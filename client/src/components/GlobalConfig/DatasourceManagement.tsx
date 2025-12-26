import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button, useToastContext } from '@because/client';
import { useAuthContext } from '~/hooks';
import { useListAgentsQuery } from '~/data-provider';
import { PermissionBits } from '@because/data-provider';
import { cn } from '~/utils';
import {
    RefreshCw,
    Plus,
    Edit2,
    Trash2,
    Database,
    X,
    CheckCircle,
    XCircle,
    ChevronDown,
    Check
} from 'lucide-react';

interface DatProject {
    _id: string;
    name: string;
}

interface DatDatasource {
    _id: string;
    projectId: string;
    name: string;
    description?: string;
    provider: string;
    configuration: {
        host?: string;
        port?: number;
        database?: string;
        username?: string;
        password?: string;
        [key: string]: any;
    };
    agentNames: string[];
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

const getDefaultDatasource = (projectId = ''): Omit<DatDatasource, '_id' | 'createdAt' | 'updatedAt'> => ({
    projectId,
    name: '',
    description: '',
    provider: 'mysql',
    configuration: {
        host: 'localhost',
        port: 3306,
        database: '',
        username: '',
        password: ''
    },
    agentNames: [],
    enabled: true,
});

const PROVIDER_OPTIONS = [
    { label: 'MySQL', value: 'mysql' },
    { label: 'PostgreSQL', value: 'postgresql' },
    { label: 'ClickHouse', value: 'clickhouse' },
    { label: 'SQLite', value: 'sqlite' },
    { label: 'DuckDB', value: 'duckdb' },
    { label: 'Oracle', value: 'oracle' },
    { label: 'SQL Server', value: 'sqlserver' },
    { label: 'MongoDB', value: 'mongodb' },
    { label: 'Redis', value: 'redis' },
    { label: 'Elasticsearch', value: 'elasticsearch' },
    { label: 'Hive', value: 'hive' },
    { label: 'Presto', value: 'presto' },
    { label: 'Trino', value: 'trino' },
    { label: 'Doris', value: 'doris' },
    { label: 'StarRocks', value: 'starrocks' },
    { label: 'TiDB', value: 'tidb' },
    { label: 'OceanBase', value: 'oceanbase' },
];

export default function DatasourceManagement() {
    const { showToast } = useToastContext();
    const { token } = useAuthContext();
    const [datasources, setDatasources] = useState<DatDatasource[]>([]);
    const [projects, setProjects] = useState<DatProject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingDatasource, setEditingDatasource] = useState<Partial<DatDatasource> | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Multi-select state
    const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
    const agentDropdownRef = useRef<HTMLDivElement>(null);

    // Fetch Agents using the hook
    const { data: agentsData } = useListAgentsQuery({
        requiredPermission: PermissionBits.VIEW,
    });

    const agents = useMemo(() => agentsData?.data || [], [agentsData]);

    const getApiBase = useCallback(() => {
        const baseEl = document.querySelector('base');
        const baseHref = baseEl?.getAttribute('href') || '/';
        return baseHref.endsWith('/') ? baseHref.slice(0, -1) : baseHref;
    }, []);

    const getHeaders = useCallback((): HeadersInit => {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }, [token]);

    const fetchProjects = useCallback(async () => {
        try {
            const response = await fetch(`${getApiBase()}/api/dat-projects`, {
                method: 'GET',
                headers: getHeaders(),
                credentials: 'include',
            });
            if (response.ok) {
                const data = await response.json();
                setProjects(data.projects || []);
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        }
    }, [getApiBase, getHeaders]);

    const fetchDatasources = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${getApiBase()}/api/dat-datasources`, {
                method: 'GET',
                headers: getHeaders(),
                credentials: 'include',
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: '获取数据源列表失败' }));
                throw new Error(error.error || '获取数据源列表失败');
            }

            const data = await response.json();
            setDatasources(data.datasources || []);
        } catch (error) {
            console.error('Error fetching datasources:', error);
            showToast({
                message: `获取数据源列表失败: ${error instanceof Error ? error.message : '未知错误'}`,
                status: 'error',
            });
        } finally {
            setIsLoading(false);
        }
    }, [getApiBase, getHeaders, showToast]);

    useEffect(() => {
        fetchProjects();
        fetchDatasources();
    }, [fetchProjects, fetchDatasources]);

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
                setIsAgentDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const saveDatasource = async () => {
        if (!editingDatasource) return;

        if (!editingDatasource.projectId) {
            showToast({ message: '请选择所属项目', status: 'error' });
            return;
        }
        if (!editingDatasource.name?.trim()) {
            showToast({ message: '请输入数据源名称', status: 'error' });
            return;
        }

        setIsSaving(true);
        try {
            const isEdit = !!(editingDatasource as DatDatasource)._id;
            const url = isEdit
                ? `${getApiBase()}/api/dat-datasources/${(editingDatasource as DatDatasource)._id}`
                : `${getApiBase()}/api/dat-datasources`;

            const response = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: getHeaders(),
                credentials: 'include',
                body: JSON.stringify(editingDatasource),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: '保存失败' }));
                throw new Error(error.error || '保存失败');
            }

            showToast({
                message: isEdit ? '数据源更新成功' : '数据源创建成功',
                status: 'success',
            });

            setEditingDatasource(null);
            fetchDatasources();
        } catch (error) {
            console.error('Error saving datasource:', error);
            showToast({
                message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`,
                status: 'error',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const deleteDatasource = async (datasource: DatDatasource) => {
        if (!confirm(`确定要删除数据源 "${datasource.name}" 吗？此操作将同时删除关联的语义模型。`)) {
            return;
        }

        setDeletingId(datasource._id);
        try {
            const response = await fetch(`${getApiBase()}/api/dat-datasources/${datasource._id}`, {
                method: 'DELETE',
                headers: getHeaders(),
                credentials: 'include',
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: '删除失败' }));
                throw new Error(error.error || '删除失败');
            }

            showToast({ message: '数据源删除成功', status: 'success' });
            setDatasources(prev => prev.filter(p => p._id !== datasource._id));
        } catch (error) {
            console.error('Error deleting datasource:', error);
            showToast({
                message: `删除失败: ${error instanceof Error ? error.message : '未知错误'}`,
                status: 'error',
            });
        } finally {
            setDeletingId(null);
        }
    };

    const updateEditing = (key: keyof DatDatasource, value: any) => {
        setEditingDatasource(prev => (prev ? { ...prev, [key]: value } : prev));
    };

    const updateConfig = (key: string, value: any) => {
        setEditingDatasource(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                configuration: {
                    ...prev.configuration,
                    [key]: value
                }
            };
        });
    };

    const toggleAgentSelection = async (agentName: string) => {
        if (!editingDatasource) return;

        const currentAgents = editingDatasource.agentNames || [];

        // If already selected, just remove it from current datasource
        if (currentAgents.includes(agentName)) {
            setEditingDatasource(prev => {
                if (!prev) return prev;
                return { ...prev, agentNames: currentAgents.filter(n => n !== agentName) };
            });
            return;
        }

        // Check if this agent is already bound to another datasource
        const currentDatasourceId = (editingDatasource as DatDatasource)._id;
        const boundDatasource = datasources.find(ds =>
            ds._id !== currentDatasourceId && ds.agentNames?.includes(agentName)
        );

        if (boundDatasource) {
            // Agent is already bound to another datasource, need to unbind first
            const confirmUnbind = confirm(
                `智能体 "${agentName}" 已绑定到数据源 "${boundDatasource.name}"。是否解除原有绑定并绑定到当前数据源？`
            );

            if (!confirmUnbind) {
                return;
            }

            // Remove agent from the other datasource
            try {
                const updatedOtherDatasource = {
                    ...boundDatasource,
                    agentNames: boundDatasource.agentNames.filter(n => n !== agentName)
                };

                const response = await fetch(`${getApiBase()}/api/dat-datasources/${boundDatasource._id}`, {
                    method: 'PUT',
                    headers: getHeaders(),
                    credentials: 'include',
                    body: JSON.stringify(updatedOtherDatasource),
                });

                if (!response.ok) {
                    const error = await response.json().catch(() => ({ error: '解除绑定失败' }));
                    throw new Error(error.error || '解除绑定失败');
                }

                // Update local datasources state
                setDatasources(prev => prev.map(ds =>
                    ds._id === boundDatasource._id
                        ? { ...ds, agentNames: ds.agentNames.filter(n => n !== agentName) }
                        : ds
                ));

                showToast({
                    message: `已从数据源 "${boundDatasource.name}" 解除智能体 "${agentName}" 的绑定`,
                    status: 'success',
                });
            } catch (error) {
                console.error('Error unbinding agent:', error);
                showToast({
                    message: `解除绑定失败: ${error instanceof Error ? error.message : '未知错误'}`,
                    status: 'error',
                });
                return;
            }
        }

        // Add agent to current datasource
        setEditingDatasource(prev => {
            if (!prev) return prev;
            return { ...prev, agentNames: [...(prev.agentNames || []), agentName] };
        });
    };

    const getProjectName = (projectId: string) => {
        const project = projects.find(p => p._id === projectId);
        return project ? project.name : projectId;
    };

    const formatDate = (dateString: string) => {
        try {
            return new Date(dateString).toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return dateString;
        }
    };

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-text-primary">数据源管理</h2>
                    <p className="mt-1 text-sm text-text-secondary">
                        管理数据库连接配置，并绑定到智能体
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        onClick={fetchDatasources}
                        disabled={isLoading}
                        className="btn btn-neutral border-token-border-light relative flex items-center gap-2 rounded-lg px-3 py-2"
                    >
                        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                        {isLoading ? '加载中...' : '刷新'}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => setEditingDatasource(getDefaultDatasource())}
                        className="btn btn-primary relative flex items-center gap-2 rounded-lg px-3 py-2"
                    >
                        <Plus className="h-4 w-4" />
                        添加数据源
                    </Button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto">
                {isLoading ? (
                    <div className="flex h-32 items-center justify-center text-text-secondary">
                        <p className="text-sm">加载中...</p>
                    </div>
                ) : datasources.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center gap-2 text-text-secondary">
                        <Database className="h-8 w-8" />
                        <p className="text-sm">暂无数据源</p>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                        {datasources.map(ds => (
                            <div
                                key={ds._id}
                                className="rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm transition-shadow hover:shadow-md"
                            >
                                <div className="mb-3 flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="rounded p-2 bg-surface-secondary text-blue-600">
                                            <Database className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-text-primary">{ds.name}</h3>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                                                <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                                                    {getProjectName(ds.projectId)}
                                                </span>
                                                <span>{ds.provider}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setEditingDatasource(ds)}
                                            className="rounded p-1.5 text-text-secondary hover:bg-surface-hover"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteDatasource(ds)}
                                            disabled={deletingId === ds._id}
                                            className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <p className="mb-4 h-10 text-sm text-text-secondary line-clamp-2">
                                    {ds.description || '无描述'}
                                </p>

                                {/* Agents Tag List */}
                                <div className="mb-3">
                                    <div className="flex flex-wrap gap-1">
                                        {ds.agentNames && ds.agentNames.length > 0 ? (
                                            ds.agentNames.map(name => (
                                                <span key={name} className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-900/30 dark:text-blue-400">
                                                    {name}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-xs text-text-tertiary italic">未绑定智能体</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-xs text-text-tertiary">
                                    <span className={cn("flex items-center gap-1", ds.enabled ? "text-green-600" : "text-gray-400")}>
                                        {ds.enabled ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                        {ds.enabled ? '已启用' : '已禁用'}
                                    </span>
                                    <span>{formatDate(ds.createdAt)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingDatasource && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
                    <div className="relative flex h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border-light bg-surface-primary shadow-lg">
                        <div className="flex items-center justify-between border-b border-border-light p-4">
                            <h3 className="text-lg font-semibold text-text-primary">
                                {(editingDatasource as DatDatasource)._id ? '编辑数据源' : '添加数据源'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setEditingDatasource(null)}
                                className="rounded p-1 text-text-secondary hover:bg-surface-hover"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="space-y-4">
                                {/* Project Selection */}
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-text-primary">
                                        所属项目 <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={editingDatasource.projectId || ''}
                                        onChange={(e) => updateEditing('projectId', e.target.value)}
                                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    >
                                        <option value="" disabled>请选择所属项目</option>
                                        {projects.map(p => (
                                            <option key={p._id} value={p._id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Agent Binding (Multi-Select) */}
                                {editingDatasource.projectId && (
                                    <div className="relative" ref={agentDropdownRef}>
                                        <label className="mb-1 block text-sm font-medium text-text-primary">
                                            绑定智能体
                                        </label>
                                        <div
                                            className="flex w-full cursor-pointer items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            onClick={() => setIsAgentDropdownOpen(!isAgentDropdownOpen)}
                                        >
                                            <div className="flex flex-wrap gap-1">
                                                {editingDatasource.agentNames && editingDatasource.agentNames.length > 0 ? (
                                                    editingDatasource.agentNames.map(name => (
                                                        <span key={name} className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                                                            {name}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-gray-400">选择智能体...</span>
                                                )}
                                            </div>
                                            <ChevronDown className="h-4 w-4 text-gray-500" />
                                        </div>

                                        {/* Dropdown Menu */}
                                        {isAgentDropdownOpen && (
                                            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
                                                {agents.length > 0 ? (
                                                    agents.map((agent: any) => {
                                                        const isSelected = editingDatasource.agentNames?.includes(agent.name);
                                                        return (
                                                            <div
                                                                key={agent.id}
                                                                className={cn(
                                                                    "flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700",
                                                                    isSelected && "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                                                )}
                                                                onClick={() => toggleAgentSelection(agent.name)}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    {/* Maybe show avatar? */}
                                                                    <span>{agent.name}</span>
                                                                    {agent.description && <span className="text-xs text-gray-400 truncate max-w-[150px]">- {agent.description}</span>}
                                                                </div>
                                                                {isSelected && <Check className="h-4 w-4" />}
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className="px-3 py-2 text-sm text-gray-500">暂无智能体</div>
                                                )}
                                            </div>
                                        )}
                                        <p className="mt-1 text-xs text-text-tertiary">
                                            一个智能体只能绑定一个数据源。选择后将从其他数据源解绑。
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <label className="mb-1 block text-sm font-medium text-text-primary">
                                        数据源名称 <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editingDatasource.name || ''}
                                        onChange={(e) => updateEditing('name', e.target.value)}
                                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                        placeholder="请输入数据源名称"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block text-sm font-medium text-text-primary">描述</label>
                                    <textarea
                                        value={editingDatasource.description || ''}
                                        onChange={(e) => updateEditing('description', e.target.value)}
                                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                        rows={2}
                                        placeholder="请输入描述"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-text-primary">数据库类型 <span className="text-red-500">*</span></label>
                                        <select
                                            value={editingDatasource.provider}
                                            onChange={(e) => updateEditing('provider', e.target.value)}
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                        >
                                            {PROVIDER_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center pt-6">
                                        <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={editingDatasource.enabled}
                                                onChange={(e) => updateEditing('enabled', e.target.checked)}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                            />
                                            启用数据源
                                        </label>
                                    </div>
                                </div>

                                <div className="border-t border-border-light pt-4 mt-4">
                                    <h4 className="mb-4 text-sm font-semibold text-text-primary">连接配置</h4>

                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-text-primary">主机 (Host)</label>
                                            <input
                                                type="text"
                                                value={editingDatasource.configuration?.host || 'localhost'}
                                                onChange={(e) => updateConfig('host', e.target.value)}
                                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                placeholder="localhost"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-text-primary">端口 (Port)</label>
                                            <input
                                                type="number"
                                                value={editingDatasource.configuration?.port || 3306}
                                                onChange={(e) => updateConfig('port', Number(e.target.value))}
                                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <label className="mb-1 block text-sm font-medium text-text-primary">数据库名 (Database)</label>
                                        <input
                                            type="text"
                                            value={editingDatasource.configuration?.database || ''}
                                            onChange={(e) => updateConfig('database', e.target.value)}
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            placeholder="database"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-text-primary">用户名 (Username)</label>
                                            <input
                                                type="text"
                                                value={editingDatasource.configuration?.username || ''}
                                                onChange={(e) => updateConfig('username', e.target.value)}
                                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                placeholder="username"
                                            />
                                        </div>
                                        <div>
                                            <label className="mb-1 block text-sm font-medium text-text-primary">密码 (Password)</label>
                                            <input
                                                type="password"
                                                value={editingDatasource.configuration?.password || ''}
                                                onChange={(e) => updateConfig('password', e.target.value)}
                                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                placeholder="password"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-border-light bg-surface-primary p-4">
                            <Button
                                type="button"
                                onClick={() => setEditingDatasource(null)}
                                className="btn btn-neutral rounded-lg px-4 py-2"
                            >
                                取消
                            </Button>
                            <Button
                                type="button"
                                onClick={saveDatasource}
                                disabled={isSaving}
                                className="btn btn-primary rounded-lg px-4 py-2"
                            >
                                {isSaving ? '保存中...' : '保存'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
