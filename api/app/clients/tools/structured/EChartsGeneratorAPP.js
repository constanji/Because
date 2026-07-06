const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { logger } = require("@because/data-schemas");

/**
 * 将模型可能返回的各种 charts 形态归一化为图表配置数组。
 *
 * 兼容以下常见的非规范输出：
 * 1. charts 是 JSON 字符串（如 '"[{...}]"'）→ 解析
 * 2. charts 被再包了一层 {charts:[...]} → 解包
 * 3. charts 是单个图表对象 → 包成数组
 * 4. 顶层直接传了 {id,title,echartsOption} → 由 preprocess 在数组层兜底
 *
 * 无法识别时原样返回，交由 zod 报错。
 */
function coerceToChartsArray(value) {
  let v = value;

  // 反复解析字符串（可能存在多层 JSON.stringify）
  for (let i = 0; i < 3 && typeof v === "string"; i++) {
    const trimmed = v.trim();
    if (!trimmed) {
      break;
    }
    try {
      v = JSON.parse(trimmed);
    } catch (_err) {
      // 不是合法 JSON，保持原样交给 zod 报错
      break;
    }
  }

  // 解包 {charts:[...]} 或 {charts:"[...]"}
  if (v && typeof v === "object" && !Array.isArray(v) && "charts" in v) {
    v = coerceToChartsArray(v.charts);
  }

  // 单个图表对象 → 包成数组
  if (
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    ("echartsOption" in v || "title" in v || "id" in v)
  ) {
    v = [v];
  }

  return v;
}

/**
 * EChartsGeneratorAPP Tool - ECharts 图表生成工具
 *
 * 接收 LLM 生成的 ECharts Option JSON 配置，验证后返回配置供前端 EChartsChart 组件渲染。
 * 优先使用此工具而非 chart_generator：需要 dataZoom/visualMap 强交互、地图/桑基图/旭日图等复杂可视化时。
 */
class EChartsGeneratorAPP extends Tool {
  name = "echarts_generator_app";

  description =
    "ECharts 图表生成工具。传入 title + echartsOption 生成交互式图表嵌入聊天。\n\n" +
    "支持类型：柱状图、折线图、面积图、饼图/环图、散点图、雷达图、热力图、漏斗图、仪表盘、瀑布图、箱线图、桑基图、旭日图、地图等。\n\n" +
    "## 图表生成规则（强制执行，违反任何一条视为违规）\n\n" +
    "### 1. 何时必须画图（按顺序判断，命中即执行）\n" +
    "- 数据有 ≥2 行且存在维度字段（brchna/地区/渠道等）有 ≥2 个不同值 → 必须画图\n" +
    "- 数据只有 1 行但包含时间对比字段（yd_value/m_begin_value/q_begin_value/y_begin_value/ly_value 任意一个非空）→ 必须画图\n" +
    "- 数据只有 1 行且无任何时间对比字段 → 禁止画图，告知用户数据粒度不足\n\n" +
    "### 2. 宽格式时间序列转换（1行数据含时间对比字段时必须执行，不可跳过）\n" +
    "将时间对比字段转换为长格式，每条记录含 日期、指标值、对比类型：\n" +
    "- index_value → 日期=data_dt，类型=当前\n" +
    "- yd_value → 日期=data_dt减1天，类型=上日\n" +
    "- m_begin_value → 日期=上月末，类型=上月末\n" +
    "- q_begin_value → 日期=上季末，类型=上季末\n" +
    "- y_begin_value → 日期=上年末(12月31日)，类型=上年末\n" +
    "- ly_value → 日期=去年同期，类型=上年同期\n" +
    "转换后按日期升序排列。null/不存在的字段跳过。有效记录≥3条→生成趋势图。\n\n" +
    "### 3. 图表类型选型\n" +
    "- ≥2个维度值对比 → 分组柱形图/横向条形图\n" +
    "- ≥3个时间点序列 → 折线图/面积图\n" +
    "- ≥3行Top N排名 → 横向条形图\n" +
    "- 各部分占整体比例 → 饼图/环图\n" +
    "- 绝对值+增长率 → 柱线混合双轴图\n\n" +
    "### 4. 数据真实性（最高优先级，严禁违反）\n" +
    "- 图表数值必须原封不动来自 ask_data 返回结果\n" +
    "- 严禁：把合计值除以N估算、凭空编造数据行、拆分汇总行凑图\n" +
    "- 1行合计且无时间对比字段 → 不画图，告知用户\n" +
    "- 🚫 严禁使用任何 emoji 表情符号（包括 📊📈📉🔍💡✅❌ 等）\n\n" +
    "### 5. 字段命名与交互\n" +
    "- 图表数据字段名必须使用中文，禁止展示数据库原始英文字段名\n" +
    "- 标题需具备业务洞察力\n" +
    "- 必须配置 tooltip（提示框）\n" +
    "- 推荐配置 toolbox（至少含 saveAsImage）\n" +
    "- 数据量大时推荐 dataZoom\n\n" +
    "### 6. ECharts Option 格式要点\n" +
    "- 必须包含 series（系列数组）和对应坐标系（xAxis/yAxis 等）\n" +
    "- series 中每个系列的 type 指定图表类型\n" +
    "- 参考标准格式：https://echarts.apache.org/zh/option.html";

  schema = z.object({
    charts: z
      .preprocess(
        coerceToChartsArray,
        z
          .array(
            z.object({
              id: z
                .string()
                .describe(
                  "图表唯一标识，用于前端解析匹配（如 id_1, id_2 等），对应 markdown 中的 @ec@type:id@ec@ 标记",
                ),
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
          )
          .min(1),
      )
      .describe("图表配置数组，每个图表配置包含 id、title、echartsOption，前端根据 id 匹配对应的图表位置"),
  });

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

  /**
   * 处理单个图表配置
   */
  processChart(chart, index) {
    const { id, title, echartsOption: rawOption, analysisType } = chart;

    if (!id || typeof id !== "string") {
      throw new Error(`charts[${id}] 缺少图表标识（id）`);
    }

    if (!title || typeof title !== "string") {
      throw new Error(`charts[${id}] 缺少图表标题（title）`);
    }

    // 解析 echartsOption
    let echartsOption;
    if (typeof rawOption === "string") {
      try {
        echartsOption = JSON.parse(rawOption);
      } catch (parseErr) {
        throw new Error(`charts[${id}] echartsOption JSON 解析失败: ${parseErr.message}`);
      }
    } else {
      echartsOption = rawOption;
    }

    if (!echartsOption || typeof echartsOption !== "object") {
      throw new Error(`charts[${id}] echartsOption 必须是有效的 JSON 对象或 JSON 字符串`);
    }

    // 验证
    this.validateEChartsOption(echartsOption);

    // 清理
    echartsOption = this.sanitizeOption(echartsOption);

    return {
      id,
      title,
      analysisType: analysisType || "general",
      echartsOption,
    };
  }

  async _call(input) {
    const startTime = Date.now();

    try {
      logger.info("[EChartsGenerator] ========== 开始调用 ==========");
      logger.info(
        `[EChartsGenerator] 输入参数: ${JSON.stringify(input, null, 2)}`,
      );

      const { charts } = input;

      if (!charts || !Array.isArray(charts) || charts.length === 0) {
        return JSON.stringify(
          { success: false, error: "缺少图表配置数组（charts）" },
          null,
          2,
        );
      }

      // 处理所有图表配置
      const processedCharts = [];
      for (let i = 0; i < charts.length; i++) {
        try {
          const processedChart = this.processChart(charts[i], i);
          processedCharts.push(processedChart);
        } catch (chartErr) {
          return JSON.stringify(
            { success: false, error: chartErr.message },
            null,
            2,
          );
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[EChartsGenerator] ECharts 图表配置生成成功, 共 ${processedCharts.length} 个图表, 耗时: ${duration}ms`,
      );
      logger.info("[EChartsGenerator] ========== 调用完成 ==========");

      return JSON.stringify(
        {
          success: true,
          __echartsConfig: true,
          charts: processedCharts,
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

module.exports = EChartsGeneratorAPP;
