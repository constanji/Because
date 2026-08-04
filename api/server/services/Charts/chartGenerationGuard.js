/**
 * Deterministic chart post-condition for agent/MCP tool results.
 * It deliberately does not ask an LLM to decide whether a chart is useful:
 * structured tabular data is detected and rendered with the approved templates.
 */

const DATE_KEYS = ['date', 'dt', 'time', 'month', 'day', '日期', '时间', '月份'];

function parseValue(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value !== null && 'content' in value) {
    return parseValue(value.content);
  }

  if (typeof value === 'string') {
    const text = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(text); } catch { return null; }
  }
  return value;
}

function findRows(value, depth = 0) {
  if (depth > 4 || value == null) return null;
  const parsed = parseValue(value);
  if (Array.isArray(parsed) && parsed.length && parsed.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const child of Object.values(parsed)) {
      const rows = findRows(child, depth + 1);
      if (rows) return rows;
    }
  }
  return null;
}

function isDateKey(key) {
  const lower = String(key).toLowerCase();
  return DATE_KEYS.some((item) => lower.includes(item));
}

function numericKeys(rows) {
  return Object.keys(rows[0] || {}).filter((key) => rows.some((row) => typeof row[key] === 'number' || (typeof row[key] === 'string' && row[key].trim() !== '' && Number.isFinite(Number(row[key])))));
}

function valueOf(row, key) {
  const value = row[key];
  return typeof value === 'number' ? value : Number(value);
}

/** Returns a valid ECharts tool output, or null when data is not chartable. */
function generateChartFromToolResult(rawResult, context = {}) {
  const rows = findRows(rawResult);
  if (!rows || rows.length < 2) return null;

  const keys = Object.keys(rows[0]);
  const dateKey = keys.find(isDateKey);
  const numbers = numericKeys(rows).filter((key) => !isDateKey(key));
  if (!numbers.length) return null;
  const categoryKey = keys.find((key) => !isDateKey(key) && !numbers.includes(key) && rows.every((row) => row[key] != null));
  const titleBase = context.agentName || context.toolName || '数据分析';
  let chart;

  if (dateKey && numbers.length >= 2) {
    const ordered = [...rows].sort((a, b) => String(a[dateKey]).localeCompare(String(b[dateKey])));
    chart = { title: `${titleBase}多指标趋势`, analysisType: 'combined_analysis', echartsOption: {
      title: { text: `${titleBase}多指标趋势` }, tooltip: { trigger: 'axis', confine: true },
      legend: { data: numbers, left: 'right' }, grid: { left: '2%', bottom: '0%', right: '1%', containLabel: true },
      xAxis: { type: 'category', data: ordered.map((row) => String(row[dateKey])), axisLabel: { rotate: 45 }, boundaryGap: false },
      yAxis: { type: 'value' }, series: numbers.map((key) => ({ name: key, type: 'line', data: ordered.map((row) => valueOf(row, key)), markPoint: { data: [{ type: 'max' }, { type: 'min' }] }, markLine: { data: [{ type: 'average' }] } }))
    }};
  } else if (dateKey) {
    const ordered = [...rows].sort((a, b) => String(a[dateKey]).localeCompare(String(b[dateKey])));
    const key = numbers[0];
    chart = { title: `${titleBase}${key}趋势`, analysisType: 'trend_analysis', echartsOption: {
      title: { text: `${titleBase}${key}趋势`, left: 'center' }, tooltip: { trigger: 'axis', confine: true }, legend: { data: [key], left: 'right' }, grid: { left: '2%', bottom: '0%', right: '1%', containLabel: true }, xAxis: { type: 'category', data: ordered.map((row) => String(row[dateKey])), axisLabel: { rotate: 45 }, boundaryGap: false }, yAxis: { type: 'value' }, series: [{ name: key, type: 'line', data: ordered.map((row) => valueOf(row, key)), markPoint: { data: [{ type: 'max' }, { type: 'min' }] }, markLine: { data: [{ type: 'average' }] } }]
    }};
  } else if (categoryKey && numbers.length === 1) {
    const key = numbers[0];
    chart = { title: `${titleBase}${key}构成`, analysisType: 'composition_distribution', echartsOption: {
      title: { text: `${titleBase}${key}构成`, left: 'center' }, tooltip: { trigger: 'item', formatter: '{b}: {d}%' }, legend: { data: rows.map((row) => String(row[categoryKey])), left: 'center', bottom: 'bottom' }, color: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272'], series: [{ type: 'pie', name: key, radius: ['0%', '65%'], center: ['50%', '45%'], data: rows.map((row) => ({ name: String(row[categoryKey]), value: valueOf(row, key) })), label: { show: true, formatter: '{b}: {d}%' } }]
    }};
  } else if (categoryKey && numbers.length >= 2) {
    chart = { title: `${titleBase}指标对比`, analysisType: 'dimension_compare', echartsOption: {
      title: { text: `${titleBase}指标对比` }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, legend: { data: numbers, top: '10%' }, color: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272'], grid: { left: '3%', right: '4%', bottom: '3%', top: '30%', containLabel: true }, xAxis: { type: 'category', data: rows.map((row) => String(row[categoryKey])) }, yAxis: { type: 'value' }, series: numbers.map((key) => ({ name: key, type: 'bar', data: rows.map((row) => valueOf(row, key)) }))
    }};
  }
  return chart ? { success: true, __echartsConfig: true, charts: [{ id: context.chartId || `auto_${Date.now()}`, ...chart }] } : null;
}

module.exports = { generateChartFromToolResult, findRows };
