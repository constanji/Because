import React, { useState, useEffect, useMemo } from "react";
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  useToastContext,
  Spinner,
  Button,
} from "@because/client";
import { Database, RefreshCw, X, Search } from "lucide-react";
import { cn } from "~/utils";

const DAT_API_BASE =
  import.meta.env.VITE_DAT_OPENAPI_BASE_URL || "http://localhost:8080";

// 数据源接口定义
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
  enabled: boolean;
}

// LightSchema 类型定义
interface LightSchemaColumn {
  name: string;
  type: string;
  description?: string;
  sampleValues?: string[];
}

interface LightSchemaForeignKey {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

interface LightSchema {
  tableName: string;
  tableDescription?: string;
  columns: LightSchemaColumn[];
  primaryKeys?: string[];
  foreignKeys?: LightSchemaForeignKey[];
  indices?: string[];
}

interface DatabaseSchemaDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  datasource: DatDatasource | null;
}

export default function DatabaseSchemaDialog({
  isOpen,
  onOpenChange,
  datasource,
}: DatabaseSchemaDialogProps) {
  const { showToast } = useToastContext();
  const [schemas, setSchemas] = useState<LightSchema[]>([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen && datasource) {
      loadSchema();
    } else {
      // 关闭对话框时重置状态
      setSchemas([]);
      setSelectedTable(null);
      setSearchQuery("");
    }
  }, [isOpen, datasource]);

  const loadSchema = async () => {
    if (!datasource?._id || !datasource?.projectId) {
      showToast({
        message: "数据源信息不完整",
        status: "error",
      });
      return;
    }

    try {
      setLoadingSchema(true);
      const response = await fetch(
        `${DAT_API_BASE}/api/v1/content-store/light-schema/list?projectId=${datasource.projectId}&datasourceId=${datasource._id}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSchemas(data || []);

      if (data && data.length > 0) {
        showToast({
          message: `成功加载 ${data.length} 张表结构`,
          status: "success",
        });
      }
    } catch (error) {
      console.error("Failed to load schema:", error);
      showToast({
        message: `获取数据库结构失败: ${error instanceof Error ? error.message : "未知错误"}`,
        status: "error",
      });
      setSchemas([]);
    } finally {
      setLoadingSchema(false);
    }
  };

  // 过滤的表列表
  const filteredSchemas = useMemo(() => {
    if (!searchQuery) return schemas;
    return schemas.filter(
      (s) =>
        s.tableName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.tableDescription &&
          s.tableDescription.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [schemas, searchQuery]);

  // 选中的表信息
  const selectedSchema = useMemo(() => {
    return schemas.find((s) => s.tableName === selectedTable);
  }, [schemas, selectedTable]);

  if (!datasource) {
    return null;
  }

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] w-11/12 max-w-5xl flex-col"
      >
        <OGDialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <OGDialogTitle className="text-xl font-semibold text-text-primary">
                数据库结构 (Light Schema)
              </OGDialogTitle>
              <p className="mt-1 text-sm text-text-secondary">
                {datasource.name} ({datasource.provider.toUpperCase()}) ·{" "}
                {datasource.configuration.database || "未配置数据库"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={loadSchema}
                disabled={loadingSchema}
                variant="ghost"
                className="btn btn-neutral border-token-border-light relative flex items-center gap-2 rounded-lg px-3 py-2"
              >
                {loadingSchema ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                刷新
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                variant="ghost"
                className="btn btn-neutral border-token-border-light relative flex items-center gap-2 rounded-lg px-3 py-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </OGDialogHeader>

        <div className="flex-1 overflow-auto mt-4">
          {loadingSchema ? (
            <div className="flex h-full items-center justify-center py-12">
              <div className="text-center">
                <Spinner className="h-8 w-8 mx-auto mb-4 text-text-primary" />
                <p className="text-text-secondary">正在加载数据库结构...</p>
              </div>
            </div>
          ) : schemas.length === 0 ? (
            <div className="flex h-full items-center justify-center py-12">
              <div className="text-center">
                <Database className="h-12 w-12 mx-auto mb-4 text-text-tertiary" />
                <p className="text-text-secondary mb-2">尚未生成 Light Schema</p>
                <p className="text-xs text-text-tertiary mb-4">
                  请在数据源管理中生成 Light Schema
                </p>
                <Button
                  onClick={loadSchema}
                  disabled={loadingSchema}
                  className="btn btn-primary relative flex items-center gap-2 rounded-lg px-4 py-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  重新加载
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 搜索栏 */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="搜索表名或描述..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-border-light bg-surface-secondary py-2 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="text-sm text-text-secondary">
                  共 {filteredSchemas.length} / {schemas.length} 张表
                </div>
              </div>

              {/* 表列表 */}
              <div className="space-y-2">
                {filteredSchemas.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-text-secondary">没有匹配的表</p>
                  </div>
                ) : (
                  filteredSchemas.map((schema) => {
                    const isSelected = selectedTable === schema.tableName;
                    return (
                      <div
                        key={schema.tableName}
                        className={cn(
                          "rounded-lg border p-4 cursor-pointer transition-colors",
                          isSelected
                            ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                            : "border-border-light bg-surface-secondary hover:bg-surface-hover"
                        )}
                        onClick={() =>
                          setSelectedTable(isSelected ? null : schema.tableName)
                        }
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-text-primary">
                            {schema.tableName}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-text-secondary">
                            <span>{schema.columns.length} 列</span>
                            {schema.primaryKeys && schema.primaryKeys.length > 0 && (
                              <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded">
                                主键: {schema.primaryKeys.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 表描述 */}
                        {schema.tableDescription && (
                          <p className="text-sm text-text-secondary mb-2">
                            {schema.tableDescription}
                          </p>
                        )}

                        {/* 展开后的详细信息 */}
                        {isSelected && (
                          <div className="mt-4 space-y-4">
                            {/* 列信息 */}
                            <div>
                              <div className="text-sm font-medium text-text-secondary mb-2">
                                列信息:
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {schema.columns.map((col) => (
                                  <div
                                    key={col.name}
                                    className="text-xs p-2 rounded bg-surface-primary border border-border-light"
                                  >
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-text-primary">
                                        {col.name}
                                      </span>
                                      <span className="text-text-secondary">
                                        ({col.type})
                                      </span>
                                      {schema.primaryKeys?.includes(col.name) && (
                                        <span className="px-1 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded">
                                          主键
                                        </span>
                                      )}
                                    </div>
                                    {col.description && (
                                      <div className="text-text-secondary mt-1">
                                        {col.description}
                                      </div>
                                    )}
                                    {col.sampleValues &&
                                      col.sampleValues.length > 0 && (
                                        <div className="text-text-tertiary mt-1">
                                          示例值: {col.sampleValues.slice(0, 3).join(", ")}
                                          {col.sampleValues.length > 3 && "..."}
                                        </div>
                                      )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 外键信息 */}
                            {schema.foreignKeys &&
                              schema.foreignKeys.length > 0 && (
                                <div>
                                  <div className="text-sm font-medium text-text-secondary mb-2">
                                    外键:
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {schema.foreignKeys.map((fk, idx) => (
                                      <div
                                        key={idx}
                                        className="text-xs px-2 py-1 rounded bg-surface-primary border border-border-light"
                                      >
                                        <span className="font-medium text-text-primary">
                                          {fk.columnName}
                                        </span>{" "}
                                        →{" "}
                                        <span className="text-text-secondary">
                                          {fk.referencedTable}({fk.referencedColumn})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                            {/* 索引信息 */}
                            {schema.indices && schema.indices.length > 0 && (
                              <div>
                                <div className="text-sm font-medium text-text-secondary mb-2">
                                  索引:
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {schema.indices.map((idx, i) => (
                                    <span
                                      key={i}
                                      className="text-xs px-2 py-1 rounded bg-surface-primary border border-border-light text-text-secondary"
                                    >
                                      {idx}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
