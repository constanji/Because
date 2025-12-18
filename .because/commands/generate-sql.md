---
description: 将自然语言查询转换为 ANSI SQL 查询
category: sql-generation
version: 1.0
handoffs: []
scripts:
  sh: |
    # 可以添加预处理脚本
    echo "准备生成SQL查询"
---
## 用户输入

```text
$ARGUMENTS
```

在继续之前，你**必须**考虑用户输入（如果不为空）。

## 概述

目标：根据用户提供的自然语言查询，使用 SQL 生成提示词模板生成 ANSI SQL 查询。

注意：此命令需要用户提供查询问题，系统将根据语义模型、上下文信息和提示词模板生成 SQL 查询。

执行步骤：

1. **分析用户需求**
   - 从用户输入中提取查询意图和关键信息
   - 识别查询涉及的表、列和操作
   - 确定查询类型（SELECT、聚合、JOIN 等）
   - 识别时间范围、过滤条件等

2. **选择提示词模板**
   
   a. **判断查询类型**：
      - 如果是首次查询：使用 `User Prompt Template`
      - 如果有查询历史：使用 `Follow-up User Prompt Template`
   
   b. **加载提示词文件**：
      - System Prompt：`templates/prompt-templates/default/sql_generation_system_prompt.txt`
      - User Prompt Template：
        - 首次查询：`templates/prompt-templates/default/sql_generation_user_prompt_template.txt`
        - 后续查询：`templates/prompt-templates/default/sql_generation_with_followup_user_prompt_template.txt`

3. **准备变量数据**

   a. **必需变量**：
      - `semantic_models`：从项目配置或上下文加载语义模型列表
      - `query`：用户输入的查询问题
      - `query_time`：当前系统时间（格式：YYYY-MM-DD HH:mm:ss）
      - `language`：输出语言（如："简体中文"、"English"）

   b. **可选变量**（如果提供）：
      - `instruction`：用户自定义指令
      - `text_to_sql_rules`：SQL 生成规则（从 `templates/prompt-templates/default/text_to_sql_rules.txt` 加载）
      - `data_samples`：数据样本（用于帮助理解数据结构）
      - `sql_samples`：SQL 示例（用于学习 SQL 写法）
      - `synonyms`：同义词列表（用于理解业务术语）
      - `docs`：业务知识文档（用于理解业务逻辑）
      - `sql_generation_reasoning`：推理计划（如果已生成）

   c. **查询历史**（如果是后续查询）：
      - `histories`：之前的查询历史，包含问题和对应的 SQL

4. **执行变量替换**

   a. **加载 Jinja2 模板**：
      - 读取 System Prompt 模板文件
      - 读取 User Prompt Template 模板文件

   b. **替换变量**：
      - 使用 Jinja2 模板引擎替换所有 `{{ variable }}` 占位符
      - 处理 `{% if %}` 条件语句
      - 处理 `{% for %}` 循环语句
      - 确保所有必需变量都已替换

   c. **验证替换结果**：
      - 检查是否还有未替换的变量
      - 检查模板语法是否正确
      - 检查内容是否完整

5. **调用 LLM**

   a. **构建消息**：
      - System Message：使用替换后的 System Prompt
      - User Message：使用替换后的 User Prompt Template

   b. **发送请求**：
      - 调用 LLM API
      - 传递 System Message 和 User Message
      - 设置适当的参数（temperature、max_tokens 等）

   c. **获取响应**：
      - 接收 LLM 的响应
      - 解析响应内容

6. **处理响应**

   a. **验证格式**：
      - 检查响应是否为有效的 JSON 格式
      - 验证 JSON 结构：`{"sql": "<SQL_QUERY>"}`
      - 检查 SQL 字段是否存在

   b. **提取 SQL**：
      - 从 JSON 中提取 SQL 查询
      - 验证 SQL 语法（基本检查）
      - 确保是 ANSI SQL（标准 SQL）

   c. **验证 SQL**：
      - 检查是否使用了语义模型中定义的表和列
      - 检查是否有明显的语法错误
      - 检查是否符合 SQL 生成规则（如果提供）

7. **错误处理**

   a. **常见错误**：
      - LLM 响应格式错误：重新请求或解析
      - SQL 语法错误：记录错误并提示
      - 变量缺失：检查并补充必需变量
      - 模板加载失败：检查文件路径

   b. **错误恢复**：
      - 如果响应格式错误，尝试解析或重新请求
      - 如果 SQL 有语法错误，记录错误信息
      - 如果变量缺失，提示用户补充

8. **返回结果**

   返回生成的 SQL 查询，包括：
   - SQL 查询语句（ANSI SQL 格式）
   - 使用的语义模型信息
   - 变量替换记录（可选）
   - 错误信息（如果有）

## 行为规则

- **模板选择**：
  - 优先使用适合的模板（首次 vs 后续查询）
  - 如果提供了推理计划，必须使用包含推理计划的模板

- **变量替换**：
  - 必须替换所有必需变量
  - 可选变量根据实际情况决定是否使用
  - 替换值要准确具体
  - 替换后要检查模板完整性

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

- **错误处理**：
  - 妥善处理所有可能的错误情况
  - 提供清晰的错误信息
  - 记录错误用于调试

## 示例执行

### 示例输入：
```
用户：查询每个国家的病例总数
```

### 执行过程：
1. **分析需求**：聚合查询，按国家分组，统计病例总数
2. **选择模板**：首次查询，使用 `User Prompt Template`
3. **准备变量**：
   - `semantic_models`: [包含国家、病例的语义模型]
   - `query`: "查询每个国家的病例总数"
   - `query_time`: "2025-01-27 10:30:00"
   - `language`: "简体中文"
4. **加载模板**：加载 System Prompt 和 User Prompt Template
5. **替换变量**：使用 Jinja2 替换所有变量
6. **调用 LLM**：发送提示词并获取响应
7. **处理响应**：解析 JSON，提取 SQL
8. **返回结果**：返回 SQL 查询

### 示例输出：
```json
{
    "sql": "SELECT country, SUM(cases) as total_cases FROM covid_data GROUP BY country"
}
```

## 错误处理

### 常见错误：
1. **变量缺失**：用户输入信息不完整
   - 处理：检查必需变量，提示用户补充
   - 示例：缺少语义模型，提示加载语义模型

2. **模板加载失败**：提示词模板文件不存在
   - 处理：检查文件路径，使用默认模板
   - 示例：文件路径错误，使用备用路径

3. **LLM 响应格式错误**：响应不是有效的 JSON
   - 处理：尝试解析或重新请求
   - 示例：响应包含额外文本，提取 JSON 部分

4. **SQL 语法错误**：生成的 SQL 有语法问题
   - 处理：记录错误，提示用户检查
   - 示例：缺少 GROUP BY，补充 GROUP BY 子句

### 错误预防：
- 提前验证所有必需变量
- 使用模板前检查文件存在性
- 替换后立即检查模板完整性
- 最终输出前验证 SQL 格式

## 注意事项

- 必须生成 ANSI SQL（标准 SQL），后续会转换为特定数据库方言
- 如果提供了推理计划，必须按照计划逐步执行
- 必须遵循用户自定义指令（如果提供）
- 参考 SQL 示例学习模式结构和 SQL 写法
- 考虑查询历史上下文（如果是后续查询）
- 确保 SQL 使用语义模型中定义的表和列名

## 相关资源

- **提示词模板**：`../templates/prompt-templates/default/sql_generation_*.txt`
- **SQL 规则指南**：`../templates/guides/sql-rules-guide.md`
- **变量参考**：`../templates/variable-system/variable-reference.md`

Context for prioritization: {ARGS}
