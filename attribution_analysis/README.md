# 归因分析 & 多维度下钻工具
为数据分析智能体提供"可计算、可回放、可解释"的归因分析与多维度下钻能力，适配智能体Function Calling调用场景，可与becauseai-server工具联动完成端到端的指标归因分析。

## 工具定位
本工具聚焦**指标异常归因**与**多维度下钻分析**，不负责原始数据查询（依赖becauseai-server工具完成数据提取），仅接收结构化数据/分析指令后输出标准化分析结果与可解释结论，供智能体决策使用。

## 核心能力列表
### 1. anomaly_detect - 异常检测
#### 功能描述
判断指定指标是否相对于历史基准出现异常，需联动becauseai-server工具获取当前值与对比基准值，输出异常判定结果、偏离幅度、置信度。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| metric | string | 是 | 待检测指标名称（如GMV、订单量、转化率） |
| compare_type | string | 是 | 对比类型，可选值：hour(前一小时)、day(前一天/环比)、week(上周同期)、month(上月同期)、year(去年同期/同比) |
| time_range | string | 是 | 指标统计时间范围（如"2024-05-01 00:00:00至2024-05-01 23:59:59"） |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| is_anomaly | boolean | 是否异常 |
| current_value | float | 指标当前值 |
| baseline_value | float | 基准值 |
| deviation_rate | float | 偏离率（(当前值-基准值)/基准值） |
| confidence | float | 异常判定置信度（0-1） |

### 2. dimension_preview - 维度预览
#### 功能描述
快速估计指定维度的分布特征，为智能体决策"选择哪个维度下钻"提供依据，需联动becauseai-server获取维度枚举值与对应指标占比。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| metric | string | 是 | 目标指标名称 |
| dimension | string | 是 | 待预览维度（如渠道、地区、用户等级） |
| time_range | string | 是 | 统计时间范围 |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| dimension_values | array[string] | 维度枚举值（如["抖音", "快手", "小红书"]） |
| value_distribution | array[float] | 各维度值对应指标占比 |
| top3_contribution | array[object] | 贡献度TOP3维度值（含维度值、占比、环比变化） |

### 3. drill_down_query - 正式下钻
#### 功能描述
对指定维度进行完整下钻分析，验证归因假设，输出维度各层级的指标拆解结果。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| metric | string | 是 | 目标指标名称 |
| drill_dimensions | array[string] | 是 | 下钻维度列表（支持多层下钻，如["渠道", "地区"]） |
| time_range | string | 是 | 统计时间范围 |
| baseline_time_range | string | 是 | 基准对比时间范围 |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| drill_result | object | 多层维度下钻结果（嵌套结构，含各维度组合的指标值、基准值、变化量） |
| total_variance | float | 指标总变化量 |
| variance_explained | float | 当前下钻维度解释的变化量占比（0-1） |

### 4. contribution_score - 归因评分
#### 功能描述
将下钻结果转化为可比较的"归因价值"分数，量化各维度/维度值对指标变化的贡献度，供智能体排序决策。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| drill_down_result | object | 是 | drill_down_query输出的下钻结果 |
| score_type | string | 否 | 评分类型，默认"shapley"，可选"linear" |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| dimension_contribution | array[object] | 各维度贡献度（含维度名、评分、贡献占比） |
| dimension_value_contribution | array[object] | 各维度值贡献度（含维度名、维度值、评分、贡献占比） |
| ranking | array[string] | 按贡献度降序排列的维度值列表 |

### 5. convergence_judge - 收敛判断
#### 功能描述
判断当前归因分析是否达到收敛条件，输出是否停止分析的建议及依据。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| contribution_scores | object | 是 | contribution_score输出的归因评分结果 |
| convergence_threshold | float | 否 | 收敛阈值（默认0.9，即解释90%以上变化量则收敛） |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| is_converged | boolean | 是否收敛 |
| explained_variance | float | 已解释的变化量占比 |
| suggestion | string | 后续操作建议（如"停止分析"、"继续下钻XX维度"） |

### 6. regression_attribution - 回归归因
#### 功能描述
使用多变量回归模型量化各维度对目标指标的**独立贡献**，剥离维度间的交互效应，输出各维度的回归系数与贡献度。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| metric | string | 是 | 目标指标名称 |
| features | array[string] | 是 | 待分析的维度（特征）列表 |
| data | object | 是 | becauseai-server查询的结构化数据（含特征列与指标列） |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| regression_coef | array[object] | 各特征回归系数（含特征名、系数值、p值） |
| r_squared | float | 模型拟合优度（0-1） |
| independent_contribution | array[object] | 各特征独立贡献度（含特征名、贡献值、占比） |

### 7. decision_tree_analysis - 决策树分析
#### 功能描述
通过决策树模型发现归因规则，回答"为什么是这个维度/维度值导致指标异常"，生成人类可读的规则路径。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| metric | string | 是 | 目标指标名称 |
| features | array[string] | 是 | 待分析维度列表 |
| data | object | 是 | becauseai-server查询的结构化数据 |
| anomaly_label | boolean | 是 | 异常标签（标记数据是否为异常样本） |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| tree_rules | array[string] | 决策树规则路径（如"渠道=抖音 AND 地区=华东 → 指标异常"） |
| rule_importance | array[object] | 各规则的重要性（含规则、覆盖样本数、异常命中率） |
| root_cause | string | 核心归因规则（最具解释力的规则） |

### 8. shap_analysis - SHAP 分析
#### 功能描述
基于博弈论的**模型无关**特征重要性解释，输出全局/局部特征重要性，量化各维度对指标的影响方向与程度。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| metric | string | 是 | 目标指标名称 |
| features | array[string] | 是 | 待分析维度列表 |
| data | object | 是 | becauseai-server查询的结构化数据 |
| model_type | string | 否 | 基础模型类型（默认"tree"，可选"linear"、"nn"） |
| analysis_scope | string | 否 | 分析范围（默认"global"，可选"local"，需指定local_sample_id） |
| local_sample_id | string | 否 | 局部分析的样本ID（analysis_scope=local时必选） |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| shap_values | array[object] | 各特征SHAP值（含特征名、全局均值/局部值、影响方向） |
| feature_importance | array[object] | 特征重要性排序（含特征名、重要性得分） |
| summary_plot | string | SHAP汇总图文本描述（便于智能体理解特征影响） |

### 9. regression_diff_attribution - 差异回归归因
#### 功能描述
对比current（当前）和baseline（基准）两个时间段的**回归系数变化**，识别对指标影响力度发生变化的关键因素。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| metric | string | 是 | 目标指标名称 |
| features | array[string] | 是 | 待分析维度列表 |
| current_data | object | 是 | 当前时间段结构化数据 |
| baseline_data | object | 是 | 基准时间段结构化数据 |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| coef_diff | array[object] | 各特征回归系数变化（含特征名、当前系数、基准系数、变化量） |
| contribution_diff | array[object] | 各特征贡献度变化（含特征名、变化占比、影响方向） |
| key_changes | array[string] | 核心变化特征列表 |

### 10. decision_tree_diff_analysis - 差异决策树分析
#### 功能描述
训练分类器区分current和baseline时间段的样本，发现"什么维度/维度值发生了变化"的规则，定位指标异常的核心变化点。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| metric | string | 是 | 目标指标名称 |
| features | array[string] | 是 | 待分析维度列表 |
| current_data | object | 是 | 当前时间段结构化数据 |
| baseline_data | object | 是 | 基准时间段结构化数据 |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| diff_rules | array[string] | 差异规则（如"渠道=抖音 AND 订单金额>1000 → 当前时段占比提升20%"） |
| rule_impact | array[object] | 各规则对指标变化的影响度（含规则、影响值、占比） |
| core_change_dimension | string | 核心变化维度 |

### 11. shap_diff_analysis - 差异 SHAP 分析
#### 功能描述
对比current和baseline两个时间段的**特征重要性漂移**，识别特征影响力度/方向发生显著变化的维度。
#### 入参规范
| 参数名 | 类型 | 必选 | 说明 |
|--------|------|------|------|
| metric | string | 是 | 目标指标名称 |
| features | array[string] | 是 | 待分析维度列表 |
| current_data | object | 是 | 当前时间段结构化数据 |
| baseline_data | object | 是 | 基准时间段结构化数据 |
#### 出参规范
| 参数名 | 类型 | 说明 |
|--------|------|------|
| shap_importance_diff | array[object] | 特征重要性变化（含特征名、当前重要性、基准重要性、变化量） |
| direction_change | array[string] | 影响方向发生变化的特征列表 |
| drift_score | array[object] | 特征漂移得分（含特征名、得分、漂移等级） |

## Function Calling 调用流程
1. 智能体接收用户归因分析需求 → 调用`anomaly_detect`确认指标是否异常；
2. 若异常，调用`dimension_preview`预览核心维度分布 → 决策下钻维度；
3. 调用`drill_down_query`完成指定维度下钻 → 调用`contribution_score`生成归因评分；
4. 调用`convergence_judge`判断是否收敛：
    - 收敛：输出最终归因结论；
    - 未收敛：返回步骤2，选择新维度继续下钻；
5. （可选）调用进阶归因能力（`regression_attribution`/`decision_tree_analysis`/`shap_analysis`）深化解释；
6. （可选）调用差异类归因能力（`regression_diff_attribution`/`decision_tree_diff_analysis`/`shap_diff_analysis`）定位时间维度的变化因素。

## 与becauseai-server工具联动规范
### 数据交互格式
becauseai-server工具需返回JSON格式结构化数据，字段需包含：
- 时间字段（如`stat_time`）；
- 目标指标字段（与归因工具入参`metric`一致）；
- 维度字段（与归因工具入参`dimension`/`features`一致）。

### 错误处理
若becauseai-server返回数据不完整/格式错误，归因工具需返回：
```json
{
  "error_code": "DATA_INVALID",
  "error_msg": "具体数据错误原因（如缺少XX维度字段、指标值为空）",
  "suggestion": "建议becauseai-server补充查询XX字段/重新查询XX时间范围数据"
}
```

## 应用场景示例
### 场景1：GMV异常下降归因
1. 调用`anomaly_detect`：检测到2024-05-01 GMV较前一天下降15%（异常）；
2. 调用`dimension_preview`：预览渠道维度，发现抖音渠道GMV占比从30%降至18%；
3. 调用`drill_down_query`：下钻渠道+地区维度，定位抖音-华东地区GMV下降最显著；
4. 调用`contribution_score`：抖音渠道贡献度-80%（核心负向因素）；
5. 调用`convergence_judge`：已解释90%变化量，收敛；
6. 调用`decision_tree_analysis`：生成规则"渠道=抖音 AND 地区=华东 AND 客单价<200 → GMV下降"。

### 场景2：转化率同比变化分析
1. 调用`regression_diff_attribution`：对比2024年与2023年转化率回归系数，发现"用户等级=新用户"的系数从0.2升至0.5；
2. 调用`shap_diff_analysis`：验证新用户维度重要性提升30%；
3. 输出结论：新用户转化率提升是整体转化率同比增长的核心因素。