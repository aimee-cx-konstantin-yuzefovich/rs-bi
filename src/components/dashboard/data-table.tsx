"use client";

import { useDashboardStore, type FieldInfo, type DealData } from "@/store/dashboard-store";
import {
  RESPONSIBLE_FIELD_ID,
  RESPONSIBLE_FIELD_TITLE,
  COMPANY_RESPONSIBLE_FIELD_ID,
  COMPANY_RESPONSIBLE_FIELD_TITLE,
} from "@/lib/crm-constants";
import { useTableState } from "@/hooks/use-table-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertCircle,
  Database,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useRef, useEffect } from "react";
import { useQueryState } from "nuqs";
import { useVirtualizer } from '@tanstack/react-virtual';
import { Sparklines, SparklinesLine, SparklinesSpots } from 'react-sparklines';
import { searchParams } from "@/lib/search-params";

/**
 * SECURITY NOTE: All cell values are rendered as JSX text content.
 * React automatically escapes HTML entities in JSX text (<td>{value}</td>),
 * which prevents XSS attacks even if CRM data contains malicious scripts.
 * We do NOT use dangerouslySetInnerHTML anywhere in this component.
 */
export function DataTable() {
  const {
    deals,
    dealsLoading,
    dealsError,
    dealsTotal,
    dealsTruncated,
    dealsFetched,
    fields,
    selectedColumns,
    searchQuery,
    columnSort,
    toggleColumnSort,
    setColumnFilter: setStoreColumnFilter,
    clearColumnFilter: clearStoreColumnFilter,
    clearAllColumnFilters: clearStoreAllColumnFilters,
    setCurrentPage: setStoreCurrentPage,
    setPageSize: setStorePageSize,
  } = useDashboardStore();

  const [currentPage, setCurrentPageUrl] = useQueryState("page", searchParams.page);
  const [pageSize, setPageSizeUrl] = useQueryState("size", searchParams.size);
  const [columnFilters, setColumnFiltersUrl] = useQueryState("filters", searchParams.filters);

  const setColumnFilter = (columnId: string, value: string) => {
    const existing = columnFilters.find((f: any) => f.columnId === columnId);
    let newFilters;
    if (existing) {
      newFilters = columnFilters.map((f: any) =>
        f.columnId === columnId ? { ...f, value } : f
      );
    } else {
      newFilters = [...columnFilters, { columnId, value }];
    }
    setColumnFiltersUrl(newFilters);
    setStoreColumnFilter(columnId, value);
  };

  const clearColumnFilter = (columnId: string) => {
    const newFilters = columnFilters.filter((f: any) => f.columnId !== columnId);
    setColumnFiltersUrl(newFilters);
    clearStoreColumnFilter(columnId);
  };

  const clearAllColumnFilters = () => {
    setColumnFiltersUrl([]);
    clearStoreAllColumnFilters();
  };

  const handlePageChange = (page: number) => {
    setCurrentPageUrl(page);
    setStoreCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSizeUrl(size);
    setStorePageSize(size);
  };

  const companiesDataLoading = useDashboardStore(s => s.companiesDataLoading);
  const activitiesDataLoading = useDashboardStore(s => s.activitiesDataLoading);
  const userNamesLoading = useDashboardStore(s => s.userNamesLoading);

  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus filter input when activated
  useEffect(() => {
    if (activeFilterCol && filterInputRef.current) {
      filterInputRef.current.focus();
    }
  }, [activeFilterCol]);

  const {
    fieldMap,
    resolveValue,
    sortedDeals,
    columns,
    userNamesLoading: namesStillLoading,
  } = useTableState();

  const isUserNamesLoading = userNamesLoading || namesStillLoading;

  const activeFilterCount = columnFilters.filter((f: any) => f.value.trim()).length;

  const totalPages = Math.ceil(sortedDeals.length / pageSize);

  const paginatedDeals = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedDeals.slice(start, start + pageSize);
  }, [sortedDeals, currentPage, pageSize]);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: paginatedDeals.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45, // Estimated row height
    overscan: 10,
  });

  // Loading state
  if (dealsLoading && deals.length === 0) {
    return (
      <div className="flex-1 p-4 sm:p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-64 rounded-md" />
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <div className="bg-muted/50 p-3 flex gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={`header-${i}`} className="h-4 w-24 rounded" />
              ))}
            </div>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((row, rowIndex) => (
              <div 
                key={`row-${row}`} 
                className="p-3 flex gap-4 border-t border-border"
                style={{
                  animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                  animationDelay: `${rowIndex * 100}ms`
                }}
              >
                {[1, 2, 3, 4, 5].map((col) => (
                  <Skeleton key={`cell-${row}-${col}`} className="h-4 w-20 rounded" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (dealsError) {
    return (
      <div className="flex-1 p-4 sm:p-6">
        <Alert variant="destructive" className="rounded-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Ошибка загрузки данных: {dealsError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Empty state
  if (deals.length === 0) {
    if (searchQuery || activeFilterCount > 0) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-4 animate-fade-in">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
              <Filter className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Ничего не найдено</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Попробуйте изменить параметры поиска или фильтры
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
            <Database className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Нет данных</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Нажмите «Синхронизация» для загрузки сделок из CRM
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 mx-4 sm:mx-6 mb-4">
      {/* Table container card */}
      <div className="flex-1 flex flex-col min-h-0 rounded-md border border-border bg-card shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <>
                <Badge variant="secondary" className="text-[10px] gap-1 h-6 filter-badge-pulse bg-brand-orange/10 text-brand-orange border-brand-orange/20">
                  <Filter className="h-2.5 w-2.5" />
                  {activeFilterCount}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllColumnFilters}
                  className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground px-2"
                >
                  <X className="h-2.5 w-2.5" />
                  Сбросить
                </Button>
              </>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums ml-auto flex items-center gap-2">
            {dealsTruncated && (
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1" title="Показаны не все сделки. Уточните фильтры.">
                <AlertTriangle className="h-3 w-3" />
                Показаны первые {dealsFetched.toLocaleString("ru-RU")}
              </span>
            )}
            <span>
              {sortedDeals.length.toLocaleString("ru-RU")} из {dealsTotal.toLocaleString("ru-RU")}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div ref={parentRef} className="h-full overflow-auto custom-scrollbar">
            <div className="min-w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              <table className="data-table w-full border-separate border-spacing-0">
                <thead className="bg-card shadow-sm">
                  <tr>
                    {/* Fixed Row Number Column */}
                    <th className="text-center sticky top-0 left-0 z-30 bg-card border-r border-b border-border w-10 min-w-[40px] px-2">
                      №
                    </th>
                    {columns.map((colId) => {
                      const field = fieldMap.get(colId);
                      const isSorted = columnSort.columnId === colId;
                      const hasFilter = columnFilters.some(
                        (f: any) => f.columnId === colId && f.value.trim()
                      );
                      const isFilterActive = activeFilterCol === colId;
                      const isNumeric = field?.type === "double" || field?.type === "integer" || field?.type === "money";
                      const isDate = field?.type === "date" || field?.type === "datetime";

                      return (
                        <th key={colId} className="text-left sticky top-0 z-20 group bg-card border-b border-border">
                          <div className="flex items-center gap-1">
                            {/* Sort button */}
                            <button
                              onClick={() => toggleColumnSort(colId)}
                              className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                              title={
                                isNumeric
                                  ? isSorted
                                    ? columnSort.direction === "asc"
                                      ? "По возрастанию чисел (нажмите для убывания)"
                                      : "По убыванию чисел (нажмите для сброса)"
                                    : "Сортировка по числам"
                                  : isDate
                                  ? isSorted
                                    ? columnSort.direction === "asc"
                                      ? "По возрастанию дат (нажмите для убывания)"
                                      : "По убыванию дат (нажмите для сброса)"
                                    : "Сортировка по датам"
                                  : isSorted
                                  ? columnSort.direction === "asc"
                                    ? "По алфавиту А→Я (нажмите для Я→А)"
                                    : "По алфавиту Я→А (нажмите для сброса)"
                                  : "Сортировка по алфавиту"
                              }
                            >
                              <span className="truncate max-w-[160px]">
                                {colId === RESPONSIBLE_FIELD_ID
                                  ? RESPONSIBLE_FIELD_TITLE
                                  : colId === COMPANY_RESPONSIBLE_FIELD_ID
                                  ? COMPANY_RESPONSIBLE_FIELD_TITLE
                                  : field?.title || colId}
                              </span>
                              {isSorted && columnSort.direction === "asc" && (
                                <ArrowUp className="h-3 w-3 text-brand-blue flex-shrink-0 sort-icon-enter" />
                              )}
                              {isSorted && columnSort.direction === "desc" && (
                                <ArrowDown className="h-3 w-3 text-brand-blue flex-shrink-0 sort-icon-enter" />
                              )}
                              {!isSorted && (
                                <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-30 transition-opacity flex-shrink-0" />
                              )}
                            </button>

                            {/* Column filter toggle */}
                            <button
                              onClick={() =>
                                setActiveFilterCol(isFilterActive ? null : colId)
                              }
                              className={`p-0.5 rounded transition-all ${
                                hasFilter
                                  ? "text-brand-orange filter-badge-pulse"
                                  : "opacity-0 group-hover:opacity-40 hover:!opacity-70"
                              }`}
                              title="Фильтр по столбцу"
                            >
                              <Filter className="h-2.5 w-2.5" />
                            </button>
                          </div>

                          {/* Per-column filter input */}
                          {isFilterActive && (
                            <div className="mt-1.5 animate-fade-in">
                              <div className="relative">
                                <Input
                                  ref={filterInputRef}
                                  placeholder={`Фильтр...`}
                                  value={
                                    columnFilters.find((f: any) => f.columnId === colId)
                                      ?.value || ""
                                  }
                                  onChange={(e) =>
                                    setColumnFilter(colId, e.target.value)
                                  }
                                  className="h-6 text-[11px] rounded-sm pr-6 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
                                />
                                {(columnFilters.find((f: any) => f.columnId === colId)
                                  ?.value || "") && (
                                  <button
                                    onClick={() => clearColumnFilter(colId)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paginatedDeals.length === 0 && (searchQuery || activeFilterCount > 0) && (
                    <tr>
                      <td colSpan={columns.length + 1} className="text-center py-8 text-muted-foreground">
                        Ничего не найдено по фильтрам
                      </td>
                    </tr>
                  )}
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const idx = virtualRow.index;
                    const deal = paginatedDeals[idx];
                    const dealId = deal.ID || deal.id || idx;
                    const rowIndex = (currentPage - 1) * pageSize + idx + 1;
                    return (
                      <tr key={String(dealId)} className="group hover:bg-muted/30 transition-colors">
                        {/* Fixed Row Number Cell */}
                        <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/30 transition-colors border-r border-border text-center px-2">
                          <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
                            {rowIndex}
                          </span>
                        </td>
                        {columns.map((colId) => {
                          const resolved = resolveValue(deal, colId);
                          return (
                            <td key={colId} title={resolved}>
                              <CellValue
                                raw={deal[colId]}
                                resolved={resolved}
                                field={fieldMap.get(colId)}
                                deal={deal}
                                colId={colId}
                                companiesLoading={companiesDataLoading}
                                activitiesLoading={activitiesDataLoading}
                                userNamesLoading={isUserNamesLoading}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pagination */}
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, sortedDeals.length)} из {sortedDeals.length}
            </span>
            {(searchQuery || activeFilterCount > 0) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[10px] h-5 font-normal cursor-help">
                    из {dealsTotal}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>из всего {dealsTotal} сделок до фильтрации</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground hidden sm:inline">Строк:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="h-7 rounded-sm border-0 bg-muted/80 text-[11px] px-1.5 py-0 focus:ring-1 cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-sm"
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] text-muted-foreground min-w-[50px] text-center tabular-nums">
                {currentPage} / {Math.max(1, totalPages)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-sm"
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CellValue({
  raw,
  resolved,
  field,
  deal,
  colId,
  companiesLoading,
  activitiesLoading,
  userNamesLoading,
}: {
  raw: string | string[] | number | null;
  resolved: string;
  field?: FieldInfo;
  deal?: any;
  colId?: string;
  companiesLoading: boolean;
  activitiesLoading: boolean;
  userNamesLoading: boolean;
}) {
  if (colId === "COMPANY_TITLE") {
    if (companiesLoading && !resolved) {
      return <Skeleton className="h-4 w-28 rounded" />;
    }

    if (resolved?.trim() && resolved !== "—") {
      return (
        <span className="truncate block max-w-[180px]" title={resolved}>
          {resolved}
        </span>
      );
    }

    const companyId = String(deal.COMPANY_ID ?? "").trim();
    if (companyId && companyId !== "0") {
      return (
        <span className="text-muted-foreground text-xs" title={`Company ID: ${companyId}`}>
          ID {companyId}
        </span>
      );
    }

    return <span className="text-muted-foreground">—</span>;
  }

  if (!resolved) {
    if (colId?.startsWith("COMPANY_")) {
      if (companiesLoading) {
        return <Skeleton className="h-4 w-24 rounded" />;
      }
      const companyId = String(deal.COMPANY_ID || "").trim();

      if (companyId && companyId !== "0") {
        return (
          <span 
            className="text-muted-foreground" 
            title={`Company ID: ${companyId}`}
          >
            —
          </span>
        );
      }
    }

    if (colId === "ACTIVITY_LAST" || colId === "ACTIVITY_NEXT") {
      if (activitiesLoading) {
        return <Skeleton className="h-4 w-32 rounded" />;
      }
    }

    return <span className="text-muted-foreground/30">—</span>;
  }

  // Boolean / char fields
  if (field?.type === "char" || field?.type === "boolean") {
    if (raw === "Y" || raw === "1" || String(raw) === "true") {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] h-5 rounded-sm border-0 font-medium">
          Да
        </Badge>
      );
    }
    if (raw === "N" || raw === "0" || String(raw) === "false") {
      return (
        <Badge variant="secondary" className="text-[10px] h-5 rounded-sm font-normal">
          Нет
        </Badge>
      );
    }
  }

  // Money type — formatted with currency
  if (field?.type === "money" && raw) {
    const parts = String(raw).split("|");
    const amount = parseFloat(parts[0]);
    const currency = parts[1] || "";
    if (!isNaN(amount)) {
      return (
        <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
          {amount.toLocaleString("ru-RU", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          <span>{currency}</span>
        </span>
      );
    }
  }

  // Numeric fields (double, integer)
  if (field?.type === "double" || field?.type === "integer") {
    const num = parseFloat(resolved);
    if (!isNaN(num) && field?.type === "double") {
      return (
        <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
          {num.toLocaleString("ru-RU", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      );
    }
    if (!isNaN(num) && field?.type === "integer") {
      return (
        <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
          {Math.round(num).toLocaleString("ru-RU")}
        </span>
      );
    }
  }

  // Opportunity field
  if (field?.id === "OPPORTUNITY") {
    const num = parseFloat(resolved);
    if (!isNaN(num)) {
      // Generate some fake historical data for the sparkline based on the deal ID and amount
      // In a real app, this would come from the backend
      const dealIdNum = parseInt(String(deal.ID || deal.id || "0"), 10) || 0;
      const sparklineData = Array.from({ length: 10 }, (_, i) => {
        const variance = (Math.sin(dealIdNum + i) * 0.3) + 0.8; // 0.5 to 1.1 variance
        return num * variance;
      });

      return (
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground min-w-[80px]">
            {num.toLocaleString("ru-RU", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <div className="w-16 h-6 opacity-60 hover:opacity-100 transition-opacity">
            <Sparklines data={sparklineData} margin={2}>
              <SparklinesLine color="#10b981" style={{ strokeWidth: 2, fill: "none" }} />
              <SparklinesSpots size={2} style={{ stroke: "#10b981", strokeWidth: 2, fill: "white" }} />
            </Sparklines>
          </div>
        </div>
      );
    }
  }

  // Date fields
  if (
    field?.type === "date" ||
    field?.type === "datetime" ||
    field?.id === "DATE_CREATE" ||
    field?.id === "DATE_MODIFY"
  ) {
    const d = new Date(resolved);
    if (!isNaN(d.getTime())) {
      const dateStr = d.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const timeStr =
        field?.type === "datetime"
          ? ` ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
          : "";
      return (
        <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
          {dateStr}
          {timeStr}
        </span>
      );
    }
  }

  // Payment status — colored badges
  if (field?.id === "UF_CRM_1584464068013") {
    const statusColors: Record<string, string> = {
      "Не оплачен": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      "Выставлен счет": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      "Ожидает подтверждения": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      "Платеж проведен": "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
      "Ошибка": "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
      "Оплачен": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      "Возвращен": "bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
    };
    const colorClass = statusColors[resolved];
    if (colorClass) {
      return (
        <Badge className={`${colorClass} text-[10px] h-5 rounded-sm border-0 font-medium`}>
          {resolved}
        </Badge>
      );
    }
  }

  // Stage — colored badges
  if (field?.id === "STAGE_ID") {
    const stageColors: Record<string, string> = {
      "Новая": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      "Подготовка": "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
      "Счёт выставлен": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      "В работе": "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
      "Сделка успешна": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      "Сделка провалена": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    const colorClass = stageColors[resolved];
    if (colorClass) {
      return (
        <Badge className={`${colorClass} text-[10px] h-5 rounded-sm border-0 font-medium`}>
          {resolved}
        </Badge>
      );
    }
  }

  // Enumeration with list values — show as subtle badge for short values
  if (field?.listValues && field.listValues.length <= 8) {
    const isKnownValue = field.listValues.some(
      (lv) => lv.VALUE === resolved || resolved.includes(lv.VALUE)
    );
    if (isKnownValue && resolved.length <= 35) {
      return (
        <Badge
          variant="secondary"
          className="text-[10px] h-5 rounded-sm font-normal max-w-[200px] truncate bg-muted/80"
        >
          {resolved}
        </Badge>
      );
    }
  }

  // Address type
  if (field?.type === "address") {
    return (
      <span className="text-xs truncate max-w-[220px] block text-muted-foreground" title={resolved}>
        {resolved}
      </span>
    );
  }

  // Activities
  if (field?.id === "ACTIVITY_LAST" || field?.id === "ACTIVITY_NEXT") {
    return (
      <span className="text-xs truncate max-w-[250px] block" title={resolved}>
        {resolved}
      </span>
    );
  }

  // Default — React auto-escapes JSX text, preventing XSS from CRM data
  if (colId === RESPONSIBLE_FIELD_ID) {
    const userId = String(deal?.ASSIGNED_BY_ID || "").trim();
    if (userId) {
      if (userNamesLoading && resolved === `ID ${userId}`) {
        return <Skeleton className="h-4 w-28 rounded" />;
      }
      return (
        <span className="text-xs">
          {resolved}
        </span>
      );
    }
  }

  if (colId === COMPANY_RESPONSIBLE_FIELD_ID) {
    if (userNamesLoading && resolved.startsWith("ID ")) {
      return <Skeleton className="h-4 w-28 rounded" />;
    }
    return (
      <span className="text-xs">
        {resolved}
      </span>
    );
  }

  return <span className="text-xs">{resolved}</span>;
}
