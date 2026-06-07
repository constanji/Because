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
    FileText,
    Code,
    ArrowLeftRight,
    Upload,
    Inbox,
    Tag,
    Network,
    Code2,
    RotateCw,
} from 'lucide-react';
import { providerConfigs, ProviderType } from '~/constants/projectConfig';
import ProviderConfigForm from './components/ProviderConfigForm';
import EmailSenderConfig from './components/EmailSenderConfig';
import McpServersConfig from './components/McpServersConfig';

const DAT_API_BASE = import.meta.env.VITE_DAT_OPENAPI_BASE_URL || 'http://localhost:8080';

interface OrgPreviewNode {
    key: string;
    title: string;
    children: OrgPreviewNode[];
}

// 简易树视图：避免引入额外 UI 库，单纯渲染嵌套缩进 + 折叠
function OrgTreeView({ nodes, depth }: { nodes: OrgPreviewNode[]; depth: number }) {
    return (
        <ul className={cn(depth === 0 ? 'space-y-1' : 'space-y-1 border-l border-border-light pl-3 ml-1')}>
            {nodes.map((n) => (
                <li key={n.key}>
                    <div className="text-text-primary">{n.title}</div>
                    {n.children && n.children.length > 0 && (
                        <OrgTreeView nodes={n.children} depth={depth + 1} />
                    )}
                </li>
            ))}
        </ul>
    );
}

// 将后端返回的驼峰命名字段转换为前端使用的下划线命名
// 后端可能返回 embeddingStore，但前端期望 embedding_store
const normalizeProject = (project: any): DatProject => {
    return {
        ...project,
        // 处理 embeddingStore -> embedding_store
        embedding_store: project.embedding_store || project.embeddingStore,
        // 处理 contentStore -> content_store
        content_store: project.content_store || project.contentStore,
        // 处理 semanticModels -> semantic_models (在 agents 中)
        agents: project.agents?.map((agent: any) => ({
            ...agent,
            semantic_models: agent.semantic_models || agent.semanticModels || [],
            semantic_model_tags: agent.semantic_model_tags || agent.semanticModelTags || [],
        })) || [],
    };
};

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

// Content Management Types
interface SqlPair {
    id: string;
    question: string;
    sql: string;
}

interface Synonym {
    id: string;
    word: string;
    synonyms: string[];
}

interface DocItem {
    id: string;
    content: string;
}

interface IndexEntry {
    id: string;
    indexNumber: string;
    standardName: string;
    aliases?: string[];
    source?: number | null;
    frequency?: string | null;
}

interface IndexUploadResult {
    upserted: number;
    skippedRows: number;
    errors: { rowNumber: number; message: string }[];
}

type ContentTabType = 'sql-pairs' | 'synonyms' | 'docs' | 'index-entries' | 'org-nodes';

// 默认项目数据
const getDefaultProject = (): Omit<
    DatProject,
    "_id" | "createdAt" | "updatedAt"
> => ({
    version: 1,
    name: "",
    description: "",
    configuration: {},
    llms: [
        {
            name: "default",
            provider: "openai",
            configuration: {
                "base-url": "https://api.openai.com/v1",
                "model-name": "",
                "api-key": "",
            },
        },
    ],
    agents: [
        {
            name: "default",
            description: "",
            provider: "default",
            configuration: {
                "default-llm": "default",
                language: "Simplified Chinese",
            },
            semantic_models: [],
            semantic_model_tags: [],
        },
    ],
    embedding: {
        provider: "bge-small-zh-v15-q",
        configuration: {},
    },
    embedding_store: {
        provider: "pgvector",
        configuration: {
            host: "pgvector",
            port: 5432,
            user: "dat",
            password: "dat123",
            database: "dat_embeddings",
            dimension: 512,
            "table-prefix": "dat_embeddings",
        },
    },
    content_store: {
        provider: "default",
        configuration: {
            "max-results": 5,
            "min-score": 0.6,
        },
    },
    reranking: {
        provider: "ms-marco-MiniLM-L6-v2-q",
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

    // Content Management State
    const [contentManagementProject, setContentManagementProject] = useState<DatProject | null>(null);
    const [contentActiveTab, setContentActiveTab] = useState<ContentTabType>('sql-pairs');
    const [contentLoading, setContentLoading] = useState(false);

    // SQL Pairs
    const [sqlPairs, setSqlPairs] = useState<SqlPair[]>([]);
    const [sqlSearchQuery, setSqlSearchQuery] = useState('');
    const [sqlModalVisible, setSqlModalVisible] = useState(false);
    const [sqlForm, setSqlForm] = useState({ question: '', sql: '' });

    // Synonyms
    const [synonyms, setSynonyms] = useState<Synonym[]>([]);
    const [synSearchQuery, setSynSearchQuery] = useState('');
    const [synModalVisible, setSynModalVisible] = useState(false);
    const [synForm, setSynForm] = useState({ word: '', synonyms: '' });

    // Docs
    const [docs, setDocs] = useState<DocItem[]>([]);
    const [docSearchQuery, setDocSearchQuery] = useState('');
    const [docModalVisible, setDocModalVisible] = useState(false);
    const [docForm, setDocForm] = useState({ content: '' });
    const [uploading, setUploading] = useState(false);

    // Index Entries (指标库)
    const [indexEntries, setIndexEntries] = useState<IndexEntry[]>([]);
    const [indexSearchQuery, setIndexSearchQuery] = useState('');
    const [indexModalVisible, setIndexModalVisible] = useState(false);
    const [indexEditingId, setIndexEditingId] = useState<string | null>(null);
    const [indexForm, setIndexForm] = useState<{
        indexNumber: string;
        standardName: string;
        aliases: string;
        source: number | undefined;
        frequency: string;
    }>({ indexNumber: '', standardName: '', aliases: '', source: undefined, frequency: '' });
    const [indexUploadModalVisible, setIndexUploadModalVisible] = useState(false);
    const [indexUploading, setIndexUploading] = useState(false);
    const [indexUploadResult, setIndexUploadResult] = useState<IndexUploadResult | null>(null);

    // Org Nodes (机构信息 JSON)
    const ORG_NODES_TEMPLATE = `[
  {
    "orgCode": "H0001",
    "orgName": "总行",
    "orgType": "HEAD_OFFICE",
    "dataScope": "ALL",
    "children": [
      {
        "orgCode": "B0001",
        "orgName": "北京分行",
        "orgType": "BRANCH",
        "dataScope": "SELF_AND_DESCENDANTS",
        "children": [
          { "orgCode": "S00001", "orgName": "北京城南支行", "orgType": "SUB_BRANCH", "dataScope": "SELF" }
        ]
      }
    ]
  }
]`;
    const [orgNodesJsonText, setOrgNodesJsonText] = useState<string>(ORG_NODES_TEMPLATE);
    const [orgNodesJsonError, setOrgNodesJsonError] = useState<string>('');
    const [orgNodesPreview, setOrgNodesPreview] = useState<OrgPreviewNode[]>([]);
    const [orgNodesSaving, setOrgNodesSaving] = useState(false);
    const [orgNodesLoading, setOrgNodesLoading] = useState(false);

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
            // 对每个项目进行字段名规范化，处理驼峰命名到下划线命名的转换
            const normalizedProjects = (data.projects || []).map(normalizeProject);
            setProjects(normalizedProjects);
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

    // ============ Content Management API Functions ============

    // Open content management for a project
    const openContentManagement = (project: DatProject) => {
        setContentManagementProject(project);
        setContentActiveTab('sql-pairs');
        setSqlPairs([]);
        setSynonyms([]);
        setDocs([]);
        setIndexEntries([]);
        setIndexSearchQuery('');
        setIndexUploadResult(null);
        setOrgNodesJsonText(ORG_NODES_TEMPLATE);
        setOrgNodesJsonError('');
        setOrgNodesPreview([]);
        setSqlSearchQuery('');
        setSynSearchQuery('');
        setDocSearchQuery('');
        loadSqlPairs(project._id);
    };

    // Close content management
    const closeContentManagement = () => {
        setContentManagementProject(null);
        setSqlPairs([]);
        setSynonyms([]);
        setDocs([]);
        setIndexEntries([]);
        setOrgNodesJsonText(ORG_NODES_TEMPLATE);
        setOrgNodesPreview([]);
    };

    // ---- SQL Pairs ----
    const loadSqlPairs = async (projectId: string) => {
        setContentLoading(true);
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/sql-pairs?projectId=${projectId}`);
            if (response.ok) {
                const data = await response.json();
                setSqlPairs(data || []);
            }
        } catch (error) {
            console.error('Failed to load SQL pairs:', error);
            setSqlPairs([]);
        } finally {
            setContentLoading(false);
        }
    };

    const searchSqlPairs = async () => {
        if (!contentManagementProject || !sqlSearchQuery.trim()) {
            if (contentManagementProject) loadSqlPairs(contentManagementProject._id);
            return;
        }
        setContentLoading(true);
        try {
            const response = await fetch(
                `${DAT_API_BASE}/api/v1/content-store/sql-pairs/retrieve?projectId=${contentManagementProject._id}&query=${encodeURIComponent(sqlSearchQuery)}`
            );
            if (response.ok) {
                const data = await response.json();
                setSqlPairs(data || []);
                showToast({ message: `检索到 ${data?.length || 0} 个相关结果`, status: 'success' });
            }
        } catch (error) {
            showToast({ message: `检索失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        } finally {
            setContentLoading(false);
        }
    };

    const handleAddSqlPair = async () => {
        if (!contentManagementProject || !sqlForm.question || !sqlForm.sql) {
            showToast({ message: '请填写问题和SQL', status: 'warning' });
            return;
        }
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/sql-pairs?projectId=${contentManagementProject._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sqlForm)
            });
            if (response.ok) {
                showToast({ message: '添加成功', status: 'success' });
                setSqlModalVisible(false);
                setSqlForm({ question: '', sql: '' });
                loadSqlPairs(contentManagementProject._id);
            } else {
                throw new Error('添加失败');
            }
        } catch (error) {
            showToast({ message: `添加失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleRemoveSqlPair = async (id: string) => {
        if (!contentManagementProject) return;
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/sql-pairs/${id}?projectId=${contentManagementProject._id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast({ message: '删除成功', status: 'success' });
                loadSqlPairs(contentManagementProject._id);
            }
        } catch (error) {
            showToast({ message: `删除失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleClearAllSqlPairs = async () => {
        if (!contentManagementProject) return;
        if (!confirm('确定要清空所有SQL示例对吗？此操作不可恢复！')) return;
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/sql-pairs?projectId=${contentManagementProject._id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast({ message: '清空成功', status: 'success' });
                setSqlPairs([]);
            }
        } catch (error) {
            showToast({ message: `清空失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    // ---- Synonyms ----
    const loadSynonyms = async (projectId: string) => {
        setContentLoading(true);
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/synonyms?projectId=${projectId}`);
            if (response.ok) {
                const data = await response.json();
                setSynonyms(data || []);
            }
        } catch (error) {
            console.error('Failed to load synonyms:', error);
            setSynonyms([]);
        } finally {
            setContentLoading(false);
        }
    };

    const searchSynonyms = async () => {
        if (!contentManagementProject || !synSearchQuery.trim()) {
            if (contentManagementProject) loadSynonyms(contentManagementProject._id);
            return;
        }
        setContentLoading(true);
        try {
            const response = await fetch(
                `${DAT_API_BASE}/api/v1/content-store/synonyms/retrieve?projectId=${contentManagementProject._id}&query=${encodeURIComponent(synSearchQuery)}`
            );
            if (response.ok) {
                const data = await response.json();
                setSynonyms(data || []);
                showToast({ message: `检索到 ${data?.length || 0} 个相关结果`, status: 'success' });
            }
        } catch (error) {
            showToast({ message: `检索失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        } finally {
            setContentLoading(false);
        }
    };

    const handleAddSynonym = async () => {
        if (!contentManagementProject || !synForm.word || !synForm.synonyms) {
            showToast({ message: '请填写词和同义词', status: 'warning' });
            return;
        }
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/synonyms?projectId=${contentManagementProject._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    word: synForm.word,
                    synonyms: synForm.synonyms.split(',').map(s => s.trim()).filter(Boolean)
                })
            });
            if (response.ok) {
                showToast({ message: '添加成功', status: 'success' });
                setSynModalVisible(false);
                setSynForm({ word: '', synonyms: '' });
                loadSynonyms(contentManagementProject._id);
            } else {
                throw new Error('添加失败');
            }
        } catch (error) {
            showToast({ message: `添加失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleRemoveSynonym = async (id: string) => {
        if (!contentManagementProject) return;
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/synonyms/${id}?projectId=${contentManagementProject._id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast({ message: '删除成功', status: 'success' });
                loadSynonyms(contentManagementProject._id);
            }
        } catch (error) {
            showToast({ message: `删除失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleClearAllSynonyms = async () => {
        if (!contentManagementProject) return;
        if (!confirm('确定要清空所有同义词吗？此操作不可恢复！')) return;
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/synonyms?projectId=${contentManagementProject._id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast({ message: '清空成功', status: 'success' });
                setSynonyms([]);
            }
        } catch (error) {
            showToast({ message: `清空失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    // ---- Docs ----
    const loadDocs = async (projectId: string) => {
        setContentLoading(true);
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/docs?projectId=${projectId}`);
            if (response.ok) {
                const data = await response.json();
                setDocs(data || []);
            }
        } catch (error) {
            console.error('Failed to load docs:', error);
            setDocs([]);
        } finally {
            setContentLoading(false);
        }
    };

    const searchDocs = async () => {
        if (!contentManagementProject || !docSearchQuery.trim()) {
            if (contentManagementProject) loadDocs(contentManagementProject._id);
            return;
        }
        setContentLoading(true);
        try {
            const response = await fetch(
                `${DAT_API_BASE}/api/v1/content-store/docs/retrieve?projectId=${contentManagementProject._id}&query=${encodeURIComponent(docSearchQuery)}`
            );
            if (response.ok) {
                const data = await response.json();
                setDocs(data || []);
                showToast({ message: `检索到 ${data?.length || 0} 个相关结果`, status: 'success' });
            }
        } catch (error) {
            showToast({ message: `检索失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        } finally {
            setContentLoading(false);
        }
    };

    const handleAddDoc = async () => {
        if (!contentManagementProject || !docForm.content) {
            showToast({ message: '请填写知识内容', status: 'warning' });
            return;
        }
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/docs?projectId=${contentManagementProject._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: docForm.content })
            });
            if (response.ok) {
                showToast({ message: '添加成功', status: 'success' });
                setDocModalVisible(false);
                setDocForm({ content: '' });
                loadDocs(contentManagementProject._id);
            } else {
                throw new Error('添加失败');
            }
        } catch (error) {
            showToast({ message: `添加失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleRemoveDoc = async (id: string) => {
        if (!contentManagementProject) return;
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/docs/${id}?projectId=${contentManagementProject._id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast({ message: '删除成功', status: 'success' });
                loadDocs(contentManagementProject._id);
            }
        } catch (error) {
            showToast({ message: `删除失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleClearAllDocs = async () => {
        if (!contentManagementProject) return;
        if (!confirm('确定要清空所有业务知识吗？此操作不可恢复！')) return;
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/docs?projectId=${contentManagementProject._id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast({ message: '清空成功', status: 'success' });
                setDocs([]);
            }
        } catch (error) {
            showToast({ message: `清空失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!contentManagementProject || !e.target.files?.[0]) return;
        const file = e.target.files[0];
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch(`${DAT_API_BASE}/api/v1/content-store/docs/upload?projectId=${contentManagementProject._id}`, {
                method: 'POST',
                body: formData
            });
            if (response.ok) {
                const result = await response.json();
                showToast({ message: `文件 "${result.filename}" 上传成功`, status: 'success' });
                loadDocs(contentManagementProject._id);
            } else {
                throw new Error('上传失败');
            }
        } catch (error) {
            showToast({ message: `上传失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    // Handle content tab change
    const handleContentTabChange = (tab: ContentTabType) => {
        setContentActiveTab(tab);
        if (!contentManagementProject) return;
        if (tab === 'sql-pairs') {
            loadSqlPairs(contentManagementProject._id);
        } else if (tab === 'synonyms') {
            loadSynonyms(contentManagementProject._id);
        } else if (tab === 'index-entries') {
            loadIndexEntries(contentManagementProject._id);
        } else if (tab === 'org-nodes') {
            loadOrgNodes(contentManagementProject._id);
        } else {
            loadDocs(contentManagementProject._id);
        }
    };

    // ============ Index Entries (指标库) ============
    const sourceLabel = (n: number | null | undefined) => {
        if (n == null) return '-';
        return ({ 1: '人行', 2: '银监', 3: '省联社' } as Record<number, string>)[n] || String(n);
    };

    const loadIndexEntries = async (projectId: string) => {
        setContentLoading(true);
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/index/entries?projectId=${projectId}`);
            if (response.ok) {
                const data = await response.json();
                setIndexEntries(data || []);
            } else {
                setIndexEntries([]);
            }
        } catch (error) {
            console.error('Failed to load index entries:', error);
            setIndexEntries([]);
        } finally {
            setContentLoading(false);
        }
    };

    // 后端 list 不带模糊检索，前端本地子串过滤
    const searchIndexEntries = async () => {
        if (!contentManagementProject) return;
        const projectId = contentManagementProject._id;
        setContentLoading(true);
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/index/entries?projectId=${projectId}`);
            if (!response.ok) throw new Error('加载失败');
            const all: IndexEntry[] = await response.json();
            const q = indexSearchQuery.trim();
            if (!q) {
                setIndexEntries(all || []);
            } else {
                const filtered = (all || []).filter((e) =>
                    (e.indexNumber || '').includes(q) ||
                    (e.standardName || '').includes(q) ||
                    (e.aliases || []).some((a) => (a || '').includes(q))
                );
                setIndexEntries(filtered);
                showToast({ message: `本地过滤到 ${filtered.length} 个结果`, status: 'success' });
            }
        } catch (error) {
            showToast({ message: `检索失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        } finally {
            setContentLoading(false);
        }
    };

    const openAddIndexEntry = () => {
        setIndexEditingId(null);
        setIndexForm({ indexNumber: '', standardName: '', aliases: '', source: undefined, frequency: '' });
        setIndexModalVisible(true);
    };

    const openEditIndexEntry = (record: IndexEntry) => {
        setIndexEditingId(record.id);
        setIndexForm({
            indexNumber: record.indexNumber,
            standardName: record.standardName,
            aliases: (record.aliases || []).join('/'),
            source: record.source ?? undefined,
            frequency: record.frequency || '',
        });
        setIndexModalVisible(true);
    };

    const handleSaveIndexEntry = async () => {
        if (!contentManagementProject) return;
        const { indexNumber, standardName } = indexForm;
        if (!indexNumber.trim()) {
            showToast({ message: '请填写指标编码', status: 'warning' });
            return;
        }
        if (!standardName.trim()) {
            showToast({ message: '请填写指标名称', status: 'warning' });
            return;
        }
        const aliases = (indexForm.aliases || '')
            .split(/[/,;、，；]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && s !== standardName.trim());
        try {
            const response = await fetch(
                `${DAT_API_BASE}/api/v1/index/entries?projectId=${contentManagementProject._id}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        indexNumber: indexNumber.trim(),
                        standardName: standardName.trim(),
                        aliases,
                        source: indexForm.source,
                        frequency: (indexForm.frequency || '').trim() || null,
                    }),
                }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showToast({ message: indexEditingId ? '更新成功' : '添加成功', status: 'success' });
            setIndexModalVisible(false);
            loadIndexEntries(contentManagementProject._id);
        } catch (error) {
            showToast({
                message: `${indexEditingId ? '更新' : '添加'}失败: ${error instanceof Error ? error.message : '未知错误'}`,
                status: 'error',
            });
        }
    };

    const handleRemoveIndexEntry = async (id: string) => {
        if (!contentManagementProject) return;
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/index/entries/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showToast({ message: '删除成功', status: 'success' });
            loadIndexEntries(contentManagementProject._id);
        } catch (error) {
            showToast({ message: `删除失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleClearAllIndexEntries = async () => {
        if (!contentManagementProject) return;
        if (!confirm('确定要清空该项目下所有指标吗？此操作不可恢复！')) return;
        try {
            const response = await fetch(
                `${DAT_API_BASE}/api/v1/index/entries/all?projectId=${contentManagementProject._id}`,
                { method: 'DELETE' }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showToast({ message: '清空成功', status: 'success' });
            setIndexEntries([]);
        } catch (error) {
            showToast({ message: `清空失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleUploadIndexEntryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!contentManagementProject || !e.target.files?.[0]) return;
        const file = e.target.files[0];
        setIndexUploading(true);
        setIndexUploadResult(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch(
                `${DAT_API_BASE}/api/v1/index/entries/upload?projectId=${contentManagementProject._id}`,
                { method: 'POST', body: formData }
            );
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || `HTTP ${response.status}`);
            }
            const result: IndexUploadResult = await response.json();
            setIndexUploadResult(result);
            const errCount = (result.errors || []).length;
            if (errCount === 0) {
                showToast({
                    message: `导入成功：写入 ${result.upserted} 条，跳过空行 ${result.skippedRows} 行`,
                    status: 'success',
                });
            } else {
                showToast({
                    message: `导入完成：写入 ${result.upserted} 条，跳过 ${result.skippedRows} 行，${errCount} 行错误（详见弹窗）`,
                    status: 'warning',
                });
            }
            loadIndexEntries(contentManagementProject._id);
        } catch (error) {
            showToast({ message: `上传失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        } finally {
            setIndexUploading(false);
            e.target.value = '';
        }
    };

    // ============ Org Nodes (机构信息 JSON 模型) ============

    const stripForEditor = (nodes: any[]): any[] =>
        (nodes || []).map((n) => {
            const obj: any = {
                orgCode: n.orgCode,
                orgName: n.orgName,
                orgType: n.orgType,
                dataScope: n.dataScope,
            };
            if (n.children && n.children.length > 0) {
                obj.children = stripForEditor(n.children);
            }
            return obj;
        });

    const jsonToPreviewTree = (nodes: any[]): OrgPreviewNode[] =>
        (nodes || []).map((n) => ({
            key: `org-${n.orgCode}`,
            title: `${n.orgCode} ${n.orgName || ''} [${n.orgType}/${n.dataScope}]`,
            children: jsonToPreviewTree(n.children || []),
        }));

    const parseOrgNodesJson = (text?: string): any[] | null => {
        const source = text ?? orgNodesJsonText;
        try {
            const parsed = JSON.parse(source || '[]');
            if (!Array.isArray(parsed)) throw new Error('根必须是数组');
            setOrgNodesPreview(jsonToPreviewTree(parsed));
            setOrgNodesJsonError('');
            return parsed;
        } catch (err) {
            setOrgNodesJsonError('JSON 格式错误: ' + (err instanceof Error ? err.message : String(err)));
            setOrgNodesPreview([]);
            return null;
        }
    };

    const loadOrgNodes = async (projectId: string) => {
        setOrgNodesLoading(true);
        try {
            const response = await fetch(`${DAT_API_BASE}/api/v1/org/nodes?projectId=${projectId}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const tree = await response.json();
            const nextText = tree && tree.length > 0 ? JSON.stringify(stripForEditor(tree), null, 2) : ORG_NODES_TEMPLATE;
            setOrgNodesJsonText(nextText);
            parseOrgNodesJson(nextText);
        } catch (error) {
            showToast({ message: `加载机构信息失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
            setOrgNodesJsonText(ORG_NODES_TEMPLATE);
            parseOrgNodesJson(ORG_NODES_TEMPLATE);
        } finally {
            setOrgNodesLoading(false);
        }
    };

    const handleSaveOrgNodes = async () => {
        if (!contentManagementProject) return;
        const parsed = parseOrgNodesJson();
        if (parsed === null) {
            showToast({ message: 'JSON 有错误，请先修正', status: 'error' });
            return;
        }
        setOrgNodesSaving(true);
        try {
            const response = await fetch(
                `${DAT_API_BASE}/api/v1/org/nodes?projectId=${contentManagementProject._id}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(parsed),
                }
            );
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.message || `HTTP ${response.status}`);
            }
            showToast({ message: `保存成功，${body?.inserted || 0} 个机构已生效`, status: 'success' });
        } catch (error) {
            showToast({ message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        } finally {
            setOrgNodesSaving(false);
        }
    };

    const handleClearOrgNodes = async () => {
        if (!contentManagementProject) return;
        if (!confirm('将清空该项目下全部机构信息，清空后所有指标问数权限失效。是否继续？')) return;
        try {
            const response = await fetch(
                `${DAT_API_BASE}/api/v1/org/nodes/all?projectId=${contentManagementProject._id}`,
                { method: 'DELETE' }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showToast({ message: '清空成功', status: 'success' });
            setOrgNodesJsonText(ORG_NODES_TEMPLATE);
            parseOrgNodesJson(ORG_NODES_TEMPLATE);
        } catch (error) {
            showToast({ message: `清空失败: ${error instanceof Error ? error.message : '未知错误'}`, status: 'error' });
        }
    };

    const handleFormatOrgJson = () => {
        const parsed = parseOrgNodesJson();
        if (parsed !== null) {
            setOrgNodesJsonText(JSON.stringify(parsed, null, 2));
        }
    };

    return (
        <div className="flex h-full flex-col">
            {/* 头部 */}
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-text-primary">项目管理</h2>
                    <p className="mt-1 text-sm text-text-secondary">
                        管理 BecauseAI 项目配置，包括 LLM、Agent、嵌入模型、内容管理等
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
                                            onClick={() => openContentManagement(project)}
                                            className="rounded p-1.5 text-text-secondary transition-colors hover:bg-surface-hover"
                                            title="内容管理"
                                        >
                                            <FileText className="h-4 w-4" />
                                        </button>
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
                                            嵌入模型配置
                                        </h4>
                                        <div className="mb-4">
                                            <label className="mb-1 block text-sm font-medium text-text-primary">供应商</label>
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
                                            嵌入存储模型配置
                                        </h4>
                                        <div className="mb-4">
                                            <label className="mb-1 block text-sm font-medium text-text-primary">供应商</label>
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
                                            内容存储配置
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
                                            重排序模型
                                        </h4>
                                        <div className="mb-4">
                                            <label className="mb-1 block text-sm font-medium text-text-primary">供应商</label>
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

            {/* Content Management Modal */}
            {contentManagementProject && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
                    <div className="relative flex h-[90vh] w-full max-w-5xl flex-col rounded-lg border border-border-light bg-surface-primary shadow-lg overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-border-light p-4">
                            <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-text-secondary" />
                                <div>
                                    <h3 className="text-lg font-semibold text-text-primary">内容管理</h3>
                                    <p className="text-xs text-text-tertiary">{contentManagementProject.name}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={closeContentManagement}
                                className="rounded p-1 text-text-secondary hover:bg-surface-hover"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-border-light px-4">
                            <button
                                type="button"
                                onClick={() => handleContentTabChange('sql-pairs')}
                                className={cn(
                                    "px-4 py-3 text-sm font-medium border-b-2 -mb-[1px] transition-colors flex items-center gap-1.5",
                                    contentActiveTab === 'sql-pairs'
                                        ? "border-blue-500 text-blue-600"
                                        : "border-transparent text-text-secondary hover:text-text-primary"
                                )}
                            >
                                <Code className="h-4 w-4" />
                                SQL 示例对
                            </button>
                            <button
                                type="button"
                                onClick={() => handleContentTabChange('synonyms')}
                                className={cn(
                                    "px-4 py-3 text-sm font-medium border-b-2 -mb-[1px] transition-colors flex items-center gap-1.5",
                                    contentActiveTab === 'synonyms'
                                        ? "border-blue-500 text-blue-600"
                                        : "border-transparent text-text-secondary hover:text-text-primary"
                                )}
                            >
                                <ArrowLeftRight className="h-4 w-4" />
                                同义词
                            </button>
                            <button
                                type="button"
                                onClick={() => handleContentTabChange('docs')}
                                className={cn(
                                    "px-4 py-3 text-sm font-medium border-b-2 -mb-[1px] transition-colors flex items-center gap-1.5",
                                    contentActiveTab === 'docs'
                                        ? "border-blue-500 text-blue-600"
                                        : "border-transparent text-text-secondary hover:text-text-primary"
                                )}
                            >
                                <FileText className="h-4 w-4" />
                                业务知识
                            </button>
                            <button
                                type="button"
                                onClick={() => handleContentTabChange('index-entries')}
                                className={cn(
                                    "px-4 py-3 text-sm font-medium border-b-2 -mb-[1px] transition-colors flex items-center gap-1.5",
                                    contentActiveTab === 'index-entries'
                                        ? "border-blue-500 text-blue-600"
                                        : "border-transparent text-text-secondary hover:text-text-primary"
                                )}
                            >
                                <Tag className="h-4 w-4" />
                                指标库
                            </button>
                            <button
                                type="button"
                                onClick={() => handleContentTabChange('org-nodes')}
                                className={cn(
                                    "px-4 py-3 text-sm font-medium border-b-2 -mb-[1px] transition-colors flex items-center gap-1.5",
                                    contentActiveTab === 'org-nodes'
                                        ? "border-blue-500 text-blue-600"
                                        : "border-transparent text-text-secondary hover:text-text-primary"
                                )}
                            >
                                <Network className="h-4 w-4" />
                                机构信息
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-auto p-4">
                            {/* SQL Pairs Tab */}
                            {contentActiveTab === 'sql-pairs' && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                                                <input
                                                    type="text"
                                                    value={sqlSearchQuery}
                                                    onChange={(e) => setSqlSearchQuery(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && searchSqlPairs()}
                                                    placeholder="输入问题检索相关SQL..."
                                                    className="w-72 pl-8 pr-3 py-2 text-sm rounded-md border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                />
                                            </div>
                                            <Button onClick={searchSqlPairs} className="btn btn-neutral text-sm">
                                                检索
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button onClick={() => setSqlModalVisible(true)} className="btn btn-primary text-sm flex items-center gap-1">
                                                <Plus className="h-4 w-4" /> 添加
                                            </Button>
                                            <Button
                                                onClick={handleClearAllSqlPairs}
                                                disabled={sqlPairs.length === 0}
                                                className="btn btn-neutral text-sm text-red-500 disabled:opacity-50"
                                            >
                                                清空全部
                                            </Button>
                                        </div>
                                    </div>
                                    {contentLoading ? (
                                        <div className="flex h-40 items-center justify-center text-text-secondary">
                                            <p className="text-sm">加载中...</p>
                                        </div>
                                    ) : sqlPairs.length === 0 ? (
                                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-secondary">
                                            <Code className="h-8 w-8" />
                                            <p className="text-sm">暂无SQL示例对</p>
                                        </div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse text-white">
                                          <thead>
                                          <tr className="bg-surface-secondary">
                                            <th className="border border-border-light px-3 py-2 text-left font-medium w-2/5 text-white">问题</th>
                                            <th className="border border-border-light px-3 py-2 text-left font-medium text-white">SQL</th>
                                            <th className="border border-border-light px-3 py-2 text-center font-medium w-16 text-white">操作</th>
                                          </tr>
                                          </thead>
                                          <tbody>
                                          {sqlPairs.map((item, idx) => (
                                            <tr key={item.id} className={idx % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary/50'}>
                                              <td className="border border-border-light px-3 py-2 text-white">{item.question}</td>
                                              <td className="border border-border-light px-3 py-2 text-white">
                                                <code className="text-xs font-mono text-white bg-gray-800/60 px-1.5 py-0.5 rounded">
                                                  {item.sql}
                                                </code>
                                              </td>
                                              <td className="border border-border-light px-3 py-2 text-center">
                                                <button
                                                  onClick={() => {
                                                    if (confirm('确定删除此项吗？')) handleRemoveSqlPair(item.id);
                                                  }}
                                                  className="text-red-400 hover:text-red-300 transition-colors"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                </div>
                            )}

                            {/* Synonyms Tab */}
                            {contentActiveTab === 'synonyms' && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                                                <input
                                                    type="text"
                                                    value={synSearchQuery}
                                                    onChange={(e) => setSynSearchQuery(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && searchSynonyms()}
                                                    placeholder="输入词语检索相关同义词..."
                                                    className="w-72 pl-8 pr-3 py-2 text-sm rounded-md border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                />
                                            </div>
                                            <Button onClick={searchSynonyms} className="btn btn-neutral text-sm">
                                                检索
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button onClick={() => setSynModalVisible(true)} className="btn btn-primary text-sm flex items-center gap-1">
                                                <Plus className="h-4 w-4" /> 添加
                                            </Button>
                                            <Button
                                                onClick={handleClearAllSynonyms}
                                                disabled={synonyms.length === 0}
                                                className="btn btn-neutral text-sm text-red-500 disabled:opacity-50"
                                            >
                                                清空全部
                                            </Button>
                                        </div>
                                    </div>
                                    {contentLoading ? (
                                        <div className="flex h-40 items-center justify-center text-text-secondary">
                                            <p className="text-sm">加载中...</p>
                                        </div>
                                    ) : synonyms.length === 0 ? (
                                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-secondary">
                                            <ArrowLeftRight className="h-8 w-8" />
                                            <p className="text-sm">暂无同义词</p>
                                        </div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse text-white">
                                          <thead>
                                          <tr className="bg-surface-secondary">
                                            <th className="border border-border-light px-3 py-2 text-left font-medium w-32 text-white">词</th>
                                            <th className="border border-border-light px-3 py-2 text-left font-medium text-white">同义词</th>
                                            <th className="border border-border-light px-3 py-2 text-center font-medium w-16 text-white">操作</th>
                                          </tr>
                                          </thead>
                                          <tbody>
                                          {synonyms.map((item, idx) => (
                                            <tr key={item.id} className={idx % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary/50'}>
                                              <td className="border border-border-light px-3 py-2 font-medium text-white">{item.word}</td>
                                              <td className="border border-border-light px-3 py-2 text-white">
                                                <div className="flex flex-wrap gap-1">
                                                  {item.synonyms.map((syn, i) => (
                                                    <span key={i} className="inline-flex items-center rounded-full bg-blue-900/40 px-2 py-0.5 text-xs text-blue-300 ring-1 ring-inset ring-blue-500/20">
                                    {syn}
                                </span>
                                                  ))}
                                                </div>
                                              </td>
                                              <td className="border border-border-light px-3 py-2 text-center">
                                                <button
                                                  onClick={() => {
                                                    if (confirm('确定删除此项吗？')) handleRemoveSynonym(item.id);
                                                  }}
                                                  className="text-red-400 hover:text-red-300 transition-colors"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                </div>
                            )}

                            {/* Docs Tab */}
                            {contentActiveTab === 'docs' && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                                                <input
                                                    type="text"
                                                    value={docSearchQuery}
                                                    onChange={(e) => setDocSearchQuery(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && searchDocs()}
                                                    placeholder="输入关键词检索相关知识..."
                                                    className="w-72 pl-8 pr-3 py-2 text-sm rounded-md border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                />
                                            </div>
                                            <Button onClick={searchDocs} className="btn btn-neutral text-sm">
                                                检索
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button onClick={() => setDocModalVisible(true)} className="btn btn-primary text-sm flex items-center gap-1">
                                                <Plus className="h-4 w-4" /> 添加文本
                                            </Button>
                                            <label className="btn btn-neutral text-sm flex items-center gap-1 cursor-pointer">
                                                <Upload className="h-4 w-4" />
                                                {uploading ? '上传中...' : '上传文件'}
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept=".txt,.md,.pdf,.doc,.docx,.html,.xml,.json,.csv"
                                                    onChange={handleFileUpload}
                                                    disabled={uploading}
                                                />
                                            </label>
                                            <Button
                                                onClick={handleClearAllDocs}
                                                disabled={docs.length === 0}
                                                className="btn btn-neutral text-sm text-red-500 disabled:opacity-50"
                                            >
                                                清空全部
                                            </Button>
                                        </div>
                                    </div>
                                    {contentLoading ? (
                                        <div className="flex h-40 items-center justify-center text-text-secondary">
                                            <p className="text-sm">加载中...</p>
                                        </div>
                                    ) : docs.length === 0 ? (
                                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-secondary">
                                            <Inbox className="h-8 w-8" />
                                            <p className="text-sm">暂无业务知识</p>
                                        </div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse text-white">
                                          <thead>
                                          <tr className="bg-surface-secondary">
                                            <th className="border border-border-light px-3 py-2 text-left font-medium w-16 text-white">序号</th>
                                            <th className="border border-border-light px-3 py-2 text-left font-medium text-white">内容</th>
                                            <th className="border border-border-light px-3 py-2 text-center font-medium w-16 text-white">操作</th>
                                          </tr>
                                          </thead>
                                          <tbody>
                                          {docs.map((item, idx) => (
                                            <tr
                                              key={item.id}
                                              className={idx % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary/50'}
                                            >
                                              <td className="border border-border-light px-3 py-2 text-center text-white">{idx + 1}</td>
                                              <td className="border border-border-light px-3 py-2 text-white">
                                                <p className="line-clamp-2 text-white">{item.content}</p>
                                              </td>
                                              <td className="border border-border-light px-3 py-2 text-center">
                                                <button
                                                  onClick={() => {
                                                    if (confirm('确定删除此项吗？')) handleRemoveDoc(item.id);
                                                  }}
                                                  className="text-red-500 hover:text-red-600"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                </div>
                            )}

                            {/* Index Entries Tab (指标库) */}
                            {contentActiveTab === 'index-entries' && (
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                                                <input
                                                    type="text"
                                                    value={indexSearchQuery}
                                                    onChange={(e) => setIndexSearchQuery(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && searchIndexEntries()}
                                                    placeholder="按编码 / 名称 / 别名过滤..."
                                                    className="w-72 pl-8 pr-3 py-2 text-sm rounded-md border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                />
                                            </div>
                                            <Button onClick={searchIndexEntries} className="btn btn-neutral text-sm">
                                                检索
                                            </Button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button onClick={openAddIndexEntry} className="btn btn-primary text-sm flex items-center gap-1">
                                                <Plus className="h-4 w-4" /> 添加
                                            </Button>
                                            <Button
                                                onClick={() => setIndexUploadModalVisible(true)}
                                                className="btn btn-neutral text-sm flex items-center gap-1"
                                            >
                                                <Upload className="h-4 w-4" /> 上传 Excel
                                            </Button>
                                            <Button
                                                onClick={handleClearAllIndexEntries}
                                                disabled={indexEntries.length === 0}
                                                className="btn btn-neutral text-sm text-red-500 disabled:opacity-50"
                                            >
                                                清空全部
                                            </Button>
                                        </div>
                                    </div>
                                    {contentLoading ? (
                                        <div className="flex h-40 items-center justify-center text-text-secondary">
                                            <p className="text-sm">加载中...</p>
                                        </div>
                                    ) : indexEntries.length === 0 ? (
                                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-secondary">
                                            <Tag className="h-8 w-8" />
                                            <p className="text-sm">暂无指标</p>
                                        </div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse text-white">
                                          <thead>
                                          <tr className="bg-surface-secondary">
                                            <th className="border border-border-light px-3 py-2 text-left font-medium w-32 text-white">指标编码</th>
                                            <th className="border border-border-light px-3 py-2 text-left font-medium w-48 text-white">指标名称</th>
                                            <th className="border border-border-light px-3 py-2 text-left font-medium text-white">别名</th>
                                            <th className="border border-border-light px-3 py-2 text-left font-medium w-24 text-white">来源</th>
                                            <th className="border border-border-light px-3 py-2 text-left font-medium w-20 text-white">频度</th>
                                            <th className="border border-border-light px-3 py-2 text-center font-medium w-28 text-white">操作</th>
                                          </tr>
                                          </thead>
                                          <tbody>
                                          {indexEntries.map((item, idx) => (
                                            <tr key={item.id} className={idx % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary/50'}>
                                              <td className="border border-border-light px-3 py-2 font-mono text-xs text-white">{item.indexNumber}</td>
                                              <td className="border border-border-light px-3 py-2 text-white">{item.standardName}</td>
                                              <td className="border border-border-light px-3 py-2">
                                                {item.aliases && item.aliases.length > 0 ? (
                                                  <div className="flex flex-wrap gap-1">
                                                    {item.aliases.map((al) => (
                                                      <span
                                                        key={al}
                                                        className="inline-flex items-center rounded bg-blue-500/15 px-1.5 py-0.5 text-xs text-blue-300"
                                                      >
                                                        {al}
                                                      </span>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <span className="text-text-tertiary">-</span>
                                                )}
                                              </td>
                                              <td className="border border-border-light px-3 py-2">
                                                {item.source != null ? (
                                                  <span className="inline-flex items-center rounded bg-green-500/15 px-1.5 py-0.5 text-xs text-green-300">
                                                    {sourceLabel(item.source)}
                                                  </span>
                                                ) : (
                                                  <span className="text-text-tertiary">-</span>
                                                )}
                                              </td>
                                              <td className="border border-border-light px-3 py-2">
                                                {item.frequency ? (
                                                  <span className="inline-flex items-center rounded bg-purple-500/15 px-1.5 py-0.5 text-xs text-purple-300">
                                                    {item.frequency}
                                                  </span>
                                                ) : (
                                                  <span className="text-text-tertiary">-</span>
                                                )}
                                              </td>
                                              <td className="border border-border-light px-3 py-2 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                  <button
                                                    onClick={() => openEditIndexEntry(item)}
                                                    className="text-blue-400 hover:text-blue-300"
                                                    title="编辑"
                                                  >
                                                    <Edit2 className="h-4 w-4" />
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      if (confirm('确定删除此项吗？')) handleRemoveIndexEntry(item.id);
                                                    }}
                                                    className="text-red-500 hover:text-red-600"
                                                    title="删除"
                                                  >
                                                    <Trash2 className="h-4 w-4" />
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                </div>
                            )}

                            {/* Org Nodes Tab (机构信息) */}
                            {contentActiveTab === 'org-nodes' && (
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                                    <div className="lg:col-span-3 rounded-lg border border-border-light bg-surface-secondary/40 p-3">
                                        <div className="mb-2 flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-text-primary">机构信息</h4>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleFormatOrgJson}
                                                    disabled={!contentManagementProject}
                                                    className="rounded border border-border-light px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <Code2 className="h-3 w-3" /> 格式化
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => contentManagementProject && loadOrgNodes(contentManagementProject._id)}
                                                    disabled={!contentManagementProject || orgNodesLoading}
                                                    className="rounded border border-border-light px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50 flex items-center gap-1"
                                                >
                                                    <RotateCw className={cn('h-3 w-3', orgNodesLoading && 'animate-spin')} /> 重新拉取
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleSaveOrgNodes}
                                                    disabled={!contentManagementProject || orgNodesSaving}
                                                    className="btn btn-primary text-xs px-2 py-1"
                                                >
                                                    {orgNodesSaving ? '保存中...' : '保存并应用'}
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={orgNodesJsonText}
                                            onChange={(e) => setOrgNodesJsonText(e.target.value)}
                                            onBlur={() => parseOrgNodesJson()}
                                            rows={22}
                                            placeholder="嵌套 JSON 数组，每节点至少含 orgCode/orgName/orgType/dataScope"
                                            spellCheck={false}
                                            className={cn(
                                                'w-full rounded-md border bg-white px-3 py-2 font-mono text-xs leading-relaxed text-gray-900 dark:bg-gray-900 dark:text-gray-100',
                                                orgNodesJsonError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                            )}
                                        />
                                        {orgNodesJsonError ? (
                                            <div className="mt-1 text-xs text-red-500">{orgNodesJsonError}</div>
                                        ) : (
                                            <div className="mt-1 text-xs text-text-tertiary">✓ JSON 格式有效；失焦时自动同步到右侧树预览</div>
                                        )}
                                        <div className="mt-3">
                                            <Button
                                                onClick={handleClearOrgNodes}
                                                disabled={!contentManagementProject}
                                                className="btn btn-neutral text-xs text-red-500 disabled:opacity-50 flex items-center gap-1"
                                            >
                                                <Trash2 className="h-3 w-3" /> 清空机构信息
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="lg:col-span-2 rounded-lg border border-border-light bg-surface-secondary/40 p-3">
                                        <h4 className="mb-2 text-sm font-semibold text-text-primary">树形预览</h4>
                                        {orgNodesLoading ? (
                                            <div className="flex h-40 items-center justify-center text-sm text-text-secondary">加载中...</div>
                                        ) : orgNodesPreview.length === 0 ? (
                                            <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-secondary">
                                                <Network className="h-8 w-8" />
                                                <p className="text-sm">JSON 为空或格式错误</p>
                                            </div>
                                        ) : (
                                            <div className="max-h-[480px] overflow-auto text-sm">
                                                <OrgTreeView nodes={orgNodesPreview} depth={0} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* SQL Pair Add Modal */}
            {sqlModalVisible && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg rounded-lg border border-border-light bg-surface-primary shadow-lg">
                        <div className="flex items-center justify-between border-b border-border-light p-4">
                            <h3 className="text-lg font-semibold text-text-primary">添加 SQL 示例对</h3>
                            <button onClick={() => setSqlModalVisible(false)} className="rounded p-1 text-text-secondary hover:bg-surface-hover">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-primary">问题 <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={sqlForm.question}
                                    onChange={(e) => setSqlForm(prev => ({ ...prev, question: e.target.value }))}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    placeholder="例如：本月销售额是多少？"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-primary">SQL <span className="text-red-500">*</span></label>
                                <textarea
                                    value={sqlForm.sql}
                                    onChange={(e) => setSqlForm(prev => ({ ...prev, sql: e.target.value }))}
                                    rows={4}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    placeholder="例如：SELECT SUM(amount) FROM sales WHERE month = CURRENT_MONTH"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border-light p-4">
                            <Button onClick={() => setSqlModalVisible(false)} className="btn btn-neutral">取消</Button>
                            <Button onClick={handleAddSqlPair} className="btn btn-primary">确定</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Synonym Add Modal */}
            {synModalVisible && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-lg border border-border-light bg-surface-primary shadow-lg">
                        <div className="flex items-center justify-between border-b border-border-light p-4">
                            <h3 className="text-lg font-semibold text-text-primary">添加同义词</h3>
                            <button onClick={() => setSynModalVisible(false)} className="rounded p-1 text-text-secondary hover:bg-surface-hover">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-primary">词 <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={synForm.word}
                                    onChange={(e) => setSynForm(prev => ({ ...prev, word: e.target.value }))}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    placeholder="例如：销售额"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-primary">同义词（多个用逗号分隔） <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={synForm.synonyms}
                                    onChange={(e) => setSynForm(prev => ({ ...prev, synonyms: e.target.value }))}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    placeholder="例如：营收,营业额,销售收入"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border-light p-4">
                            <Button onClick={() => setSynModalVisible(false)} className="btn btn-neutral">取消</Button>
                            <Button onClick={handleAddSynonym} className="btn btn-primary">确定</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Doc Add Modal */}
            {docModalVisible && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg rounded-lg border border-border-light bg-surface-primary shadow-lg">
                        <div className="flex items-center justify-between border-b border-border-light p-4">
                            <h3 className="text-lg font-semibold text-text-primary">添加业务知识</h3>
                            <button onClick={() => setDocModalVisible(false)} className="rounded p-1 text-text-secondary hover:bg-surface-hover">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-primary">知识内容 <span className="text-red-500">*</span></label>
                                <textarea
                                    value={docForm.content}
                                    onChange={(e) => setDocForm(prev => ({ ...prev, content: e.target.value }))}
                                    rows={6}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    placeholder="输入业务知识、术语定义或规则说明..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border-light p-4">
                            <Button onClick={() => setDocModalVisible(false)} className="btn btn-neutral">取消</Button>
                            <Button onClick={handleAddDoc} className="btn btn-primary">确定</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Index Entry Add / Edit Modal */}
            {indexModalVisible && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-xl rounded-lg border border-border-light bg-surface-primary shadow-lg">
                        <div className="flex items-center justify-between border-b border-border-light p-4">
                            <h3 className="text-lg font-semibold text-text-primary">
                                {indexEditingId ? '编辑指标' : '添加指标'}
                            </h3>
                            <button onClick={() => setIndexModalVisible(false)} className="rounded p-1 text-text-secondary hover:bg-surface-hover">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="space-y-4 p-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-primary">
                                    指标编码 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={indexForm.indexNumber}
                                    onChange={(e) => setIndexForm((prev) => ({ ...prev, indexNumber: e.target.value }))}
                                    disabled={!!indexEditingId}
                                    placeholder="例如：KPI0001"
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:disabled:bg-gray-800"
                                />
                                {indexEditingId && (
                                    <p className="mt-1 text-xs text-text-tertiary">编码作为唯一标识，编辑模式下不可修改</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-primary">
                                    指标名称 <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={indexForm.standardName}
                                    onChange={(e) => setIndexForm((prev) => ({ ...prev, standardName: e.target.value }))}
                                    placeholder="例如：各项存款余额"
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-text-primary">别名</label>
                                <input
                                    type="text"
                                    value={indexForm.aliases}
                                    onChange={(e) => setIndexForm((prev) => ({ ...prev, aliases: e.target.value }))}
                                    placeholder='多个用 "/" 分隔，例如：存款余额/总存款'
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                />
                                <p className="mt-1 text-xs text-text-tertiary">等于指标名称的别名会自动去重剔除</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-text-primary">指标来源</label>
                                    <select
                                        value={indexForm.source ?? ''}
                                        onChange={(e) =>
                                            setIndexForm((prev) => ({
                                                ...prev,
                                                source: e.target.value === '' ? undefined : Number(e.target.value),
                                            }))
                                        }
                                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    >
                                        <option value="">选择来源口径</option>
                                        <option value="1">人行口径</option>
                                        <option value="2">银监口径</option>
                                        <option value="3">省联社口径</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-text-primary">指标频度</label>
                                    <select
                                        value={indexForm.frequency || ''}
                                        onChange={(e) => setIndexForm((prev) => ({ ...prev, frequency: e.target.value }))}
                                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    >
                                        <option value="">选择频度</option>
                                        <option value="日">日</option>
                                        <option value="旬">旬</option>
                                        <option value="月">月</option>
                                        <option value="季">季</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border-light p-4">
                            <Button onClick={() => setIndexModalVisible(false)} className="btn btn-neutral">取消</Button>
                            <Button onClick={handleSaveIndexEntry} className="btn btn-primary">
                                {indexEditingId ? '更新' : '添加'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Index Entry Excel Upload Modal */}
            {indexUploadModalVisible && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-2xl rounded-lg border border-border-light bg-surface-primary shadow-lg">
                        <div className="flex items-center justify-between border-b border-border-light p-4">
                            <h3 className="text-lg font-semibold text-text-primary">上传指标库 Excel</h3>
                            <button
                                onClick={() => {
                                    setIndexUploadModalVisible(false);
                                    setIndexUploadResult(null);
                                }}
                                className="rounded p-1 text-text-secondary hover:bg-surface-hover"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="space-y-3 p-4">
                            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border-light px-6 py-10 text-text-secondary hover:border-blue-400 hover:text-blue-500">
                                <Inbox className="h-10 w-10" />
                                <span className="text-sm">{indexUploading ? '正在解析与入库...' : '点击选择 .xlsx 文件上传'}</span>
                                <span className="text-xs text-text-tertiary">必填：指标编码 / 指标名称；可选：别名（/ 分隔）、来源、频度</span>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept=".xlsx,.xls"
                                    disabled={indexUploading}
                                    onChange={handleUploadIndexEntryFile}
                                />
                            </label>
                            {indexUploadResult && (
                                <div className="rounded-md border border-border-light bg-surface-secondary/40 p-3 text-sm">
                                    <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                                        <div>
                                            <div className="text-xs text-text-tertiary">写入条数</div>
                                            <div className="text-lg font-semibold text-green-500">{indexUploadResult.upserted}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-text-tertiary">跳过空行</div>
                                            <div className="text-lg font-semibold text-text-primary">{indexUploadResult.skippedRows}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-text-tertiary">错误行数</div>
                                            <div className={cn('text-lg font-semibold', (indexUploadResult.errors || []).length > 0 ? 'text-red-500' : 'text-text-primary')}>
                                                {(indexUploadResult.errors || []).length}
                                            </div>
                                        </div>
                                    </div>
                                    {(indexUploadResult.errors || []).length > 0 && (
                                        <div className="max-h-48 overflow-auto">
                                            <table className="w-full text-xs border-collapse">
                                                <thead>
                                                <tr className="bg-surface-secondary">
                                                    <th className="border border-border-light px-2 py-1 text-left w-20">行号</th>
                                                    <th className="border border-border-light px-2 py-1 text-left">错误信息</th>
                                                </tr>
                                                </thead>
                                                <tbody>
                                                {indexUploadResult.errors.map((err, i) => (
                                                    <tr key={i}>
                                                        <td className="border border-border-light px-2 py-1 font-mono">{err.rowNumber}</td>
                                                        <td className="border border-border-light px-2 py-1 text-red-500">{err.message}</td>
                                                    </tr>
                                                ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
