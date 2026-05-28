import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, AlertTriangle, Square, FileText, BarChart3, Settings, Upload, Download, Loader2 } from 'lucide-react';
import { useGetEndpointsQuery, useListAgentsQuery, useGetStartupConfig, useMCPToolsQuery } from '~/data-provider';
import { useGetModelsQuery, useUpdateUserPluginsMutation } from '@because/data-provider/react-query';
import { useAuthContext } from '~/hooks/AuthContext';
import { EModelEndpoint, PermissionBits, SystemRoles, Constants } from '@because/data-provider';
import useAuthRedirect from './useAuthRedirect';
import CustomUserVarsSection from '~/components/MCP/CustomUserVarsSection';

const BENCHMARK_CONFIG_KEY = 'benchmark_config';
const BENCHMARK_CURRENT_TASK_KEY = 'benchmark_current_task_id';

const defaultEvaluationMetrics = [
  { id: 'EX', name: '执行准确率 (Execution Accuracy, EX)', description: '衡量预测SQL与标准答案执行结果匹配程度', checked: true },
  { id: 'R-VES', name: '基于奖励的效率分数 (R-VES)', description: '基于执行时间比率的奖励机制', checked: false },
  { id: 'Soft F1', name: '结果中的表结构相似度 (Soft F1-Score)', description: '预测SQL与标准答案表结构相似度', checked: false },
];

const databases = [
  { id: 'debit_card_specializing', name: '借记卡专业化', description: '借记卡在加油站场景的专业化应用' },
  { id: 'financial', name: '银行金融系统', description: '银行核心业务系统，包含客户、账户、交易等' },
  { id: 'student_club', name: '学生俱乐部', description: '学生俱乐部管理系统' },
  { id: 'thrombosis_prediction', name: '血栓预测', description: '医疗健康领域的血栓预测数据库' },
  { id: 'european_football_2', name: '欧洲足球', description: '欧洲足球联赛数据' },
  { id: 'formula_1', name: '一级方程式赛车', description: 'F1赛车相关数据' },
  { id: 'superhero', name: '超级英雄', description: '超级英雄相关数据' },
  { id: 'codebase_community', name: '代码库社区', description: '代码库社区数据' },
  { id: 'card_games', name: '卡牌游戏', description: '卡牌游戏相关数据' },
  { id: 'toxicology', name: '毒理学', description: '毒理学研究数据' },
  { id: 'california_schools', name: '加州学校', description: '加州学校数据' },
];

export default function Benchmark() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token, user, isAuthenticated } = useAuthContext();
  useAuthRedirect();

  const handleNewTest = () => {
    setTaskId(null);
    setTaskStatus(null);
    setStatusLogs([]);
    setUploadedDatasetId(null);
    setUploadError(null);
    setUploadErrorDetails([]);
    setUploadStats(null);
    try {
      localStorage.removeItem(BENCHMARK_CURRENT_TASK_KEY);
    } catch {
      // ignore
    }
    setSearchParams({}, { replace: true });
  };

  const [activeTab, setActiveTab] = useState<'bird' | 'custom'>('bird');
  const [uploadedDatasetId, setUploadedDatasetId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadErrorDetails, setUploadErrorDetails] = useState<string[]>([]);
  const [uploadStats, setUploadStats] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedDatabaseType, setSelectedDatabaseType] = useState<'SQLite' | 'MySQL' | 'PostgreSQL'>('SQLite');
  const [selectedDatasourceId, setSelectedDatasourceId] = useState<string>('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [datasources, setDatasources] = useState<any[]>([]);
  const [isLoadingDatasources, setIsLoadingDatasources] = useState(false);
  const [statusLogs, setStatusLogs] = useState<
    Array<{ time: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>
  >([]);
  const [evaluationMetrics, setEvaluationMetrics] = useState(defaultEvaluationMetrics);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const [driverEndpoint, setDriverEndpoint] = useState<string>('');
  const [driverModel, setDriverModel] = useState<string>('');

  const [selectedMcpToolName, setSelectedMcpToolName] = useState<string>('');
  const [mcpToolArgumentsJson, setMcpToolArgumentsJson] = useState<string>('');
  const [isTestingMcpConnection, setIsTestingMcpConnection] = useState<boolean>(false);
  const [mcpConnectionError, setMcpConnectionError] = useState<string | null>(null);

  const { data: startupConfig } = useGetStartupConfig();
  const { data: mcpToolsData, refetch: refetchMcpTools } = useMCPToolsQuery();
  const updateUserPlugins = useUpdateUserPluginsMutation();

  const { data: endpointsConfig } = useGetEndpointsQuery({ enabled: isAuthenticated });
  const { data: modelsConfig } = useGetModelsQuery();
  const { data: agentsResponse } = useListAgentsQuery(
    { requiredPermission: PermissionBits.VIEW, limit: 200 },
    { enabled: isAuthenticated && selectedEndpoint === EModelEndpoint.agents },
  );
  const agents = useMemo(() => agentsResponse?.data ?? [], [agentsResponse]);

  const availableEndpoints = useMemo(() => {
    if (!endpointsConfig) return [];
    const eps = Object.keys(endpointsConfig).map((key) => ({
      id: key,
      name: endpointsConfig[key]?.modelDisplayLabel || key,
      type: endpointsConfig[key]?.type || 'custom',
    }));
    eps.push({ id: 'mcp', name: 'MCP (Model Context Protocol)', type: 'mcp' });
    return eps;
  }, [endpointsConfig]);

  const availableModels = useMemo(() => {
    if (!selectedEndpoint) return [];
    if (selectedEndpoint === 'mcp') {
      if (!startupConfig?.mcpServers) return [];
      return Object.keys(startupConfig.mcpServers);
    }
    if (!modelsConfig) return [];
    return modelsConfig[selectedEndpoint] || [];
  }, [selectedEndpoint, modelsConfig, startupConfig]);

  const driverModels = useMemo(() => {
    if (!driverEndpoint || !modelsConfig) return [];
    return modelsConfig[driverEndpoint] || [];
  }, [driverEndpoint, modelsConfig]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BENCHMARK_CONFIG_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        if (saved.activeTab != null) setActiveTab(saved.activeTab as 'bird' | 'custom');
        if (saved.selectedDatabaseType) setSelectedDatabaseType(saved.selectedDatabaseType as 'SQLite' | 'MySQL' | 'PostgreSQL');
        if (saved.selectedDatasourceId != null) setSelectedDatasourceId(String(saved.selectedDatasourceId));
        if (saved.selectedEndpoint != null) setSelectedEndpoint(String(saved.selectedEndpoint));
        if (saved.selectedModel != null) setSelectedModel(String(saved.selectedModel));
        if (saved.driverEndpoint != null) setDriverEndpoint(String(saved.driverEndpoint));
        if (saved.driverModel != null) setDriverModel(String(saved.driverModel));
        if (saved.selectedMcpToolName != null) setSelectedMcpToolName(String(saved.selectedMcpToolName));
        if (saved.mcpToolArgumentsJson != null) setMcpToolArgumentsJson(String(saved.mcpToolArgumentsJson));
        if (Array.isArray(saved.evaluationMetrics)) setEvaluationMetrics(saved.evaluationMetrics as typeof defaultEvaluationMetrics);
      }
    } catch {
      // ignore invalid stored config
    }
  }, []);

  useEffect(() => {
    const payload = {
      activeTab,
      selectedDatabaseType,
      selectedDatasourceId,
      selectedEndpoint,
      selectedModel,
      driverEndpoint,
      driverModel,
      selectedMcpToolName,
      mcpToolArgumentsJson,
      evaluationMetrics,
    };
    try {
      localStorage.setItem(BENCHMARK_CONFIG_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota or parse errors
    }
  }, [activeTab, selectedDatabaseType, selectedDatasourceId, selectedEndpoint, selectedModel, driverEndpoint, driverModel, evaluationMetrics, selectedMcpToolName, mcpToolArgumentsJson]);

  const databaseTypes = [
    { id: 'SQLite', name: 'SQLite' },
    { id: 'MySQL', name: 'MySQL' },
    { id: 'PostgreSQL', name: 'PostgreSQL' },
  ];

  // 仅在有 ?new=1 时重置任务状态；返回页面时不重置
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setTaskId(null);
      setTaskStatus(null);
      setStatusLogs([]);
      try {
        localStorage.removeItem(BENCHMARK_CURRENT_TASK_KEY);
      } catch {
        // ignore
      }
      setSearchParams({}, { replace: true });
      return;
    }
    // 从结果页返回时恢复当前任务，避免刷新导致状态丢失
    try {
      const saved = localStorage.getItem(BENCHMARK_CURRENT_TASK_KEY);
      if (saved && saved.trim()) setTaskId(saved.trim());
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authHeaders = useMemo(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, [token]);

  const getApiBase = useCallback(() => {
    const baseEl = document.querySelector("base");
    const baseHref = baseEl?.getAttribute("href") || "/";
    return baseHref.endsWith("/") ? baseHref.slice(0, -1) : baseHref;
  }, []);

  const fetchDatasources = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoadingDatasources(true);
    try {
      const response = await fetch(`${getApiBase()}/api/dat-datasources`, {
        method: "GET",
        headers: authHeaders,
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        const enabledDatasources = (data.datasources || []).filter(
          (ds: any) => ds.enabled
        );
        setDatasources(enabledDatasources);
      }
    } catch (error) {
      console.error("Error fetching datasources:", error);
    } finally {
      setIsLoadingDatasources(false);
    }
  }, [getApiBase, authHeaders, isAuthenticated]);

  useEffect(() => {
    fetchDatasources();
  }, [fetchDatasources]);

  // 同步 selectedMcpToolName 到下拉框实际展示的第一个工具，避免显示层 fallback 与 state 错位
  useEffect(() => {
    if (selectedEndpoint !== 'mcp' || !selectedModel) return;
    const server = mcpToolsData?.servers?.[selectedModel];
    const tools = server?.tools;
    if (!tools || tools.length === 0) return;
    const exists = tools.some((t: any) => t.name === selectedMcpToolName);
    if (!exists) {
      setSelectedMcpToolName(tools[0].name);
    }
  }, [selectedEndpoint, selectedModel, mcpToolsData, selectedMcpToolName]);

  // becauseai-server / ask_data：选了数据源后自动把 projectId 写入 arg1、datasourceId 写入 arg2
  // 与后端 McpContextResolver 的 inject 规则一致，避免用户重复手填
  useEffect(() => {
    if (selectedModel !== 'becauseai-server' || selectedMcpToolName !== 'ask_data') return;
    if (!selectedDatasourceId) return;
    const ds = datasources.find((d: any) => d._id === selectedDatasourceId);
    if (!ds) return;
    const projectId = ds.projectId || '';

    setMcpToolArgumentsJson((current) => {
      let parsed: Record<string, any> = {};
      if (current && current.trim()) {
        try {
          const obj = JSON.parse(current);
          if (obj && typeof obj === 'object') parsed = obj;
        } catch {
          return current; // 用户在编辑非法 JSON，不打断
        }
      }

      const next = { ...parsed };
      // arg2 一律以当前选中数据源为准；arg1 跟随其对应 projectId
      if (next.arg2 !== selectedDatasourceId) {
        next.arg2 = selectedDatasourceId;
        next.arg1 = projectId;
      } else {
        if (!next.arg1) next.arg1 = projectId;
      }

      const newJson = JSON.stringify(next, null, 2);
      return newJson === current ? current : newJson;
    });
  }, [selectedModel, selectedMcpToolName, selectedDatasourceId, datasources]);

  const handleTestMcpConnection = async () => {
    if (!selectedModel) return;
    setIsTestingMcpConnection(true);
    setMcpConnectionError(null);
    try {
      const response = await fetch(`/api/mcp/${selectedModel}/reinitialize`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
      });
      if (response.ok) {
        await refetchMcpTools();
        alert('MCP Server 连接测试成功，已更新工具列表。');
      } else {
        const data = await response.json();
        setMcpConnectionError(data.error || '测试连接失败');
      }
    } catch (error: any) {
      console.error('Error testing MCP connection:', error);
      setMcpConnectionError(error.message || '测试连接发生异常');
    } finally {
      setIsTestingMcpConnection(false);
    }
  };

  const handleStartBenchmark = async () => {
  if (!selectedDatasourceId || !selectedDatabaseType || !selectedEndpoint || !selectedModel) {
    alert('请先选择数据库类型、数据源、端点和模型');
    return;
  }

  if (selectedEndpoint === 'mcp' && !selectedModel) {
    alert('请选择需要测试的 MCP Server');
    return;
  }

  const selectedDatasource = datasources.find(d => d._id === selectedDatasourceId);
  if (!selectedDatasource) {
    alert('所选数据源无效，请重新选择');
    return;
  }

  const dbName = selectedDatasource.configuration?.database || selectedDatasource.name;

  let mcpToolArguments = {};
  if (selectedEndpoint === 'mcp' && mcpToolArgumentsJson) {
    try {
      mcpToolArguments = JSON.parse(mcpToolArgumentsJson);
    } catch (e) {
      alert('MCP 工具参数 JSON 格式不正确，请检查！');
      return;
    }
  }

  try {
    const response = await fetch('/api/benchmark/run', {
      method: 'POST',
      headers: authHeaders,
      credentials: 'include',
      body: JSON.stringify({
        datasetId: `${dbName}_${selectedDatabaseType.toLowerCase()}`,
        sqlDialect: selectedDatabaseType,
        databaseName: dbName,
        datasourceId: selectedDatasourceId,
        projectId: selectedDatasource.projectId,
        endpointName: selectedEndpoint,
        model: selectedModel,
        driverEndpoint: selectedEndpoint === 'mcp' ? driverEndpoint : undefined,
        driverModel: selectedEndpoint === 'mcp' ? driverModel : undefined,
        evaluationMetrics: evaluationMetrics.filter((m) => m.checked).map((m) => m.id),
        mcpToolName: selectedEndpoint === 'mcp' ? selectedMcpToolName : undefined,
        mcpToolArguments: selectedEndpoint === 'mcp' ? mcpToolArguments : undefined,
      }),
    });
    const data = await response.json();
    if (data.taskId) {
      setTaskId(data.taskId);
      try {
        localStorage.setItem(BENCHMARK_CURRENT_TASK_KEY, data.taskId);
      } catch {
        // ignore
      }
      setStatusLogs([{ time: new Date().toLocaleTimeString(), message: '测试任务已创建，开始初始化...', type: 'success' }]);
    } else {
      alert(data.error || '启动测试失败');
    }
  } catch (error: any) {
    console.error('Error starting benchmark:', error);
    alert('启动测试失败: ' + (error?.message || String(error)));
  }
};

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/benchmark/template', {
        headers: authHeaders,
        credentials: 'include',
      });
      if (!response.ok) throw new Error('下载模板失败');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'custom_benchmark_template.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('下载模板失败: ' + err.message);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadErrorDetails([]);
    setUploadStats(null);
    setUploadedDatasetId(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        let parsedJson;
        try {
          parsedJson = JSON.parse(text);
        } catch (parseErr) {
          throw new Error('文件内容不是有效的 JSON 格式');
        }

        const response = await fetch('/api/benchmark/upload-dataset', {
          method: 'POST',
          headers: authHeaders,
          credentials: 'include',
          body: JSON.stringify({ dataset: parsedJson }),
        });

        const data = await response.json();
        if (response.ok) {
          setUploadedDatasetId(data.datasetId);
          setUploadStats(data.stats);
        } else {
          setUploadError(data.error || '上传失败');
          if (Array.isArray(data.details)) {
            setUploadErrorDetails(data.details);
          }
        }
      } catch (err: any) {
        setUploadError(err.message || '读取或上传文件时出错');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setUploadError('读取文件失败');
      setIsUploading(false);
    };
    reader.readAsText(file);
  };

  const handleStartCustomBenchmark = async () => {
    if (!uploadedDatasetId) {
      alert('请先上传并校验您的自定义测试集文件');
      return;
    }
    if (!selectedDatasourceId || !selectedDatabaseType || !selectedEndpoint || !selectedModel) {
      alert('请先选择数据库类型、数据源、端点和模型');
      return;
    }

    const selectedDatasource = datasources.find(d => d._id === selectedDatasourceId);
    if (!selectedDatasource) {
      alert('所选数据源无效，请重新选择');
      return;
    }

    let mcpToolArguments = {};
    if (selectedEndpoint === 'mcp' && mcpToolArgumentsJson) {
      try {
        mcpToolArguments = JSON.parse(mcpToolArgumentsJson);
      } catch (e) {
        alert('MCP 工具参数 JSON 格式不正确，请检查！');
        return;
      }
    }

    try {
      const response = await fetch('/api/benchmark/run-custom', {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          customDatasetId: uploadedDatasetId,
          sqlDialect: selectedDatabaseType,
          datasourceId: selectedDatasourceId,
          endpointName: selectedEndpoint,
          model: selectedModel,
          evaluationMetrics: evaluationMetrics.filter((m) => m.checked).map((m) => m.id),
          mcpToolName: selectedEndpoint === 'mcp' ? selectedMcpToolName : undefined,
          mcpToolArguments: selectedEndpoint === 'mcp' ? mcpToolArguments : undefined,
        }),
      });
      const data = await response.json();
      if (data.taskId) {
        setTaskId(data.taskId);
        try {
          localStorage.setItem(BENCHMARK_CURRENT_TASK_KEY, data.taskId);
        } catch {
          // ignore
        }
        setStatusLogs([{ time: new Date().toLocaleTimeString(), message: '自定义基准测试任务已创建，开始初始化...', type: 'success' }]);
      } else {
        alert(data.error || '启动自定义测试失败');
      }
    } catch (error: any) {
      console.error('Error starting custom benchmark:', error);
      alert('启动自定义测试失败: ' + (error?.message || String(error)));
    }
  };

  useEffect(() => {
    if (!taskId) return;
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/benchmark/task/${taskId}`, { headers: authHeaders, credentials: 'include' });
        if (!response.ok) {
          if (response.status === 404) {
            try {
              const resultResponse = await fetch(`/api/benchmark/result/${taskId}`, { headers: authHeaders, credentials: 'include' });
              if (resultResponse.ok) {
                const resultData = await resultResponse.json();
                setTaskStatus({ ...resultData, status: 'completed', progress: 100 });
                setStatusLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), message: '从历史记录中恢复任务状态', type: 'success' }]);
                clearInterval(interval);
                return;
              } else {
                // 如果不仅任务找不到，结果也找不到，说明任务已经不存在了，停止轮询。
                setTaskStatus({ status: 'failed', error: '任务不存在或已丢失' });
                try {
                  localStorage.removeItem(BENCHMARK_CURRENT_TASK_KEY);
                } catch {
                  // ignore
                }
                clearInterval(interval);
                return;
              }
            } catch {
              // 发生网络错误等情况，直接停止并报错
              setTaskStatus({ status: 'failed', error: '无法获取任务结果' });
              clearInterval(interval);
              return;
            }
          }
          // 对于其他的非 404 错误（比如 500），最好也判断是否需要停止轮询或者重试几次
          return;
        }
        const data = await response.json();
        setTaskStatus(data);
        // 与后端 [BenchmarkService] 日志格式保持一致
        if (Array.isArray(data.statusLogs) && data.statusLogs.length > 0) {
          setStatusLogs(
            data.statusLogs.map((message: string) => ({
              time: '',
              message,
              type: 'info' as const,
            })),
          );
        }
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') clearInterval(interval);
      } catch (error) {
        console.error('Error polling task status:', error);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [taskId, authHeaders]);

  useEffect(() => {
    if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
  }, [statusLogs]);

  const getCurrentStageDescription = () => {
    if (!taskStatus) return '';
    const { status, progress, completed, total } = taskStatus;
    if (status === 'pending') return '等待开始...';
    if (status === 'running') {
      if (progress <= 5) return '正在加载数据集';
      if (progress <= 60) return `正在生成 SQL (${completed}/${total})`;
      if (progress < 100) return '正在运行评估';
    }
    if (status === 'completed') return '测试已完成';
    if (status === 'failed') return '测试失败';
    return '处理中...';
  };

  if (!isAuthenticated) return null;

  const isAdmin = user?.role === SystemRoles.ADMIN;
  if (!isAdmin) {
    navigate('/c/new', { replace: true });
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="mb-4 px-4 pt-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">SQL 基准测试平台</h1>
            <p className="mt-1 text-sm text-text-secondary">配置数据集、模型端点和评估指标，对 SQL 模型/Agent 进行评估测试</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-neutral border-token-border-light relative flex items-center gap-2 rounded-lg px-3 py-2"
              onClick={() => navigate('/c/new')}
              aria-label="返回"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>返回</span>
            </button>
            <button
              type="button"
              className="btn btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              onClick={handleNewTest}
            >
              开启新测试
            </button>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="mt-4 flex border-b border-border-light">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'bird'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => {
              setActiveTab('bird');
              setUploadedDatasetId(null);
              setUploadError(null);
              setUploadErrorDetails([]);
              setUploadStats(null);
            }}
          >
            BIRD 标准基准测试
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'custom'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            onClick={() => {
              setActiveTab('custom');
            }}
          >
            自定义数据源测试
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="rounded-lg border border-border-light bg-surface-secondary p-4 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-text-primary">1. 选择模型</h2>
                <div className="space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">端点</label>
                    <select
                      aria-label="选择端点"
                      value={selectedEndpoint}
                      onChange={(e) => {
                        setSelectedEndpoint(e.target.value);
                        setSelectedModel('');
                      }}
                      className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                    >
                      <option value="">-- 选择端点 --</option>
                      {availableEndpoints.map((ep) => (
                        <option key={ep.id} value={ep.id}>
                          {ep.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">模型</label>
                    {selectedEndpoint ? (
                      <select
                        aria-label="选择模型"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                      >
                        <option value="">-- 选择模型 --</option>
                        {selectedEndpoint === EModelEndpoint.agents
                          ? agents.map((agent: any) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.name || agent.id} ({agent.id})
                              </option>
                            ))
                          : availableModels.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                      </select>
                    ) : (
                      <div className="rounded-md border border-border-light bg-surface-tertiary px-3 py-2 text-sm text-text-secondary">请先选择端点</div>
                    )}
                    {selectedEndpoint === EModelEndpoint.agents && selectedEndpoint && agents.length === 0 ? (
                      <div className="mt-2 text-xs text-text-tertiary">暂无可用智能体（请先在 Agent平台创建，并确保你有权限访问）</div>
                    ) : null}
                  </div>
                  {selectedEndpoint === 'mcp' && selectedModel && startupConfig?.mcpServers?.[selectedModel] && (() => {
                    const serverName = selectedModel;
                    const serverConfig = startupConfig.mcpServers[serverName];
                    const hasCustomVars = serverConfig?.customUserVars && Object.keys(serverConfig.customUserVars).length > 0;
                    
                    if (!hasCustomVars) return null;

                    return (
                      <div className="mt-2">
                        <label className="mb-2 block text-sm font-medium text-text-primary">MCP 参数配置</label>
                        <div className="rounded bg-surface-secondary p-3">
                          <CustomUserVarsSection
                            serverName={serverName}
                            fields={serverConfig.customUserVars as any}
                            onSave={async (authData) => {
                              try {
                                const filteredAuthData: Record<string, string> = {};
                                Object.entries(authData).forEach(([key, value]) => {
                                  if (value && value.trim()) filteredAuthData[key] = value.trim();
                                });
                                if (Object.keys(filteredAuthData).length > 0) {
                                  await updateUserPlugins.mutateAsync({
                                    pluginKey: `${Constants.mcp_prefix}${serverName}`,
                                    action: 'install',
                                    auth: filteredAuthData,
                                    isEntityTool: true,
                                  });
                                  alert('参数已保存');
                                }
                              } catch (error: any) {
                                alert('保存失败: ' + error.message);
                              }
                            }}
                            onRevoke={() => {
                              updateUserPlugins.mutate({
                                pluginKey: `${Constants.mcp_prefix}${serverName}`,
                                action: 'uninstall',
                                auth: {},
                                isEntityTool: true,
                              });
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                  {selectedEndpoint === 'mcp' && (
                    <div className="mt-4 rounded-md border border-border-light bg-surface-tertiary p-3">
                      <label className="mb-2 block text-sm font-medium text-text-primary">测试说明</label>
                      <div className="text-xs text-text-secondary">
                        选择 MCP 后，将直接调用该 MCP Server 进行基准测试。请确保在参数配置中填入了正确的参数。
                      </div>
                    </div>
                  )}
                  {selectedEndpoint === 'mcp' && selectedModel && (() => {
                    const server = mcpToolsData?.servers?.[selectedModel];
                    const hasTools = server && server.tools && server.tools.length > 0;
                    
                    return (
                      <div className="mt-4 rounded-md border border-border-light bg-surface-primary p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <label className="text-sm font-medium text-text-primary">MCP 连接与工具配置</label>
                          <button
                            type="button"
                            onClick={handleTestMcpConnection}
                            disabled={isTestingMcpConnection}
                            className="btn btn-neutral border-token-border-light rounded-md px-3 py-1 text-xs font-medium"
                          >
                            {isTestingMcpConnection ? '测试中...' : '测试连接并刷新工具'}
                          </button>
                        </div>

                        {mcpConnectionError && (
                          <div className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-600">
                            连接失败: {mcpConnectionError}
                          </div>
                        )}

                        {!hasTools ? (
                          <div className="rounded-md bg-surface-secondary p-3 text-xs text-text-secondary">
                            尚未获取到工具列表，请点击上方“测试连接并刷新工具”按钮。
                            {server && server.tools && server.tools.length === 0 && (
                              <div className="mt-1 text-yellow-600">该服务器当前未暴露任何工具。</div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3 rounded-md border border-border-light bg-surface-secondary p-3">
                            <div>
                              <label className="mb-1 block text-xs text-text-secondary">选择工具</label>
                              <select
                                className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                                value={selectedMcpToolName || (server.tools[0]?.name || '')}
                                onChange={(e) => setSelectedMcpToolName(e.target.value)}
                              >
                                {server.tools.map((t: any) => (
                                  <option key={t.name} value={t.name}>{t.name}</option>
                                ))}
                              </select>
                            </div>
                            {(() => {
                              const currentTool = server.tools.find((t: any) => t.name === selectedMcpToolName) || server.tools[0];
                              if (!currentTool) return null;
                              
                              const handleGenerateDefaultJson = () => {
                                if (currentTool.inputSchema && currentTool.inputSchema.properties) {
                                  const propKeys = Object.keys(currentTool.inputSchema.properties);
                                  const requiredKeys = currentTool.inputSchema.required || [];
                                  if (propKeys.length > 0) {
                                    const defaultObj: Record<string, string> = {};
                                    
                                    // 针对 becauseai-server 的 ask_data 工具进行特殊处理
                                    if (selectedModel === 'becauseai-server' && selectedMcpToolName === 'ask_data') {
                                      const currentDs = datasources.find((ds: any) => ds._id === selectedDatasourceId);
                                      if (propKeys.includes('arg1')) {
                                        defaultObj['arg1'] = currentDs?.projectId || '';
                                      }
                                      if (propKeys.includes('arg2')) {
                                        defaultObj['arg2'] = selectedDatasourceId || '';
                                      }
                                    } else {
                                      // 默认逻辑：过滤掉 required 的参数，因为我们认为它是 question
                                      const optionalKeys = propKeys.filter(key => !requiredKeys.includes(key));
                                      optionalKeys.forEach(key => {
                                          defaultObj[key] = "";
                                      });
                                      // 如果没有可选参数，则把所有的除了最后一个参数都加上去
                                      if(optionalKeys.length === 0) {
                                          for(let i=0; i<propKeys.length-1; i++) {
                                              defaultObj[propKeys[i]] = "";
                                          }
                                      }
                                    }

                                    setMcpToolArgumentsJson(JSON.stringify(defaultObj, null, 2));
                                  }
                                } else {
                                  setMcpToolArgumentsJson(JSON.stringify({}, null, 2));
                                }
                              };

                              return (
                                <div>
                                  <label className="mb-1 block text-xs text-text-secondary flex justify-between items-center">
                                    <span>高级 JSON 参数配置</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-text-tertiary">可用占位符: {'{{prompt}}'}, {'{{question}}'}</span>
                                      <button 
                                        type="button" 
                                        onClick={handleGenerateDefaultJson}
                                        className="text-xs text-primary hover:underline"
                                      >
                                        填入默认结构
                                      </button>
                                    </div>
                                  </label>
                                  <textarea
                                    rows={6}
                                    value={mcpToolArgumentsJson}
                                    onChange={(e) => setMcpToolArgumentsJson(e.target.value)}
                                    placeholder={`{\n  "query": "{{question}}"\n}`}
                                    className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-xs font-mono text-text-primary focus:border-primary focus:outline-none"
                                  />
                                  {currentTool.inputSchema && (
                                    <div className="mt-2">
                                      <div className="mb-1 text-xs text-text-secondary">参数 Schema 参考:</div>
                                      <pre className="max-h-32 overflow-y-auto rounded bg-surface-tertiary p-2 text-xs text-text-tertiary">
                                        {JSON.stringify(currentTool.inputSchema, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-lg border border-border-light bg-surface-secondary p-4 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-text-primary">
                  {activeTab === 'bird' ? '2. 选择可用数据源' : '2. 选择自定义数据源'}
                </h2>
                <div className="space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">数据库类型</label>
                    <select
                      aria-label="数据库类型"
                      value={selectedDatabaseType}
                      onChange={(e) => {
                        setSelectedDatabaseType(e.target.value as 'SQLite' | 'MySQL' | 'PostgreSQL');
                        setSelectedDatasourceId('');
                      }}
                      className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                    >
                      {databaseTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {activeTab === 'bird'
                        ? '类型用于加载对应题目集与生成 SQL 方言。执行准确率（EX）在 BIRD 的 SQLite 库（dev_databases）上比对查询结果，与此处方言无关。'
                        : '选择您需要评估的目标数据库类型，生成的 SQL 将与此数据源连接执行比对。'}
                    </p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">当前项目数据源</label>
                    <select
                      aria-label="选择数据源"
                      value={selectedDatasourceId}
                      onChange={(e) => setSelectedDatasourceId(e.target.value)}
                      className="w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
                    >
                      <option value="">-- 请选择数据源 --</option>
                      {activeTab === 'bird'
                        ? datasources
                            .filter(ds => {
                              const isProviderMatch = ds.provider.toLowerCase() === selectedDatabaseType.toLowerCase() || (ds.provider === 'postgresql' && selectedDatabaseType === 'PostgreSQL');
                              if (!isProviderMatch) return false;
                              const dbName = ds.configuration?.database || ds.name;
                              return databases.some(db => db.id === dbName);
                            })
                            .map((ds) => (
                              <option key={ds._id} value={ds._id}>
                                {ds.name} (BIRD 数据集)
                              </option>
                            ))
                        : datasources
                            .filter(ds => {
                              return ds.provider.toLowerCase() === selectedDatabaseType.toLowerCase() || (ds.provider === 'postgresql' && selectedDatabaseType === 'PostgreSQL');
                            })
                            .map((ds) => (
                              <option key={ds._id} value={ds._id}>
                                {ds.name}
                              </option>
                            ))
                      }
                    </select>
                    {datasources.length === 0 && (
                      <div className="mt-2 text-xs text-text-tertiary">请先在数据源管理中配置当前项目的 {selectedDatabaseType} 数据源</div>
                    )}
                  </div>
                  {selectedDatasourceId && (() => {
                    const ds = datasources.find((x) => x._id === selectedDatasourceId);
                    if (!ds) return null;
                    const dbName = ds.configuration?.database || ds.name;
                    const birdDb = databases.find(db => db.id === dbName);
                    
                    return (
                      <div className="rounded-md border border-border-light bg-surface-tertiary px-3 py-2">
                        <div className="text-sm text-text-primary">
                          <span className="font-medium">已选择数据源:</span> {ds.name}
                        </div>
                        <div className="mt-1 text-xs text-text-secondary">
                          数据库名: <span className="font-medium">{dbName}</span>
                        </div>
                        {activeTab === 'bird' && birdDb && (
                          <div className="mt-1 text-xs text-green-600 font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> 匹配到 BIRD 数据集: {birdDb.name}
                          </div>
                        )}
                        {activeTab === 'bird' && birdDb?.description && (
                          <div className="mt-1 text-xs text-text-secondary">{birdDb.description}</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {activeTab === 'custom' && (
                <div className="rounded-lg border border-border-light bg-surface-secondary p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-text-primary">3. 上传自定义测试答案</h2>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载 JSON 模板文件
                    </button>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".json"
                      className="hidden"
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        uploadedDatasetId
                          ? 'border-green-500 bg-green-500/5 hover:bg-green-500/10'
                          : uploadError
                          ? 'border-red-500 bg-red-500/5 hover:bg-red-500/10'
                          : 'border-border-light hover:border-primary bg-surface-primary hover:bg-surface-hover'
                      }`}
                    >
                      {isUploading ? (
                        <div className="flex flex-col items-center py-2">
                          <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                          <span className="text-sm font-medium text-text-primary">正在上传并校验数据集...</span>
                        </div>
                      ) : uploadedDatasetId ? (
                        <div className="flex flex-col items-center py-2">
                          <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
                          <span className="text-sm font-medium text-green-600 font-semibold">测试集校验通过且已上传</span>
                          <span className="text-xs text-text-secondary mt-1 font-mono">数据集 ID: {uploadedDatasetId}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center py-2">
                          <Upload className="h-8 w-8 text-text-secondary mb-2" />
                          <span className="text-sm font-medium text-text-primary">点击选择或拖入 JSON 数据集文件</span>
                          <span className="text-xs text-text-tertiary mt-1">仅支持 .json 文件</span>
                        </div>
                      )}
                    </div>

                    {uploadStats && (
                      <div className="rounded-md bg-surface-tertiary p-3 text-xs space-y-1">
                        <div className="font-semibold text-text-primary mb-1">数据集解析统计:</div>
                        <div className="text-text-secondary">总测试项: <span className="font-medium text-text-primary">{uploadStats.total}</span> 题</div>
                        <div className="text-text-secondary">涉及数据库: <span className="font-medium text-text-primary">{uploadStats.databases?.join(', ') || '无'}</span> ({uploadStats.databaseCount}个)</div>
                        <div className="text-text-secondary">难度分布:
                          <span className="ml-2 text-green-600 font-medium">简单: {uploadStats.difficulty?.simple || 0}</span> |
                          <span className="ml-2 text-yellow-600 font-medium">中等: {uploadStats.difficulty?.moderate || 0}</span> |
                          <span className="ml-2 text-red-600 font-medium">困难: {uploadStats.difficulty?.challenging || 0}</span>
                        </div>
                      </div>
                    )}

                    {uploadError && (
                      <div className="rounded-md bg-red-50 p-3 text-xs border border-red-200">
                        <div className="font-semibold text-red-700 flex items-center gap-1 mb-1">
                          <AlertTriangle className="h-4 w-4" />
                          {uploadError}
                        </div>
                        {uploadErrorDetails.length > 0 && (
                          <div className="max-h-32 overflow-y-auto space-y-1 mt-1 text-red-600 font-mono text-[11px] list-disc list-inside">
                            {uploadErrorDetails.slice(0, 10).map((err, i) => (
                              <div key={i}>• {err}</div>
                            ))}
                            {uploadErrorDetails.length > 10 && (
                              <div className="text-red-500 font-semibold mt-1">...等共 {uploadErrorDetails.length} 个错误</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border-light bg-surface-secondary p-4 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-text-primary">
                  {activeTab === 'bird' ? '3. 选择评估指标' : '4. 选择评估指标'}
                </h2>
                <div className="space-y-3">
                  {evaluationMetrics.map((metric) => {
                    const isDisabled = activeTab === 'custom' && metric.id !== 'EX';
                    return (
                      <label
                        key={metric.id}
                        title={metric.description}
                        className={`flex cursor-pointer items-center rounded-md border border-border-light bg-surface-primary px-3 py-2 hover:bg-surface-hover ${
                          isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isDisabled}
                          checked={isDisabled ? false : metric.checked}
                          onChange={(e) =>
                            setEvaluationMetrics((prev) =>
                              prev.map((m) => (m.id === metric.id ? { ...m, checked: e.target.checked } : m)),
                            )
                          }
                          className="mr-3 h-4 w-4 rounded border-border-light text-primary focus:ring-primary disabled:opacity-50"
                        />
                        <span className="text-sm text-text-primary">{metric.name}</span>
                        {isDisabled && (
                          <span className="ml-auto text-[10px] text-text-tertiary">自定义测试暂不支持</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {activeTab === 'bird' ? (
                <button
                  type="button"
                  onClick={handleStartBenchmark}
                  disabled={!selectedDatasourceId || !selectedDatabaseType || !selectedEndpoint || !selectedModel}
                  className="btn btn-primary relative flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  开始 BIRD 测试
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCustomBenchmark}
                  disabled={!uploadedDatasetId || !selectedDatasourceId || !selectedDatabaseType || !selectedEndpoint || !selectedModel}
                  className="btn btn-primary relative flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  开始自定义测试
                </button>
              )}
            </div>

            <div className="space-y-6">
              {taskId && (
                <div className="rounded-lg border border-border-light bg-surface-secondary p-4 shadow-sm">
                  <h2 className="mb-4 text-lg font-semibold text-text-primary">测试进度</h2>
                  {taskStatus ? (
                    <div className="space-y-4">
                      <div className="rounded-md border border-border-light bg-surface-primary p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-text-secondary">状态:</span>
                          <span className={`font-medium ${taskStatus.status === 'completed' ? 'text-green-600' : taskStatus.status === 'failed' ? 'text-red-600' : taskStatus.status === 'cancelled' ? 'text-yellow-600' : 'text-text-primary'}`}>
                            {taskStatus.status === 'completed' ? '已完成' : taskStatus.status === 'failed' ? '失败' : taskStatus.status === 'cancelled' ? '已取消' : taskStatus.status === 'running' ? '运行中' : taskStatus.status}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-sm">
                          <span className="text-text-secondary">进度:</span>
                          <span className="font-medium text-text-primary">{taskStatus.completed || 0} / {taskStatus.total || 0}</span>
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 flex justify-between text-xs text-text-secondary">
                          <span>{getCurrentStageDescription()}</span>
                          <span>{Math.round(taskStatus.progress || 0)}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-tertiary">
                          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${taskStatus.progress || 0}%` }} />
                        </div>
                      </div>
                      {taskStatus.status === 'running' && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!taskId) return;
                              try {
                                const response = await fetch(`/api/benchmark/task/${taskId}/cancel`, {
                                  method: 'POST',
                                  headers: authHeaders,
                                  credentials: 'include',
                                });
                                if (response.ok) {
                                  setStatusLogs((prev) => [
                                    ...prev,
                                    { time: new Date().toLocaleTimeString(), message: '已请求终止测试', type: 'warning' },
                                  ]);
                                } else {
                                  const data = await response.json();
                                  alert('终止失败: ' + (data.error || '未知错误'));
                                }
                              } catch (error: any) {
                                console.error('Error cancelling task:', error);
                                alert('终止失败: ' + (error?.message || String(error)));
                              }
                            }}
                            className="btn btn-neutral border-red-500/20 bg-red-500/5 text-red-600 hover:bg-red-500/10 rounded-md px-3 py-2 text-sm"
                          >
                            <Square className="h-3 w-3 mr-1 fill-current" /> 终止测试
                          </button>
                        </div>
                      )}
                      {statusLogs.length > 0 && (
                        <div className="rounded-md border border-border-light bg-surface-primary p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs font-medium text-text-secondary flex items-center gap-1"><FileText className="h-3 w-3" /> 测试日志</div>
                            <button type="button" onClick={() => setStatusLogs([])} className="text-xs text-text-tertiary hover:text-text-secondary">清空</button>
                          </div>
                          <div ref={logContainerRef} className="max-h-48 space-y-1 overflow-y-auto text-xs font-mono" style={{ scrollBehavior: 'smooth' }}>
                            {statusLogs.map((log, index) => (
                              <div
                                key={index}
                                className={`flex items-start gap-2 py-0.5 ${log.type === 'success' ? 'text-green-600' : log.type === 'error' ? 'text-red-600' : log.type === 'warning' ? 'text-yellow-600' : 'text-text-secondary'}`}
                              >
                                {log.time ? (
                                  <span className="shrink-0 text-text-tertiary font-normal">[{log.time}]</span>
                                ) : null}
                                <span className="flex-1 font-mono text-xs">{log.message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {taskStatus.status === 'completed' && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/result/${taskId}`)}
                              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 text-sm text-green-600 hover:bg-green-500/10"
                            >
                              <FileText className="h-4 w-4" />
                              <span>查看详细结果</span>
                              <span>→</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleNewTest}
                              className="btn btn-primary rounded-md px-3 py-2 text-sm"
                            >
                              开启新测试
                            </button>
                          </div>
                          {taskStatus.results && (
                            <div className="rounded-md border border-border-light bg-surface-tertiary p-3">
                              <div className="text-xs font-medium text-text-secondary mb-1">评估结果摘要</div>
                              {Object.keys(taskStatus.results).map((metric) => {
                                const result = taskStatus.results[metric];
                                if (result.error) return <div key={metric} className="text-xs text-red-600">{metric}: 评估失败</div>;
                                return <div key={metric} className="text-xs text-text-primary">{metric}: {result.accuracy !== undefined ? `${result.accuracy.toFixed(2)}%` : '已完成'}</div>;
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      {taskStatus.error && (
                        <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
                          <div className="text-sm font-medium text-red-600">错误信息</div>
                          <div className="mt-1 text-xs text-red-500">{taskStatus.error}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-sm text-text-secondary">加载中...</div>
                    </div>
                  )}
                </div>
              )}
              {!taskId && (
                <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-border-light bg-surface-secondary">
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-tertiary">
                      <BarChart3 className="h-6 w-6 text-text-secondary" />
                    </div>
                    <div className="text-sm font-medium text-text-primary">等待开始测试</div>
                    <div className="mt-1 text-xs text-text-secondary">配置完成后点击「开始测试」按钮</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
