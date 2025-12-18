---
description: Agentic 模式的文本转 SQL 工具
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

目标：在 Agentic 模式下，将自然语言查询转换为 ANSI SQL 查询。

注意：这是 Agentic 模式下的文本转SQL工具，输出格式是纯 SQL（不是 JSON），系统提示和用户提示合并在一起。

执行步骤：

1. **分析用户需求**
   - 从用户输入中提取查询问题
   - 识别需要的上下文信息

2. **选择提示词模板**
   
   a. **判断查询类型**：
      - 如果是首次查询：使用 `User Prompt Template`
      - 如果有查询历史：使用 `Follow-up User Prompt Template`
   
   b. **加载提示词文件**：
      - Agentic 模式下的提示词模板：
        - 首次查询：`templates/prompt-templates/agentic/text_to_sql_user_prompt.txt`
        - 后续查询：`templates/prompt-templates/agentic/text_to_sql_with_followup_user_prompt.txt`

3. **准备变量数据**

   a. **必需变量**：
      - `semantic_models`：语义模型列表
      - `query`：用户查询问题
      - `query_time`：当前系统时间

   b. **可选变量**（如果提供）：
      - `instruction`：用户自定义指令
      - `text_to_sql_rules`：SQL 生成规则
      - `data_samples`：数据样本
      - `sql_samples`：SQL 示例
      - `synonyms`：同义词列表
      - `docs`：业务知识文档
      - `histories`：查询历史

4. **执行变量替换**

   a. **加载 Jinja2 模板**：
      - 读取 Agentic 模式的用户提示模板文件

   b. **替换变量**：
      - 使用 Jinja2 模板引擎替换所有 `{{ variable }}` 占位符
      - 处理 `{% if %}` 条件语句
      - 处理 `{% for %}` 循环语句

5. **调用 LLM**

   a. **构建消息**：
      - 注意：Agentic 模式下，系统提示和用户提示合并在一起
      - User Message：使用替换后的完整提示词模板

   b. **发送请求**：
      - 调用 LLM API
      - 传递 User Message

   c. **获取响应**：
      - 接收 LLM 的响应
      - 解析 SQL 查询（纯 SQL 格式，不是 JSON）

6. **处理响应**

   a. **验证格式**：
      - 检查响应是否为有效的 SQL 语句
      - 验证 SQL 语法（基本检查）
      - 确保是 ANSI SQL（标准 SQL）

   b. **验证 SQL**：
      - 检查是否使用了语义模型中定义的表和列
      - 检查是否有明显的语法错误
      - 检查是否符合 SQL 生成规则（如果提供）

7. **返回结果**

   返回生成的 SQL 查询，包括：
   - SQL 查询语句（ANSI SQL 格式，纯 SQL）
   - 错误信息（如果有）

## 行为规则

- **输出格式**：
  - 必须返回纯 SQL 查询（不是 JSON 格式）
  - 系统提示和用户提示合并在一起

- **SQL 生成**：
  - 必须生成 ANSI SQL（标准 SQL）
  - 不能包含特定数据库的方言特性
  - 必须使用语义模型中定义的表和列
  - 必须遵循 SQL 生成规则（如果提供）

- **质量保证**：
  - 生成的 SQL 必须语法正确
  - SQL 必须能正确表达用户查询意图
  - 必须考虑查询历史和上下文
  - 必须遵循用户自定义指令（如果提供）

## 与默认模式的区别

1. **提示词结构**：
   - 默认模式：System Prompt + User Prompt Template（分离）
   - Agentic 模式：合并在一起（只有 User Prompt Template）

2. **输出格式**：
   - 默认模式：JSON 格式 `{"sql": "..."}`
   - Agentic 模式：纯 SQL 格式

3. **使用场景**：
   - 默认模式：独立使用
   - Agentic 模式：由主代理调用

## 示例执行

### 示例输入：
```
query: "查询每个国家的病例总数"
semantic_models: [...]
```

### 执行过程：
1. **分析需求**：识别为 SQL 生成需求
2. **选择模板**：首次查询，使用 Agentic 模式模板
3. **准备变量**：准备所有必需的变量
4. **替换变量**：使用 Jinja2 替换所有变量
5. **调用 LLM**：发送合并后的提示词
6. **处理响应**：解析纯 SQL 响应
7. **返回结果**：返回 SQL 查询

### 示例输出：
```sql
SELECT country, SUM(cases) as total_cases 
FROM covid_data 
GROUP BY country
```

## 注意事项

- 输出格式是纯 SQL，不是 JSON
- 系统提示和用户提示合并在一起
- 必须生成 ANSI SQL（标准 SQL）
- 必须遵循用户自定义指令（如果提供）
- 考虑查询历史上下文（如果是后续查询）

## 相关资源

- **提示词模板**：`../templates/prompt-templates/agentic/text_to_sql_*.txt`
- **主代理命令**：`main-agent.md`
- **SQL 规则指南**：`../../templates/guides/sql-rules-guide.md`

Context for prioritization: {ARGS}
