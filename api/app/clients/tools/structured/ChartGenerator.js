const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { logger } = require("@because/data-schemas");

/**
 * ChartGenerator Tool - 灵活 G2 图表生成工具
 *
 * 接收 LLM 生成的 G2 Spec JSON 配置，验证后返回配置供前端 G2Chart 组件渲染。
 */
class ChartGenerator extends Tool {
  name = "chart_generator";

  description =
    "G2 图表生成工具。传入 title + g2Spec 生成交互式图表嵌入聊天。\n\n" +
    "支持类型：分组柱形图、堆叠柱形图、发散条形图、弹性条形图、折线图、柱线混合双轴图、斜率图、饼图/环图、箱线图、热力图、雷达图、散点图、瀑布图等。\n\n" +
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
    "### 5. 字段命名\n" +
    "- 图表数据字段名必须使用中文，禁止展示数据库原始英文字段名（如 district_count）\n" +
    "- 标题需具备业务洞察力（如\"二线城市是本月销售下滑的重灾区\"而非\"各地区销售数据\"）\n\n" +
    "### 6. G2 Spec 格式要点\n" +
    "- 必须包含 type（interval/line/point/area/cell/boxplot 或 view）和 data\n" +
    "- 复合图表用 type:\"view\" + children 数组\n" +
    "- encode 配置 x/y/color/series/shape 等通道\n" +
    "- transform 支持 stackY/dodgeX/flexX/normalizeY 等\n" +
    "- 参考 G2 Spec 标准格式：https://g2.antv.antgroup.com/api/spec";

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
