# SQL 生成规则指南

本指南说明 SQL 生成规则的用途、内容和最佳实践。

## 概述

SQL 生成规则（`text_to_sql_rules`）用于约束和指导 LLM 生成符合要求的 ANSI SQL 查询。这些规则确保生成的 SQL 查询：

- 符合 ANSI SQL 标准
- 安全可靠（只读操作）
- 语法正确
- 性能良好
- 易于维护

## 规则内容

SQL 生成规则通常包含以下类型的约束：

### 1. 操作限制
- **只允许 SELECT**：禁止 DELETE、UPDATE、INSERT 等修改数据的操作
- **只使用指定表**：只能使用语义模型中定义的表和列

### 2. 语法规范
- **列名限定**：必须使用表名或别名限定列名
- **JOIN 使用**：多表查询必须使用 JOIN
- **别名规范**：别名不能使用 SQL 关键字，不能包含点号

### 3. 函数使用
- **大小写不敏感比较**：使用 `lower()` 函数进行比较
- **时间戳转换**：时间字段需要适当的转换函数
- **聚合函数位置**：聚合函数不能在 WHERE 子句中使用

### 4. 格式要求
- **无注释**：生成的 SQL 不包含注释和换行
- **日期范围**：特定日期查询使用日期范围

## 规则文件位置

默认规则文件位于：
```
templates/prompt-templates/default/text_to_sql_rules.txt
```

Agentic 模式的规则文件位于：
```
templates/prompt-templates/agentic/text_to_sql_rules.txt
```

## 使用方式

在 SQL 生成命令中，规则会作为可选变量传递给模板：

```yaml
text_to_sql_rules: |
  - ONLY USE SELECT statements
  - MUST USE JOIN for multiple tables
  ...
```

或者从文件加载：

```python
with open('templates/prompt-templates/default/text_to_sql_rules.txt') as f:
    text_to_sql_rules = f.read()
```

## 规则示例

典型的 SQL 生成规则包括：

```
- ONLY USE SELECT statements, NO DELETE, UPDATE OR INSERT etc.
- ONLY USE the tables and columns mentioned in the database schema.
- ONLY USE "*" if the user query asks for all the columns of a table.
- ALWAYS QUALIFY column names with their table name or table alias.
- YOU MUST USE "JOIN" if you choose columns from multiple tables!
- YOU MUST USE "lower(<table_name>.<column_name>) like lower(<value>)" 
  for case-insensitive comparison!
- If the column is date/time related field, and it is a INT/BIGINT/DOUBLE/FLOAT type, 
  please use the appropriate function to cast the column to "TIMESTAMP" type first.
- DON'T USE '.' in column/table alias, replace '.' with '_'.
- Aggregate functions are not allowed in the WHERE clause. 
  Instead, they belong in the HAVING clause.
```

## 最佳实践

### 1. 规则编写
- **清晰明确**：规则应该清晰明确，避免歧义
- **具体可操作**：规则应该具体可操作，不要过于抽象
- **完整覆盖**：覆盖常见的 SQL 生成场景和问题

### 2. 规则维护
- **定期审查**：定期审查规则的有效性
- **更新迭代**：根据实际使用情况更新规则
- **版本管理**：对规则文件进行版本管理

### 3. 规则应用
- **强制使用**：确保规则在 SQL 生成时被应用
- **验证检查**：对生成的 SQL 进行规则验证
- **错误提示**：当 SQL 违反规则时提供清晰的错误提示

## 自定义规则

你可以根据项目需求自定义 SQL 生成规则：

1. **复制规则文件**：
   ```bash
   cp templates/prompt-templates/default/text_to_sql_rules.txt \
      templates/prompt-templates/default/text_to_sql_rules_custom.txt
   ```

2. **修改规则内容**：
   根据需要添加、删除或修改规则

3. **在命令中使用**：
   在 SQL 生成命令中引用自定义规则文件

## 相关资源

- **默认规则文件**：`templates/prompt-templates/default/text_to_sql_rules.txt`
- **Agentic 规则文件**：`templates/prompt-templates/agentic/text_to_sql_rules.txt`
- **SQL 生成命令**：`../../commands/generate-sql.md`

---

**最后更新**：2025-01-27  
**版本**：1.0.0
