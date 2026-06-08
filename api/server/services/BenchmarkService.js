const fs = require('fs').promises;
const path = require('path');
const ModelClient = require('./ModelClient');
const EvaluationService = require('./EvaluationService');
const CustomEvaluationService = require('./CustomEvaluationService');
const { isAgentsEndpoint, EModelEndpoint, Constants } = require('@because/data-provider');
const AgentClient = require('../controllers/agents/client');
const { initializeClient } = require('../services/Endpoints/agents/initialize');
const { getAppConfig } = require('../services/Config');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('@because/data-schemas');

function getTasks() {
  const BenchmarkController = require('../controllers/BenchmarkController');
  const tasks = BenchmarkController.tasks;
  if (!tasks || typeof tasks.get !== 'function') {
    throw new Error('tasks is not a valid Map');
  }
  return tasks;
}

class BenchmarkService {
  static knowledgeLoggedDbIds = new Set();
  static knowledgeCache = new Map(); // 缓存知识库内容，避免重复加载

  static async runBenchmarkTask(taskId, config, benchmarkRoot, resultsDirOverride) {
    const root = benchmarkRoot || path.join(__dirname, '../../benchmark');
    const dataDir = path.join(root, 'data');
    const resultsDir = resultsDirOverride || path.join(root, 'results');
    const knowledgeDir = path.join(root, 'knowledge');

    const tasksMap = getTasks();
    const task = tasksMap.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    BenchmarkService.knowledgeLoggedDbIds.clear();
    BenchmarkService.knowledgeCache.clear(); // 清空知识库缓存
    if (!Array.isArray(task.statusLogs)) task.statusLogs = [];

    const pushLog = (msg) => {
      task.statusLogs.push(msg);
      console.log(msg);
      tasksMap.set(taskId, task);
    };

    try {
      task.status = 'running';
      task.progress = 0;
      task.startTime = Date.now();
      tasksMap.set(taskId, task);

      const isCustomMode = config.benchmarkMode === 'custom';
      const dataset = isCustomMode
        ? await this.loadCustomDataset(resultsDir, config.customDatasetId)
        : await this.loadDataset(dataDir, config.datasetId, config.databaseName, config.sqlDialect);
      task.total = dataset.length;
      tasksMap.set(taskId, task);

      // 检查是否为 agents 端点或是否包含 MCP
      const isAgents = !!config.agentConfig;

      // 对于非 agents 且非包含 MCP 的端点，不需要 baseURL 和 apiKey 检查
      if (!isAgents && config.endpointConfig.type !== 'mcp_direct') {
        if (!config.endpointConfig.baseURL) {
          throw new Error('Endpoint baseURL is missing. Please check your endpoint configuration.');
        }
        if (!config.endpointConfig.apiKey) {
          throw new Error('Endpoint API key is missing. Please check your .env file or endpoint configuration.');
        }
      }
      const endpointType = isAgents ? '智能体 (Agents)' : config.endpointConfig.type === 'mcp_direct' ? 'MCP 直接调用' : '模型 (Model)';
      pushLog(`[BenchmarkService] 任务 ${taskId} 开始 | 端点: ${config.endpointConfig.name} (${endpointType}) | 模型: ${config.modelConfig.model} | 数据集: ${config.databaseName || '全部'} (${dataset.length} 题) | SQL方言: ${config.sqlDialect}`);

      let modelClient = null;
      let agentClient = null;
      let mockReq = null;
      let mockRes = null;

      if (isAgents) {
        // 初始化智能体客户端
        const appConfig = await getAppConfig({ role: 'USER' });
        mockReq = this.createMockRequest(config, appConfig, config.userId);
        mockRes = this.createMockResponse();
        const { client } = await initializeClient({
          req: mockReq,
          res: mockRes,
          endpointOption: {
            endpoint: config.agentConfig.agent.endpoint || EModelEndpoint.agents,
            agent: Promise.resolve(config.agentConfig.agent),
            model_parameters: config.agentConfig.agent.model_parameters,
          },
        });
        agentClient = client;
      } else if (config.endpointConfig.type !== 'mcp_direct') {
        // 初始化模型客户端
        modelClient = new ModelClient(config.endpointConfig, config.modelConfig);
      }

      const predictions = [];

      for (let i = 0; i < dataset.length; i++) {
        // 检查是否已取消
        const currentTask = tasksMap.get(taskId);
        if (currentTask?.cancelled) {
          pushLog(`[BenchmarkService] 任务已取消，停止处理`);
          task.status = 'cancelled';
          tasksMap.set(taskId, task);
          break;
        }

        const item = dataset[i];
        const itemStartTime = Date.now();
        task.currentItem = item.question_id || `item_${i + 1}`;
        task.itemStartTime = new Date().toISOString();
        tasksMap.set(taskId, task);

        try {
          let predictedSQL = '';
          if (config.endpointConfig.type === 'mcp_direct') {
            // 直接调用 MCP Server
            predictedSQL = await this.generateSQLWithMCP({
              serverName: config.modelConfig.model,
              item,
              sqlDialect: config.sqlDialect,
              knowledgeDir,
              userId: config.userId,
              userOrgCode: config.userOrgCode,
              datasourceId: config.datasourceId,
              mcpToolName: config.mcpToolName,
              mcpToolArguments: config.mcpToolArguments,
            });
          } else if (isAgents) {
            predictedSQL = await this.generateSQLWithAgent(agentClient, item, config.sqlDialect, knowledgeDir, mockReq);
          } else {
            predictedSQL = await this.generateSQL(modelClient, item, config.sqlDialect, knowledgeDir);
          }
          const itemDuration = Date.now() - itemStartTime;
          predictions.push({
            index: i,
            db_id: item.db_id,
            sql: predictedSQL,
            question_id: item.question_id,
            duration: itemDuration,
          });

          task.completed = i + 1;
          task.progress = Math.round(((i + 1) / dataset.length) * 50);
          task.lastCompletedItem = item.question_id || `item_${i + 1}`;
          task.lastItemDuration = itemDuration;
          task.currentItem = null;
          task.itemStartTime = null;
          tasksMap.set(taskId, task);

          pushLog(`[BenchmarkService] 已完成 第 ${i + 1}/${dataset.length} 题 | question_id=${item.question_id} | 耗时 ${itemDuration}ms`);
          if ((i + 1) % 5 === 0 || i === dataset.length - 1) {
            const totalSoFar = Date.now() - task.startTime;
            pushLog(`[BenchmarkService] 进度 ${task.progress}% (${i + 1}/${dataset.length}) | 累计耗时 ${(totalSoFar / 1000).toFixed(1)}s`);
          }
        } catch (error) {
          const itemDuration = Date.now() - itemStartTime;
          pushLog(`[BenchmarkService] 第 ${i + 1}/${dataset.length} 题失败 question_id=${item.question_id}: ${error.message}`);
          predictions.push({ index: i, db_id: item.db_id, sql: null, error: error.message, duration: itemDuration });
          task.completed = i + 1;
          task.progress = Math.round(((i + 1) / dataset.length) * 50);
          task.lastCompletedItem = item.question_id || `item_${i + 1}`;
          task.currentItem = null;
          task.itemStartTime = null;
          tasksMap.set(taskId, task);
        }
      }

      pushLog(`[BenchmarkService] 保存预测结果...`);
      const predictionsPath = await this.savePredictions(resultsDir, taskId, predictions, dataset);
      
      // 保存任务配置以便后续恢复详情
      const configPath = path.join(resultsDir, `${taskId}_config.json`);
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      task.progress = 60;
      tasksMap.set(taskId, task);
      pushLog(`[BenchmarkService] 预测已保存，开始评估: ${config.evaluationMetrics.join(', ')}`);

      let evaluationResults;
      if (isCustomMode) {
        // 自定义数据源评估：使用用户数据库连接执行 SQL 对比
        pushLog(`[BenchmarkService] 使用自定义评估模式（连接用户数据源执行 SQL 对比）`);
        evaluationResults = await CustomEvaluationService.evaluate({
          datasourceId: config.datasourceId,
          predictions,
          dataset,
          onProgress: (progress) => {
            const currentTask = tasksMap.get(taskId);
            if (currentTask) {
              currentTask.progress = 60 + Math.round(progress * 0.4);
              tasksMap.set(taskId, currentTask);
            }
          },
        });
      } else {
        // BIRD 标准评估：使用 Python 脚本在 SQLite dev_databases 上评估
        evaluationResults = await EvaluationService.evaluate(
          root,
          predictionsPath,
          config.datasetId,
          config.sqlDialect,
          config.evaluationMetrics,
          (progress) => {
            const currentTask = tasksMap.get(taskId);
            if (currentTask) {
              currentTask.progress = 60 + Math.round(progress * 0.4);
              tasksMap.set(taskId, currentTask);
            }
          },
        );
      }

      task.status = 'completed';
      task.progress = 100;
      task.results = evaluationResults;
      task.completedAt = new Date().toISOString();
      tasksMap.set(taskId, task);

      const resultsFilePath = path.join(resultsDir, `${taskId}_results.json`);
      pushLog(`[BenchmarkService] 任务 ${taskId} 完成，结果已写入 ${resultsFilePath}`);
      await fs.writeFile(resultsFilePath, JSON.stringify(evaluationResults, null, 2));
    } catch (error) {
      const currentTask = tasksMap.get(taskId);
      if (currentTask) {
        currentTask.status = 'failed';
        currentTask.error = error.message;
        tasksMap.set(taskId, currentTask);
      }
      throw error;
    }
  }

  static async loadDataset(dataDir, datasetId, databaseName, sqlDialect) {
    let fileName = datasetId;
    if (!datasetId.includes('mini_dev')) {
      fileName = `mini_dev_${sqlDialect.toLowerCase()}.json`;
    }
    const filePath = path.join(dataDir, fileName);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let dataset = JSON.parse(content);
      if (databaseName) {
        dataset = dataset.filter((item) => item.db_id === databaseName);
        if (dataset.length === 0) {
          throw new Error(`No data found for database: ${databaseName} in ${fileName}`);
        }
      }
      return dataset;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Dataset file not found: ${filePath}. Please ensure the dataset file exists.`);
      }
      throw new Error(`Failed to load dataset: ${error.message}`);
    }
  }

  /**
   * 加载自定义数据集
   */
  static async loadCustomDataset(resultsDir, customDatasetId) {
    const filePath = path.join(resultsDir, 'custom_datasets', `${customDatasetId}.json`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const dataset = JSON.parse(content);
      if (!Array.isArray(dataset) || dataset.length === 0) {
        throw new Error('自定义数据集为空或格式不正确');
      }
      // 确保每项都有 difficulty 字段（默认 simple）
      return dataset.map((item) => ({
        ...item,
        difficulty: item.difficulty || 'simple',
      }));
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`自定义数据集文件不存在: ${customDatasetId}`);
      }
      throw new Error(`加载自定义数据集失败: ${error.message}`);
    }
  }

  static async generateSQL(modelClient, item, sqlDialect, knowledgeDir) {
    const prompt = await this.buildPrompt(item, sqlDialect, knowledgeDir);
    const response = await modelClient.generate(prompt, { temperature: 0.1, max_tokens: 2000 });
    return this.extractSQL(response);
  }

  static async generateSQLWithAgent(agentClient, item, sqlDialect, knowledgeDir, req) {
    const prompt = await this.buildAgentPrompt(item, sqlDialect, knowledgeDir);
    
    // 调用智能体的 sendMessage 方法
    const conversationId = uuidv4();
    const responseMessageId = uuidv4();
    
    const messageOptions = {
      user: req.user?.id,
      conversationId,
      parentMessageId: Constants.NO_PARENT,
      responseMessageId,
      abortController: new AbortController(),
      progressOptions: {
        res: null, // 不需要流式响应
      },
    };

    const response = await agentClient.sendMessage(prompt, messageOptions);
    
    // 从响应中提取 SQL
    const responseText = this.extractTextFromAgentResponse(response);
    return this.extractSQL(responseText);
  }

  static async generateSQLWithMCP({
    serverName,
    item,
    sqlDialect,
    knowledgeDir,
    userId,
    userOrgCode,
    datasourceId,
    mcpToolName,
    mcpToolArguments,
  }) {
    const { getMCPManager, getFlowStateManager } = require('~/config');
    const { getLogStores } = require('~/cache');
    const { CacheKeys } = require('@because/data-provider');
    const { findToken, createToken, updateToken } = require('~/models');
    const { resolveAndInjectMcpContext } = require('./McpContextResolver');
    const { getAppConfig } = require('./Config');
    const {
      isMissingArg,
      extractTextFromMcpResult,
      extractSqlFromMcpResponse,
    } = require('./McpBenchmarkUtils');

    const mcpManager = getMCPManager();

    if (!mcpManager) {
      throw new Error('MCP Manager not initialized');
    }

    const connection = await mcpManager.getConnection({
      user: { id: userId },
      serverName,
    });

    if (!connection) {
      throw new Error(`Failed to get MCP connection for server: ${serverName}`);
    }

    const prompt = await this.buildAgentPrompt(item, sqlDialect, knowledgeDir);
    const questionText = item.question || item.query || item.text || prompt;

    const tools = await connection.fetchTools();
    if (!tools || tools.length === 0) {
      throw new Error(`No tools found in MCP server: ${serverName}`);
    }

    let toolName = mcpToolName;
    if (!toolName) {
      toolName = tools[0].name;
      const generateSqlTool = tools.find(
        (t) => t.name.toLowerCase().includes('sql') || t.name.toLowerCase().includes('generate'),
      );
      if (generateSqlTool) {
        toolName = generateSqlTool.name;
      }
    }

    let toolArguments = mcpToolArguments ? JSON.parse(JSON.stringify(mcpToolArguments)) : {};

    let hasPromptPlaceholder = false;
    const processArguments = (args) => {
      for (const key of Object.keys(args)) {
        if (typeof args[key] === 'string') {
          if (args[key].includes('{{prompt}}')) {
            args[key] = args[key].replace(/\{\{prompt\}\}/g, prompt || '');
            hasPromptPlaceholder = true;
          }
          if (args[key].includes('{{question}}')) {
            args[key] = args[key].replace(/\{\{question\}\}/g, questionText);
            hasPromptPlaceholder = true;
          }
        } else if (args[key] && typeof args[key] === 'object') {
          processArguments(args[key]);
        }
      }
    };
    processArguments(toolArguments);

    const schema = tools.find((t) => t.name === toolName)?.inputSchema;
    const propKeys = schema?.properties ? Object.keys(schema.properties) : [];
    const requiredKeys = schema?.required || [];
    const questionLikeKeys = [...propKeys, ...requiredKeys].filter(
      (key, index, arr) =>
        arr.indexOf(key) === index &&
        (key.toLowerCase().includes('query') ||
          key.toLowerCase().includes('question') ||
          key.toLowerCase().includes('prompt') ||
          key.toLowerCase().includes('input')),
    );

    if (!hasPromptPlaceholder && !mcpToolArguments) {
      if (schema && schema.properties) {
        if (requiredKeys.length > 0) {
          const targetKey =
            questionLikeKeys.find((k) => requiredKeys.includes(k)) ||
            requiredKeys.find(
              (k) => k.toLowerCase().includes('query') || k.toLowerCase().includes('question'),
            ) ||
            requiredKeys[requiredKeys.length - 1];
          toolArguments[targetKey] = questionText;
        } else if (propKeys.length > 0) {
          const targetKey =
            questionLikeKeys[0] ||
            propKeys.find(
              (k) => k.toLowerCase().includes('query') || k.toLowerCase().includes('question'),
            ) ||
            propKeys[propKeys.length - 1];
          toolArguments[targetKey] = questionText;
        }
      } else {
        toolArguments = { query: questionText };
      }
    } else if (schema && schema.properties) {
      const keysToFill = [...requiredKeys, ...questionLikeKeys];
      keysToFill.forEach((key) => {
        if (isMissingArg(toolArguments[key])) {
          toolArguments[key] = questionText;
        }
      });
    }

    const appConfig = await getAppConfig();
    const configurable = {
      user: { id: userId, ...(userOrgCode ? { orgCode: userOrgCode } : {}) },
      requestBody: datasourceId ? { datasourceId } : {},
    };
    const finalToolArguments = await resolveAndInjectMcpContext({
      serverName,
      toolName,
      toolArguments,
      configurable,
      mcpConfig: appConfig?.mcpConfig,
    });

    logger.info(
      `[BenchmarkService][${serverName}][${toolName}] Final tool arguments: ${JSON.stringify(finalToolArguments)}`,
    );

    const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
    const result = await mcpManager.callTool({
      serverName,
      toolName,
      toolArguments: finalToolArguments,
      user: { id: userId },
      requestBody: configurable.requestBody,
      flowManager,
      tokenMethods: {
        findToken,
        createToken,
        updateToken,
      },
    });

    const responseText = extractTextFromMcpResult(result);
    if (!responseText || responseText === '(No response)') {
      throw new Error(`MCP tool ${toolName} returned empty response`);
    }

    return extractSqlFromMcpResponse(serverName, responseText, (text) => this.extractSQL(text));
  }

  static extractTextFromAgentResponse(response) {
    // 从智能体响应中提取文本内容
    if (response.text) {
      return response.text;
    }
    if (response.content && typeof response.content === 'string') {
      return response.content;
    }
    if (Array.isArray(response.content)) {
      return response.content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part.text) return part.text;
          return '';
        })
        .join('');
    }
    return JSON.stringify(response);
  }

  static createMockRequest(config, appConfig, userId) {
    // 创建一个模拟的 req 对象用于智能体初始化
    // 使用传入的用户ID，如果没有则使用当前请求的用户ID
    if (!userId) {
      throw new Error('用户ID是必需的，请确保在配置中传递 userId');
    }

    const projectId = config.datasource?.projectId || null;

    return {
      user: {
        id: userId,
        role: 'USER',
      },
      config: appConfig || {
        endpoints: {
          [EModelEndpoint.agents]: {},
        },
      },
      body: {
        projectId: projectId,
        datasourceId: config.datasourceId,
        endpointOption: {
          endpoint: config.agentConfig?.agent?.endpoint || 'custom',
          model_parameters: config.agentConfig?.agent?.model_parameters || {},
        },
      },
    };
  }

  static createMockResponse() {
    // 创建一个模拟的 res 对象
    return {
      on: () => {},
      write: () => {},
      end: () => {},
      status: () => ({ json: () => {} }),
      json: () => {},
    };
  }

  static async buildPrompt(item, sqlDialect, knowledgeDir) {
    const schemaPrompt = await this.getSchemaPrompt(item.db_id, sqlDialect);
    const question = item.question;
    const evidence = item.evidence || '';

    return `${schemaPrompt}

-- Using valid ${sqlDialect}${evidence ? ' and understanding External Knowledge' : ''}, answer the following questions for the tables provided above.
-- ${question}
${evidence ? `-- External Knowledge: ${evidence}` : ''}

Generate the ${sqlDialect} SQL for the above question after thinking step by step:

In your response, you do not need to mention your intermediate steps.
Do not include any comments in your response.
Do not need to start with the symbol \`\`\`
You only need to return the result ${sqlDialect} SQL code
start from SELECT`;
  }

  static async buildAgentPrompt(item, sqlDialect, knowledgeDir) {
    // 使用 Python 脚本生成智能体提示词
    const { spawn } = require('child_process');
    const { promisify } = require('util');
    const schemaPrompt = await this.getSchemaPrompt(item.db_id, sqlDialect);
    const question = item.question;
    const evidence = item.evidence || '';

    return `${schemaPrompt}

请使用有效的 ${sqlDialect} SQL${evidence ? ' 并理解外部知识' : ''}，回答以下关于上述表的问题。
问题: ${question}
${evidence ? `外部知识: ${evidence}` : ''}

请使用可用的工具（如数据库结构查询、SQL 生成、执行工具等）来完成以下任务：
1. 如果需要，使用工具获取数据库表结构信息。
2. 使用工具或直接将自然语言问题转换为 ${sqlDialect} SQL 查询。
3. 如果需要，可以使用工具执行 SQL 并查看结果。

最终请返回生成的 ${sqlDialect} SQL 代码，以 SELECT 开头。`;
  }

  static async loadKnowledgeFromDirectory(dir, dbId) {
    try {
      await fs.access(dir);
    } catch {
      return '';
    }

    const knowledgeParts = [];

    const schemaDir = path.join(dir, 'schema');
    try {
      const schemaFiles = await fs.readdir(schemaDir);
      const yamlFiles = schemaFiles.filter(
        (f) =>
          (f.endsWith('.yaml') || f.endsWith('.yml')) &&
          (f.toLowerCase().includes(dbId.toLowerCase()) || f === 'Semantic Schema.yaml'),
      );
      for (const yamlFile of yamlFiles) {
        const yamlPath = path.join(schemaDir, yamlFile);
        const yamlContent = await this.parseYAMLFile(yamlPath);
        if (yamlContent) knowledgeParts.push(`# Semantic Schema (${yamlFile}):\n${yamlContent}`);
      }
    } catch {
      // ignore
    }

    const knowledgeSubDir = path.join(dir, 'knowledge');
    try {
      const knowledgeFiles = await fs.readdir(knowledgeSubDir);
      const mdFiles = knowledgeFiles.filter(
        (f) => f.endsWith('.md') && (f.includes(dbId) || f.toLowerCase().includes(dbId.toLowerCase())),
      );
      for (const mdFile of mdFiles) {
        const content = await fs.readFile(path.join(knowledgeSubDir, mdFile), 'utf-8');
        knowledgeParts.push(`# Knowledge Document (${mdFile}):\n${content}`);
      }
    } catch {
      // ignore
    }

    return knowledgeParts.length > 0 ? knowledgeParts.join('\n\n---\n\n') : '';
  }

  static async parseYAMLFile(yamlPath) {
    try {
      const yaml = require('js-yaml');
      const content = await fs.readFile(yamlPath, 'utf-8');
      const data = yaml.load(content);
      return this.formatYAMLForLLM(data);
    } catch {
      try {
        return await fs.readFile(yamlPath, 'utf-8');
      } catch {
        return '';
      }
    }
  }

  static formatYAMLForLLM(data) {
    let result = '';
    if (data.database) {
      result += `## Database: ${data.database.name || 'Unknown'}\n`;
      if (data.database.description) result += `${data.database.description}\n\n`;
    }
    if (data.entities) {
      result += '## Entities (Tables):\n\n';
      for (const [entityName, entityInfo] of Object.entries(data.entities)) {
        result += `### ${entityName}\n`;
        if (entityInfo.description) result += `**Description**: ${entityInfo.description}\n`;
        if (entityInfo.primary_key) result += `**Primary Key**: ${entityInfo.primary_key}\n`;
        if (entityInfo.fields) {
          result += '**Fields**:\n';
          for (const [fieldName, fieldDesc] of Object.entries(entityInfo.fields)) {
            result += `  - ${fieldName}: ${fieldDesc}\n`;
          }
        }
        result += '\n';
      }
    }
    if (data.relationships && Array.isArray(data.relationships)) {
      result += '## Relationships:\n';
      data.relationships.forEach((rel) => {
        result += `- ${rel}\n`;
      });
    }
    return result;
  }

  static async getSchemaPrompt(dbId, sqlDialect) {
    return `-- Database schema for ${dbId} (${sqlDialect})`;
  }

  static extractSQL(response) {
    let sql = response.trim();
    sql = sql.replace(/^```[\w]*\n?/g, '').replace(/\n?```$/g, '').trim();
    sql = sql.replace(/--.*$/gm, '');
    return sql.trim();
  }

  static async savePredictions(resultsDir, taskId, predictions, dataset) {
    await fs.mkdir(resultsDir, { recursive: true });

    const predictionsObj = {};
    predictions.forEach((pred) => {
      if (pred.sql) {
        predictionsObj[pred.index] = `${pred.sql}\t----- bird -----\t${pred.db_id}`;
      }
    });
    const filePath = path.join(resultsDir, `${taskId}_predictions.json`);
    await fs.writeFile(filePath, JSON.stringify(predictionsObj, null, 2));

    const groundTruthPath = path.join(resultsDir, `${taskId}_ground_truth.sql`);
    const groundTruthContent = dataset
      .map((item) => {
        let sql = (item.SQL || '').trim().replace(/\s+/g, ' ');
        return `${sql}\t${item.db_id}`;
      })
      .join('\n');
    await fs.writeFile(groundTruthPath, groundTruthContent);

    const diffJsonlPath = path.join(resultsDir, `${taskId}_diff.jsonl`);
    const diffJsonlContent =
      dataset
        .map((item) =>
          JSON.stringify({
            question_id: item.question_id,
            db_id: item.db_id,
            difficulty: item.difficulty || 'simple',
          }),
        )
        .join('\n') + '\n';
    await fs.writeFile(diffJsonlPath, diffJsonlContent);

    // 保存详细信息预测文件，包括耗时、问题、回答等
    const detailedPredictions = predictions.map((pred) => {
      const datasetItem = dataset[pred.index] || {};
      return {
        index: pred.index,
        question_id: pred.question_id || datasetItem.question_id,
        db_id: pred.db_id,
        question: datasetItem.question || datasetItem.query || '',
        predictedSQL: pred.sql ? pred.sql.split('\t----- bird -----\t')[0].trim() : '',
        groundTruthSQL: datasetItem.SQL ? datasetItem.SQL.trim() : '',
        duration: pred.duration || 0,
        error: pred.error || null,
      };
    });
    const detailedFilePath = path.join(resultsDir, `${taskId}_predictions_detailed.json`);
    await fs.writeFile(detailedFilePath, JSON.stringify(detailedPredictions, null, 2));

    return { predictions: filePath, groundTruth: groundTruthPath, diffJsonl: diffJsonlPath };
  }
}

module.exports = BenchmarkService;
