# BeCause 工具使用说明

## 概述

`BeCause` 是一个类似 `Speckit` 的工具，专门用于智能问数（自然语言转SQL）。它可被集成到工具系统中，可以通过智能体直接调用。

## 工具命令

### 1. `/because.generate_sql` - 生成 SQL 查询

根据用户输入的自然语言查询生成 ANSI SQL 查询。

**使用方式**：
```
/because.generate_sql 查询每个国家的病例总数
```

**参数**：
- `arguments` (必需): 用户输入的自然语言查询
- `semantic_models` (可选): 语义模型列表
- `query_time` (可选): 当前时间
- `language` (可选): 输出语言

**示例**：
```json
{
  "command": "generate_sql",
  "arguments": "查询每个国家的病例总数",
  "semantic_models": [...],
  "language": "简体中文"
}
```

### 2. `/because.classify_intent` - 分类查询意图

分类用户查询意图（TEXT_TO_SQL / GENERAL / MISLEADING_QUERY）。

**使用方式**：
```
/because.classify_intent 查询每个国家的病例总数
```

**参数**：
- `arguments` (必需): 用户查询问题
- `histories` (可选): 查询历史
- `semantic_models` (可选): 语义模型列表
- `language` (可选): 输出语言

### 3. `/because.assist_data` - 数据辅助

回答关于数据库模式的一般问题。

**使用方式**：
```
/because.assist_data 这个数据集是关于什么的？
```

**参数**：
- `arguments` (必需): 用户问题
- `semantic_models` (必需): 语义模型列表
- `language` (可选): 输出语言

### 4. `/because.handle_misleading` - 处理误导查询

处理误导性查询并提供建议。

**使用方式**：
```
/because.handle_misleading 你好吗？
```

**参数**：
- `arguments` (必需): 用户查询问题
- `semantic_models` (必需): 语义模型列表
- `language` (可选): 输出语言

### 5. `/because.generate_reasoning` - 生成推理计划

生成 SQL 生成前的推理计划。

**使用方式**：
```
/because.generate_reasoning 查询每个国家的病例总数
```

**参数**：
- `arguments` (必需): 用户查询问题
- `semantic_models` (可选): 语义模型列表
- `language` (可选): 输出语言

## 工具工作原理

1. **接收用户输入**：工具接收用户的查询或问题
2. **加载命令模板**：根据命令类型加载对应的命令模板
3. **加载提示词模板**：从模板目录加载系统提示和用户提示模板
4. **准备变量**：从用户输入和上下文准备变量数据
5. **替换变量**：使用 Jinja2 替换模板中的变量
6. **调用 LLM**：使用替换后的提示词调用 LLM
7. **处理响应**：解析和处理 LLM 响应
8. **返回结果**：返回处理后的结果

## 在智能体中使用

### 方式一：直接命令调用

用户可以直接在对话中使用命令：

```
用户：/because.generate_sql 查询每个国家的病例总数
```

### 方式二：自然语言描述

用户也可以用自然语言描述，智能体会自动调用工具：

```
用户：帮我查询每个国家的病例总数
```

智能体会：
1. 识别这是 SQL 生成需求
2. 调用 `/because.generate_sql` 工具
3. 生成 SQL 查询

## 工具返回格式

工具返回 JSON 格式的响应，包含：

```json
{
  "success": true,
  "message": "SQL生成命令已识别...",
  "user_input": "用户输入的内容",
  "command_template": "...",
  "prompt_templates": {
    "system": "...",
    "user": "..."
  },
  "instructions": [
    "1. 分析用户输入，提取关键信息...",
    "2. 根据模板结构，组织内容...",
    ...
  ]
}
```

## LLM 处理流程

当工具返回后，LLM 应该：

1. **读取命令模板**：了解执行流程和步骤
2. **读取提示词模板**：了解提示词结构
3. **准备变量**：从用户输入和上下文准备变量数据
4. **替换变量**：使用 Jinja2 替换模板中的变量
5. **调用 LLM**：使用替换后的提示词调用 LLM
6. **处理响应**：解析和处理 LLM 响应
7. **返回给用户**：提供最终结果

## 示例工作流程

### 用户输入：
```
查询每个国家的病例总数
```

### 工具调用：
```json
{
  "command": "generate_sql",
  "arguments": "查询每个国家的病例总数"
}
```

### 工具返回：
- 加载命令模板：`commands/generate-sql.md`
- 加载提示词模板：`templates/prompt-templates/default/sql_generation_*.txt`
- 提供执行步骤和变量要求

### LLM 处理：
1. 准备变量：
   - query: "查询每个国家的病例总数"
   - semantic_models: [...]
   - query_time: "2025-01-27 10:30:00"
   - language: "简体中文"

2. 替换变量：使用 Jinja2 替换模板中的变量

3. 调用 LLM：发送提示词并获取响应

4. 生成 SQL：
```sql
SELECT country, SUM(cases) as total_cases 
FROM covid_data 
GROUP BY country
```

## 与 Speckit 的对比

| 特性 | Speckit | BeCause |
|------|---------|---------|
| 用途 | 软件开发规范 | 智能问数（文本转SQL） |
| 命令格式 | `/speckit.xxx` | `/because.xxx` |
| 模板位置 | `.specify/templates/` | `.because/` |
| 输出 | 技术文档 | SQL 查询、意图分类等 |
| 场景支持 | 功能规范、计划等 | SQL生成、数据辅助等 |

## 注意事项

1. **模板文件位置**：确保模板文件在 `.because/` 目录下
2. **权限**：工具不需要特殊权限，可以直接使用
3. **错误处理**：如果模板文件不存在，工具会返回错误信息
4. **变量验证**：使用前请验证所有必需变量都已提供

## 故障排除

### 问题：工具未加载

**解决方案**：
1. 检查工具注册文件是否存在
2. 检查工具是否正确导入
3. 检查工具路径配置是否正确

### 问题：模板文件未找到

**解决方案**：
1. 确认 `.because/` 目录存在
2. 确认模板文件在正确的位置
3. 检查文件路径是否正确

### 问题：变量缺失

**解决方案**：
1. 检查命令模板中的变量要求
2. 确保所有必需变量都已提供
3. 检查变量名称是否正确

## 扩展开发

如果需要添加新功能：

1. **添加新命令**：在 `commands/` 目录下创建新的命令模板文件
2. **添加提示词模板**：在 `templates/prompt-templates/` 目录下添加新的模板文件
3. **更新工具注册**：在工具系统中注册新的命令

---

**最后更新**：2025-01-27  
**版本**：1.0.0
