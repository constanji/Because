const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { logger } = require("@because/data-schemas");

/**
 * EChartsGenerator Tool - ECharts 图表生成工具
 *
 * 接收 LLM 生成的 ECharts Option JSON 配置，验证后返回配置供前端 EChartsChart 组件渲染。
 * 支持所有 ECharts 图表类型，覆盖归因分析五大核心场景：
 *
 * 场景1: 多维度对比分析 - 柱状图/条形图/堆叠图
 * 场景2: 同比/环比趋势分析 - 折线图/面积图/柱线混合
 * 场景3: 多维度+时间轴组合归因 - 组合图/多轴图
 * 场景4: 指标构成/分布归因 - 饼图/环图/漏斗图/热力图
 * 场景5: 散点图/雷达图/仪表盘/瀑布图等辅助分析
 */
class EChartsGenerator extends Tool {
  name = "echarts_generator";

  description =
    "ECharts 图表生成工具，接收 ECharts Option JSON 配置在聊天消息中生成交互式 ECharts 图表。" +
    "支持所有 ECharts 图表类型：柱状图（bar）、折线图（line）、面积图（area）、饼图（pie）、环图（ring）、" +
    "散点图（scatter）、雷达图（radar）、热力图（heatmap）、漏斗图（funnel）、仪表盘（gauge）、" +
    "瀑布图、箱线图（boxplot）、桑基图（sankey）、旭日图（sunburst）、地图（map）等。" +
    "传入图表标题和完整的 ECharts Option JSON 即可生成图表。" +
    "用于展示多维度对比分析、同比/环比趋势归因、维度贡献度分析、构成/分布归因等数据可视化场景。" +
    "当需要更丰富的交互效果、缩放/平移、数据区域缩放（dataZoom）、视觉映射（visualMap）" +
    "或复杂的地图可视化时，优先使用此工具而非 chart_generator。";

  schema = z.object({
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

  async _call(input) {
    const startTime = Date.now();

    try {
      logger.info("[EChartsGenerator] ========== 开始调用 ==========");
      logger.info(
        `[EChartsGenerator] 输入参数: ${JSON.stringify(input, null, 2)}`,
      );

      const { title, echartsOption: rawOption, analysisType } = input;

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
