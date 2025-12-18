const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@aipyq/data-schemas');
const BeCauseService = require('~/server/services/BeCauseService');

/**
 * BeCause Tool - Text-to-SQL prompt template system for Aipyq
 *
 * 这是从 LBchat / BeCause 体系迁移过来的 BeCause 工具，用于自然语言问数（Text-to-SQL）
 * 的提示词模板系统。它不直接生成 SQL，而是向 LLM 返回「命令模板 + Prompt 模板加载说明 +
 * 变量说明」，由上层 Agent 按模板调用 LLM 生成 SQL 或进行数据问答。
 */
class BeCause extends Tool {
  name = 'because';

  description =
    '智能问数（自然语言转SQL）提示词模板系统。' +
    'Commands: sql-generation (生成SQL), sql-generation-reasoning (生成推理计划), ' +
    'intent-classification (意图分类), data-assistance (数据辅助), misleading-assistance (误导查询处理), ' +
    'scoring (文档评分), hypothetical-questions (假设问题生成), agentic/main-agent (Agentic主代理), ' +
    'agentic/text-to-sql (Agentic文本转SQL), agentic/data-assistance (Agentic数据辅助), ' +
    'agentic/misleading-assistance (Agentic误导查询处理)。';

  schema = z.object({
    command: z.enum([
      'sql-generation',
      'sql-generation-reasoning',
      'intent-classification',
      'data-assistance',
      'misleading-assistance',
      'scoring',
      'hypothetical-questions',
      'agentic/main-agent',
      'agentic/text-to-sql',
      'agentic/data-assistance',
      'agentic/misleading-assistance',
    ]),
    arguments: z
      .string()
      .optional()
      .describe('命令参数，例如 sql-generation 的自然语言查询、data-assistance 的用户问题等'),
    mode: z
      .enum(['default', 'agentic'])
      .optional()
      .describe('模板模式：default 或 agentic（默认根据 command 推断）'),
  });

  constructor(fields = {}) {
    super();
    // 和 LBchat 中保持一致：projectRoot 用于在服务里查找 BeCauseNode 目录
    this.projectRoot = fields.projectRoot || process.cwd();
    this.service = new BeCauseService(this.projectRoot);
  }

  /**
   * 处理 sql-generation 命令
   */
  async handleSqlGeneration(args) {
    const { arguments: userQuery, mode } = args;

    if (!userQuery || !userQuery.trim()) {
      return JSON.stringify(
        {
          success: false,
          error: 'sql-generation 命令需要提供自然语言查询（arguments 字段）。',
        },
        null,
        2,
      );
    }

    try {
      const commandTemplate = await this.service.readCommandTemplate('sql-generation');
      const templateMode = mode || 'default';

      const systemPrompt = await this.service
        .readPromptTemplate(templateMode, 'sql_generation_system_prompt.txt')
        .catch(() => null);

      const userPromptTemplate = await this.service
        .readPromptTemplate(templateMode, 'sql_generation_user_prompt_template.txt')
        .catch(() => null);

      const commandInfo = await this.service.getCommandInfo('sql-generation');

      return JSON.stringify(
        {
          success: true,
          message: 'SQL 生成命令已识别。请根据命令模板和 Prompt 模板生成 ANSI SQL。',
          user_input: userQuery,
          command_template: commandTemplate,
          command_info: commandInfo,
          prompt_templates: {
            system: systemPrompt ? 'Loaded' : 'Not found',
            user: userPromptTemplate ? 'Loaded' : 'Not found',
          },
          instructions: [
            '1. 阅读命令模板，理解执行步骤和变量说明',
            `2. 从 BeCauseNode/templates/prompt-templates/${templateMode}/ 加载对应的 system/user Prompt 模板`,
            '3. 准备变量（semantic_models、query、query_time、language 等）',
            '4. 使用 Jinja2 或等价模板能力替换变量，构造最终的 Prompt',
            '5. 调用 LLM 生成 ANSI SQL',
            '6. 校验 SQL 语法与安全性，并返回最终 SQL 查询',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载 sql-generation 命令模板失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 intent-classification 命令
   */
  async handleIntentClassification(args) {
    const { arguments: userQuery } = args;

    if (!userQuery || !userQuery.trim()) {
      return JSON.stringify(
        {
          success: false,
          error: 'intent-classification 命令需要提供自然语言查询（arguments 字段）。',
        },
        null,
        2,
      );
    }

    try {
      const commandTemplate = await this.service.readCommandTemplate('intent-classification');
      const systemPrompt = await this.service
        .readPromptTemplate('default', 'intent_classification_system_prompt.txt')
        .catch(() => null);

      const userPromptTemplate = await this.service
        .readPromptTemplate('default', 'intent_classification_user_prompt_template.txt')
        .catch(() => null);

      const commandInfo = await this.service.getCommandInfo('intent-classification');

      return JSON.stringify(
        {
          success: true,
          message: '意图分类命令已识别。请根据命令模板进行意图分类。',
          user_input: userQuery,
          command_template: commandTemplate,
          command_info: commandInfo,
          prompt_templates: {
            system: systemPrompt ? 'Loaded' : 'Not found',
            user: userPromptTemplate ? 'Loaded' : 'Not found',
          },
          intent_types: ['TEXT_TO_SQL', 'GENERAL', 'MISLEADING_QUERY'],
          instructions: [
            '1. 阅读命令模板，理解执行步骤与变量',
            '2. 从 templates/prompt-templates/default/ 加载 system/user Prompt 模板',
            '3. 准备变量（query、histories、language 等）',
            '4. 使用模板生成 Prompt 并调用 LLM',
            '5. 解析 LLM 响应，得到意图类型和推理说明',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载 intent-classification 命令模板失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 data-assistance 命令
   */
  async handleDataAssistance(args) {
    const { arguments: userQuery, mode } = args;

    if (!userQuery || !userQuery.trim()) {
      return JSON.stringify(
        {
          success: false,
          error: 'data-assistance 命令需要提供自然语言问题（arguments 字段）。',
        },
        null,
        2,
      );
    }

    try {
      const templateMode = mode || 'default';
      const commandName = templateMode === 'agentic' ? 'agentic/data-assistance' : 'data-assistance';
      const commandTemplate = await this.service.readCommandTemplate(commandName);

      const systemPrompt = await this.service
        .readPromptTemplate(templateMode, 'data_assistance_system_prompt.txt')
        .catch(() => null);

      const userPromptTemplate = await this.service
        .readPromptTemplate(
          templateMode,
          templateMode === 'agentic'
            ? 'data_assistance_user_prompt.txt'
            : 'data_assistance_user_prompt_template.txt',
        )
        .catch(() => null);

      const commandInfo = await this.service.getCommandInfo(commandName);

      return JSON.stringify(
        {
          success: true,
          message: '数据辅助命令已识别。请根据命令模板回答数据库相关问题。',
          user_input: userQuery,
          command_template: commandTemplate,
          command_info: commandInfo,
          prompt_templates: {
            system: systemPrompt ? 'Loaded' : 'Not found',
            user: userPromptTemplate ? 'Loaded' : 'Not found',
          },
          instructions: [
            '1. 阅读命令模板，理解执行步骤和变量（query、semantic_models、language 等）',
            `2. 从 templates/prompt-templates/${templateMode}/ 加载 system/user Prompt 模板`,
            '3. 使用模板生成 Prompt 并调用 LLM',
            '4. 基于数据库 Schema 和语义模型，为用户提供数据解释与辅助',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载 data-assistance 命令模板失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 agentic/main-agent 命令
   */
  async handleAgenticMainAgent(args) {
    const { arguments: userQuery } = args;

    try {
      const commandTemplate = await this.service.readCommandTemplate('agentic/main-agent');
      const systemPrompt = await this.service
        .readPromptTemplate('agentic', 'main_agent_system_prompt.txt')
        .catch(() => null);

      const userPromptTemplate = await this.service
        .readPromptTemplate('agentic', 'main_agent_user_prompt.txt')
        .catch(() => null);

      const commandInfo = await this.service.getCommandInfo('agentic/main-agent');

      return JSON.stringify(
        {
          success: true,
          message: 'Agentic 主代理命令已识别。请根据命令模板作为主代理协调子代理。',
          user_input: userQuery || '',
          command_template: commandTemplate,
          command_info: commandInfo,
          prompt_templates: {
            system: systemPrompt ? 'Loaded' : 'Not found',
            user: userPromptTemplate ? 'Loaded' : 'Not found',
          },
          instructions: [
            '1. 阅读命令模板，理解 Agentic 主代理的职责与流程',
            '2. 从 templates/prompt-templates/agentic/ 加载对应 Prompt 模板',
            '3. 根据模板中的 Agentic 工作流路由到合适的子代理（如 text-to-sql / data-assistance 等）',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载 agentic/main-agent 命令模板失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理除上面几个之外的通用命令：
   * - sql-generation-reasoning
   * - misleading-assistance
   * - scoring
   * - hypothetical-questions
   * - agentic/text-to-sql
   * - agentic/data-assistance
   * - agentic/misleading-assistance
   */
  async handleGenericCommand(command, args) {
    try {
      const commandTemplate = await this.service.readCommandTemplate(command);
      const commandInfo = await this.service.getCommandInfo(command);

      return JSON.stringify(
        {
          success: true,
          message: `命令 '${command}' 已识别。请根据命令模板执行对应流程。`,
          command,
          arguments: args.arguments || '',
          command_template: commandTemplate,
          command_info: commandInfo,
          instructions: [
            '1. 阅读命令模板，理解执行步骤',
            '2. 加载需要的 Prompt 模板（如有）',
            '3. 按模板准备变量并生成 Prompt',
            '4. 调用 LLM 并处理响应结果',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载命令 '${command}' 失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  async _call(args) {
    const startTime = Date.now();
    try {
      const { command, arguments: commandArgs, mode } = args;

      logger.info('[BeCause工具调用] ========== 开始调用 ==========');
      const inputParams = {
        command,
        arguments: commandArgs,
        mode,
        timestamp: new Date().toISOString(),
      };
      logger.info(`[BeCause工具调用] 输入参数: ${JSON.stringify(inputParams, null, 2)}`);

      // 检查 BeCauseNode 目录是否存在
      const isAvailable = await this.service.isAvailable();
      if (!isAvailable) {
        return JSON.stringify(
          {
            success: false,
            error:
              'BeCauseNode 目录未找到。请确保在项目根目录或上级目录中存在 BeCauseNode，并且其中包含 commands 与 templates/prompt-templates。',
          },
          null,
          2,
        );
      }

      let result;
      switch (command) {
        case 'sql-generation':
          result = await this.handleSqlGeneration(args);
          break;
        case 'sql-generation-reasoning':
          result = await this.handleGenericCommand(command, args);
          break;
        case 'intent-classification':
          result = await this.handleIntentClassification(args);
          break;
        case 'data-assistance':
          result = await this.handleDataAssistance(args);
          break;
        case 'misleading-assistance':
        case 'scoring':
        case 'hypothetical-questions':
          result = await this.handleGenericCommand(command, args);
          break;
        case 'agentic/main-agent':
          result = await this.handleAgenticMainAgent(args);
          break;
        case 'agentic/text-to-sql':
        case 'agentic/data-assistance':
        case 'agentic/misleading-assistance':
          result = await this.handleGenericCommand(command, args);
          break;
        default:
          result = JSON.stringify(
            {
              success: false,
              error: `未知命令: ${command}`,
            },
            null,
            2,
          );
      }

      const duration = Date.now() - startTime;
      const resultPreview =
        typeof result === 'string'
          ? result.length > 1000
            ? result.substring(0, 1000) + '...'
            : result
          : JSON.stringify(result).substring(0, 1000);
      const resultInfo = {
        command,
        resultPreview,
        resultLength: typeof result === 'string' ? result.length : JSON.stringify(result).length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
      logger.info(`[BeCause工具调用] 执行结果: ${JSON.stringify(resultInfo, null, 2)}`);
      logger.info('[BeCause工具调用] ========== 调用完成 ==========');

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorInfo = {
        error: err.message,
        stack: err.stack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
      logger.error(`[BeCause工具调用] 执行错误: ${JSON.stringify(errorInfo, null, 2)}`);
      logger.error('BeCause tool error:', err);
      return JSON.stringify(
        {
          success: false,
          error: err.message,
        },
        null,
        2,
      );
    }
  }
}

module.exports = BeCause;


