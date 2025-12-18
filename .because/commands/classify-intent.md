---
description: 分类用户查询意图（TEXT_TO_SQL / GENERAL / MISLEADING_QUERY）
category: intent-classification
version: 1.0
handoffs: []
---
## 用户输入

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果不为空）。

## 概述

目标：根据用户查询和上下文信息，将用户查询分类为三种意图之一：`TEXT_TO_SQL`、`GENERAL` 或 `MISLEADING_QUERY`。

注意：此命令需要用户提供查询问题，系统将根据语义模型和查询历史对用户意图进行分类。

执行步骤：

1. **分析用户需求**
   - 从用户输入中提取查询问题
   - 识别是否有查询历史
   - 确定需要的上下文信息

2. **选择提示词模板**
   
   a. **加载提示词文件**：
      - System Prompt：`templates/prompt-templates/default/intent_classification_system_prompt.txt`
      - User Prompt Template：`templates/prompt-templates/default/intent_classification_user_prompt_template.txt`

3. **准备变量数据**

   a. **必需变量**：
      - `query`：当前用户查询
      - `query_time`：当前系统时间（格式：YYYY-MM-DD HH:mm:ss）
      - `language`：输出语言（如："简体中文"、"English"）

   b. **可选变量**（如果提供）：
      - `semantic_models`：语义模型列表
      - `histories`：之前的查询历史
      - `instruction`：用户自定义指令

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
      - 检查响应是否为有效的 JSON 格式
      - 验证 JSON 结构：
        ```json
        {
            "rephrased_question": "...",
            "reasoning": "...",
            "intent": "TEXT_TO_SQL" | "GENERAL" | "MISLEADING_QUERY"
        }
        ```

   b. **提取分类结果**：
      - 提取意图分类（intent）
      - 提取重述问题（rephrased_question，如果有）
      - 提取推理（reasoning）

   c. **验证分类**：
      - 检查意图是否为有效值
      - 检查推理长度（最多 20 个词）

7. **返回结果**

   返回意图分类结果，包括：
   - 意图分类（TEXT_TO_SQL / GENERAL / MISLEADING_QUERY）
   - 重述问题（如果有）
   - 推理说明（最多 20 个词）
   - 错误信息（如果有）

## 行为规则

- **意图定义**：
  - **TEXT_TO_SQL**：查询与数据库模式相关，需要生成 SQL
  - **GENERAL**：查询关于数据库模式的一般信息
  - **MISLEADING_QUERY**：查询与数据库模式无关或缺乏详细信息

- **上下文考虑**：
  - 如果有查询历史，必须结合上下文理解当前查询
  - 后续问题应重述为完整的独立问题
  - 时间相关信息不应在重述时修改

- **语言一致性**：
  - 重述问题和推理必须使用与用户输出语言相同的语言
  - 推理必须清晰、简洁，限制在 20 个词以内

- **错误处理**：
  - 如果查询模糊或与模式无关，分类为 MISLEADING_QUERY
  - 妥善处理所有可能的错误情况
  - 提供清晰的错误信息

## 示例执行

### 示例输入：
```
用户：查询每个国家的病例总数
```

### 执行过程：
1. **分析需求**：识别为数据库查询相关
2. **选择模板**：加载意图分类模板
3. **准备变量**：
   - `query`: "查询每个国家的病例总数"
   - `query_time`: "2025-01-27 10:30:00"
   - `language`: "简体中文"
4. **替换变量**：使用 Jinja2 替换所有变量
5. **调用 LLM**：发送提示词并获取响应
6. **处理响应**：解析 JSON，提取分类结果
7. **返回结果**：返回意图分类

### 示例输出：
```json
{
    "rephrased_question": "查询每个国家的病例总数",
    "reasoning": "查询涉及数据库表和列，需要生成SQL",
    "intent": "TEXT_TO_SQL"
}
```

## 意图分类规则

### TEXT_TO_SQL
- **何时使用**：
  - 用户的输入与数据库模式相关，需要 SQL 查询
  - 问题包含对特定表、列或数据详情的引用
  - 用户的输入是关于修改之前问题的 SQL

- **要求**：
  - 在推理中包含模式中的特定表和列名
  - 引用用户输入中与模式明确相关的短语

- **示例**：
  - "上个季度的总销售额是多少？"
  - "显示所有购买了产品 X 的客户。"
  - "列出收入排名前 10 的产品。"

### GENERAL
- **何时使用**：
  - 用户寻求关于数据库模式或其整体功能的一般信息
  - 组合的查询没有提供足够的细节来生成特定的 SQL 查询

- **要求**：
  - 突出用户输入中表示与特定模式细节无关的一般询问的短语

- **示例**：
  - "这个数据集是关于什么的？"
  - "告诉我更多关于数据库的信息。"
  - "我如何用这些数据分析客户行为？"

### MISLEADING_QUERY
- **何时使用**：
  - 用户的输入与数据库模式无关或包含 SQL 代码
  - 用户的输入缺乏生成 SQL 查询所需的特定细节（如表名或列）
  - 它看起来偏离主题或只是随意的对话开场白

- **要求**：
  - 结合用户输入中表示与数据库模式缺乏相关性的短语

- **示例**：
  - "你好吗？"
  - "今天天气怎么样？"
  - "给我讲个笑话。"

## 注意事项

- 如果有之前的查询，必须结合上下文理解当前查询
- 后续问题应重述为完整的独立问题
- 时间相关信息不应在重述时修改
- 模糊查询应分类为 MISLEADING_QUERY
- 推理必须清晰、简洁，限制在 20 个词以内

## 相关资源

- **提示词模板**：`../templates/prompt-templates/default/intent_classification_*.txt`
- **变量参考**：`../templates/variable-system/variable-reference.md`

Context for prioritization: {ARGS}
