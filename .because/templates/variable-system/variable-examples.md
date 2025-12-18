# 变量使用示例

本文档提供 BeCause 智能问数工具系统中变量的实际使用示例。

## SQL 生成示例

### 基本 SQL 生成

```yaml
# 变量配置
query: "查询每个国家的病例总数"
query_time: "2025-01-27 10:30:00"
semantic_models:
  - name: covid_data
    description: COVID-19 病例数据
    model: ref('covid_cases')
    entities:
      - name: country
        description: 国家名称
        type: primary
    measures:
      - name: cases
        description: 病例数量
        agg: sum
language: "简体中文"
```

**生成的 SQL**：
```sql
SELECT country, SUM(cases) as total_cases 
FROM covid_data 
GROUP BY country
```

### 带 SQL 示例的生成

```yaml
query: "查询中国和美国的病例总数"
query_time: "2025-01-27 10:30:00"
semantic_models: [...]
language: "简体中文"
sql_samples:
  - question: "查询每个国家的病例总数"
    sql: "SELECT country, SUM(cases) FROM covid_data GROUP BY country"
  - question: "查询中国的病例数"
    sql: "SELECT SUM(cases) FROM covid_data WHERE country = 'China'"
```

### 带同义词的生成

```yaml
query: "查询每个国家的感染人数"
query_time: "2025-01-27 10:30:00"
semantic_models: [...]
language: "简体中文"
synonyms:
  - noun: "病例"
    synonyms: ["感染", "确诊", "患者"]
```

### 带业务知识的生成

```yaml
query: "查询最近一周的新增病例"
query_time: "2025-01-27 10:30:00"
semantic_models: [...]
language: "简体中文"
docs:
  - "COVID-19 病例数据每日更新"
  - "新增病例 = 当日病例数 - 前一日病例数"
  - "时间字段使用 YYYY-MM-DD 格式"
```

### 带推理计划的生成

```yaml
query: "查询每个国家的病例总数"
query_time: "2025-01-27 10:30:00"
semantic_models: [...]
language: "简体中文"
sql_generation_reasoning: |
  ## 1. **理解查询需求**
  用户想要查询每个国家的病例总数...

  ## 2. **确定数据源**
  根据语义模型，需要使用 covid_data 表...
```

## 意图分类示例

### 基本意图分类

```yaml
query: "查询每个国家的病例总数"
query_time: "2025-01-27 10:30:00"
language: "简体中文"
```

**分类结果**：
```json
{
  "rephrased_question": "查询每个国家的病例总数",
  "reasoning": "查询涉及数据库表和列，需要生成SQL",
  "intent": "TEXT_TO_SQL"
}
```

### 带历史上下文的分类

```yaml
query: "也查询一下美国的"
query_time: "2025-01-27 10:30:00"
language: "简体中文"
histories:
  - question: "查询中国的病例数"
    sql: "SELECT SUM(cases) FROM covid_data WHERE country = 'China'"
```

**分类结果**：
```json
{
  "rephrased_question": "查询美国的病例数",
  "reasoning": "基于历史查询，用户想要查询美国的病例数",
  "intent": "TEXT_TO_SQL"
}
```

### 误导查询分类

```yaml
query: "你好吗？"
query_time: "2025-01-27 10:30:00"
language: "简体中文"
```

**分类结果**：
```json
{
  "rephrased_question": "你好吗？",
  "reasoning": "查询与数据库模式无关，是闲聊内容",
  "intent": "MISLEADING_QUERY"
}
```

## 数据辅助示例

### 基本数据辅助

```yaml
query: "这个数据集是关于什么的？"
semantic_models:
  - name: covid_data
    description: COVID-19 病例数据
language: "简体中文"
```

**回答示例**：
```markdown
这个数据集包含全球 COVID-19 病例信息，主要包括：

## 数据内容
- **国家/地区**：各个国家和地区的名称
- **病例数量**：每日新增和累计病例数
- **日期信息**：记录每个数据点的时间

## 用途
数据集可用于分析不同地区的疫情趋势...
```

## 误导查询处理示例

### 基本误导查询处理

```yaml
query: "今天天气怎么样？"
query_time: "2025-01-27 10:30:00"
semantic_models:
  - name: covid_data
    description: COVID-19 病例数据
language: "简体中文"
```

**回答示例**：
```markdown
您好！我是您的数据查询助手，可以帮助您查询数据库中的信息。

## 我可以帮助您
- 查询数据：例如"查询每个国家的病例总数"
- 了解数据结构：例如"这个数据集包含哪些字段？"

## 建议的查询示例
基于当前数据库，您可以尝试：
- "查询各个国家的病例总数"
- "显示最近一周的新增病例"
```

## 推理生成示例

### 基本推理生成

```yaml
query: "查询每个国家的病例总数"
query_time: "2025-01-27 10:30:00"
semantic_models: [...]
language: "简体中文"
```

**推理计划示例**：
```markdown
## 1. **理解查询需求**
用户想要查询每个国家的病例总数，这是一个聚合查询，需要按国家分组并统计病例总数。

## 2. **确定数据源**
根据语义模型，需要使用 covid_data 表，该表包含国家信息和病例数据。

## 3. **识别关键字段**
- 国家字段：covid_data.country
- 病例字段：covid_data.cases

## 4. **确定聚合方式**
需要对病例字段使用 SUM 聚合函数，按国家分组。

## 5. **构建查询逻辑**
查询逻辑为：按国家分组，对每个国家的病例数求和，返回国家名称和对应的病例总数。
```

## Agentic 模式示例

### 主代理调用

```yaml
query: "查询每个国家的病例总数"
instruction: "所有结果保留两位小数"
```

**代理响应**：
```json
{
  "tool_calls": [
    {
      "tool": "text-to-sql",
      "arguments": {
        "query": "查询每个国家的病例总数",
        "semantic_models": [...],
        "instruction": "所有结果保留两位小数"
      }
    }
  ]
}
```

## 完整工作流示例

### 端到端 SQL 生成

```yaml
# 步骤1: 意图分类
classify_intent:
  query: "查询每个国家的病例总数"
  language: "简体中文"
  
# 结果: TEXT_TO_SQL

# 步骤2: 生成推理计划
generate_reasoning:
  query: "查询每个国家的病例总数"
  semantic_models: [...]
  language: "简体中文"

# 步骤3: 生成 SQL
generate_sql:
  query: "查询每个国家的病例总数"
  semantic_models: [...]
  sql_generation_reasoning: [从步骤2获得]
  language: "简体中文"
  
# 最终 SQL
SELECT country, SUM(cases) as total_cases 
FROM covid_data 
GROUP BY country
```

## 注意事项

1. **变量类型**：确保变量类型与模板期望的类型匹配
2. **必需变量**：确保所有必需变量都已提供
3. **格式验证**：某些变量有特定格式要求，使用前请验证
4. **上下文关联**：某些变量（如 histories）需要在多次调用间保持一致性

## 相关资源

- **变量参考**：`variable-reference.md`
- **命令文档**：`../../commands/`
- **模板文件**：`../prompt-templates/`

---

**最后更新**：2025-01-27  
**版本**：1.0.0
