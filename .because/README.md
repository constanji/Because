# BeCause 智能问数工具系统

**创建日期**：2025-01-27  
**版本**：1.0.0  
**用途**：用于智能问数（自然语言转SQL）的规范模板系统

## 概述

本工具系统提供了一套完整的智能问数内容生成规范，包含SQL生成、意图分类、数据辅助等多种场景的命令模板和提示词模板。系统设计遵循以下原则：

1. **标准化**：统一的智能问数格式和结构
2. **场景化**：针对不同查询类型提供专用模板
3. **可定制**：通过变量替换机制实现个性化
4. **易用性**：模板简单易懂，易于使用

## 目录结构

```
.because/
├── README.md (本文件)
├── commands/
│   ├── generate-sql.md (生成SQL命令模板)
│   ├── classify-intent.md (意图分类命令模板)
│   ├── assist-data.md (数据辅助命令模板)
│   ├── handle-misleading.md (误导查询处理命令模板)
│   ├── generate-reasoning.md (推理生成命令模板)
│   └── agentic/
│       ├── main-agent.md (Agentic主代理命令模板)
│       ├── text-to-sql.md (Agentic文本转SQL命令模板)
│       ├── data-assistance.md (Agentic数据辅助命令模板)
│       └── misleading-assistance.md (Agentic误导查询处理命令模板)
├── templates/
│   ├── prompt-templates/ (提示词模板，链接到BeCauseNode)
│   │   ├── default/ (默认模式提示词模板)
│   │   └── agentic/ (Agentic模式提示词模板)
│   ├── guides/
│   │   ├── sql-rules-guide.md (SQL生成规则指南)
│   │   ├── semantic-model-guide.md (语义模型使用指南)
│   │   └── query-formatting.md (查询格式化指南)
│   └── variable-system/
│       ├── variable-reference.md (变量参考手册)
│       └── variable-examples.md (变量使用示例)
├── USAGE_GUIDE.md (使用指南)
└── TOOL_USAGE.md (工具使用说明)
```

## 核心组件

### 1. SQL 生成命令 (generate-sql.md)
将自然语言查询转换为 ANSI SQL 查询的核心命令模板。

### 2. 意图分类命令 (classify-intent.md)
分类用户查询意图（TEXT_TO_SQL / GENERAL / MISLEADING_QUERY）的命令模板。

### 3. 数据辅助命令 (assist-data.md)
回答关于数据库模式一般问题的命令模板。

### 4. 误导查询处理 (handle-misleading.md)
处理误导性查询并提供建议的命令模板。

### 5. 推理生成命令 (generate-reasoning.md)
生成 SQL 生成前的推理计划的命令模板。

### 6. Agentic 模式命令 (agentic/)
基于 Agentic 模式的智能问数命令模板集。

### 7. 提示词模板 (templates/prompt-templates/)
原始的 Jinja2 模板文件，包含系统提示和用户提示模板。

### 8. 格式指南 (templates/guides/)
SQL 生成规则、语义模型使用、查询格式化等指南文档。

### 9. 变量系统 (templates/variable-system/)
变量替换机制的详细说明和示例。

## 使用方法

### 基本使用流程

1. **选择命令**：根据查询类型选择合适的命令模板
2. **准备变量**：根据变量参考手册准备具体数据
3. **应用模板**：使用提示词模板和命令模板
4. **生成结果**：调用 LLM 生成 SQL 或响应
5. **验证检查**：按照检查清单进行最终验证

### 变量替换示例

```markdown
# 使用变量替换前
用户问题: {{ query }}
语义模型: {{ semantic_models }}

# 使用变量替换后
用户问题: 查询每个国家的病例总数
语义模型: [语义模型内容...]
```

## 占位符系统

系统使用以下占位符格式：

### 动态占位符（运行时替换）
- `{{ query }}`：用户查询
- `{{ query_time }}`：当前时间
- `{{ semantic_models }}`：语义模型列表
- `{{ language }}`：输出语言

### 可选占位符（条件替换）
- `{{ instruction }}`：用户自定义指令
- `{{ text_to_sql_rules }}`：SQL 生成规则
- `{{ data_samples }}`：数据样本
- `{{ sql_samples }}`：SQL 示例
- `{{ synonyms }}`：同义词列表
- `{{ docs }}`：业务知识文档
- `{{ histories }}`：查询历史
- `{{ sql_generation_reasoning }}`：推理计划

## 最佳实践

### SQL 生成
1. **准确性**：确保生成的 SQL 语法正确
2. **标准性**：使用 ANSI SQL 标准
3. **安全性**：避免 SQL 注入风险
4. **性能**：考虑查询性能优化

### 意图理解
1. **清晰度**：准确识别用户意图
2. **上下文**：考虑历史查询上下文
3. **重述**：对模糊查询进行重述
4. **分类**：正确分类查询类型

### 数据辅助
1. **准确性**：提供准确的模式信息
2. **完整性**：覆盖用户关心的所有方面
3. **简洁性**：避免冗长的解释
4. **实用性**：提供实用的建议

### 查询处理
1. **识别误导**：准确识别误导性查询
2. **友好提示**：提供友好的建议信息
3. **模式参考**：基于数据库模式提供建议
4. **引导改进**：引导用户改进查询

## 更新记录

- **v1.0.0 (2025-01-27)**：初始版本发布
  - 创建基础命令模板系统
  - 添加SQL生成、意图分类等核心命令
  - 建立变量替换机制
  - 制定格式规范

## 下一步建议

1. **扩展场景**：根据需求添加更多查询场景模板
2. **优化变量**：收集反馈优化变量系统
3. **自动化工具**：开发自动化SQL生成工具
4. **数据分析**：分析模板使用效果，持续改进

## 相关资源

- **BeCauseNode**：`/Users/constanjin/Desktop/BeCause/BeCauseNode/`
- **be-cause 项目**：`/Users/constanjin/Desktop/BeCause/be-cause/`
- **提示词模板源**：`BeCauseNode/templates/prompt-templates/`

---

**注意**：本工具系统基于 BeCauseNode 项目创建，遵循 speckit 规范和 social-media-templates 的结构模式。
