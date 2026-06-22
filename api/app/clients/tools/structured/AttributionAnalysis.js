const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { logger } = require("@because/data-schemas");

/**
 * AttributionAnalysis Tool - 指标异动归因分析工具
 *
 * 基于"加法型 / 乘法型 / 除法型"三类指标归因方法论，提供真实计算能力的归因分析闭环。
 */
class AttributionAnalysis extends Tool {
  name = "attribution_analysis";

  description =
    "指标异动归因分析工具。基于加法型(Y=A+B+C)、乘法型(Y=A×B×C)、除法型(R=N/D)三类归因方法论。\n\n" +
    "支持 action：pre_check、indicator_type_detect、contribution_analysis、chain_decomposition、" +
    "differential_decomposition、scenario_simulation、drill_down、convergence_judge。\n\n" +
    "## 归因分析规则（强制执行）\n\n" +
    "### 何时触发归因分析\n" +
    "- 用户明确问原因/为什么/怎么回事/为何异常\n" +
    "- 用户关注波动/异常（突然下降/明显上涨/不正常）\n" +
    "- 用户要求分析/拆解/解释\n" +
    "- 用户给了数据并要求解读\n" +
    "- 一旦触发，不允许只查一条数据就结束\n\n" +
    "### 归因闭环（必须按顺序执行）\n" +
    "第1步 pre_check → 第2步 indicator_type_detect → 第3步归因计算（三选一）→ 第4步 drill_down（如需）→ 第5步 convergence_judge → 第6步 图表生成\n\n" +
    "**第1步：pre_check（数据可信性预检）**\n" +
    "- 即使没有明确问题也必须调用，传入空字符串即可\n" +
    "- can_proceed=false → 排除干扰因素后重试\n\n" +
    "**第2步：indicator_type_detect（识别指标类型）**\n" +
    "- 必须先判断类型再归因，同一指标只用一种结构\n" +
    "- 能明确判断时通过 sub_indicator_type_hint 直接指定\n" +
    "- 不确定时通过 ask_data 查询业务字段推导\n\n" +
    "**第3步：归因计算（根据类型三选一）**\n" +
    "- 加法型 → contribution_analysis，data 格式：[{name, current_value, baseline_value}, ...]\n" +
    "- 乘法型 → chain_decomposition，factors 格式：[{name, current_value, baseline_value}, ...]，必须按业务逻辑排序\n" +
    "- 除法型 → differential_decomposition + scenario_simulation，分别提供分子分母当前值和基准值\n\n" +
    "**第4步：drill_down（多维度下钻）**\n" +
    "- 每次至少下钻 2-3 个维度\n" +
    "- 发现异常聚集时继续下钻更底层明细\n\n" +
    "**第5步：convergence_judge（收敛判断）**\n" +
    "- is_converged=true → 进入图表生成\n" +
    "- is_converged=false → 回到第4步继续下钻\n\n" +
    "**第6步：图表生成**\n" +
    "- 归因分析至少生成 2 张图表（趋势图 + 维度对比图）\n\n" +
    "### 强制执行原则\n" +
    "1. 禁止\"数据不足\"式逃避：字段存在就必须通过 ask_data 查询\n" +
    "2. 必须先判断指标类型再归因，禁止混用结构\n" +
    "3. 拒绝扁平化归因：时间序列维度（必查）+ 结构占比维度（必查）+ 多角度关联\n" +
    "4. 高频调用归因算法：喂足够多维的 data 数组，不能只有两三行总计\n" +
    "5. 警惕三类陷阱：掩盖效应（加法型）、放大效应（乘法型）、稀释效应（除法型）\n" +
    "6. 所有结论必须有数据+归因计算双重支撑，推断≠猜测\n" +
    "7. 图表必须服务于归因结论\n\n" +
    "### 报告结构（归因分析完成后必须调用 report_generator）\n" +
    "1. 核心结论（2-3句话：发生了什么+主要原因）\n" +
    "2. 指标变化概览（趋势+趋势图）\n" +
    "3. 主导因子分析（贡献度对比图）\n" +
    "4. 异常/关键点下钻（明细下钻图）\n" +
    "5. 多维关联发现（结构性变化图）\n" +
    "6. 行动建议（短期止血+中长期优化）\n" +
    "⚠️ 未完成归因闭环前禁止调用 report_generator。";

  schema = z.object({
    action: z
      .enum([
        "pre_check",
        "indicator_type_detect",
        "contribution_analysis",
        "chain_decomposition",
        "differential_decomposition",
        "scenario_simulation",
        "drill_down",
        "convergence_judge",
      ])
      .describe("要执行的具体归因分析功能"),

    // === 通用参数 ===
    metric: z.string().optional().describe("待分析的目标指标名称，如 GMV、DAU、转化率"),

    // === pre_check 参数 ===
    data_quality_notes: z
      .string()
      .optional()
      .describe("数据质量检查备注（是否有漏报/错报/脏数据）"),
    caliber_notes: z
      .string()
      .optional()
      .describe("统计口径核对备注（对比维度是否一致）"),
    external_factor_notes: z
      .string()
      .optional()
      .describe("外部因素排查备注（节假日/季节性/公共事件）"),

    // === indicator_type_detect 参数 ===
    indicator_formula: z
      .string()
      .optional()
      .describe("指标的数学公式描述，如 'GMV = DAU × 转化率 × 客单价' 或 '总收入 = 渠道A + 渠道B + 渠道C'"),
    sub_indicators: z
      .array(z.string())
      .optional()
      .describe("子指标/因子列表，如 ['DAU', '转化率', '客单价']"),
    sub_indicator_type_hint: z
      .enum(["additive", "multiplicative", "ratio"])
      .optional()
      .describe("子指标结构类型提示，如果明确知道可直接指定"),

    // === contribution_analysis (加法型) 参数 ===
    data: z
      .any()
      .optional()
      .describe(
        "加法型：子项数据数组，每个元素包含子项名称、当前值和基准值。" +
        "格式: [{name:'渠道A', current_value: 450, baseline_value: 500}, ...]。" +
        "乘法型链式分解：因子数组，每个元素包含因子名称、当前值和基准值。" +
        "格式: [{name:'DAU', current_value: 1200000, baseline_value: 1000000}, ...]。" +
        "除法型：{numerator_current, numerator_baseline, denominator_current, denominator_baseline}。" +
        "drill_down：维度明细数据数组。"
      ),

    // === chain_decomposition (乘法型) 参数 ===
    factors: z
      .array(
        z.object({
          name: z.string().describe("因子名称"),
          current_value: z.number().describe("当前值"),
          baseline_value: z.number().describe("基准值"),
        })
      )
      .optional()
      .describe("乘法型链式分解的因子序列，按业务逻辑顺序排列（如漏斗顺序）"),

    // === differential_decomposition / scenario_simulation (除法型) 参数 ===
    numerator_current: z.number().optional().describe("分子当前值（如当前付费用户数）"),
    numerator_baseline: z.number().optional().describe("分子基准值"),
    denominator_current: z.number().optional().describe("分母当前值（如当前DAU）"),
    denominator_baseline: z.number().optional().describe("分母基准值"),

    // === drill_down 参数 ===
    dimensions: z
      .array(z.string())
      .optional()
      .describe("下钻维度列表，如 ['渠道', '地区', '用户类型']"),

    // === convergence_judge 参数 ===
    contribution_scores: z
      .any()
      .optional()
      .describe("contribution_analysis 或 chain_decomposition 或 drill_down 输出的归因结果"),
    convergence_threshold: z
      .number()
      .optional()
      .default(0.9)
      .describe("收敛解释度阈值，默认0.9（解释度>90%视为收敛）"),

    // === 辅助参数 ===
    compare_type: z
      .string()
      .optional()
      .describe("对比类型：hour, day, week, month, year"),
    time_range: z.string().optional().describe("指标统计时间范围"),
    baseline_time_range: z.string().optional().describe("基准对比时间范围"),
  });

  constructor(fields = {}) {
    super();
  }

  async _call(input) {
    const { action, ...params } = input;
    const startTime = Date.now();
    logger.info(`[AttributionAnalysis] 开始调用 action: ${action}`);

    try {
      let resultObj;
      switch (action) {
        case "pre_check":
          resultObj = this.preCheck(params);
          break;
        case "indicator_type_detect":
          resultObj = this.indicatorTypeDetect(params);
          break;
        case "contribution_analysis":
          resultObj = this.contributionAnalysis(params);
          break;
        case "chain_decomposition":
          resultObj = this.chainDecomposition(params);
          break;
        case "differential_decomposition":
          resultObj = this.differentialDecomposition(params);
          break;
        case "scenario_simulation":
          resultObj = this.scenarioSimulation(params);
          break;
        case "drill_down":
          resultObj = this.drillDown(params);
          break;
        case "convergence_judge":
          resultObj = this.convergenceJudge(params);
          break;
        default:
          throw new Error("不支持的归因分析 action: " + action);
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[AttributionAnalysis] action: ${action} 执行成功, 耗时: ${duration}ms`,
      );
      return JSON.stringify(
        { success: true, action, result: resultObj },
        null,
        2,
      );
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(
        `[AttributionAnalysis] 执行 action: ${action} 错误: ${err.message}, 耗时: ${duration}ms`,
      );
      return JSON.stringify(
        { success: false, action, error: err.message },
        null,
        2,
      );
    }
  }

  // ================================================================
  // 1. pre_check — 数据可信性预检
  // ================================================================
  preCheck({ metric, data_quality_notes, caliber_notes, external_factor_notes }) {
    const checks = [];

    // 数据质量
    const qualityPass = !data_quality_notes || data_quality_notes.trim() === "";
    checks.push({
      item: "数据质量",
      passed: qualityPass,
      notes: data_quality_notes || "未发现数据质量问题",
      warning: qualityPass
        ? null
        : "存在数据质量问题，归因结论可能受脏数据干扰，建议先核实源数据",
    });

    // 统计口径
    const caliberPass = !caliber_notes || caliber_notes.trim() === "";
    checks.push({
      item: "统计口径",
      passed: caliberPass,
      notes: caliber_notes || "对比维度一致，口径无差异",
      warning: caliberPass
        ? null
        : "统计口径不一致可能导致虚假异动，建议确认口径后再分析",
    });

    // 外部因素
    const externalPass =
      !external_factor_notes || external_factor_notes.trim() === "";
    checks.push({
      item: "外部因素",
      passed: externalPass,
      notes: external_factor_notes || "未发现显著外部干扰因素",
      warning: externalPass
        ? null
        : "外部因素可能影响指标波动，归因时需剔除节假日/季节性/公共事件影响",
    });

    const allPassed = checks.every((c) => c.passed);
    const blockedChecks = checks.filter((c) => !c.passed);

    return {
      all_passed: allPassed,
      can_proceed: allPassed || blockedChecks.length <= 1,
      checks,
      recommendation: allPassed
        ? "预检通过，可进入正式归因分析。下一步：调用 indicator_type_detect 识别指标类型"
        : `存在 ${blockedChecks.length} 项未通过：${blockedChecks.map((c) => c.item).join("、")}。建议先排除干扰因素后再进行归因分析。`,
      metric: metric || null,
    };
  }

  // ================================================================
  // 2. indicator_type_detect — 识别指标归因结构类型
  // ================================================================
  indicatorTypeDetect({
    metric,
    indicator_formula,
    sub_indicators,
    sub_indicator_type_hint,
  }) {
    let detectedType = "unknown";
    let confidence = 0;
    let reasoning = "";

    // 如果明确给出了类型提示，直接使用
    if (sub_indicator_type_hint) {
      detectedType = sub_indicator_type_hint;
      confidence = 0.95;
      reasoning = `根据传入的类型提示，指标归因结构为${sub_indicator_type_hint}型`;
    } else if (indicator_formula) {
      // 从公式中推断
      const formula = indicator_formula.toLowerCase();
      const hasMultiply = /[×*×]/.test(indicator_formula);
      const hasDivide = /[÷/÷]/.test(indicator_formula);
      const hasPlus = /[+＋]/.test(indicator_formula);

      if (hasDivide) {
        detectedType = "ratio";
        confidence = 0.9;
        reasoning = `公式 "${indicator_formula}" 包含除法运算，识别为除法型指标`;
      } else if (hasMultiply && !hasPlus) {
        detectedType = "multiplicative";
        confidence = 0.9;
        reasoning = `公式 "${indicator_formula}" 仅包含乘法运算，识别为乘法型指标`;
      } else if (hasPlus && !hasMultiply) {
        detectedType = "additive";
        confidence = 0.9;
        reasoning = `公式 "${indicator_formula}" 包含加法运算，识别为加法型指标`;
      } else if (hasMultiply && hasPlus) {
        // 混合公式 — 看主要结构
        detectedType = "multiplicative";
        confidence = 0.7;
        reasoning = `公式 "${indicator_formula}" 包含加法+乘法混合运算，建议先按维度分组再做乘法归因。默认按乘法型处理`;
      }
    } else if (sub_indicators && sub_indicators.length > 0) {
      // 从子指标名称推断
      const ratioKeywords = ["率", "比", "转化", "均", "人均", "占比", "ROI"];
      const isRatioType = sub_indicators.some((s) =>
        ratioKeywords.some((kw) => s.includes(kw))
      );
      if (isRatioType) {
        detectedType = "ratio";
        confidence = 0.65;
        reasoning = `子指标名称包含比率类关键词，推测为除法型指标`;
      } else {
        detectedType = "additive";
        confidence = 0.5;
        reasoning = "无法从子指标名称明确推断类型，默认为加法型，建议提供指标公式以获取更准确判断";
      }
    }

    const typeDescriptions = {
      additive: {
        type: "加法型",
        formula_pattern: "整体 = A + B + C + ...",
        method: "贡献度分析（Contribution Analysis）",
        core_formula: "ΔTotal = ΔA + ΔB + ΔC, 贡献率_i = ΔX_i / ΔTotal",
        key_warning: "警惕高增长子项掩盖衰退子项的结构恶化风险",
        next_action: "contribution_analysis",
      },
      multiplicative: {
        type: "乘法型",
        formula_pattern: "整体 = A × B × C × ...",
        method: "链式分解法（Chain Decomposition）",
        core_formula:
          "A贡献 ≈ (A₁-A₀)×B₀×C₀, B贡献 ≈ A₁×(B₁-B₀)×C₀, C贡献 ≈ A₁×B₁×(C₁-C₀)",
        key_warning: "中间漏斗因子的微小变动会被显著放大",
        next_action: "chain_decomposition",
      },
      ratio: {
        type: "除法型",
        formula_pattern: "R = N / D（分子/分母）",
        method: "差分分解法 + 情景模拟法",
        core_formula:
          "ΔR ≈ (ΔN/D₀) - (N₀×ΔD/D₀²), 分子贡献=ΔN/D₀, 分母贡献=-(N₀/D₀²)×ΔD",
        key_warning: "下降可能是分母质量下降导致的稀释效应，而非分子能力变差",
        next_action: "differential_decomposition",
      },
    };

    return {
      detected_type: detectedType,
      confidence: parseFloat(confidence.toFixed(2)),
      reasoning,
      type_info: typeDescriptions[detectedType] || null,
      metric: metric || null,
      formula: indicator_formula || null,
      sub_indicators: sub_indicators || null,
    };
  }

  // ================================================================
  // 3. contribution_analysis — 加法型贡献度分析（Y = A + B + C）
  // ================================================================
  contributionAnalysis({ metric, data }) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error(
        "contribution_analysis 需要传入有效的 data 数组。" +
        "格式: [{name:'子项A', current_value: 450, baseline_value: 500}, ...]"
      );
    }

    // 自动嗅探字段名
    const sample = data[0];
    const keys = Object.keys(sample);
    const nameKey =
      keys.find((k) => ["name", "dimension", "category", "渠道", "地区", "类型"].includes(k)) ||
      keys.find((k) => typeof sample[k] === "string") ||
      keys[0];
    const currentKey =
      keys.find((k) => ["current_value", "current", "当前值", "本期值"].includes(k)) ||
      keys.find((k) => typeof sample[k] === "number" && k !== "baseline_value") ||
      keys[1];
    const baselineKey =
      keys.find((k) => ["baseline_value", "baseline", "基准值", "上期值"].includes(k)) ||
      keys.find((k) => typeof sample[k] === "number" && k !== currentKey) ||
      keys[2];

    let totalCurrent = 0;
    let totalBaseline = 0;
    const items = [];

    for (const row of data) {
      const name = row[nameKey] || String(row[keys[0]]);
      const cur = parseFloat(row[currentKey]) || 0;
      const base = parseFloat(row[baselineKey]) || 0;

      totalCurrent += cur;
      totalBaseline += base;

      items.push({
        name,
        current_value: cur,
        baseline_value: base,
        change: parseFloat((cur - base).toFixed(2)),
        change_rate: parseFloat(
          base === 0 ? (cur > 0 ? 1 : 0).toFixed(4) : ((cur - base) / base).toFixed(4)
        ),
      });
    }

    const totalChange = totalCurrent - totalBaseline;
    const totalChangeRate =
      totalBaseline === 0
        ? totalCurrent > 0 ? 1 : 0
        : parseFloat((totalChange / totalBaseline).toFixed(4));

    // 计算每项的贡献值和贡献率
    for (const item of items) {
      item.contribution_value = item.change;
      item.contribution_rate = parseFloat(
        totalChange === 0
          ? 0
          : (item.change / totalChange).toFixed(4)
      );
    }

    // 按贡献绝对值排序
    items.sort((a, b) => Math.abs(b.contribution_value) - Math.abs(a.contribution_value));

    // 标记掩盖效应：正向贡献最大的子项 & 负向贡献最大的子项
    const positiveItems = items.filter((i) => i.contribution_value > 0);
    const negativeItems = items.filter((i) => i.contribution_value < 0);
    const maxPositive = positiveItems.length > 0 ? positiveItems[0] : null;
    const maxNegative = negativeItems.length > 0 ? negativeItems[0] : null;
    const hasMaskingEffect =
      totalChange > 0 && negativeItems.length > 0; // 总体增长但有子项下降
    const hasDeterioration =
      totalChange < 0 && positiveItems.length > 0; // 总体下降但有子项增长

    return {
      indicator_type: "加法型",
      formula_pattern: "整体 = A + B + C + ...",
      total_current: parseFloat(totalCurrent.toFixed(2)),
      total_baseline: parseFloat(totalBaseline.toFixed(2)),
      total_change: parseFloat(totalChange.toFixed(2)),
      total_change_rate: totalChangeRate,
      items,
      top_contributors: items.slice(0, 3).map((i) => ({
        name: i.name,
        contribution_value: i.contribution_value,
        contribution_rate: i.contribution_rate,
        direction: i.contribution_value >= 0 ? "正向贡献" : "负向贡献",
      })),
      masking_effect: hasMaskingEffect
        ? {
            detected: true,
            warning: `总体增长但以下子项出现衰退：${negativeItems.map((i) => i.name).join("、")}`,
            masked_items: negativeItems.map((i) => i.name),
            dominating_item: maxPositive
              ? { name: maxPositive.name, contribution_value: maxPositive.contribution_value }
              : null,
          }
        : { detected: false },
      deterioration_effect: hasDeterioration
        ? {
            detected: true,
            warning: `总体下降但以下子项逆势增长：${positiveItems.map((i) => i.name).join("、")}`,
            growing_items: positiveItems.map((i) => i.name),
          }
        : { detected: false },
      key_insight:
        hasMaskingEffect && maxPositive
          ? `警惕「掩盖效应」：${maxPositive.name}的正向贡献（+${maxPositive.contribution_value}）掩盖了${negativeItems.length}个子项的衰退风险，表面增长实则结构恶化`
          : totalChange > 0
            ? "各子项全面增长，结构健康"
            : `重点关注：${items[0]?.name || "最大变动子项"}的变动贡献了总变化的${(items[0]?.contribution_rate * 100 || 0).toFixed(1)}%`,
      metric: metric || null,
    };
  }

  // ================================================================
  // 4. chain_decomposition — 乘法型链式分解法（Y = A × B × C）
  // ================================================================
  chainDecomposition({ metric, factors, data }) {
    // 兼容两种输入方式：直接传 factors 数组，或从 data 数组中提取
    let factorList = factors;

    if (!factorList && data && Array.isArray(data)) {
      // 从 data 中自动提取因子
      const sample = data[0];
      const keys = Object.keys(sample);
      const nameKey =
        keys.find((k) => ["name", "factor", "因子"].includes(k)) ||
        keys.find((k) => typeof sample[k] === "string") ||
        keys[0];
      const currentKey =
        keys.find((k) => ["current_value", "current", "当前值"].includes(k)) ||
        keys.find((k) => typeof sample[k] === "number") ||
        keys[1];
      const baselineKey =
        keys.find((k) => ["baseline_value", "baseline", "基准值"].includes(k)) ||
        keys.find((k) => typeof sample[k] === "number" && k !== currentKey) ||
        keys[2];

      factorList = data.map((row) => ({
        name: String(row[nameKey]),
        current_value: parseFloat(row[currentKey]) || 0,
        baseline_value: parseFloat(row[baselineKey]) || 0,
      }));
    }

    if (!factorList || !Array.isArray(factorList) || factorList.length < 2) {
      throw new Error(
        "chain_decomposition 需要至少2个因子。" +
        "格式: factors: [{name:'DAU', current_value: 1200000, baseline_value: 1000000}, ...]"
      );
    }

    // 计算总体的当前值和基准值
    const totalCurrent = factorList.reduce((prod, f) => prod * f.current_value, 1);
    const totalBaseline = factorList.reduce((prod, f) => prod * f.baseline_value, 1);

    // 链式分解：按业务逻辑顺序依次替换
    const contributions = [];
    let currentProduct = 1; // 前面的因子用当前值
    let baselineProduct = 1; // 后面的因子用基准值

    for (let i = 0; i < factorList.length; i++) {
      const factor = factorList[i];

      // 前面的因子用当前值（已经替换过）
      // 当前因子用差值
      // 后面的因子用基准值

      let preProduct = 1; // A₁ × B₁ × ... (已替换的)
      let postProduct = 1; // ... × C₀ × D₀ (未替换的)

      for (let j = 0; j < i; j++) {
        preProduct *= factorList[j].current_value;
      }
      for (let j = i + 1; j < factorList.length; j++) {
        postProduct *= factorList[j].baseline_value;
      }

      // 第i个因子的贡献 = 前序当前值 × (当前_i - 基准_i) × 后续基准值
      const contribution =
        preProduct * (factor.current_value - factor.baseline_value) * postProduct;

      contributions.push({
        name: factor.name,
        current_value: factor.current_value,
        baseline_value: factor.baseline_value,
        change: parseFloat((factor.current_value - factor.baseline_value).toFixed(4)),
        change_rate: parseFloat(
          factor.baseline_value === 0
            ? 0
            : ((factor.current_value - factor.baseline_value) / factor.baseline_value).toFixed(4)
        ),
        contribution: parseFloat(contribution.toFixed(2)),
        contribution_rate: parseFloat(
          totalCurrent - totalBaseline === 0
            ? 0
            : (contribution / (totalCurrent - totalBaseline)).toFixed(4)
        ),
        decomposition_path: factorList
          .map((f, idx) => {
            if (idx < i) return `${f.name}₁(${f.current_value})`;
            if (idx === i) return `[${f.name}]`;
            return `${f.name}₀(${f.baseline_value})`;
          })
          .join(" × "),
      });

      currentProduct = preProduct * factor.current_value;
      baselineProduct = postProduct;
    }

    // 按贡献绝对值排序
    contributions.sort(
      (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
    );

    const totalChange = totalCurrent - totalBaseline;

    // 检测放大效应
    const hasAmplification = contributions.some((c) => {
      const factorChangeRate = Math.abs(c.change_rate);
      const contributionRate = Math.abs(c.contribution_rate);
      return contributionRate > factorChangeRate * 1.5; // 贡献率显著大于因子自身变化率
    });

    return {
      indicator_type: "乘法型",
      formula_pattern: factorList.map((f) => f.name).join(" × "),
      total_current: parseFloat(totalCurrent.toFixed(2)),
      total_baseline: parseFloat(totalBaseline.toFixed(2)),
      total_change: parseFloat(totalChange.toFixed(2)),
      total_change_rate: parseFloat(
        totalBaseline === 0 ? 0 : ((totalCurrent - totalBaseline) / totalBaseline).toFixed(4)
      ),
      factor_count: factorList.length,
      contributions,
      top_contributor: contributions[0] || null,
      amplification_effect: hasAmplification
        ? {
            detected: true,
            warning:
              "中间漏斗因子的微小变动被显著放大，请重点审查漏斗各环节的异常",
            amplified_factors: contributions
              .filter((c) => Math.abs(c.contribution_rate) > Math.abs(c.change_rate) * 1.5)
              .map((c) => c.name),
          }
        : { detected: false },
      key_insight: `最大贡献因子「${contributions[0]?.name}」贡献了总变化的${((contributions[0]?.contribution_rate || 0) * 100).toFixed(1)}%，${hasAmplification ? "存在放大效应，该因子需重点监控" : "该因子的变化直接驱动了整体波动"}`,
      metric: metric || null,
    };
  }

  // ================================================================
  // 5. differential_decomposition — 除法型差分分解法（R = N / D）
  // ================================================================
  differentialDecomposition({
    metric,
    numerator_current,
    numerator_baseline,
    denominator_current,
    denominator_baseline,
    data,
  }) {
    // 兼容 data 传入方式
    let nCur = numerator_current;
    let nBase = numerator_baseline;
    let dCur = denominator_current;
    let dBase = denominator_baseline;

    if ((nCur == null || nBase == null || dCur == null || dBase == null) && data) {
      if (typeof data === "object" && !Array.isArray(data)) {
        nCur = nCur ?? data.numerator_current ?? data.numerator?.current;
        nBase = nBase ?? data.numerator_baseline ?? data.numerator?.baseline;
        dCur = dCur ?? data.denominator_current ?? data.denominator?.current;
        dBase = dBase ?? data.denominator_baseline ?? data.denominator?.baseline;
      }
    }

    if (
      typeof nCur !== "number" ||
      typeof nBase !== "number" ||
      typeof dCur !== "number" ||
      typeof dBase !== "number"
    ) {
      throw new Error(
        "differential_decomposition 需要分子和分母的当前值及基准值。" +
        "参数: numerator_current, numerator_baseline, denominator_current, denominator_baseline"
      );
    }

    if (dBase === 0 || dCur === 0) {
      throw new Error("分母不能为零");
    }

    const R0 = nBase / dBase; // 基准转化率
    const R1 = nCur / dCur; // 当前转化率
    const deltaR = R1 - R0;

    // 差分分解
    // 分子贡献 = ΔN / D₀
    const numeratorContribution = (nCur - nBase) / dBase;
    // 分母贡献 = -(N₀ / D₀²) × ΔD
    const denominatorContribution = -(nBase / (dBase * dBase)) * (dCur - dBase);

    return {
      indicator_type: "除法型",
      formula: "R = N / D",
      baseline_rate: parseFloat(R0.toFixed(6)),
      current_rate: parseFloat(R1.toFixed(6)),
      delta_rate: parseFloat(deltaR.toFixed(6)),
      delta_rate_pp: parseFloat((deltaR * 100).toFixed(2)), // 百分点变化
      numerator: {
        name: "分子",
        current_value: nCur,
        baseline_value: nBase,
        change: nCur - nBase,
        change_rate: parseFloat(
          nBase === 0 ? 0 : ((nCur - nBase) / nBase).toFixed(4)
        ),
        contribution_to_rate: parseFloat(numeratorContribution.toFixed(6)),
        contribution_pp: parseFloat((numeratorContribution * 100).toFixed(2)),
      },
      denominator: {
        name: "分母",
        current_value: dCur,
        baseline_value: dBase,
        change: dCur - dBase,
        change_rate: parseFloat(
          dBase === 0 ? 0 : ((dCur - dBase) / dBase).toFixed(4)
        ),
        contribution_to_rate: parseFloat(denominatorContribution.toFixed(6)),
        contribution_pp: parseFloat((denominatorContribution * 100).toFixed(2)),
      },
      dominant_factor:
        Math.abs(numeratorContribution) >= Math.abs(denominatorContribution)
          ? "分子"
          : "分母",
      dilution_effect:
        dCur > dBase && R1 < R0
          ? {
              detected: true,
              warning:
                "分母增长但转化率下降，存在「稀释效应」：分母质量下降（如新用户质量偏低）导致转化率被稀释，而非转化能力变差",
              suggestion: "建议分层分析新老用户或按来源渠道下钻，排查分母结构变化",
            }
          : { detected: false },
      key_insight:
        dCur > dBase && R1 < R0
          ? `转化率下降${Math.abs(deltaR * 100).toFixed(2)}个百分点，主要由分母增长${((dCur - dBase) / dBase * 100).toFixed(1)}%导致的稀释效应驱动，建议检查新增用户的转化质量`
          : `转化率变化主要由「${Math.abs(numeratorContribution) >= Math.abs(denominatorContribution) ? "分子" : "分母"}」驱动`,
      metric: metric || null,
    };
  }

  // ================================================================
  // 6. scenario_simulation — 除法型情景模拟法
  // ================================================================
  scenarioSimulation({
    metric,
    numerator_current,
    numerator_baseline,
    denominator_current,
    denominator_baseline,
    data,
  }) {
    // 兼容 data 传入方式（同 differential_decomposition）
    let nCur = numerator_current;
    let nBase = numerator_baseline;
    let dCur = denominator_current;
    let dBase = denominator_baseline;

    if ((nCur == null || nBase == null || dCur == null || dBase == null) && data) {
      if (typeof data === "object" && !Array.isArray(data)) {
        nCur = nCur ?? data.numerator_current ?? data.numerator?.current;
        nBase = nBase ?? data.numerator_baseline ?? data.numerator?.baseline;
        dCur = dCur ?? data.denominator_current ?? data.denominator?.current;
        dBase = dBase ?? data.denominator_baseline ?? data.denominator?.baseline;
      }
    }

    if (
      typeof nCur !== "number" ||
      typeof nBase !== "number" ||
      typeof dCur !== "number" ||
      typeof dBase !== "number"
    ) {
      throw new Error(
        "scenario_simulation 需要分子和分母的当前值及基准值"
      );
    }

    if (dBase === 0) {
      throw new Error("分母不能为零");
    }

    const R0 = nBase / dBase; // 基准比率
    const R1 = nCur / dCur; // 实际当前比率

    // 情景A：分母不变，仅分子变化
    const scenarioA = nCur / dBase;
    // 情景B：分子不变，仅分母变化
    const scenarioB = nBase / dCur;

    return {
      indicator_type: "除法型",
      method: "情景模拟法",
      baseline: {
        numerator: nBase,
        denominator: dBase,
        rate: parseFloat(R0.toFixed(6)),
        description: "基准期",
      },
      actual: {
        numerator: nCur,
        denominator: dCur,
        rate: parseFloat(R1.toFixed(6)),
        description: "当前实际",
      },
      scenarios: [
        {
          name: "情景A：仅分子变化",
          description: "分母保持基准不变，分子变为当前值",
          numerator: nCur,
          denominator: dBase,
          simulated_rate: parseFloat(scenarioA.toFixed(6)),
          rate_change_pp: parseFloat(((scenarioA - R0) * 100).toFixed(2)),
          interpretation:
            scenarioA > R0
              ? `如果分母不变，比率将上升${((scenarioA - R0) * 100).toFixed(2)}个百分点`
              : `如果分母不变，比率将下降${((R0 - scenarioA) * 100).toFixed(2)}个百分点`,
        },
        {
          name: "情景B：仅分母变化",
          description: "分子保持基准不变，分母变为当前值",
          numerator: nBase,
          denominator: dCur,
          simulated_rate: parseFloat(scenarioB.toFixed(6)),
          rate_change_pp: parseFloat(((scenarioB - R0) * 100).toFixed(2)),
          interpretation:
            scenarioB < R0
              ? `如果分子不变，比率将被稀释下降${((R0 - scenarioB) * 100).toFixed(2)}个百分点`
              : `如果分子不变，比率将上升${((scenarioB - R0) * 100).toFixed(2)}个百分点`,
        },
      ],
      conclusion: {
        numerator_effect_pp: parseFloat(((scenarioA - R0) * 100).toFixed(2)),
        denominator_effect_pp: parseFloat(((scenarioB - R0) * 100).toFixed(2)),
        actual_change_pp: parseFloat(((R1 - R0) * 100).toFixed(2)),
        dominant_factor:
          Math.abs(scenarioA - R0) >= Math.abs(scenarioB - R0) ? "分子" : "分母",
      },
      metric: metric || null,
    };
  }

  // ================================================================
  // 7. drill_down — 多维度下钻分析
  // ================================================================
  drillDown({ metric, dimensions, data }) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error(
        "drill_down 需要传入有效的 data 数组。" +
        "格式: [{维度1: 'A', 维度2: 'X', current_value: 100, baseline_value: 80}, ...]"
      );
    }

    const sample = data[0];
    const keys = Object.keys(sample);

    // 自动嗅探维度列和数值列
    let autoDims = dimensions?.filter((d) => keys.includes(d)) || [];
    if (autoDims.length === 0) {
      autoDims = keys.filter((k) => typeof sample[k] === "string");
      if (autoDims.length === 0) autoDims = [keys[0]];
    }

    // 自动嗅探数值列
    const numKeys = keys.filter(
      (k) => typeof sample[k] === "number" && !autoDims.includes(k)
    );
    const currentKey =
      numKeys.find((k) => ["current_value", "current"].includes(k)) || numKeys[0];
    const baselineKey =
      numKeys.find((k) => ["baseline_value", "baseline"].includes(k)) ||
      (numKeys.length >= 2 ? numKeys[1] : numKeys[0]);

    if (!currentKey) {
      throw new Error("无法从数据中识别数值列，请确保数据包含 current_value 或数值字段");
    }

    // 按维度组合分组聚合
    const groupMap = {};
    let totalCurrent = 0;
    let totalBaseline = 0;

    for (const row of data) {
      const dimKey = autoDims.map((d) => String(row[d] || "未知")).join("|");
      const cur = parseFloat(row[currentKey]) || 0;
      const base = parseFloat(row[baselineKey]) || 0;

      if (!groupMap[dimKey]) {
        groupMap[dimKey] = {
          dimensions: {},
          current_value: 0,
          baseline_value: 0,
        };
        autoDims.forEach((d) => {
          groupMap[dimKey].dimensions[d] = String(row[d] || "未知");
        });
      }

      groupMap[dimKey].current_value += cur;
      groupMap[dimKey].baseline_value += base;
      totalCurrent += cur;
      totalBaseline += base;
    }

    const totalVariance = totalCurrent - totalBaseline;
    const drillResult = Object.entries(groupMap)
      .map(([key, group]) => {
        const variance = group.current_value - group.baseline_value;
        return {
          key,
          dimensions: group.dimensions,
          current_value: parseFloat(group.current_value.toFixed(2)),
          baseline_value: parseFloat(group.baseline_value.toFixed(2)),
          variance: parseFloat(variance.toFixed(2)),
          variance_contribution:
            totalVariance === 0
              ? 0
              : parseFloat((variance / totalVariance).toFixed(4)),
          change_rate: parseFloat(
            group.baseline_value === 0
              ? 0
              : ((variance / group.baseline_value)).toFixed(4)
          ),
        };
      })
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

    // 计算解释度（Top N 维度的贡献绝对值之和 / 总变化绝对值）
    const top3AbsSum = drillResult
      .slice(0, 3)
      .reduce((sum, d) => sum + Math.abs(d.variance), 0);
    const varianceExplained =
      totalVariance === 0
        ? 1
        : parseFloat(
            Math.min(1, top3AbsSum / Math.abs(totalVariance)).toFixed(4)
          );

    return {
      dimensions_used: autoDims,
      total_current: parseFloat(totalCurrent.toFixed(2)),
      total_baseline: parseFloat(totalBaseline.toFixed(2)),
      total_variance: parseFloat(totalVariance.toFixed(2)),
      drill_result: drillResult,
      top3: drillResult.slice(0, 3),
      variance_explained: varianceExplained,
      metric: metric || null,
    };
  }

  // ================================================================
  // 8. convergence_judge — 归因收敛判断
  // ================================================================
  convergenceJudge({ metric, contribution_scores, convergence_threshold = 0.9 }) {
    if (!contribution_scores) {
      throw new Error("需要 contribution_scores 参数（来自 contribution_analysis、chain_decomposition 或 drill_down 的输出）");
    }

    let explainedVariance = 0;
    let sourceAction = "unknown";
    let topContributors = [];

    // 根据不同的来源提取解释度
    if (contribution_scores.top_contributors) {
      // 来自 contribution_analysis（加法型）
      sourceAction = "contribution_analysis";
      topContributors = contribution_scores.top_contributors;
      explainedVariance = topContributors.reduce(
        (sum, c) => sum + Math.abs(c.contribution_rate || 0),
        0
      );
    } else if (contribution_scores.contributions) {
      // 来自 chain_decomposition（乘法型）
      sourceAction = "chain_decomposition";
      topContributors = contribution_scores.contributions.slice(0, 3);
      explainedVariance = topContributors.reduce(
        (sum, c) => sum + Math.abs(c.contribution_rate || 0),
        0
      );
    } else if (contribution_scores.variance_explained != null) {
      // 来自 drill_down
      sourceAction = "drill_down";
      explainedVariance = contribution_scores.variance_explained;
      topContributors = (contribution_scores.top3 || []).slice(0, 3);
    } else if (contribution_scores.dominant_factor) {
      // 来自 differential_decomposition 或 scenario_simulation
      sourceAction = "除法型分析";
      explainedVariance = 0.95; // 除法型通常已经定位到分子/分母
      topContributors = [
        { name: contribution_scores.dominant_factor || "主要驱动因素" },
      ];
    }

    const isConverged = explainedVariance >= convergence_threshold;

    return {
      is_converged: isConverged,
      explained_variance: parseFloat(explainedVariance.toFixed(4)),
      convergence_threshold,
      source_action: sourceAction,
      top_contributors: topContributors,
      suggestion: isConverged
        ? "已收敛。归因链路清晰，可停止下钻并生成归因结论与图表"
        : `未收敛（当前解释度${(explainedVariance * 100).toFixed(1)}% < 目标${(convergence_threshold * 100).toFixed(0)}%），建议继续下钻其他辅助维度或调用 drill_down 进行更深层维度拆解`,
      next_steps: isConverged
        ? ["生成归因报告（调用 report_generator）", "生成归因图表（调用 echarts_generator/chart_generator）"]
        : ["调用 drill_down 下钻新维度", "重新检查数据是否遗漏关键维度"],
      metric: metric || null,
    };
  }
}

module.exports = AttributionAnalysis;
