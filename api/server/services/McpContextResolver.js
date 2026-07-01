const { logger } = require("@because/data-schemas");
const { getDatDatasourceModel } = require("~/models/DatDatasource");
const { getConvo } = require("~/models/Conversation");
const { Conversation } = require("~/db/models");
const { getDataSourceByAgentId } = require("~/server/services/DataSource");

/** @type {Record<string, import('./McpContextResolver').ContextInjectionConfig | Record<string, import('./McpContextResolver').ContextInjectionConfig>>} */
const DEFAULT_CONTEXT_INJECTION = {
  "becauseai-server": {
    ask_data: {
      resolve: [
        { from: "requestBody", field: "datasourceId" },
        { from: "conversation" },
        { from: "agentBinding" },
      ],
      // 与 Because.yaml 中的协议保持一致：arg4=机构编码，arg5=用户问题
      inject: {
        projectId: "projectId",
        arg1: "projectId",
        arg2: "datasourceId",
        arg4: "orgCode",
        arg5: "question",
      },
      hideFromSchema: ["projectId", "arg1", "arg2", "arg4"],
    },
    agents: {
      resolve: [
        { from: "requestBody", field: "datasourceId" },
        { from: "conversation" },
        { from: "agentBinding" },
      ],
      inject: {
        projectId: "projectId",
        arg1: "projectId",
        datasourceId: "datasourceId",
      },
      hideFromSchema: ["projectId", "arg1", "datasourceId"],
    },
  },
  "analysis-server": {
    resolve: [
      { from: "requestBody", field: "datasourceId" },
      { from: "conversation" },
      { from: "agentBinding" },
    ],
    inject: {
      projectId: "projectId",
      datasourceId: "datasourceId",
    },
    hideFromSchema: ["projectId", "datasourceId"],
  },
};

/** @type {Map<string, { projectId: string, datasourceId: string, expiresAt: number }>} */
const datasourceCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * @typedef {{ from: 'conversation' | 'requestBody' | 'agentBinding', field?: string }} ResolveSource
 * @typedef {{ resolve: ResolveSource[], inject: Record<string, string>, hideFromSchema?: string[] }} ContextInjectionConfig
 * @typedef {{ projectId: string, datasourceId: string, source?: string, orgCode?: string }} McpExecutionContext
 */

/**
 * @param {string} serverName
 * @param {Record<string, unknown> | undefined} mcpConfig
 * @param {string} [toolName]
 * @returns {ContextInjectionConfig | null}
 */
function getContextInjectionConfig(serverName, mcpConfig, toolName) {
  const fromConfig = mcpConfig?.[serverName]?.contextInjection;
  if (toolName && fromConfig?.[toolName]?.inject && fromConfig?.[toolName]?.resolve) {
    return fromConfig[toolName];
  }
  if (fromConfig?.inject && fromConfig?.resolve) {
    return fromConfig;
  }

  const defaults = DEFAULT_CONTEXT_INJECTION[serverName];
  if (!defaults) {
    return null;
  }
  if (toolName && defaults[toolName]?.inject && defaults[toolName]?.resolve) {
    return defaults[toolName];
  }
  if (defaults.inject && defaults.resolve) {
    return defaults;
  }
  return null;
}

/**
 * Remove injected params from tool JSON schema so the model does not fill them.
 * @param {Record<string, unknown> | undefined} parameters
 * @param {string[] | undefined} hideFromSchema
 * @returns {Record<string, unknown> | undefined}
 */
function stripHiddenParamsFromSchema(parameters, hideFromSchema) {
  if (!parameters?.properties || !hideFromSchema?.length) {
    return parameters;
  }

  const hidden = new Set(hideFromSchema);
  const hasHidden = hideFromSchema.some((key) => key in parameters.properties);
  if (!hasHidden) {
    return parameters;
  }

  const modified = { ...parameters, properties: { ...parameters.properties } };
  for (const key of hidden) {
    delete modified.properties[key];
  }
  if (Array.isArray(modified.required)) {
    modified.required = modified.required.filter((r) => !hidden.has(r));
  }
  return modified;
}

/**
 * @param {string} datasourceId
 * @returns {Promise<{ projectId: string, datasourceId: string } | null>}
 */
async function lookupDatasource(datasourceId) {
  const cached = datasourceCache.get(datasourceId);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      projectId: cached.projectId,
      datasourceId: cached.datasourceId,
    };
  }

  const DatDatasource = await getDatDatasourceModel();
  const dataSource = await DatDatasource.findById(datasourceId).lean();
  if (dataSource) {
    logger.info(
      `[McpContext] Datasource ${datasourceId}: provider=${dataSource.provider}, configurationKeys=${JSON.stringify(Object.keys(dataSource.configuration || {}))}`,
    );
  }
  if (!dataSource?.projectId) {
    return null;
  }

  const ctx = {
    projectId: String(dataSource.projectId),
    datasourceId: String(datasourceId),
  };
  datasourceCache.set(datasourceId, { ...ctx, expiresAt: Date.now() + CACHE_TTL_MS });
  return ctx;
}

/**
 * @param {string} datasourceId
 * @returns {Promise<McpExecutionContext | null>}
 */
async function resolveFromDatasourceId(datasourceId, source) {
  const ctx = await lookupDatasource(datasourceId);
  if (!ctx) {
    return null;
  }
  return { ...ctx, source };
}

/**
 * @param {ResolveSource[]} resolveSources
 * @param {object} params
 * @param {import('@langchain/core/runnables').RunnableConfig['configurable']} [params.configurable]
 * @returns {Promise<McpExecutionContext | null>}
 */
async function resolveMcpExecutionContext({ resolveSources, configurable }) {
  const requestBody = configurable?.requestBody;
  const userId = configurable?.user?.id || configurable?.user_id;
  const conversationId = requestBody?.conversationId;
  const agentId = configurable?.last_agent_id;

  for (const source of resolveSources) {
    if (source.from === "conversation" && userId && conversationId) {
      try {
        const convo = await getConvo(userId, conversationId);
        const stored = convo?.agentOptions?.mcpContext;
        if (stored?.datasourceId && stored?.projectId) {
          return {
            projectId: String(stored.projectId),
            datasourceId: String(stored.datasourceId),
            source: "conversation",
          };
        }
        if (stored?.datasourceId) {
          const ctx = await resolveFromDatasourceId(stored.datasourceId, "conversation");
          if (ctx) {
            return ctx;
          }
        }
      } catch (error) {
        logger.warn("[McpContext] Failed to read conversation mcpContext:", error);
      }
    }

    if (source.from === "requestBody") {
      const field = source.field || "datasourceId";
      const rawId = requestBody?.[field];
      if (rawId) {
        const ctx = await resolveFromDatasourceId(String(rawId), "requestBody");
        if (ctx) {
          return ctx;
        }
      }
    }

    if (source.from === "agentBinding" && agentId) {
      try {
        const dataSource = await getDataSourceByAgentId(agentId);
        if (dataSource?._id && dataSource?.projectId) {
          return {
            projectId: String(dataSource.projectId),
            datasourceId: String(dataSource._id),
            source: "agentBinding",
          };
        }
      } catch (error) {
        logger.warn("[McpContext] Agent binding lookup failed:", error);
      }
    }

    // 默认数据源回退：取第一个启用的数据源
    if (source.from === "agentBinding") {
      // agentBinding 作为最后一个 resolve source 且没命中时，回退到默认数据源
      continue;
    }
  }

  // 所有来源均未命中 → fallback 到默认数据源（第一个启用的）
  try {
    const DatDatasource = await getDatDatasourceModel();
    const defaultDs = await DatDatasource.findOne({ enabled: true }).sort({ createdAt: 1 }).lean();
    if (defaultDs?._id && defaultDs?.projectId) {
      logger.info(
        `[McpContext] Fallback to default datasource: ${defaultDs._id}, projectId=${defaultDs.projectId}`,
      );
      return {
        projectId: String(defaultDs.projectId),
        datasourceId: String(defaultDs._id),
        source: "default",
      };
    }
  } catch (error) {
    logger.warn("[McpContext] Default datasource fallback failed:", error);
  }

  return null;
}

/**
 * Persist resolved context on the conversation (fire-and-forget).
 * @param {object} params
 */
function persistConversationMcpContext({ userId, conversationId, context }) {
  if (!userId || !conversationId || !context?.datasourceId) {
    return;
  }

  Conversation.findOneAndUpdate(
    { user: userId, conversationId },
    {
      $set: {
        "agentOptions.mcpContext": {
          datasourceId: context.datasourceId,
          projectId: context.projectId,
        },
      },
    },
  ).catch((error) => {
    logger.warn("[McpContext] Failed to persist conversation mcpContext:", error);
  });
}

/**
 * Merge execution context into tool arguments without overwriting explicit LLM values.
 * @param {Record<string, unknown>} toolArguments
 * @param {McpExecutionContext} context
 * @param {Record<string, string>} injectMap
 * @param {string[]} [hideFromSchema]
 */
function applyContextInjection(toolArguments, context, injectMap, hideFromSchema = []) {
  const hidden = new Set(hideFromSchema);
  const result = { ...toolArguments };

  // question 文本的来源：先按 inject 映射反查哪个工具参数承载 question（如新协议的 arg5），
  // 再回退到通用语义字段。不能再写死 arg4：协议升级后 arg4 已是 orgCode。
  const questionParam = Object.entries(injectMap).find(([, src]) => src === "question")?.[0];
  const question =
    (questionParam ? result[questionParam] : undefined) ??
    result.question ??
    result.query ??
    result.prompt ??
    result.input;

  for (const [toolParam, contextField] of Object.entries(injectMap)) {
    const value = contextField === "question" ? question : context[contextField];
    if (value == null || value === "") {
      continue;
    }
    if (result[toolParam] != null && result[toolParam] !== "") {
      continue;
    }
    result[toolParam] = value;
  }

  for (const key of hidden) {
    if (result[key] == null || result[key] === "") {
      delete result[key];
    }
  }

  return result;
}

/**
 * Resolve datasource context and inject into MCP tool arguments.
 * @param {object} params
 * @param {string} params.serverName
 * @param {string} [params.toolName]
 * @param {Record<string, unknown>} params.toolArguments
 * @param {import('@langchain/core/runnables').RunnableConfig['configurable']} [params.configurable]
 * @param {Record<string, unknown>} [params.mcpConfig]
 * @returns {Promise<Record<string, unknown>>}
 */
async function resolveAndInjectMcpContext({
  serverName,
  toolName,
  toolArguments,
  configurable,
  mcpConfig,
}) {
  const rules = getContextInjectionConfig(serverName, mcpConfig, toolName);
  if (!rules) {
    return toolArguments;
  }

  const args =
    typeof toolArguments === "string"
      ? (() => {
          try {
            return JSON.parse(toolArguments);
          } catch {
            return { input: toolArguments };
          }
        })()
      : { ...toolArguments };

  const context = await resolveMcpExecutionContext({
    resolveSources: rules.resolve,
    configurable,
  });

  if (!context) {
    logger.warn(
      `[MCP][${serverName}] No datasource context resolved. Select a datasource or bind one to the agent.`,
    );
    return args;
  }

  // 把机构编码带到上下文，让 inject 映射 `arg4: orgCode` 等规则直接生效
  // 优先级：请求体 orgCode（接口传参） > 用户表 orgCode（JWT 解析） > 已解析的 context.orgCode
  const requestBodyOrgCode = configurable?.requestBody?.orgCode;
  const userOrgCode = configurable?.user?.orgCode;
  const candidate = requestBodyOrgCode != null && requestBodyOrgCode !== ''
    ? requestBodyOrgCode
    : userOrgCode;
  if (candidate != null && candidate !== '' && context.orgCode == null) {
    context.orgCode = String(candidate);
  }

  logger.info(
    `[MCP][${serverName}] Context resolved (source=${context.source}): projectId=${context.projectId}, datasourceId=${context.datasourceId}, orgCode=${context.orgCode || '-'}`,
  );

  const userId = configurable?.user?.id || configurable?.user_id;
  const conversationId = configurable?.requestBody?.conversationId;
  if (context.source === "requestBody" && userId && conversationId) {
    persistConversationMcpContext({ userId, conversationId, context });
  }

  return applyContextInjection(
    args,
    context,
    rules.inject,
    rules.hideFromSchema,
  );
}

module.exports = {
  DEFAULT_CONTEXT_INJECTION,
  getContextInjectionConfig,
  stripHiddenParamsFromSchema,
  resolveAndInjectMcpContext,
  resolveMcpExecutionContext,
  applyContextInjection,
  lookupDatasource,
};
