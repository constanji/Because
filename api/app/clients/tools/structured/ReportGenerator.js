const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@because/data-schemas');

/**
 * ReportGenerator Tool - 归因分析报告生成工具
 *
 * 接收 LLM 生成的报告标题和正文（Markdown 格式），
 * 清理 emoji 字符后以 ```report 代码块格式返回，
 * 前端 MarkdownComponents 自动识别并渲染为 ReportPreview 组件。
 */
class ReportGenerator extends Tool {
  name = 'report_generator';

  description =
    '归因分析报告生成工具，将分析结论生成为结构化的文档样式报告。' +
    '传入报告标题和 Markdown 格式的正文内容，系统会自动渲染为可预览、可导出 Word 的文档。' +
    '适用于归因分析、数据洞察报告、趋势分析报告等场景。' +
    '报告内容必须专业严谨，禁止使用 emoji 表情符号。';

  schema = z.object({
    title: z.string().describe('报告标题，简明扼要概括报告主题'),
    content: z
      .string()
      .describe(
        '报告正文，Markdown 格式。支持标题(##/###)、列表、加粗、表格等。' +
          '内容必须专业严谨，禁止使用 emoji 表情符号。',
      ),
  });

  constructor(fields = {}) {
    super();
  }

  /**
   * 清理文本中的 emoji 字符
   */
  removeEmoji(text) {
    return text
      .replace(
        /[\u{1F600}-\u{1F64F}]/gu, '' // 表情符号
      )
      .replace(
        /[\u{1F300}-\u{1F5FF}]/gu, '' // 杂项符号和图形
      )
      .replace(
        /[\u{1F680}-\u{1F6FF}]/gu, '' // 交通与地图符号
      )
      .replace(
        /[\u{1F1E0}-\u{1F1FF}]/gu, '' // 旗帜
      )
      .replace(
        /[\u{2600}-\u{26FF}]/gu, ''   // 杂项符号
      )
      .replace(
        /[\u{2700}-\u{27BF}]/gu, ''   // 装饰符号
      )
      .replace(
        /[\u{FE00}-\u{FE0F}]/gu, ''   // 变体选择符
      )
      .replace(
        /[\u{1F900}-\u{1F9FF}]/gu, '' // 补充符号
      )
      .replace(
        /[\u{1FA00}-\u{1FA6F}]/gu, '' // 扩展符号-A
      )
      .replace(
        /[\u{1FA70}-\u{1FAFF}]/gu, '' // 扩展符号-B
      )
      .replace(
        /[\u{200D}]/gu, ''            // 零宽连接符
      )
      .replace(
        /[\u{20E3}]/gu, ''            // 组合封闭键帽
      )
      .replace(
        /[\u{E0020}-\u{E007F}]/gu, '' // 标签字符
      );
  }

  async _call(input) {
    const startTime = Date.now();

    try {
      logger.info("[ReportGenerator] ========== 开始调用 ==========");

      const { title, content } = input;

      // 验证输入
      if (!title || typeof title !== "string" || title.trim().length === 0) {
        return "报告生成失败：缺少报告标题。";
      }

      if (
        !content ||
        typeof content !== "string" ||
        content.trim().length === 0
      ) {
        return "报告生成失败：缺少报告正文内容。";
      }

      // 清理 emoji
      const cleanTitle = this.removeEmoji(title).trim();
      const cleanContent = this.removeEmoji(content).trim();

      // 组装完整的 Markdown 报告
      const fullReport = `# ${cleanTitle}\n\n${cleanContent}`;

      const duration = Date.now() - startTime;
      logger.info(
        `[ReportGenerator] 报告生成成功, 标题: "${cleanTitle}", 耗时: ${duration}ms`,
      );
      logger.info("[ReportGenerator] ========== 调用完成 ==========");

      // 以 report 代码块格式返回，前端 MarkdownComponents 自动识别
      return "```report\n" + fullReport + "\n```";
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(`[ReportGenerator] 执行错误: ${err.message}, 耗时: ${duration}ms`);
      return `报告生成失败：${err.message || '未知错误'}`;
    }
  }
}

module.exports = ReportGenerator;
