---
description: 处理误导性查询，帮助用户理解数据并建议更好的问题
category: misleading-assistance
version: 1.0
handoffs: []
---
## 用户输入

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果不为空）。

## 概述

目标：识别和处理误导性查询，帮助用户理解数据并建议更好的问题。

注意：此命令用于处理与数据库模式无关或缺乏详细信息的查询，提供友好的引导和建议。

执行步骤：

1. **分析用户需求**
   - 从用户输入中提取查询问题
   - 识别查询是否为误导性查询
   - 确定需要的语义模型信息

2. **选择提示词模板**
   
   a. **加载提示词文件**：
      - System Prompt：`templates/prompt-templates/default/misleading_assistance_system_prompt.txt`
      - User Prompt Template：`templates/prompt-templates/default/misleading_assistance_user_prompt_template.txt`

3. **准备变量数据**

   a. **必需变量**：
      - `semantic_models`：语义模型列表
      - `query`：用户查询问题
      - `query_time`：当前系统时间
      - `language`：输出语言（如："简体中文"、"English"）

4. **执行变量替换**

   a. **加载 Jinja2 模板**：
      - 读取 System Prompt 模板文件
      - 读取 User Prompt Template 模板文件

   b. **替换变量**：
      - 使用 Jinja2 模板引擎替换所有 `{{ variable }}` 占位符
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
      - 检查是否包含 SQL 代码（应该不包含）

   b. **验证长度**：
      - 中文/韩文/日文：最多 150 词
      - 其他语言：最多 110 词

   c. **验证内容**：
      - 检查是否提供了友好的建议
      - 检查建议的问题是否基于数据库模式
      - 检查是否帮助用户理解数据

7. **返回结果**

   返回误导查询处理回答，包括：
   - Markdown 格式的回答内容
   - 建议的更好问题（如果有）

## 行为规则

- **回答格式**：
  - 必须使用 Markdown 格式
  - 不能包含 SQL 代码
  - 使用适当的换行、空白和格式（标题、列表、表格等）

- **长度限制**：
  - 中文/韩文/日文：最多 150 词
  - 其他语言：最多 110 词

- **语言一致性**：
  - 回答必须使用与用户指定的语言相同的语言

- **建议要求**：
  - 建议的问题必须考虑数据库模式
  - 提供友好、有用的引导
  - 帮助用户理解如何正确提问

## 示例执行

### 示例输入：
```
用户：你好吗？
```

### 执行过程：
1. **分析需求**：识别为误导性查询（与数据库无关）
2. **选择模板**：加载误导查询处理模板
3. **准备变量**：
   - `semantic_models`: [语义模型内容]
   - `query`: "你好吗？"
   - `query_time`: "2025-01-27 10:30:00"
   - `language`: "简体中文"
4. **替换变量**：使用 Jinja2 替换所有变量
5. **调用 LLM**：发送提示词并获取响应
6. **处理响应**：验证格式和长度
7. **返回结果**：返回友好的引导信息

### 示例输出：
```markdown
您好！我是您的数据查询助手，可以帮助您查询数据库中的信息。

## 我可以帮助您
- 查询数据：例如"查询每个国家的病例总数"
- 了解数据结构：例如"这个数据集包含哪些字段？"
- 分析数据趋势：例如"最近一个月的病例增长趋势如何？"

## 建议的查询示例
基于当前数据库，您可以尝试：
- "查询各个国家的病例总数"
- "显示最近一周的新增病例"
- "比较不同地区的病例分布"

请告诉我您想查询什么数据，我会帮助您生成相应的查询。
```

## 注意事项

- 回答必须使用与用户指定的语言相同的语言
- 使用适当的 Markdown 格式（标题、列表、表格等）
- 必须基于数据库模式建议更好的问题
- 不能提供 SQL 代码，只能提供指导性信息和建议
- 严格遵守长度限制
- 提供友好、有用的引导

## 相关资源

- **提示词模板**：`../templates/prompt-templates/default/misleading_assistance_*.txt`
- **变量参考**：`../templates/variable-system/variable-reference.md`

Context for prioritization: {ARGS}
