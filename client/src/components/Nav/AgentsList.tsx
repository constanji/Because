import React, { useMemo, useCallback, useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Database, CheckCircle2, Info } from "lucide-react";
import {
  EModelEndpoint,
  Constants,
  QueryKeys,
  LocalStorageKeys,
} from "@because/data-provider";
import { useListAgentsQuery } from "~/data-provider";
import {
  useLocalize,
  useAgentDefaultPermissionLevel,
  useNewConvo,
  useAuthContext,
} from "~/hooks";
import { useToastContext } from "@because/client";
import { clearMessagesCache } from "~/utils";
import { cn } from "~/utils";
import { getAgentAvatarUrl } from "~/utils/agents";
import type { Agent } from "@because/data-provider";
import store from "~/store";
import useLocalStorage from "~/hooks/useLocalStorage";
import DatabaseSchemaDialog from "./DatabaseSchemaDialog";

// 数据源接口定义（参考 DatasourceManagement.tsx）
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
  agentNames?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AgentsListProps {
  toggleNav?: () => void;
}

export default function AgentsList({ toggleNav }: AgentsListProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const permissionLevel = useAgentDefaultPermissionLevel();
  const { newConversation } = useNewConvo();
  const { user, token } = useAuthContext();
  const { conversation } = store.useCreateConversationAtom(0);
  const { showToast } = useToastContext();

  // 数据源列表状态
  const [datasources, setDatasources] = useState<DatDatasource[]>([]);
  const [isLoadingDatasources, setIsLoadingDatasources] = useState(false);

  // 选中的数据源ID（保存到localStorage）
  const [selectedDataSourceId, setSelectedDataSourceId] = useLocalStorage<
    string | null
  >(LocalStorageKeys.LAST_DATA_SOURCE_ID, null);

  // 数据库结构对话框状态
  const [schemaDialogOpen, setSchemaDialogOpen] = useState(false);
  const [viewingDatasource, setViewingDatasource] =
    useState<DatDatasource | null>(null);

  // 获取 API 基础路径
  const getApiBase = useCallback(() => {
    const baseEl = document.querySelector("base");
    const baseHref = baseEl?.getAttribute("href") || "/";
    return baseHref.endsWith("/") ? baseHref.slice(0, -1) : baseHref;
  }, []);

  // 获取请求头
  const getHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }, [token]);

  // 获取数据源列表
  const fetchDatasources = useCallback(async () => {
    setIsLoadingDatasources(true);
    try {
      const response = await fetch(`${getApiBase()}/api/dat-datasources`, {
        method: "GET",
        headers: getHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("获取数据源列表失败");
      }

      const data = await response.json();
      // 只显示已启用的数据源
      const enabledDatasources = (data.datasources || []).filter(
        (ds: DatDatasource) => ds.enabled
      );
      setDatasources(enabledDatasources);
    } catch (error) {
      console.error("Error fetching datasources:", error);
      setDatasources([]);
    } finally {
      setIsLoadingDatasources(false);
    }
  }, [getApiBase, getHeaders]);

  // 加载数据源列表
  useEffect(() => {
    fetchDatasources();
  }, [fetchDatasources]);

  // 只获取公开的智能体（管理员选择展示的）
  const { data: agentsResponse } = useListAgentsQuery(
    { requiredPermission: permissionLevel },
    {
      select: (res) => ({
        ...res,
        // 只显示公开的智能体（isPublic: true）
        data: res.data.filter((agent) => agent.isPublic === true),
      }),
    }
  );

  const agents = useMemo(() => agentsResponse?.data ?? [], [agentsResponse]);

  const handleAgentClick = useCallback(
    (agent: Agent) => {
      // 检查是否选中了数据源
      if (!selectedDataSourceId) {
        showToast({
          message: "请先在下方业务列表中选择一个数据源",
          status: "warning",
        });
        return;
      }

      // 清除当前对话的消息缓存，避免影响历史对话
      clearMessagesCache(queryClient, conversation?.conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);

      // 创建新对话并设置智能体，同时设置模型名称
      newConversation({
        preset: {
          endpoint: EModelEndpoint.agents,
          agent_id: agent.id,
          model: agent.model || "",
          conversationId: Constants.NEW_CONVO as string,
        },
        keepLatestMessage: false,
      });

      // 导航到新对话
      navigate(`/c/new?agent_id=${agent.id}`, {
        replace: false,
        state: {
          agentId: agent.id,
          agentName: agent.name,
          datasourceId: selectedDataSourceId,
        },
      });

      if (toggleNav) {
        toggleNav();
      }
    },
    [
      navigate,
      toggleNav,
      newConversation,
      queryClient,
      conversation,
      selectedDataSourceId,
      showToast,
    ]
  );

  // 处理数据源选择
  const handleDatasourceSelect = useCallback(
    (datasource: DatDatasource) => {
      setSelectedDataSourceId(datasource._id);
      showToast({
        message: `已选择数据源: ${datasource.name}`,
        status: "success",
      });
    },
    [setSelectedDataSourceId, showToast]
  );

  return (
    <>
      <div className="mb-4 border-t border-border-light pt-4">
        <div className="mb-2 px-2">
          <h2 className="text-sm font-semibold text-text-primary">智能体</h2>
        </div>
        <div className="rounded-lg border border-border-light bg-surface-secondary p-2">
          {agents.length === 0 ? (
            <div className="py-2 text-center text-xs text-text-tertiary">
              暂无可用智能体
            </div>
          ) : (
            <div className="space-y-1">
              {agents.map((agent) => {
                // 检查当前 URL 参数或 state 中的 agent_id
                const urlParams = new URLSearchParams(location.search);
                const urlAgentId = urlParams.get("agent_id");
                const isActive =
                  urlAgentId === agent.id ||
                  (location.pathname.includes(`/c/`) &&
                    location.state?.agentId === agent.id);

                return (
                  <AgentListItem
                    key={agent.id}
                    agent={agent}
                    isActive={isActive}
                    onClick={() => handleAgentClick(agent)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 数据源选择器 - 业务列表 */}
      <div className="mb-4 border-t border-border-light pt-4">
        <div className="mb-2 px-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">业务列表</h2>
          {!selectedDataSourceId && datasources.length > 0 && (
            <span className="text-xs text-orange-500">请选择</span>
          )}
        </div>
        <div className="rounded-lg border border-border-light bg-surface-secondary p-2">
          {isLoadingDatasources ? (
            <div className="py-2 text-center text-xs text-text-tertiary">
              加载中...
            </div>
          ) : datasources.length === 0 ? (
            <div className="py-2 text-center text-xs text-text-tertiary">
              暂无已配置的数据源
            </div>
          ) : (
            <div className="space-y-1">
              {datasources.map((datasource) => {
                const isSelected = selectedDataSourceId === datasource._id;
                return (
                  <div
                    key={datasource._id}
                    className="flex items-center gap-1 group"
                  >
                    <button
                      onClick={() => handleDatasourceSelect(datasource)}
                      className={cn(
                        "flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                        isSelected
                          ? "bg-green-50 dark:bg-green-900/20 text-text-primary"
                          : "text-text-secondary hover:bg-surface-hover"
                      )}
                      aria-label={
                        datasource.name
                          ? `选择数据源: ${datasource.name}`
                          : "选择数据源"
                      }
                    >
                      <Database className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {datasource.name}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-600" />
                          )}
                        </div>
                        <div className="text-xs text-text-tertiary">
                          {datasource.provider.toUpperCase()} ·{" "}
                          {datasource.configuration.database || "未配置"}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingDatasource(datasource);
                        setSchemaDialogOpen(true);
                      }}
                      className={cn(
                        "flex-shrink-0 p-1.5 rounded-lg transition-all",
                        "opacity-60 group-hover:opacity-100",
                        "hover:bg-surface-hover text-text-secondary hover:text-text-primary",
                        "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                      )}
                      aria-label={`查看 ${datasource.name} 的数据库结构`}
                      title="查看数据库结构"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 数据库结构对话框 */}
      <DatabaseSchemaDialog
        isOpen={schemaDialogOpen}
        onOpenChange={setSchemaDialogOpen}
        datasource={viewingDatasource}
      />
    </>
  );
}

interface AgentListItemProps {
  agent: Agent;
  isActive: boolean;
  onClick: () => void;
}

function AgentListItem({ agent, isActive, onClick }: AgentListItemProps) {
  const avatarUrl = getAgentAvatarUrl(agent);

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors",
        "hover:bg-surface-hover",
        isActive && "bg-surface-active text-text-primary",
        !isActive && "text-text-secondary"
      )}
      aria-label={agent.name}
    >
      <div className="flex-shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={agent.name || "智能体"}
            className="h-5 w-5 rounded-full object-cover"
          />
        ) : (
          <Bot className="h-5 w-5 text-text-primary" />
        )}
      </div>
      <span className="flex-1 truncate text-sm font-medium">{agent.name}</span>
    </button>
  );
}
