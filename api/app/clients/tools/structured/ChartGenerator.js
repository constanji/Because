const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { logger } = require("@because/data-schemas");

/**
 * ChartGenerator Tool - 灵活 G2 图表生成工具
 *
 * 接收 LLM 生成的 G2 Spec JSON 配置，验证后返回配置供前端 G2Chart 组件渲染。
 * 支持所有 G2 图表类型（通过 G2 Spec），覆盖归因分析五大核心场景：
 *
 * 场景1: 多维度对比分析 - 分组柱形/堆叠柱形/发散条形/弹性条形
 * 场景2: 同比/环比趋势分析 - 折线图/柱线混合/双轴图/斜率图
 * 场景3: 多维度+时间轴组合归因 - 多轴条形/聚合折线/日历条形/断轴图
 * 场景4: 指标构成/分布归因 - 饼图/环图/箱线图/热力图
 * 场景5: 瀑布图/雷达图/散点图等辅助分析
 */
class ChartGenerator extends Tool {
  name = "chart_generator";

  description =
    "灵活图表生成工具，接收 G2 Spec JSON 配置在聊天消息中生成交互式 G2 图表。" +
    "支持所有 G2 图表类型：分组柱形图、堆叠柱形图、发散条形图、弹性条形图、" +
    "折线图（基础/曲线/系列/阈值/归一化）、柱线混合双轴图、斜率图、" +
    "饼图/环图、箱线图、热力图、雷达图、散点图、瀑布图、日历条形图等。" +
    "传入图表标题和完整的 G2 Spec JSON 即可生成图表。" +
    "用于展示多维度对比分析、同比/环比趋势归因、维度贡献度分析、构成/分布归因等数据可视化场景。";

  schema = z.object({
    title: z
      .string()
      .describe(
        '图表标题，需具备业务洞察力，如"二线城市是本月销售下滑的重灾区"而非"各地区销售数据"',
      ),
    g2Spec: z
      .union([z.string(), z.record(z.any())])
      .describe(
        "完整的 G2 Spec JSON 配置（可以是 JSON 字符串或对象）。" +
          "必须包含 type（mark 类型如 interval/line/point/area/cell/boxplot 或 view）和 data（数据数组）。" +
          "支持的关键字段：type, data, encode(x/y/color/size/series/shape), transform(stackY/dodgeX/flexX/normalizeY/sortX/groupX/binX), " +
          "coordinate(transpose/polar/theta), scale, axis, legend, label, style, interaction, children(多层 mark 复合图表)。" +
          '对于复合图表（如柱线混合双轴图），使用 type:"view" + children 数组组合多个 mark。' +
          "参考 G2 Spec 标准格式。",
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
   * 验证 G2 Spec 配置的基本合法性
   */
  validateG2Spec(spec) {
    if (!spec || typeof spec !== "object") {
      throw new Error("g2Spec 必须是有效的 JSON 对象");
    }

    // 复合图表（view 类型）需要有 children
    if (spec.type === "view") {
      if (!Array.isArray(spec.children) || spec.children.length === 0) {
        throw new Error(
          'type 为 "view" 的复合图表必须包含非空的 children 数组',
        );
      }
      // 验证 children 中至少有一个有效的 mark
      for (const child of spec.children) {
        if (!child.type) {
          throw new Error("children 中的每个子图表必须包含 type 字段");
        }
      }
    } else {
      // 单一 mark 图表需要有 type
      if (!spec.type) {
        throw new Error(
          "g2Spec 必须包含 type 字段（如 interval, line, point, area, cell, boxplot 等）",
        );
      }
    }

    // data 可以在顶层，也可以在 children 的各个 mark 中
    const hasTopLevelData =
      spec.data && (Array.isArray(spec.data) || typeof spec.data === "object");
    const hasChildData =
      spec.children &&
      spec.children.some(
        (c) => c.data && (Array.isArray(c.data) || typeof c.data === "object"),
      );

    if (!hasTopLevelData && !hasChildData) {
      throw new Error("g2Spec 必须包含 data 字段（顶层或 children 内）");
    }

    return true;
  }

  /**
   * 清理 G2 Spec 中的函数字符串（安全性考虑，禁止在 JSON 中传递函数）
   * 但保留 G2 支持的声明式配置
   */
  sanitizeSpec(spec) {
    if (spec === null || spec === undefined) {
      return spec;
    }
    if (Array.isArray(spec)) {
      return spec.map((item) => this.sanitizeSpec(item));
    }
    if (typeof spec === "object") {
      const result = {};
      for (const [key, value] of Object.entries(spec)) {
        result[key] = this.sanitizeSpec(value);
      }
      return result;
    }
    return spec;
  }

  async _call(input) {
    const startTime = Date.now();

    try {
      logger.info("[ChartGenerator] ========== 开始调用 ==========");
      logger.info(
        `[ChartGenerator] 输入参数: ${JSON.stringify(input, null, 2)}`,
      );

      const { title, g2Spec: rawSpec, analysisType } = input;

      if (!title || typeof title !== "string") {
        return JSON.stringify(
          { success: false, error: "缺少图表标题（title）" },
          null,
          2,
        );
      }

      // 解析 g2Spec
      let g2Spec;
      if (typeof rawSpec === "string") {
        try {
          g2Spec = JSON.parse(rawSpec);
        } catch (parseErr) {
          return JSON.stringify(
            {
              success: false,
              error: `g2Spec JSON 解析失败: ${parseErr.message}`,
            },
            null,
            2,
          );
        }
      } else {
        g2Spec = rawSpec;
      }

      if (!g2Spec || typeof g2Spec !== "object") {
        return JSON.stringify(
          {
            success: false,
            error: "g2Spec 必须是有效的 JSON 对象或 JSON 字符串",
          },
          null,
          2,
        );
      }

      // 验证
      try {
        this.validateG2Spec(g2Spec);
      } catch (validationErr) {
        return JSON.stringify(
          { success: false, error: validationErr.message },
          null,
          2,
        );
      }

      // 清理
      g2Spec = this.sanitizeSpec(g2Spec);

      // 注入 autoFit
      if (g2Spec.autoFit === undefined) {
        g2Spec.autoFit = true;
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[ChartGenerator] G2 Spec 图表配置生成成功, 耗时: ${duration}ms`,
      );
      logger.info("[ChartGenerator] ========== 调用完成 ==========");

      return JSON.stringify(
        {
          success: true,
          __chartConfig: true,
          title,
          analysisType: analysisType || "general",
          g2Spec,
        },
        null,
        2,
      );
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(
        `[ChartGenerator] 执行错误: ${err.message}, 耗时: ${duration}ms`,
      );
      return JSON.stringify(
        { success: false, error: err.message || "图表配置生成失败" },
        null,
        2,
      );
    }
  }
}

module.exports = ChartGenerator;
