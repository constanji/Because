const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const axios = require('axios');
const { logger } = require('@aipyq/data-schemas');

/**
 * SQL Executor Tool - 执行 SQL 查询并返回结果和归因分析
 *
 * 通过调用本地 SQL API (`/sql_query` 端点) 执行只读的 SELECT 查询，
 * 返回查询结果、行数统计，并给出结构化的归因分析说明，帮助 LLM 在回答时
 * 清晰说明「结论来自哪张表、哪些字段、哪些过滤条件」。
 *
 * 依赖环境变量：
 * - SQL_API_URL: SQL API 服务地址，默认 http://localhost:3001
 */
class SqlExecutor extends Tool {
  name = 'sql_executor';

  description =
    '执行只读的 SQL SELECT 查询，并返回查询结果和详细的归因分析说明。' +
    'SQL 会被发送到后端 SQL API (`/sql_query`) 执行，工具会返回数据行、行数统计、' +
    '以及关于数据来源（表、字段、过滤条件等）的结构化说明，帮助 LLM 在回答时给出清晰的「数据来源解释」。';

  schema = z.object({
    sql: z
      .string()
      .min(1)
      .describe(
        '要执行的 MySQL SELECT 查询语句。必须是只读查询，禁止包含 INSERT/UPDATE/DELETE/DDL 等写操作。',
      ),
    max_rows: z
      .number()
      .int()
      .positive()
      .max(1000)
      .optional()
      .describe('可选：限制返回的最大行数，默认返回全部结果（最多由后端限制）。'),
  });

  constructor(fields = {}) {
    super();
    this.apiUrl = fields.apiUrl || process.env.SQL_API_URL || 'http://localhost:3001';
  }

  /**
   * 调用后端 SQL API 执行查询
   */
  async executeQuery(sql) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/sql_query`,
        { sql },
        {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data;
    } catch (error) {
      if (error.response) {
        const errorData = error.response.data;
        throw new Error(
          errorData?.message || errorData?.error || `HTTP ${error.response.status} 错误`,
        );
      } else if (error.request) {
        throw new Error(`无法连接到 SQL API 服务器: ${this.apiUrl}`);
      } else {
        throw new Error(error.message || 'SQL 查询执行失败');
      }
    }
  }

  /**
   * 从 SQL 语句中提取基础结构信息（非常轻量级的解析，仅用于归因说明）
   */
  extractQueryStructure(sql) {
    const upper = sql.toUpperCase();
    const structure = {
      tables: [],
      hasWhere: false,
      hasGroupBy: false,
      hasOrderBy: false,
      hasLimit: false,
    };

    try {
      // 提取 FROM 之后到 WHERE / GROUP BY / ORDER BY / LIMIT 之前的部分，粗略解析表名
      const fromMatch = upper.match(/\bFROM\b([\s\S]+?)(\bWHERE\b|\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|$)/);
      if (fromMatch && fromMatch[1]) {
        const rawTables = fromMatch[1]
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        structure.tables = rawTables.map((t) => t.replace(/\s+AS\s+.+$/i, '').split(/\s+/)[0]);
      }

      structure.hasWhere = /\bWHERE\b/i.test(sql);
      structure.hasGroupBy = /\bGROUP BY\b/i.test(sql);
      structure.hasOrderBy = /\bORDER BY\b/i.test(sql);
      structure.hasLimit = /\bLIMIT\b/i.test(sql);
    } catch {
      // 如果解析失败，忽略即可，用默认值
    }

    return structure;
  }

  /**
   * 基于查询语句和结果构建归因分析信息
   */
  buildAttribution(sql, rows) {
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    const sampleRow = rowCount > 0 ? rows[0] : null;
    const columns = sampleRow ? Object.keys(sampleRow) : [];
    const structure = this.extractQueryStructure(sql);

    const tablePart =
      structure.tables.length > 0
        ? `主要数据来源于以下表：${structure.tables.join('，')}。`
        : '未能从 SQL 中可靠解析出表名，请直接结合 SQL 语句自行说明数据来源。';

    const clauseHints = [];
    if (structure.hasWhere) clauseHints.push('WHERE 过滤条件');
    if (structure.hasGroupBy) clauseHints.push('GROUP BY 分组逻辑');
    if (structure.hasOrderBy) clauseHints.push('ORDER BY 排序规则');
    if (structure.hasLimit) clauseHints.push('LIMIT 行数限制');

    const clausePart =
      clauseHints.length > 0
        ? `查询中包含 ${clauseHints.join('、')}，在解释结论时需要特别说明这些条件如何影响结果。`
        : '查询中未检测到 WHERE / GROUP BY / ORDER BY / LIMIT 等子句，结果为对全表或视图的直接查询。';

    const columnPart =
      columns.length > 0
        ? `结果中包含字段：${columns.join(
            '，',
          )}。在回答用户问题时，请明确指出结论分别来自哪些字段。`
        : '结果中未检测到字段列表，请在回答中先概括返回的数据结构。';

    return {
      summary: `SQL 查询已成功执行，返回 ${rowCount} 行数据。${tablePart}`,
      details: {
        tables: structure.tables,
        rowCount,
        columns,
        hasWhere: structure.hasWhere,
        hasGroupBy: structure.hasGroupBy,
        hasOrderBy: structure.hasOrderBy,
        hasLimit: structure.hasLimit,
      },
      guidance: [
        '1. 先用自然语言概括查询目的和结果（例如：统计某张表在特定时间范围内的记录数或明细）。',
        '2. 明确说明结论分别来自哪些表、哪些字段，以及这些字段在业务中的含义。',
        '3. 如果查询中包含 WHERE / GROUP BY / ORDER BY / LIMIT 等子句，逐一解释这些条件如何影响结果和结论。',
        '4. 对于数值结果，给出必要的对比或比例说明（例如：占比、同比、环比），但这些计算必须严格基于返回的数据。',
        '5. 严格禁止臆造数据库中不存在的字段或行，只能基于本次查询返回的数据进行推理和解释。',
      ],
    };
  }

  /**
   * @override
   */
  async _call(input) {
    const { sql, max_rows } = input;
    const trimmedSql = sql.trim();

    // 基础校验：只允许 SELECT
    const upper = trimmedSql.toUpperCase();
    if (!upper.startsWith('SELECT')) {
      return JSON.stringify(
        {
          success: false,
          error: '只允许执行 SELECT 查询，请不要包含 INSERT/UPDATE/DELETE/DDL 等写操作。',
        },
        null,
        2,
      );
    }

    // 额外安全检查：禁止危险关键词（与后端保持一致，双重保护）
    const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'CREATE'];
    for (const keyword of dangerousKeywords) {
      if (upper.includes(keyword)) {
        return JSON.stringify(
          {
            success: false,
            error: `检测到危险关键词 "${keyword}"，出于安全考虑拒绝执行该查询。`,
          },
          null,
          2,
        );
      }
    }

    try {
      const apiResult = await this.executeQuery(trimmedSql);

      if (!apiResult || apiResult.success !== true) {
        const message = apiResult?.message || apiResult?.error || 'SQL API 返回错误';
        throw new Error(message);
      }

      let rows = Array.isArray(apiResult.result) ? apiResult.result : [];
      if (typeof max_rows === 'number' && max_rows > 0 && rows.length > max_rows) {
        rows = rows.slice(0, max_rows);
      }

      const attribution = this.buildAttribution(trimmedSql, rows);

      return JSON.stringify(
        {
          success: true,
          sql: trimmedSql,
          rowCount: rows.length,
          rows,
          attribution,
          note:
            'LLM 必须基于 rows 和 attribution 进行详细的业务解释，并在回答中明确说明结论来自哪些表、哪些字段以及哪些过滤/分组/排序条件，避免任何臆造。',
        },
        null,
        2,
      );
    } catch (error) {
      logger.error('[SqlExecutor] SQL 执行失败', {
        sql: trimmedSql,
        error: error.message,
      });

      return JSON.stringify(
        {
          success: false,
          error: error.message || 'SQL 执行失败',
          sql: trimmedSql,
        },
        null,
        2,
      );
    }
  }
}

module.exports = SqlExecutor;


