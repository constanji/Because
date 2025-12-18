# 语义模型使用指南

本指南说明语义模型在 BeCause 智能问数工具系统中的用途和使用方法。

## 概述

语义模型（Semantic Model）是 BeCause 系统的核心概念，它描述了数据库的结构和业务含义，帮助 LLM 理解用户查询并生成正确的 SQL。

## 语义模型结构

语义模型通常包含以下元素：

- **name**：模型名称
- **description**：模型描述
- **model**：关联的数据表或视图
- **entities**：实体（主键、外键等）
- **dimensions**：维度（时间、分类、枚举等）
- **measures**：度量（聚合函数、计算字段等）

## 使用方式

语义模型在命令中作为变量传递：

```yaml
semantic_models:
  - name: covid_data
    description: COVID-19 病例数据
    model: ref('covid_cases')
    entities:
      - name: country
        description: 国家名称
        type: primary
    dimensions:
      - name: date
        description: 日期
        type: time
        type_params:
          time_granularity: day
    measures:
      - name: cases
        description: 病例数量
        agg: sum
```

## 最佳实践

1. **清晰描述**：确保模型和字段的描述清晰准确
2. **完整信息**：提供完整的实体、维度和度量信息
3. **业务术语**：使用业务术语而非技术术语
4. **关系定义**：明确定义实体之间的关系

## 相关资源

- **be-cause 项目**：`../../../be-cause/my-project/models/`
- **SQL 生成命令**：`../../commands/generate-sql.md`

---

**最后更新**：2025-01-27  
**版本**：1.0.0
