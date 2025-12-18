# 原始提示词模板

本目录包含从 be-cause 项目中提取的原始提示词模板文件（.txt 格式）。

## 目录结构

### default/

包含默认模式的提示词模板：

#### SQL 生成相关
- `sql_generation_system_prompt.txt` - SQL 生成的系统提示词
- `sql_generation_user_prompt_template.txt` - SQL 生成的用户提示词模板（首次查询）
- `sql_generation_with_followup_user_prompt_template.txt` - SQL 生成的用户提示词模板（后续查询）

#### SQL 生成推理相关
- `sql_generation_reasoning_system_prompt.txt` - SQL 生成推理的系统提示词
- `sql_generation_reasoning_user_prompt_template.txt` - SQL 生成推理的用户提示词模板（首次查询）
- `sql_generation_reasoning_with_followup_user_prompt_template.txt` - SQL 生成推理的用户提示词模板（后续查询）

#### 意图分类相关
- `intent_classification_system_prompt.txt` - 意图分类的系统提示词
- `intent_classification_user_prompt_template.txt` - 意图分类的用户提示词模板

#### 数据辅助相关
- `data_assistance_system_prompt.txt` - 数据辅助的系统提示词
- `data_assistance_user_prompt_template.txt` - 数据辅助的用户提示词模板

#### 误导查询处理相关
- `misleading_assistance_system_prompt.txt` - 误导查询处理的系统提示词
- `misleading_assistance_user_prompt_template.txt` - 误导查询处理的用户提示词模板

#### 评分相关
- `scoring_system_prompt.txt` - 文档相关性评分的系统提示词
- `scoring_user_prompt_template.txt` - 文档相关性评分的用户提示词模板

#### 假设问题生成相关
- `generation_hypothetical_questions_system_prompt.txt` - 假设问题生成的系统提示词
- `generation_hypothetical_questions_user_prompt.txt` - 假设问题生成的用户提示词模板

### agentic/

包含 Agentic 模式的提示词模板：

- `main_agent_system_prompt.txt` - 主代理的系统提示词
- `main_agent_user_prompt.txt` - 主代理的用户提示词模板
- `text_to_sql_user_prompt.txt` - 文本转SQL的用户提示词模板
- `text_to_sql_with_followup_user_prompt.txt` - 文本转SQL的用户提示词模板（后续查询）
- `data_assistance_user_prompt.txt` - 数据辅助的用户提示词模板
- `misleading_assistance_user_prompt.txt` - 误导查询处理的用户提示词模板

## 文件格式

所有文件使用 Jinja2 模板语法，支持以下变量：

- `{{ semantic_models }}` - 语义模型列表
- `{{ query }}` - 用户查询
- `{{ query_time }}` - 当前时间
- `{{ language }}` - 输出语言
- `{{ instruction }}` - 用户自定义指令（可选）
- `{{ text_to_sql_rules }}` - SQL 生成规则（可选）
- `{{ data_samples }}` - 数据样本（可选）
- `{{ sql_samples }}` - SQL 示例（可选）
- `{{ synonyms }}` - 同义词列表（可选）
- `{{ docs }}` - 业务知识文档（可选）
- `{{ histories }}` - 查询历史（可选）

## 使用说明

这些是原始的提示词模板文件，供程序直接使用。对应的命令模板（已翻译为中文）位于 `../commands/` 目录下。

## 与命令模板的关系

- **原始模板**（本目录）：供程序运行时使用，保持原始格式和英文
- **命令模板**（`../commands/`）：供 AI 智能体参考使用，已翻译为中文，包含详细说明

