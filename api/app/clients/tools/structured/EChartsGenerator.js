const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { logger } = require("@because/data-schemas");

/**
 * 从字符串中提取 JSON 核心部分（跳过前导/后随的非 JSON 字符如 \\n）。
 */
function extractJsonCore(s) {
  const firstBrace = s.search(/[\[\{]/);
  const lastSquare = s.lastIndexOf("]");
  const lastCurly = s.lastIndexOf("}");
  const lastBrace = Math.max(lastSquare, lastCurly);
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return s.substring(firstBrace, lastBrace + 1);
  }
  return s;
}

/**
 * 多策略 JSON 解析器：直接解析 → 修复尾部逗号 → 修复缺少引号的 key → 单引号转双引号。
 * 覆盖 LLM 最常见的 JSON 错误，所有策略都失败时返回 undefined。
 */
function repairAndParseJson(jsonStr) {
  // 策略1: 直接解析
  try {
    return JSON.parse(jsonStr);
  } catch (_) {
    /* continue */
  }

  // 策略2: 修复尾部多余逗号（,} 或 ,]）
  try {
    const fixed = jsonStr.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(fixed);
  } catch (_) {
    /* continue */
  }

  // 策略3: 修复缺少引号的 key（含中文 key）
  // 覆盖: {key:、{key":、,key:、,key": — 不会误伤 {"key":
  try {
    let fixed = jsonStr.replace(/,\s*([}\]])/g, "$1");
    // 先修复缺开头引号: key": → "key":
    fixed = fixed.replace(
      /([\{,])\s*([a-zA-Z_一-鿿][\w一-鿿]*)"\s*:/g,
      '$1"$2":',
    );
    // 再修复完全无引号: key:
    fixed = fixed.replace(
      /([\{,])\s*([a-zA-Z_一-鿿][\w一-鿿]*)\s*:/g,
      '$1"$2":',
    );
    return JSON.parse(fixed);
  } catch (_) {
    /* continue */
  }

  // 策略4: 单引号 key/value 替换为双引号
  try {
    const fixed = jsonStr
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/'/g, '"');
    return JSON.parse(fixed);
  } catch (_) {
    /* continue */
  }

  return undefined;
}

/**
 * 鲁棒地把模型输出解析为对象。
 * 兼容：多层 JSON.stringify、markdown ```json 代码块包裹、前后空白/换行、
 * LLM 常见 JSON 语法错误（缺少引号的 key、尾部逗号等）。
 * 无法解析时返回 undefined。
 */
function robustParse(value) {
  let v = value;
  for (let i = 0; i < 3 && typeof v === "string"; i++) {
    let s = v.trim();
    if (!s) {
      return undefined;
    }
    // 去除 markdown 代码块围栏
    const fence = s.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
    if (fence) {
      s = fence[1].trim();
    }
    // 提取 JSON 核心 + 多策略解析
    const core = extractJsonCore(s);
    const parsed = repairAndParseJson(core);
    if (parsed !== undefined) {
      v = parsed;
    } else {
      return undefined;
    }
  }
  return v;
}

/**
 * 将模型可能返回的各种 input 形态归一化为 {title, echartsOption, analysisType}。
 * 兼容：整体被 stringify、被再包一层 {charts:[{...}]}、直接把 option 平铺在顶层等。
 * 无法识别时原样返回，交由 zod 报错。
 */
function coerceEChartsInput(value) {
  let v = value;

  // 整体是字符串 → 解析
  if (typeof v === "string") {
    const parsed = robustParse(v);
    if (parsed !== undefined) {
      v = parsed;
    }
  }

  if (!v || typeof v !== "object" || Array.isArray(v)) {
    // 顶层是数组（charts 数组误传）→ 取第一个
    if (Array.isArray(v) && v.length > 0) {
      v = v[0];
    } else {
      return value;
    }
  }

  // 被包了一层 {charts:[{...}]}
  if ("charts" in v && !("echartsOption" in v)) {
    let charts = v.charts;
    if (typeof charts === "string") {
      const parsed = robustParse(charts);
      if (parsed !== undefined) {
        charts = parsed;
      }
    }
    if (Array.isArray(charts) && charts.length > 0) {
      return { ...charts[0] };
    }
    if (charts && typeof charts === "object") {
      return { ...charts };
    }
  }

  // 模型把 option 内容平铺在顶层（有 series 但没有 echartsOption 包裹）
  if (!("echartsOption" in v) && "series" in v) {
    return { title: v.title || "图表", echartsOption: v };
  }

  return v;
}

/**
 * EChartsGenerator Tool - ECharts 图表生成工具
 *
 * 接收 LLM 生成的 ECharts Option JSON 配置，验证后返回配置供前端 EChartsChart 组件渲染。
 * 优先使用此工具而非 chart_generator：需要 dataZoom/visualMap 强交互、地图/桑基图/旭日图等复杂可视化时。
 */
class EChartsGenerator extends Tool {
  name = "echarts_generator";

  description =
    "ECharts 图表生成工具。传入 title + echartsOption 生成交互式图表嵌入聊天。\n\n" +
    "业务场景仅使用 bar（柱状图）、line（折线图）、pie（饼图）三种类型。\n\n" +
    "## 图表类型选型（严格按此决策树执行）\n" +
    "- 多机构(≥2个brchna不同值) + 多指标列对比 → 柱状图(bar)\n" +
    "- ≥3个时间点的序列 / 单指标时间趋势 → 折线图(line)\n" +
    "- 多机构(≥2行) + 仅一个指标值 → 饼图(pie)\n" +
    "- 数据仅1行合计且无任何时间对比字段 → 禁止画图，告知用户数据粒度不足\n\n" +
    "## 数据真实性（最高优先级，严禁违反）\n" +
    "- 图表数值必须原封不动来自 ask_data 返回结果，严禁估算或编造\n" +
    "- 严禁使用 emoji 表情符号\n" +
    "- 所有字段名必须使用中文，禁止展示数据库原始英文字段名\n" +
    "- 标题需具备业务洞察力\n\n" +
    "## 宽格式时间序列转换（1行数据含时间对比字段时强制执行，不可跳过）\n" +
    "将时间对比字段转换为长格式后按日期升序排列。null/不存在的字段跳过。有效记录≥3条→生成折线图：\n" +
    "- index_value → 日期=data_dt，类型=当前\n" +
    "- yd_value → 日期=data_dt减1天，类型=上日\n" +
    "- m_begin_value → 日期=上月末，类型=上月末\n" +
    "- q_begin_value → 日期=上季末，类型=上季末\n" +
    "- y_begin_value → 日期=上年末(12月31日)，类型=上年末\n" +
    "- ly_value → 日期=去年同期，类型=上年同期\n\n" +
    "═══════════════════════════════════════════════════════════\n" +
    "【柱状图 bar 模板 — 多机构多指标对比】\n" +
    "必须逐字遵循以下 JSON 结构，仅替换标注的占位内容：\n" +
    '{\n' +
    '  title: { text: "具业务洞察的标题" },\n' +
    '  tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },\n' +
    '  legend: { data: ["机构A", "机构B"], top: "10%" },\n' +
    '  color: ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272"],\n' +
    '  grid: { left: "3%", right: "4%", bottom: "3%", top: "30%", containLabel: true },\n' +
    '  xAxis: { type: "category", data: ["指标1", "指标2", "指标3"] },\n' +
    '  yAxis: { type: "value", name: "数值（单位）" },\n' +
    '  series: [\n' +
    '    { name: "机构A", type: "bar", data: [值1, 值2, 值3] },\n' +
    '    { name: "机构B", type: "bar", data: [值1, 值2, 值3] }\n' +
    '  ]\n' +
    '}\n' +
    "关键约束（违反任何一条即视为错误）：\n" +
    "- xAxis.data 放指标名（如资产规模、贷款规模），不是机构名！机构名放 series.name\n" +
    "- 每个 series 代表一个机构/维度，name 值必须与 legend.data 完全一致\n" +
    "- color 数组按顺序自动分配颜色，禁止手动添加 itemStyle 到 series 中\n" +
    "- title 不设置 left 属性（保持默认左对齐）\n" +
    "- data 数组的值顺序必须与 xAxis.data 的一一对应\n" +
    "- 严禁修改 grid/tooltip 的任何属性值\n" +
    "- 调色板固定顺序：#5470c6, #91cc75, #fac858, #ee6666, #73c0de, #3ba272\n\n" +
    "═══════════════════════════════════════════════════════════\n" +
    "【折线图 line 模板 — 单指标时间趋势】\n" +
    "必须逐字遵循以下 JSON 结构，仅替换标注的占位内容：\n" +
    '{\n' +
    '  title: { text: "指标名趋势图", left: "center" },\n' +
    '  tooltip: { trigger: "axis", confine: true },\n' +
    '  legend: { data: ["指标名称"], left: "right" },\n' +
    '  grid: { left: "2%", bottom: "0%", right: "1%", containLabel: true },\n' +
    '  xAxis: { type: "category", data: ["日期1", "日期2", ...], axisLabel: { rotate: 45 }, boundaryGap: false },\n' +
    '  yAxis: { type: "value", name: "单位：单位名" },\n' +
    '  series: [{\n' +
    '    name: "",\n' +
    '    type: "line",\n' +
    '    data: [值1, 值2, ...],\n' +
    '    markPoint: { data: [{ type: "max" }, { type: "min" }] },\n' +
    '    markLine: { data: [{ type: "average" }] }\n' +
    '  }]\n' +
    '}\n' +
    "关键约束（违反任何一条即视为错误）：\n" +
    '- series[0].name 必须为 ""（空字符串），指标名通过 legend.data 展示\n' +
    "- xAxis.boundaryGap 必须为 false（折线从坐标轴起点开始，严禁遗漏或设为 true）\n" +
    "- xAxis.axisLabel.rotate 必须为 45（日期标签旋转防重叠）\n" +
    "- data 数组必须按日期升序排列（最旧→最新）\n" +
    "- markPoint 必须包含 {type:\"max\"} 和 {type:\"min\"}\n" +
    "- markLine 必须包含 {type:\"average\"}\n" +
    '- grid.left 默认 "2%"，当 yAxis 数值位数≥6位时调大为 "4%"~"8%"\n' +
    '- title.text 须包含具体指标名（如"各项贷款余额趋势图"），禁止只写"趋势图"\n' +
    "- 严禁去掉 markPoint 或 markLine，严禁修改 grid/tooltip 的属性值\n\n" +
    "═══════════════════════════════════════════════════════════\n" +
    "【饼图 pie 模板 — 多机构占比或多指标对比】\n" +
    "必须逐字遵循以下 JSON 结构，仅替换标注的占位内容：\n" +
    '{\n' +
    '  title: { text: "占比分析标题", left: "center" },\n' +
    '  tooltip: { trigger: "item", formatter: "{b}: {d}%" },\n' +
    '  legend: { data: ["类别A", "类别B", ...], left: "center", bottom: "bottom" },\n' +
    '  color: ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272"],\n' +
    '  series: [{\n' +
    '    type: "pie",\n' +
    '    name: "系列名",\n' +
    '    radius: ["0%", "65%"],\n' +
    '    center: ["50%", "45%"],\n' +
    '    data: [{ name: "类别A", value: 值 }, { name: "类别B", value: 值 }, ...],\n' +
    '    label: { show: true, formatter: "{b}: {d}%" },\n' +
    '    emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0,0,0,0.5)" } }\n' +
    '  }]\n' +
    '}\n' +
    "关键约束：\n" +
    "- data 中每项的 name 显示为扇区标签，value 为数值\n" +
    "- color 数组按顺序自动分配，禁止手动添加 itemStyle\n\n" +
    "═══════════════════════════════════════════════════════════\n" +
    "## 禁止事项（违反即视为图表生成失败）\n" +
    "- 柱状图：禁止把机构名放在 xAxis.data 中（机构名放 series.name 和 legend.data）\n" +
    "- 折线图：禁止 series.name 填非空值、禁止 boundaryGap 不为 false、禁止遗漏 markPoint/markLine\n" +
    "- 折线图：禁止 data 不按日期升序排列\n" +
    "- 禁止修改模板中 tooltip.trigger / grid 百分比 / legend 位置等结构属性\n" +
    "- 禁止添加模板规定之外的样式字段（如 textStyle、title.textStyle 等）\n" +
    "- 禁止使用 emoji 或展示英文数据库字段名\n" +
    "- 数据量大时（≥20个类别/时间点）推荐添加 dataZoom: [{ type: \"slider\", start: 0, end: 100 }]";

  schema = z.preprocess(
    coerceEChartsInput,
    z.object({
      title: z
        .string()
        .describe(
          '图表标题，需具备业务洞察力，如"二线城市是本月销售下滑的重灾区"而非"各地区销售数据"',
        ),
      echartsOption: z
        .union([z.string(), z.record(z.any())])
        .describe(
          "完整的 ECharts Option JSON 配置（可以是 JSON 字符串或对象）。" +
            "必须包含 series（系列数据数组）以及对应的 xAxis/yAxis 或其它坐标系配置。" +
            "支持的关键字段：title, tooltip, legend, xAxis, yAxis, series, grid, " +
            "dataZoom（数据区域缩放）, visualMap（视觉映射）, toolbox（工具栏）, " +
            "dataset（数据集，ECharts 4+ 支持）, color（调色板）, " +
            "tooltip（提示框）, legend（图例）, graphic（原生图形组件）。" +
            "series 中每个系列的 type 指定图表类型（bar/line/pie/scatter/effectScatter/radar/" +
            "treemap/heatmap/boxplot/candlestick/gauge/funnel/sankey/sunburst/map/lines/graph/parallel 等）。" +
            "参考 ECharts Option 标准格式（https://echarts.apache.org/zh/option.html）。",
        ),
      analysisType: z
        .enum([
          "dimension_compare",
          "trend_analysis",
          "combined_analysis",
          "composition_distribution",
          "general",
        ])
        .optional()
        .describe(
          "归因分析场景类型（可选）：" +
            "dimension_compare=多维度对比分析, trend_analysis=同比/环比趋势分析, " +
            "combined_analysis=多维度+时间轴组合归因, composition_distribution=指标构成/分布归因, " +
            "general=通用图表",
        ),
    }),
  );

  constructor(fields = {}) {
    super();
  }

  /**
   * 验证 ECharts Option 配置的基本合法性
   */
  validateEChartsOption(option) {
    if (!option || typeof option !== "object") {
      throw new Error("echartsOption 必须是有效的 JSON 对象");
    }

    // series 是 ECharts 的核心字段
    if (!option.series) {
      throw new Error("echartsOption 必须包含 series 字段");
    }

    if (!Array.isArray(option.series)) {
      throw new Error("series 必须是数组");
    }

    if (option.series.length === 0) {
      throw new Error("series 数组不能为空");
    }

    // 验证每个 series 至少包含 type 或 data
    for (let i = 0; i < option.series.length; i++) {
      const s = option.series[i];
      if (!s || typeof s !== "object") {
        throw new Error(`series[${i}] 必须是有效的对象`);
      }
      if (!s.type && !s.data) {
        throw new Error(
          `series[${i}] 必须包含 type 字段（如 bar, line, pie 等）`,
        );
      }
    }

    return true;
  }

  /**
   * 清理 ECharts Option 中的敏感内容
   */
  sanitizeOption(option) {
    if (option === null || option === undefined) {
      return option;
    }
    if (Array.isArray(option)) {
      return option.map((item) => this.sanitizeOption(item));
    }
    if (typeof option === "object") {
      const result = {};
      for (const [key, value] of Object.entries(option)) {
        result[key] = this.sanitizeOption(value);
      }
      return result;
    }
    return option;
  }

  async _call(input) {
    const startTime = Date.now();

    try {
      logger.info("[EChartsGenerator] ========== 开始调用 ==========");
      logger.info(
        `[EChartsGenerator] 输入参数: ${JSON.stringify(input, null, 2)}`,
      );

      // 安全网：在 _call 内部再次应用 coercion（LangChain 可能绕过 Zod preprocess）
      const coerced = coerceEChartsInput(input);
      const { title, echartsOption: rawOption, analysisType } = coerced;

      if (!title || typeof title !== "string") {
        return JSON.stringify(
          { success: false, error: "缺少图表标题（title）" },
          null,
          2,
        );
      }

      // 解析 echartsOption
      let echartsOption;
      if (typeof rawOption === "string") {
        try {
          echartsOption = JSON.parse(rawOption);
        } catch (parseErr) {
          return JSON.stringify(
            {
              success: false,
              error: `echartsOption JSON 解析失败: ${parseErr.message}`,
            },
            null,
            2,
          );
        }
      } else {
        echartsOption = rawOption;
      }

      if (!echartsOption || typeof echartsOption !== "object") {
        return JSON.stringify(
          {
            success: false,
            error: "echartsOption 必须是有效的 JSON 对象或 JSON 字符串",
          },
          null,
          2,
        );
      }

      // 验证
      try {
        this.validateEChartsOption(echartsOption);
      } catch (validationErr) {
        return JSON.stringify(
          { success: false, error: validationErr.message },
          null,
          2,
        );
      }

      // 清理
      echartsOption = this.sanitizeOption(echartsOption);

      const duration = Date.now() - startTime;
      logger.info(
        `[EChartsGenerator] ECharts 图表配置生成成功, 耗时: ${duration}ms`,
      );
      logger.info("[EChartsGenerator] ========== 调用完成 ==========");

      return JSON.stringify(
        {
          success: true,
          __echartsConfig: true,
          title,
          analysisType: analysisType || "general",
          echartsOption,
        },
        null,
        2,
      );
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(
        `[EChartsGenerator] 执行错误: ${err.message}, 耗时: ${duration}ms`,
      );
      return JSON.stringify(
        { success: false, error: err.message || "图表配置生成失败" },
        null,
        2,
      );
    }
  }
}

module.exports = EChartsGenerator;
