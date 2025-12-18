# 变量参考手册

本手册列出了 BeCause 智能问数工具系统中所有可用的变量及其用法。

## 变量分类

### 必需变量

这些变量是命令执行所必需的，必须提供。

#### query
- **类型**：字符串
- **说明**：用户的自然语言查询问题
- **示例**：`"查询每个国家的病例总数"`
- **使用位置**：所有命令

#### query_time
- **类型**：字符串（日期时间格式）
- **说明**：当前系统时间
- **格式**：`YYYY-MM-DD HH:mm:ss`
- **示例**：`"2025-01-27 10:30:00"`
- **使用位置**：SQL 生成、意图分类、误导查询处理

#### semantic_models
- **类型**：列表（字符串数组）
- **说明**：语义模型列表，描述数据库结构和业务含义
- **示例**：
  ```yaml
  - name: covid_data
    description: COVID-19 病例数据
    entities:
      - name: country
        description: 国家名称
    measures:
      - name: cases
        description: 病例数量
        agg: sum
  ```
- **使用位置**：SQL 生成、意图分类、数据辅助、误导查询处理

#### language
- **类型**：字符串
- **说明**：输出语言
- **可选值**：`"简体中文"`, `"English"`, `"繁体中文"` 等
- **示例**：`"简体中文"`
- **使用位置**：所有命令

### 可选变量

这些变量可以根据实际情况选择是否提供。

#### instruction
- **类型**：字符串
- **说明**：用户自定义指令，用于指导 SQL 生成或回答
- **示例**：`"所有金额结果保留两位小数"`
- **使用位置**：SQL 生成、意图分类、推理生成

#### text_to_sql_rules
- **类型**：字符串（多行文本）
- **说明**：SQL 生成规则，定义 SQL 生成的约束和规范
- **来源**：通常从 `templates/prompt-templates/default/text_to_sql_rules.txt` 加载
- **使用位置**：SQL 生成

#### data_samples
- **类型**：列表（字符串数组）
- **说明**：数据样本，用于帮助理解数据结构
- **示例**：
  ```json
  [
    "country: China, cases: 1000",
    "country: USA, cases: 2000"
  ]
  ```
- **使用位置**：SQL 生成、推理生成

#### sql_samples
- **类型**：列表（对象数组）
- **说明**：SQL 示例，包含问题和对应的 SQL 查询
- **格式**：
  ```json
  [
    {
      "question": "查询每个国家的病例总数",
      "sql": "SELECT country, SUM(cases) FROM covid_data GROUP BY country"
    }
  ]
  ```
- **使用位置**：SQL 生成、推理生成

#### synonyms
- **类型**：列表（对象数组）
- **说明**：同义词列表，用于理解业务术语
- **格式**：
  ```json
  [
    {
      "noun": "病例",
      "synonyms": ["感染", "确诊", "患者"]
    }
  ]
  ```
- **使用位置**：SQL 生成、推理生成

#### docs
- **类型**：列表（字符串数组）
- **说明**：业务知识文档，提供额外的业务上下文
- **示例**：
  ```json
  [
    "COVID-19 病例数据每日更新",
    "病例数量包括确诊和疑似病例"
  ]
  ```
- **使用位置**：SQL 生成、推理生成

#### histories
- **类型**：列表（对象数组）
- **说明**：查询历史，包含之前的问题和对应的 SQL
- **格式**：
  ```json
  [
    {
      "question": "查询中国的病例数",
      "sql": "SELECT SUM(cases) FROM covid_data WHERE country = 'China'"
    }
  ]
  ```
- **使用位置**：SQL 生成、意图分类、推理生成（后续查询）

#### sql_generation_reasoning
- **类型**：字符串（Markdown 格式）
- **说明**：SQL 生成前的推理计划
- **来源**：通常由 `generate-reasoning` 命令生成
- **使用位置**：SQL 生成

## 变量使用示例

### SQL 生成示例

```yaml
query: "查询每个国家的病例总数"
query_time: "2025-01-27 10:30:00"
semantic_models:
  - name: covid_data
    description: COVID-19 病例数据
language: "简体中文"
text_to_sql_rules: |
  - ONLY USE SELECT statements
  - MUST USE JOIN for multiple tables
sql_samples:
  - question: "查询中国的病例数"
    sql: "SELECT SUM(cases) FROM covid_data WHERE country = 'China'"
```

### 意图分类示例

```yaml
query: "查询每个国家的病例总数"
query_time: "2025-01-27 10:30:00"
language: "简体中文"
semantic_models:
  - name: covid_data
    description: COVID-19 病例数据
histories:
  - question: "中国的病例数是多少"
    sql: "SELECT SUM(cases) FROM covid_data WHERE country = 'China'"
```

### 数据辅助示例

```yaml
query: "这个数据集是关于什么的？"
semantic_models:
  - name: covid_data
    description: COVID-19 病例数据
language: "简体中文"
```

## 变量替换语法

在 Jinja2 模板中使用以下语法：

- **基本变量**：`{{ variable_name }}`
- **条件判断**：`{% if variable_name %}...{% endif %}`
- **循环遍历**：`{% for item in list %}...{% endfor %}`
- **连接操作**：`{{ list|join(', ') }}`

## 注意事项

1. **必需变量检查**：使用模板前必须确保所有必需变量都已提供
2. **类型匹配**：确保变量类型与模板期望的类型匹配
3. **空值处理**：可选变量可以为空，模板会使用条件判断处理
4. **格式验证**：某些变量有特定格式要求，使用前请验证格式

## 相关资源

- **变量示例**：`variable-examples.md`
- **模板文件**：`../prompt-templates/`
- **命令文档**：`../../commands/`

---

**最后更新**：2025-01-27  
**版本**：1.0.0
