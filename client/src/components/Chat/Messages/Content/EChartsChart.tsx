import { useEffect, useRef, useState, memo } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, RadarChart, HeatmapChart, FunnelChart, GaugeChart, TreemapChart, SankeyChart, SunburstChart, BoxplotChart, CandlestickChart, MapChart, LinesChart, GraphChart, ParallelChart, CustomChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  VisualMapComponent,
  ToolboxComponent,
  GraphicComponent,
  DatasetComponent,
  TransformComponent,
  MarkLineComponent,
  MarkPointComponent,
  MarkAreaComponent,
  PolarComponent,
  GeoComponent,
  CalendarComponent,
  SingleAxisComponent,
  ParallelComponent,
  RadarComponent,
  AriaComponent,
} from 'echarts/components';
import { LabelLayout, UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

// 注册 ECharts 必要的组件和图表类型
echarts.use([
  // 渲染器
  CanvasRenderer,
  // 特性
  LabelLayout,
  UniversalTransition,
  // 图表类型
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  HeatmapChart,
  FunnelChart,
  GaugeChart,
  TreemapChart,
  SankeyChart,
  SunburstChart,
  BoxplotChart,
  CandlestickChart,
  MapChart,
  LinesChart,
  GraphChart,
  ParallelChart,
  CustomChart,
  // 组件
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  VisualMapComponent,
  ToolboxComponent,
  GraphicComponent,
  DatasetComponent,
  TransformComponent,
  MarkLineComponent,
  MarkPointComponent,
  MarkAreaComponent,
  PolarComponent,
  GeoComponent,
  CalendarComponent,
  SingleAxisComponent,
  ParallelComponent,
  RadarComponent,
  AriaComponent,
]);

type EChartsConfig = {
  success: boolean;
  __echartsConfig: boolean;
  title: string;
  analysisType?: string;
  echartsOption: Record<string, unknown>;
};

/**
 * 从工具的 output 字符串中尝试解析 ECharts 图表配置
 */
export function parseEChartsConfig(output: string): EChartsConfig | null {
  if (!output) {
    return null;
  }
  try {
    const parsed = JSON.parse(output);
    if (parsed && parsed.__echartsConfig === true && parsed.success === true) {
      return parsed as EChartsConfig;
    }
  } catch {
    // 无法解析，不是图表配置
  }
  return null;
}

type EChartsChartProps = {
  output: string;
  isSubmitting: boolean;
};

const EChartsChart = memo(({ output, isSubmitting }: EChartsChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<EChartsConfig | null>(null);

  // 解析配置
  useEffect(() => {
    if (!output) {
      return;
    }
    const parsed = parseEChartsConfig(output);
    if (parsed) {
      setConfig(parsed);
      setError(null);
    }
  }, [output]);

  // 渲染图表
  useEffect(() => {
    if (!config || !containerRef.current) {
      return;
    }

    // 清理之前的实例
    if (chartRef.current) {
      try {
        chartRef.current.dispose();
      } catch {
        // ignore dispose errors
      }
      chartRef.current = null;
    }

    // 清理之前的 ResizeObserver
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    try {
      const container = containerRef.current;
      const isDark = document.documentElement.classList.contains('dark');

      const chart = echarts.init(container, isDark ? 'dark' : undefined, {
        renderer: 'canvas',
      });

      chart.setOption(config.echartsOption as Record<string, unknown>);
      chartRef.current = chart;

      // 监听容器尺寸变化，自动 resize
      resizeObserverRef.current = new ResizeObserver(() => {
        chart.resize();
      });
      resizeObserverRef.current.observe(container);

      setError(null);
    } catch (err) {
      setError((err as Error).message || '图表渲染失败');
    }

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (chartRef.current) {
        try {
          chartRef.current.dispose();
        } catch {
          // ignore
        }
        chartRef.current = null;
      }
    };
  }, [config]);

  // 监听主题变化，重新渲染
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (chartRef.current && config) {
        const isDark = document.documentElement.classList.contains('dark');
        // ECharts 不支持动态切换主题，需要销毁后重新初始化
        const container = containerRef.current;
        if (!container) return;

        try {
          chartRef.current.dispose();
        } catch {
          // ignore
        }

        const chart = echarts.init(container, isDark ? 'dark' : undefined, {
          renderer: 'canvas',
        });
        chart.setOption(config.echartsOption as Record<string, unknown>);
        chartRef.current = chart;
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [config]);

  // 还在等待工具输出
  if (!output && isSubmitting) {
    return (
      <div className="my-3 flex items-center gap-2 text-sm text-text-secondary">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-border-light border-t-text-primary" />
        <span>正在生成图表...</span>
      </div>
    );
  }

  // 输出不是 ECharts 图表配置
  if (!config) {
    return null;
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border-light bg-surface-primary shadow-sm">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 border-b border-border-light px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">{config.title}</h3>
      </div>
      {/* 图表区域 */}
      <div className="p-4">
        {error ? (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            <span>图表渲染错误: {error}</span>
          </div>
        ) : (
          <div
            ref={containerRef}
            style={{ width: '100%', minHeight: '360px' }}
          />
        )}
      </div>
    </div>
  );
});

EChartsChart.displayName = 'EChartsChart';

export default EChartsChart;
