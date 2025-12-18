---
description: 生成 SQL 生成前的推理计划
category: sql-generation
version: 1.0
handoffs: []
---
## 用户输入

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果不为空）。

## 概述

目标：在生成 SQL 之前，先生成一个详细的推理计划，帮助 LLM 更好地理解和规划 SQL 生成过程。

注意：此命令生成的是推理计划（Markdown 格式），不包含 SQL 代码。推理计划将作为后续 SQL 生成的输入。

执行步骤：

1. **分析用户需求**
   - 从用户输入中提取查询问题
   - 识别查询类型和复杂度
   - 确定需要的上下文信息

2. **选择提示词模板**
   
   a. **判断查询类型**：
      - 如果是首次查询：使用 `User Prompt Template`
      - 如果有查询历史：使用 `Follow-up User Prompt Template`
   
   b. **加载提示词文件**：
      - System Prompt：`templates/prompt-templates/default/sql_generation_reasoning_system_prompt.txt`
      - User Prompt Template：
        - 首次查询：`templates/prompt-templates/default/sql_generation_reasoning_user_prompt_template.txt`
        - 后续查询：`templates/prompt-templates/default/sql_generation_reasoning_with_followup_user_prompt_template.txt`

3. **准备变量数据**

   a. **必需变量**：
      - `semantic_models`：语义模型列表
      - `query`：用户查询问题
      - `query_time`：当前系统时间
      - `language`：输出语言

   b. **可选变量**（如果提供）：
      - `instruction`：用户自定义指令
      - `data_samples`：数据样本
      - `sql_samples`：SQL 示例
      - `synonyms`：同义词列表
      - `docs`：业务知识文档
      - `histories`：查询历史

4. **执行变量替换**

   a. **加载 Jinja2 模板**：
      - 读取 System Prompt 模板文件
      - 读取 User Prompt Template 模板文件

   b. **替换变量**：
      - 使用 Jinja2 模板引擎替换所有 `{{ variable }}` 占位符
      - 处理 `{% if %}` 条件语句
      - 处理 `{% for %}` 循环语句

5. **调用 LLM**

   a. **构建消息**：
      - System Message：使用替换后的 System Prompt
      - User Message：使用替换后的 User Prompt Template

   b. **发送请求**：
      - 调用 LLM API
      - 传递 System Message 和 User Message

   c. **获取响应**：
      - 接收 LLM 的响应
      - 解析响应内容

6. **处理响应**

   a. **验证格式**：
      - 检查响应是否为 Markdown 格式
      - 检查是否包含 SQL 代码（不应该包含）
      - 检查是否包含代码块标记（不应该包含）

   b. **验证结构**：
      - 检查每个步骤是否以数字、标题（Markdown 粗体）和推理内容开始
      - 检查表名和列名格式是否正确

   c. **验证内容**：
      - 检查推理计划是否完整
      - 检查是否考虑了所有上下文信息
      - 检查时间处理是否正确

7. **返回结果**

   返回推理计划，包括：
   - Markdown 格式的推理计划
   - 相关信息（如果有）

## 行为规则

- **推理计划格式**：
  - 必须是纯 Markdown 格式（不包含代码块标记）
  - 每个步骤必须以数字、标题（Markdown 粗体）和推理内容开始
  - 不能包含 SQL 代码

- **命名规范**：
  - 表名格式：`table: <table_name>`
  - 列名格式：`column: <table_name>.<column_name>`

- **时间处理**：
  - 如果用户提供了具体时间（如 YYYY-MM-DD），使用绝对时间
  - 否则使用相对时间

- **语言一致性**：
  - 推理计划必须使用与用户输入语言相同的语言

- **内容要求**：
  - 必须考虑用户指令、SQL 示例和查询历史（如果提供）
  - 必须明确说明时间范围处理方式
  - 必须详细说明查询逻辑

## 示例执行

### 示例输入：
```
用户：查询每个国家的病例总数
```

### 执行过程：
1. **分析需求**：识别为聚合查询
2. **选择模板**：首次查询，使用 User Prompt Template
3. **准备变量**：
   - `semantic_models`: [语义模型内容]
   - `query`: "查询每个国家的病例总数"
   - `query_time`: "2025-01-27 10:30:00"
   - `language`: "简体中文"
4. **替换变量**：使用 Jinja2 替换所有变量
5. **调用 LLM**：发送提示词并获取响应
6. **处理响应**：验证格式和结构
7. **返回结果**：返回推理计划

### 示例输出：
```markdown
## 1. **理解查询需求**
用户想要查询每个国家的病例总数，这是一个聚合查询，需要按国家分组并统计病例总数。

## 2. **确定数据源**
根据语义模型，需要使用 `table: covid_data` 表，该表包含国家信息和病例数据。

## 3. **识别关键字段**
- 国家字段：`column: covid_data.country`
- 病例字段：`column: covid_data.cases`

## 4. **确定聚合方式**
需要对病例字段使用 SUM 聚合函数，按国家分组。

## 5. **构建查询逻辑**
查询逻辑为：按国家分组，对每个国家的病例数求和，返回国家名称和对应的病例总数。
```

## 注意事项

- 推理计划中**不能包含 SQL 代码**
- 每个步骤必须以数字、标题（Markdown 粗体）和推理内容开始
- 推理计划的语言必须与用户输入语言一致
- 必须考虑用户指令、SQL 示例和查询历史（如果提供）
- 时间处理必须明确说明（绝对时间 vs 相对时间）
- 表名和列名必须使用指定格式

## 相关资源

- **提示词模板**：`../templates/prompt-templates/default/sql_generation_reasoning_*.txt`
- **变量参考**：`../templates/variable-system/variable-reference.md`

Context for prioritization: {ARGS}
