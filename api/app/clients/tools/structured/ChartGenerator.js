const { Tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { logger } = require("@because/data-schemas");

/**
 * 鲁棒地把模型输出解析为对象。
 * 兼容：多层 JSON.stringify、markdown ```json 代码块包裹、前后空白。
 * 无法解析时返回 undefined。
 */
function robustParse(value) {
  let v = value;
  for (let i = 0; i < 3 && typeof v === "string"; i++) {
    let s = v.trim();
    if (!s) {
      return undefined;
    }
    const fence = s.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
    if (fence) {
      s = fence[1].trim();
    }
    try {
      v = JSON.parse(s);
    } catch (_err) {
      return undefined;
    }
  }
  return v;
}

/**
 * 将模型可能返回的各种 input 形态归一化为 {title, g2Spec, analysisType}。
 * 兼容：整体被 stringify、被再包一层 {charts:[{...}]}、把 spec 平铺在顶层等。
 * 无法识别时原样返回，交由 zod 报错。
 */
function coerceChartInput(value) {
  let v = value;

  if (typeof v === "string") {
    const parsed = robustParse(v);
    if (parsed !== undefined) {
      v = parsed;
    }
  }

  if (!v || typeof v !== "object" || Array.isArray(v)) {
    if (Array.isArray(v) && v.length > 0) {
      v = v[0];
    } else {
      return value;
    }
  }

  // 被包了一层 {charts:[{...}]}
  if ("charts" in v && !("g2Spec" in v)) {
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

  // 兼容误用 echartsOption 字段名
  if (!("g2Spec" in v) && "echartsOption" in v) {
    return { title: v.title || "图表", g2Spec: v.echartsOption };
  }

  // 模型把 spec 平铺在顶层（有 type 但没有 g2Spec 包裹）
  if (!("g2Spec" in v) && "type" in v) {
    return { title: v.title || "图表", g2Spec: v };
  }

  return v;
}

/**
 * ChartGenerator Tool - 灵活 G2 图表生成工具
 *
 * 接收 LLM 生成的 G2 Spec JSON 配置，验证后返回配置供前端 G2Chart 组件渲染。
 */
class ChartGenerator extends Tool {
  name = "chart_generator";

  description =
    "G2 图表生成工具。传入 title + g2Spec 生成图表。支持 bar（柱状图）、line（折线图）、pie（饼图）三种类型。\n\n" +
    "## 图表类型选型\n" +
    "- 多机构(≥2个brchna不同值) + 多指标列对比 → bar（分组柱状图，interval type）\n" +
    "- 单指标时间趋势（≥3个时间点）→ line（折线图，line type）\n" +
    "- 多机构占比（仅一个指标值）→ pie（饼图，interval + theta coordinate）\n\n" +
    "## g2Spec 格式（唯一合法格式，只能替换 <> 占位符）\n\n" +
    "### 条件 A（多行多维度对比 → bar 柱状图）\n" +
    "```json\n" +
    '{"type":"view","data":[\n' +
    '  {"<维度中文名>":"<rows[0].维度值>","<指标中文名>":<rows[0].index_value>},\n' +
    '  {"<维度中文名>":"<rows[1].维度值>","<指标中文名>":<rows[1].index_value>}\n' +
    '],"children":[{"type":"interval","encode":{"x":"<维度中文名>","y":"<指标中文名>","color":"<维度中文名>"}}],\n' +
    '"scale":{"y":{"nice":true}},\n' +
    '"axis":{"x":{"title":"<维度含义>"},"y":{"title":"<指标中文名>（万元）"}}}\n' +
    "```\n" +
    "- data 逐行取自 rows，有几行取几行，数值 = 原始万元值\n\n" +
    "### 条件 B（单行时间对比 → line 折线图）\n" +
    "将 index_value/yd_value/m_begin_value 等 reshape，每条数据必须带一个相同值的\"系列\"字段：\n" +
    "```json\n" +
    '{"type":"view","data":[\n' +
    '  {"对比类型":"上日","数值":<rows[0].yd_value>,"系列":"<index_name>"},\n' +
    '  {"对比类型":"上月末","数值":<rows[0].m_begin_value>,"系列":"<index_name>"},\n' +
    '  {"对比类型":"上季末","数值":<rows[0].q_begin_value>,"系列":"<index_name>"},\n' +
    '  {"对比类型":"上年末","数值":<rows[0].y_begin_value>,"系列":"<index_name>"},\n' +
    '  {"对比类型":"上年同期","数值":<rows[0].ly_value>,"系列":"<index_name>"},\n' +
    '  {"对比类型":"当前","数值":<rows[0].index_value>,"系列":"<index_name>"}\n' +
    '],"children":[{"type":"line","encode":{"x":"对比类型","y":"数值","color":"系列"}}],\n' +
    '"scale":{"y":{"nice":true}},\n' +
    '"axis":{"x":{"title":"时间对比"},"y":{"title":"<index_name>（万元）"}}}\n' +
    "```\n" +
    "- data 只含非 null 字段条目（≥2 条即可），数值 = 原始万元值\n" +
    '- 🔴 "系列"字段每条数据值必须相同（都用同一个 index_name），否则color会拆成多个系列导致线断开\n' +
    "- type 用 \"line\" 而非 \"interval\"，适合趋势展示\n\n" +
    "### 条件 C（多行占比分析 → pie 饼图）\n" +
    "```json\n" +
    '{"type":"view","data":[\n' +
    '  {"<维度中文名>":"<rows[0].维度值>","<指标中文名>":<rows[0].index_value>},\n' +
    '  {"<维度中文名>":"<rows[1].维度值>","<指标中文名>":<rows[1].index_value>}\n' +
    '],"children":[{"type":"interval","encode":{"y":"<指标中文名>","color":"<维度中文名>"},' +
    '"transform":[{"type":"stackY"}],' +
    '"coordinate":{"type":"theta"}}],' +
    '"legend":{"color":{}}}\n' +
    "```\n" +
    "- data 逐行取自 rows，数值 = 原始万元值\n" +
    "- 饼图核心：coordinate type=theta + transform stackY\n\n" +
    "### 🔴 规则\n" +
    "- 只能替换 <> 占位符，禁止新增/删除/修改任何字段名/结构\n" +
    "- encode 的 value 用字符串简写（如 \"x\":\"对比类型\"），禁止用对象包裹（禁止 {\"field\":\"...\",\"type\":\"nominal\"}）\n" +
    "- 禁止改 y 轴标题中的\"（万元）\"后缀\n" +
    "- 数值 = ask_data 返回原始值，不做除法或取整\n" +
    "- 严禁 emoji\n" +
    "- 标题具业务洞察力\n" +
    "- 仅使用 bar/line/pie 三种类型，禁止 scatter/radar/gauge 等";

  schema = z.preprocess(
    coerceChartInput,
    z.object({
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
    }),
  );

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
