import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, useToastContext } from '@because/client';
import { useAuthContext } from '~/hooks';
import { cn } from '~/utils';
import {
    RefreshCw,
    Plus,
    Edit2,
    Trash2,
    FolderOpen,
    ChevronDown,
    ChevronUp,
    Server,
    Bot,
    Database,
    Search,
    X,
    HelpCircle
} from 'lucide-react';
import { providerConfigs, ProviderType } from '~/constants/projectConfig';
import ProviderConfigForm from './components/ProviderConfigForm';
import EmailSenderConfig from './components/EmailSenderConfig';
import McpServersConfig from './components/McpServersConfig';

// 类型定义
interface LlmConfig {
    name: string;
    provider: string;
    configuration: Record<string, any>;
}

interface AgentConfig {
    name: string;
    description?: string;
    provider: string;
    configuration: Record<string, any>;
    semantic_models?: string[];
    semantic_model_tags?: string[];
}

interface ProviderConfigItem {
    provider: string;
    configuration: Record<string, any>;
}

interface DatProject {
    _id: string;
    version: number;
    name: string;
    description?: string;
    configuration?: Record<string, any>;
    db?: ProviderConfigItem;
    embedding: ProviderConfigItem;
    embedding_store: ProviderConfigItem;
    llms: LlmConfig[];
    reranking: ProviderConfigItem;
    content_store: ProviderConfigItem;
    agents: AgentConfig[];
    createdAt: string;
    updatedAt: string;
}

// 默认项目数据
const getDefaultProject = (): Omit<DatProject, '_id' | 'createdAt' | 'updatedAt'> => ({
    version: 1,
    name: '',
    description: '',
    configuration: {},
    llms: [
        {
            name: 'default',
            provider: 'openai',
            configuration: {
                'base-url': 'https://api.openai.com/v1',
                'model-name': '',
                'api-key': '',
            },
        },
    ],
    agents: [
        {
            name: 'default',
            description: '',
            provider: 'default',
            configuration: {
                'default-llm': 'default',
                language: 'Simplified Chinese',
            },
            semantic_models: [],
            semantic_model_tags: [],
        },
    ],
    embedding: {
        provider: 'bge-small-zh-v15-q',
        configuration: {},
    },
    embedding_store: {
        provider: 'duckdb',
        configuration: {},
    },
    content_store: {
        provider: 'default',
        configuration: {
            'max-results': 5,
            'min-score': 0.6,
        },
    },
    reranking: {
        provider: 'ms-marco-MiniLM-L6-v2-q',
        configuration: {},
    },
});

type TabType = 'basic' | 'llms' | 'agents' | 'embedding' | 'content';

export default function ProjectsManagement() {
    const { showToast } = useToastContext();
    const { token } = useAuthContext();
    const [projects, setProjects] = useState<DatProject[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingProject, setEditingProject] = useState<Partial<DatProject> | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>('basic');

    // 获取 API 基础路径
    const getApiBase = useCallback(() => {
        const baseEl = document.querySelector('base');
        const baseHref = baseEl?.getAttribute('href') || '/';
        return baseHref.endsWith('/') ? baseHref.slice(0, -1) : baseHref;
    }, []);

    // 获取请求头
    const getHeaders = useCallback((): HeadersInit => {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }, [token]);

    // 获取项目列表
    const fetchProjects = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${getApiBase()}/api/dat-projects`, {
                method: 'GET',
                headers: getHeaders(),
                credentials: 'include',
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: '获取项目列表失败' }));
                throw new Error(error.error || '获取项目列表失败');
            }

            const data = await response.json();
            setProjects(data.projects || []);
        } catch (error) {
            console.error('Error fetching projects:', error);
            showToast({
                message: `获取项目列表失败: ${error instanceof Error ? error.message : '未知错误'}`,
                status: 'error',
            });
        } finally {
            setIsLoading(false);
        }
    }, [getApiBase, getHeaders, showToast]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    // 保存项目
    const saveProject = async () => {
        if (!editingProject) return;

        if (!editingProject.name?.trim()) {
            showToast({ message: '请输入项目名称', status: 'error' });
            setActiveTab('basic');
            return;
        }

        setIsSaving(true);
        try {
            const isEdit = !!(editingProject as DatProject)._id;
            const url = isEdit
                ? `${getApiBase()}/api/dat-projects/${(editingProject as DatProject)._id}`
                : `${getApiBase()}/api/dat-projects`;

            const response = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: getHeaders(),
                credentials: 'include',
                body: JSON.stringify(editingProject),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: '保存失败' }));
                throw new Error(error.error || '保存失败');
            }

            showToast({
                message: isEdit ? '项目更新成功' : '项目创建成功',
                status: 'success',
            });

            setEditingProject(null);
            fetchProjects();
        } catch (error) {
            console.error('Error saving project:', error);
            showToast({
                message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`,
                status: 'error',
            });
        } finally {
            setIsSaving(false);
        }
    };

    // 删除项目
    const deleteProject = async (project: DatProject) => {
        if (!confirm(`确定要删除项目 "${project.name}" 吗？此操作不可撤销。`)) {
            return;
        }

        setDeletingId(project._id);
        try {
            const response = await fetch(`${getApiBase()}/api/dat-projects/${project._id}`, {
                method: 'DELETE',
                headers: getHeaders(),
                credentials: 'include',
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: '删除失败' }));
                throw new Error(error.error || '删除失败');
            }

            showToast({ message: '项目删除成功', status: 'success' });
            setProjects(prev => prev.filter(p => p._id !== project._id));
        } catch (error) {
            console.error('Error deleting project:', error);
            showToast({
                message: `删除失败: ${error instanceof Error ? error.message : '未知错误'}`,
                status: 'error',
            });
        } finally {
            setDeletingId(null);
        }
    };

    // 切换展开/折叠
    const toggleExpand = (projectId: string) => {
        setExpandedProjects(prev => {
            const next = new Set(prev);
            if (next.has(projectId)) {
                next.delete(projectId);
            } else {
                next.add(projectId);
            }
            return next;
        });
    };

    // 获取 Provider 选项
    const getProviderOptions = (type: string) => {
        const configs = providerConfigs[type] || {};
        return Object.entries(configs).map(([key, value]) => ({
            value: key,
            label: value.label || key,
        }));
    };

    // 获取 Provider 配置定义
    const getProviderConfigDef = (type: string, provider: string) => {
        return providerConfigs[type]?.[provider] || { label: provider, fields: [] };
    };

    // LLM Options for Selects
    const llmOptions = useMemo(() => {
        if (!editingProject?.llms) return [];
        return editingProject.llms.map(llm => ({
            label: llm.name,
            value: llm.name,
        }));
    }, [editingProject?.llms]);

    // Handlers for dynamic form updates
    const updateEditingProject = (key: keyof DatProject, value: any) => {
        setEditingProject(prev => (prev ? { ...prev, [key]: value } : prev));
    };

    const updateLlm = (index: number, changes: Partial<LlmConfig>) => {
        if (!editingProject?.llms) return;
        const newLlms = [...editingProject.llms];
        newLlms[index] = { ...newLlms[index], ...changes };
        updateEditingProject('llms', newLlms);
    };

    const removeLlm = (index: number) => {
        if (!editingProject?.llms) return;
        if (editingProject.llms.length <= 1) {
            showToast({ message: '至少需要一个 LLM 配置', status: 'warning' });
            return;
        }
        const newLlms = [...editingProject.llms];
        newLlms.splice(index, 1);
        updateEditingProject('llms', newLlms);
    };

    const addLlm = () => {
        if (!editingProject?.llms) return;
        const newLlms = [
            ...editingProject.llms,
            {
                name: `llm_${editingProject.llms.length}`,
                provider: 'openai',
                configuration: { 'base-url': 'https://api.openai.com/v1' }
            }
        ];
        updateEditingProject('llms', newLlms);
    };

    const updateAgent = (index: number, changes: Partial<AgentConfig>) => {
        if (!editingProject?.agents) return;
        const newAgents = [...editingProject.agents];
        newAgents[index] = { ...newAgents[index], ...changes };
        updateEditingProject('agents', newAgents);
    };

    const removeAgent = (index: number) => {
        if (!editingProject?.agents) return;
        if (editingProject.agents.length <= 1) {
            showToast({ message: '至少需要一个 Agent 配置', status: 'warning' });
            return;
        }
        const newAgents = [...editingProject.agents];
        newAgents.splice(index, 1);
        updateEditingProject('agents', newAgents);
    };

    const addAgent = () => {
        if (!editingProject?.agents) return;
        const newAgents = [
            ...editingProject.agents,
            {
                name: `agent_${editingProject.agents.length}`,
                provider: 'default',
                configuration: {
                    'default-llm': 'default',
                    language: 'Simplified Chinese'
                },
                semantic_models: [],
                semantic_model_tags: []
            }
        ];
        updateEditingProject('agents', newAgents);
    };

    // 格式化日期
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
            {/* 头部 */}
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-text-primary">项目管理</h2>
                    <p className="mt-1 text-sm text-text-secondary">
                        管理 DAT 项目配置，包括 LLM、Agent、嵌入模型等
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        onClick={fetchProjects}
                        disabled={isLoading}
                        className="btn btn-neutral border-token-border-light relative flex items-center gap-2 rounded-lg px-3 py-2"
                    >
                        <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                        {isLoading ? '加载中...' : '刷新'}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            setEditingProject(getDefaultProject());
                            setActiveTab('basic');
                        }}
                        className="btn btn-primary relative flex items-center gap-2 rounded-lg px-3 py-2"
                    >
                        <Plus className="h-4 w-4" />
                        创建项目
                    </Button>
                </div>
            </div>

            {/* 项目列表 */}
            <div className="flex-1 overflow-auto">
                {isLoading ? (
                    <div className="flex h-32 items-center justify-center text-text-secondary">
                        <p className="text-sm">加载中...</p>
                    </div>
                ) : projects.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center gap-2 text-text-secondary">
                        <FolderOpen className="h-8 w-8" />
                        <p className="text-sm">暂无项目</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {projects.map(project => (
                            <div
                                key={project._id}
                                className="rounded-lg border border-border-light bg-surface-primary"
                            >
                                {/* 项目头部 */}
                                <div className="flex items-center justify-between p-4">
                                    <div
                                        className="flex flex-1 cursor-pointer items-center gap-3"
                                        onClick={() => toggleExpand(project._id)}
                                    >
                                        <FolderOpen className="h-5 w-5 text-text-secondary" />
                                        <div className="flex-1">
                                            <h3 className="font-medium text-text-primary">{project.name}</h3>
                                            {project.description && (
                                                <p className="mt-0.5 text-sm text-text-secondary line-clamp-1">
                                                    {project.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 text-xs text-text-tertiary">
                                            {project.llms && project.llms.length > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <Server className="h-3 w-3" />
                                                    {project.llms.length} LLM
                                                </span>
                                            )}
                                            {project.agents && project.agents.length > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <Bot className="h-3 w-3" />
                                                    {project.agents.length} Agent
                                                </span>
                                            )}
                                            {project.embedding && (
                                                <span className="flex items-center gap-1">
                                                    <Database className="h-3 w-3" />
                                                    {project.embedding.provider}
                                                </span>
                                            )}
                                        </div>
                                        {expandedProjects.has(project._id) ? (
                                            <ChevronUp className="h-4 w-4 text-text-secondary" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4 text-text-secondary" />
                                        )}
                                    </div>
                                    <div className="ml-4 flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingProject({ ...project });
                                                setActiveTab('basic');
                                            }}
                                            className="rounded p-1.5 text-text-secondary transition-colors hover:bg-surface-hover"
                                            title="编辑"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteProject(project)}
                                            disabled={deletingId === project._id}
                                            className="rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                                            title="删除"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* 展开详情 */}
                                {expandedProjects.has(project._id) && (
                                    <div className="border-t border-border-light bg-surface-secondary p-4">
                                        {/* Simplified details view */}
                                        <div className="grid gap-4 text-sm md:grid-cols-2">
                                            <div>
                                                <span className="text-text-tertiary">版本:</span>{' '}
                                                <span className="text-text-primary">{project.version}</span>
                                            </div>
                                            <div>
                                                <span className="text-text-tertiary">更新时间:</span>{' '}
                                                <span className="text-text-primary">{formatDate(project.updatedAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 编辑/创建 Modal */}
            {editingProject && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
                    <div className="relative flex h-[90vh] w-full max-w-4xl flex-col rounded-lg border border-border-light bg-surface-primary shadow-lg overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-border-light p-4">
                            <h3 className="text-lg font-semibold text-text-primary">
                                {(editingProject as DatProject)._id ? '编辑项目' : '创建项目'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setEditingProject(null)}
                                className="rounded p-1 text-text-secondary hover:bg-surface-hover"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-border-light overflow-x-auto">
                            {[
                                { id: 'basic', label: '基本信息' },
                                { id: 'llms', label: '大模型 (LLM)' },
                                { id: 'agents', label: 'Agent 配置' },
                                { id: 'embedding', label: '嵌入配置' },
                                { id: 'content', label: '内容存储' },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabType)}
                                    className={cn(
                                        'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                                        activeTab === tab.id
                                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-text-secondary hover:text-text-primary'
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-surface-secondary/30">
                            {/* Basic Tab */}
                            {activeTab === 'basic' && (
                                <div className="space-y-4 max-w-xl">
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-text-primary">
                                            项目名称 <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={editingProject.name || ''}
                                            onChange={(e) => updateEditingProject('name', e.target.value)}
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            placeholder="请输入项目名称"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-text-primary">
                                            项目描述
                                        </label>
                                        <textarea
                                            value={editingProject.description || ''}
                                            onChange={(e) => updateEditingProject('description', e.target.value)}
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            rows={3}
                                            placeholder="请输入项目描述"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-text-primary">版本号</label>
                                        <input
                                            type="number"
                                            value={editingProject.version || 1}
                                            onChange={(e) => updateEditingProject('version', parseInt(e.target.value) || 1)}
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            min={1}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* LLMs Tab */}
                            {activeTab === 'llms' && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-text-secondary">
                                            LLM 配置列表 ({editingProject.llms?.length || 0})
                                        </span>
                                        <Button size="sm" onClick={addLlm} className="flex items-center gap-1">
                                            <Plus className="h-3 w-3" /> 添加 LLM
                                        </Button>
                                    </div>

                                    <div className="space-y-4">
                                        {editingProject.llms?.map((llm, index) => (
                                            <div key={index} className="rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm">
                                                <div className="mb-4 flex items-center justify-between border-b border-border-light pb-2">
                                                    <h4 className="font-medium text-text-primary">
                                                        {llm.name || `LLM ${index + 1}`}
                                                    </h4>
                                                    <button
                                                        onClick={() => removeLlm(index)}
                                                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded p-1"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>

                                                <div className="grid gap-4 md:grid-cols-2">
                                                    <div>
                                                        <label className="mb-1 block text-sm font-medium text-text-primary">名称</label>
                                                        <input
                                                            type="text"
                                                            value={llm.name}
                                                            onChange={(e) => updateLlm(index, { name: e.target.value })}
                                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-sm font-medium text-text-primary">Provider</label>
                                                        <select
                                                            value={llm.provider}
                                                            onChange={(e) => updateLlm(index, { provider: e.target.value, configuration: {} })}
                                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                        >
                                                            {getProviderOptions('llm').map(opt => (
                                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="mt-4">
                                                    <ProviderConfigForm
                                                        config={getProviderConfigDef('llm', llm.provider)}
                                                        value={llm.configuration}
                                                        onChange={(newConfig) => updateLlm(index, { configuration: newConfig })}
                                                        llmOptions={llmOptions}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Agents Tab */}
                            {activeTab === 'agents' && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-text-secondary">
                                            Agent 配置列表 ({editingProject.agents?.length || 0})
                                        </span>
                                        <Button size="sm" onClick={addAgent} className="flex items-center gap-1">
                                            <Plus className="h-3 w-3" /> 添加 Agent
                                        </Button>
                                    </div>

                                    <div className="space-y-4">
                                        {editingProject.agents?.map((agent, index) => (
                                            <div key={index} className="rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm">
                                                <div className="mb-4 flex items-center justify-between border-b border-border-light pb-2">
                                                    <h4 className="font-medium text-text-primary">
                                                        {agent.name || `Agent ${index + 1}`}
                                                    </h4>
                                                    <button
                                                        onClick={() => removeAgent(index)}
                                                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded p-1"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>

                                                <div className="grid gap-4 md:grid-cols-3 mb-4">
                                                    <div>
                                                        <label className="mb-1 block text-sm font-medium text-text-primary">名称</label>
                                                        <input
                                                            type="text"
                                                            value={agent.name}
                                                            onChange={(e) => updateAgent(index, { name: e.target.value })}
                                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-sm font-medium text-text-primary">Provider</label>
                                                        <select
                                                            value={agent.provider}
                                                            onChange={(e) => updateAgent(index, { provider: e.target.value, configuration: {} })}
                                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                        >
                                                            {getProviderOptions('agent').map(opt => (
                                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="mb-1 block text-sm font-medium text-text-primary">描述</label>
                                                        <input
                                                            type="text"
                                                            value={agent.description || ''}
                                                            onChange={(e) => updateAgent(index, { description: e.target.value })}
                                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="mb-4">
                                                    <label className="mb-1 block text-sm font-medium text-text-primary">Semantic Models (逗号分隔)</label>
                                                    <input
                                                        type="text"
                                                        value={agent.semantic_models?.join(', ') || ''}
                                                        onChange={(e) => updateAgent(index, {
                                                            semantic_models: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                                        })}
                                                        placeholder="model1, model2"
                                                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                    />
                                                </div>

                                                <div className="border-t border-border-light pt-4">
                                                    <h5 className="mb-3 text-sm font-medium text-text-primary">配置参数</h5>
                                                    <ProviderConfigForm
                                                        config={getProviderConfigDef('agent', agent.provider)}
                                                        value={agent.configuration}
                                                        onChange={(newConfig) => updateAgent(index, { configuration: newConfig })}
                                                        llmOptions={llmOptions}
                                                    />
                                                </div>

                                                {agent.provider === 'agentic' && (
                                                    <div className="mt-6 space-y-4 border-t border-border-light pt-4">
                                                        <h5 className="text-sm font-medium text-text-primary">高级配置</h5>
                                                        <EmailSenderConfig
                                                            value={agent.configuration['email-sender']}
                                                            onChange={(val) => {
                                                                const newConfig = { ...agent.configuration, 'email-sender': val };
                                                                updateAgent(index, { configuration: newConfig });
                                                            }}
                                                        />
                                                        <McpServersConfig
                                                            value={agent.configuration['mcp-servers']}
                                                            onChange={(val) => {
                                                                const newConfig = { ...agent.configuration, 'mcp-servers': val };
                                                                updateAgent(index, { configuration: newConfig });
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Embedding Tab */}
                            {activeTab === 'embedding' && (
                                <div className="space-y-8 max-w-3xl">
                                    {/* Embedding Model */}
                                    <div className="rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm">
                                        <h4 className="mb-4 text-base font-medium text-text-primary border-b border-border-light pb-2">
                                            Embedding 模型
                                        </h4>
                                        <div className="mb-4">
                                            <label className="mb-1 block text-sm font-medium text-text-primary">Provider</label>
                                            <select
                                                value={editingProject.embedding?.provider}
                                                onChange={(e) => updateEditingProject('embedding', { provider: e.target.value, configuration: {} })}
                                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            >
                                                {getProviderOptions('embedding').map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {editingProject.embedding && (
                                            <ProviderConfigForm
                                                config={getProviderConfigDef('embedding', editingProject.embedding.provider)}
                                                value={editingProject.embedding.configuration || {}}
                                                onChange={(newConfig) => updateEditingProject('embedding', { ...editingProject.embedding, configuration: newConfig })}
                                                llmOptions={llmOptions}
                                            />
                                        )}
                                    </div>

                                    {/* Embedding Store */}
                                    <div className="rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm">
                                        <h4 className="mb-4 text-base font-medium text-text-primary border-b border-border-light pb-2">
                                            Embedding Store
                                        </h4>
                                        <div className="mb-4">
                                            <label className="mb-1 block text-sm font-medium text-text-primary">Provider</label>
                                            <select
                                                value={editingProject.embedding_store?.provider}
                                                onChange={(e) => updateEditingProject('embedding_store', { provider: e.target.value, configuration: {} })}
                                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            >
                                                {getProviderOptions('embedding_store').map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {editingProject.embedding_store && (
                                            <ProviderConfigForm
                                                config={getProviderConfigDef('embedding_store', editingProject.embedding_store.provider)}
                                                value={editingProject.embedding_store.configuration || {}}
                                                onChange={(newConfig) => updateEditingProject('embedding_store', { ...editingProject.embedding_store, configuration: newConfig })}
                                                llmOptions={llmOptions}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Content & Reranking Tab */}
                            {activeTab === 'content' && (
                                <div className="space-y-8 max-w-3xl">
                                    {/* Content Store */}
                                    <div className="rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm">
                                        <h4 className="mb-4 text-base font-medium text-text-primary border-b border-border-light pb-2">
                                            Content Store
                                        </h4>
                                        <div className="mb-4">
                                            <label className="mb-1 block text-sm font-medium text-text-primary">Provider</label>
                                            <select
                                                value={editingProject.content_store?.provider}
                                                onChange={(e) => updateEditingProject('content_store', { provider: e.target.value, configuration: {} })}
                                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            >
                                                {getProviderOptions('content_store').map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {editingProject.content_store && (
                                            <ProviderConfigForm
                                                config={getProviderConfigDef('content_store', editingProject.content_store.provider)}
                                                value={editingProject.content_store.configuration || {}}
                                                onChange={(newConfig) => updateEditingProject('content_store', { ...editingProject.content_store, configuration: newConfig })}
                                                llmOptions={llmOptions}
                                            />
                                        )}
                                    </div>

                                    {/* Reranking */}
                                    <div className="rounded-lg border border-border-light bg-surface-primary p-4 shadow-sm">
                                        <h4 className="mb-4 text-base font-medium text-text-primary border-b border-border-light pb-2">
                                            Reranking (重排序模型)
                                        </h4>
                                        <div className="mb-4">
                                            <label className="mb-1 block text-sm font-medium text-text-primary">Provider</label>
                                            <select
                                                value={editingProject.reranking?.provider}
                                                onChange={(e) => updateEditingProject('reranking', { provider: e.target.value, configuration: {} })}
                                                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                            >
                                                <option value="">(无)</option>
                                                {getProviderOptions('reranking').map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {editingProject.reranking && editingProject.reranking.provider && (
                                            <ProviderConfigForm
                                                config={getProviderConfigDef('reranking', editingProject.reranking.provider)}
                                                value={editingProject.reranking.configuration || {}}
                                                onChange={(newConfig) => updateEditingProject('reranking', { ...editingProject.reranking, configuration: newConfig })}
                                                llmOptions={llmOptions}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-2 border-t border-border-light bg-surface-primary p-4">
                            <Button
                                type="button"
                                onClick={() => setEditingProject(null)}
                                className="btn btn-neutral rounded-lg px-4 py-2"
                            >
                                取消
                            </Button>
                            <Button
                                type="button"
                                onClick={saveProject}
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
