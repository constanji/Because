const express = require("express");
const {
  requireJwtAuth,
  buildEndpointOption,
  configMiddleware,
} = require("~/server/middleware");
const { getAgent } = require("~/models/Agent");
const { getProviderConfig } = require("~/server/services/Endpoints/index");
const { getAppConfig } = require("~/server/services/Config");
const { isAgentsEndpoint, EModelEndpoint } = require("@because/data-provider");
const { logger } = require("@because/data-schemas");

const router = express.Router();
router.use(requireJwtAuth);
router.use(configMiddleware);

router.use(async (req, res, next) => {
  try {
    const { endpoint, agent_id, model } = req.body;

    // 1. Resolve agent if agent_id is provided
    if (isAgentsEndpoint(endpoint) && agent_id) {
      const agent = await getAgent({ id: agent_id });
      if (agent) {
        const provider = agent.provider || EModelEndpoint.openAI;
        const resolvedModel = model || agent.model_parameters?.model || agent.model;

        req.body.endpoint = provider;
        req.body.model = resolvedModel;

        // Merge agent parameters
        req.body = {
          ...agent.model_parameters,
          ...req.body,
          endpoint: req.body.endpoint,
          model: req.body.model,
        };

        logger.debug(
          `[api/optimize] Resolved agent ${agent_id} to provider: ${req.body.endpoint}, model: ${req.body.model}`,
        );
      }
    }

    // 2. Ensure endpointType is set correctly for native vs custom endpoints
    const currentEndpoint = req.body.endpoint;
    if (currentEndpoint) {
      const isNative = Object.values(EModelEndpoint).includes(currentEndpoint);
      if (!isNative) {
        req.body.endpointType = EModelEndpoint.custom;
      } else {
        req.body.endpointType = currentEndpoint;
      }
    }

    next();
  } catch (err) {
    logger.error("[api/optimize] Error resolving agent endpoint", err);
    next();
  }
});

router.use(buildEndpointOption);

router.post("/", async (req, res) => {
  try {
    const { text, agent_id, endpoint } = req.body;
    let instructions = "";

    if (agent_id) {
      const agent = await getAgent({ id: agent_id });
      if (agent && agent.instructions) {
        instructions = agent.instructions;
      }
    }

    const appConfig = await getAppConfig();

    const { getOptions, customEndpointConfig, overrideProvider } =
      getProviderConfig({
        provider: endpoint || "openAI",
        appConfig,
      });

    const initFn = getOptions;

    // 我们将为请求的端点初始化标准客户端
    const { client } = await initFn({
      req,
      res,
      endpointOption: {
        ...req.body.endpointOption,
        useChatCompletion: true,
      },
      customEndpointConfig,
      overrideEndpoint: overrideProvider,
      optionsOnly: false,
    });

    if (!client) {
      throw new Error(`Failed to initialize client for endpoint: ${endpoint}`);
    }

    const systemPrompt = `你是一个提示词优化专家。请结合系统给定的智能体功能描述（Context），将用户的粗略提问或者意图，优化为描述更清晰、逻辑更严密、更能激发大模型回复质量的提示词。\n\n智能体功能与指示（Context）:\n${instructions || "无特殊指示"}\n\n【极其重要】你必须直接且仅输出优化后的最终提示词文本！绝对不要包含任何开头的寒暄、分析过程、解释说明，也绝对不要使用“优化后的提示词：”或类似的前缀，更不要加多余的换行。你的整个回复应该必须可以直接作为输入提交给大模型。`;

    // 我们直接使用 sendCompletion 来完全绕过数据库，避免空字符串返回问题。
    // 手动构建负载：由于我们强制使用了 useChatCompletion： true，它必须是一个消息对象数组。
    const payload = [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ];

    const result = await client.sendCompletion(payload, {
      abortController: new AbortController(),
    });

    let optimizedText = "";
    if (typeof result === "string") {
      optimizedText = result;
    } else if (result && typeof result.completion === "string") {
      optimizedText = result.completion;
    } else if (
      result &&
      Array.isArray(result) &&
      result[0] &&
      typeof result[0].text === "string"
    ) {
      optimizedText = result.map((part) => part.text).join("");
    } else if (result && Array.isArray(result.completion)) {
      optimizedText = result.completion.map((part) => part.text || "").join("");
    }

    if (!res.headersSent) {
      res.json({ optimizedText: optimizedText || "" });
    }
  } catch (error) {
    logger.error("[api/optimize] Error optimizing prompt", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "优化提示词时发生错误" });
    }
  }
});

module.exports = router;
