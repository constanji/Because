import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "~/utils";
import ProjectsManagement from "~/components/GlobalConfig/ProjectsManagement";
import DatasourceManagement from "~/components/GlobalConfig/DatasourceManagement";

type TabType = "dataSources" | "knowledgeBase" | "projectConfig";

const isValidTab = (tab: string | null): tab is TabType => {
  return (
    tab === "dataSources" || tab === "knowledgeBase" || tab === "projectConfig"
  );
};

export default function AssetCenterContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: TabType = isValidTab(tabParam) ? tabParam : "projectConfig";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // 当 URL 参数变化时，更新活动标签页
  useEffect(() => {
    if (isValidTab(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // 处理标签页切换，同时更新 URL 参数
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const tabs: { id: TabType; label: string; description: string }[] = [
    {
      id: "projectConfig",
      label: "项目配置",
      description:
        "管理 BecauseAI 项目配置，包括 LLM、Agent、嵌入模型、内容管理等",
    },
    {
      id: "dataSources",
      label: "数据源管理",
      description: "管理数据库连接配置，并绑定到智能体",
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 标签页导航 */}
      <div className="border-b border-border-light bg-surface-secondary">
        <div className="flex gap-1 px-4 pt-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "relative px-4 py-2 text-sm font-medium transition-colors",
                "border-b-2 border-transparent",
                activeTab === tab.id
                  ? "border-primary text-text-primary"
                  : "text-text-secondary hover:text-text-primary hover:border-border-subtle",
              )}
              aria-label={tab.label}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 标签页内容 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "projectConfig" && (
          <div className="h-full overflow-hidden px-4 py-4">
            <ProjectsManagement />
          </div>
        )}
        {activeTab === "dataSources" && (
          <div className="h-full overflow-hidden px-4 py-4">
             <DatasourceManagement />
          </div>
        )}
      </div>
    </div>
  );
}