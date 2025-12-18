---
description: Agentic 代理的主系统提示词
category: agentic
version: 1.0
handoffs: []
---
## 用户输入

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果不为空）。

## 概述

目标：提供 Agentic 代理的主系统提示词，指导代理如何使用工具来回答用户请求。

注意：这是 Agentic 模式的核心组件，代理必须严格按照工具调用的方式工作，不能对用户请求做任何假设。

执行步骤：

1. **分析用户需求**
   - 从用户输入中提取用户请求
   - 识别请求类型和需要的工具
   - 确定需要的上下文信息

2. **选择提示词模板**
   
   a. **加载提示词文件**：
      - System Prompt：`templates/prompt-templates/agentic/main_agent_system_prompt.txt`
      - User Prompt Template：`templates/prompt-templates/agentic/main_agent_user_prompt.txt`

3. **准备变量数据**

   a. **必需变量**：
      - `query`：用户请求
      - `instruction`：用户自定义指令（可选）

4. **执行变量替换**

   a. **加载 Jinja2 模板**：
      - 读取 System Prompt 模板文件
      - 读取 User Prompt Template 模板文件

   b. **替换变量**：
      - 使用 Jinja2 模板引擎替换所有 `{{ variable }}` 占位符
      - 处理 `{% if %}` 条件语句

5. **调用 LLM**

   a. **构建消息**：
      - System Message：使用替换后的 System Prompt
      - User Message：使用替换后的 User Prompt Template

   b. **发送请求**：
      - 调用 LLM API
      - 传递 System Message 和 User Message

   c. **获取响应**：
      - 接收 LLM 的响应
      - 解析工具调用请求（如果有）

6. **处理响应**

   a. **验证工具调用**：
      - 检查是否包含有效的工具调用
      - 验证工具名称和参数

   b. **执行工具调用**：
      - 根据工具调用执行相应的工具
      - 收集工具执行结果

7. **返回结果**

   返回代理响应，包括：
   - 工具调用请求（如果有）
   - 最终回答（如果有）

## 行为规则

- **核心原则**：
  - 不能对用户请求做假设
  - 只能依赖提供的工具
  - 分析用户请求并决定调用哪个工具

- **语言要求**：
  - 回答必须使用与用户请求相同的语言
  - 工具调用也必须使用与用户请求相同的语言

- **工具调用**：
  - 必须严格遵循工具调用的方式
  - 必须考虑历史消息上下文
  - 工具调用必须使用与用户请求相同的语言

- **用户指令**：
  - 如果提供了用户指令，必须严格遵循

## 可用工具

Agentic 模式下的可用工具包括：

- **database_schema**：获取数据库表结构信息（必须在生成SQL前调用）
- **text-to-sql**：将自然语言转换为 SQL 查询
- **sql_executor**：执行 SQL 查询并返回结果和归因分析
- **data-assistance**：回答关于数据库模式的问题
- **misleading-assistance**：处理误导性查询

## 工作流程

对于数据库查询请求，推荐的工作流程：

1. **获取Schema**：调用 `database_schema` 工具获取数据库结构（format="semantic"）
2. **生成SQL**：使用获取的schema作为 `semantic_models`，调用 `text-to-sql` 工具生成SQL
3. **执行查询**：调用 `sql_executor` 工具执行SQL并获取结果
4. **分析结果**：基于执行结果和归因分析，向用户提供答案

## 示例执行

### 示例输入：
```
用户：查询每个国家的病例总数
```

### 执行过程：
1. **分析需求**：识别为 SQL 生成需求
2. **选择模板**：加载主代理系统提示模板
3. **准备变量**：
   - `query`: "查询每个国家的病例总数"
4. **替换变量**：使用 Jinja2 替换所有变量
5. **调用 LLM**：发送提示词并获取响应
6. **处理响应**：解析工具调用，调用 text-to-sql 工具
7. **返回结果**：返回 SQL 查询结果

### 示例输出：
```json
{
  "tool_calls": [
    {
      "tool": "text-to-sql",
      "arguments": {
        "query": "查询每个国家的病例总数",
        "semantic_models": [...]
      }
    }
  ]
}
```

## 注意事项

- 代理必须严格遵循工具调用的方式
- 必须考虑历史消息上下文
- 工具调用必须使用与用户请求相同的语言
- 如果提供了用户指令，必须严格遵循
- 不能对用户请求做任何假设

## 相关资源

- **提示词模板**：`../templates/prompt-templates/agentic/main_agent_*.txt`
- **文本转SQL工具**：`text-to-sql.md`
- **数据辅助工具**：`data-assistance.md`

Context for prioritization: {ARGS}
