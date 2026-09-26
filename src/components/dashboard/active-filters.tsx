"use client";

import { useMemo, useCallback } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Filter, X } from "lucide-react";
import { getDealStageDisplayLabel } from "@/lib/crm-constants";

interface ActiveFilterItem {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
  /** Scope contract: GLOBAL filters affect StatsCards + Table + Excel;
   *  TABLE-ONLY filters affect the table population (and Excel row scope)
   *  but NOT the KPI cards. Visually separated to remove ambiguity. */
  scope: "GLOBAL" | "TABLE-ONLY";
}

export function ActiveFilters() {
  const {
    dateFilter,
    pipelineFilter,
    responsibleFilter,
    searchQuery,
    columnFilters,
    fields,
    userNames,
    setDateFilter,
    setPipelineFilter,
    setResponsibleFilter,
    setSearchQuery,
    clearColumnFilter,
    clearAllColumnFilters,
  } = useDashboardStore();

  const filters: ActiveFilterItem[] = useMemo(() => {
    const result: ActiveFilterItem[] = [];

    // Date filter
    if (dateFilter.preset !== "all") {
      const presetLabels: Record<string, string> = {
        "7days": "7 дней",
        "14days": "14 дней",
        "30days": "30 дней",
        "90days": "90 дней",
        custom: "Свой",
      };
      result.push({
        key: "dateFilter",
        label: "Период",
        value: presetLabels[dateFilter.preset] || dateFilter.preset,
        onRemove: () => setDateFilter({ preset: "all" }),
        scope: "GLOBAL",
      });
    }

    // Pipeline filter
    if (pipelineFilter !== "all") {
      const pipelineLabels: Record<string, string> = {
        in_work: "В работе",
        WON: "Успешные",
        LOSE: "Проиграны",
      };
      result.push({
        key: "pipelineFilter",
        label: "Воронка",
        value: pipelineLabels[pipelineFilter] || getDealStageDisplayLabel(pipelineFilter),
        onRemove: () => setPipelineFilter("all"),
        scope: "GLOBAL",
      });
    }

    // Responsible filter
    if (responsibleFilter !== "all") {
      const userName = userNames[responsibleFilter]?.trim();
      result.push({
        key: "responsibleFilter",
        label: "Ответственный",
        value: userName || `ID ${responsibleFilter}`,
        onRemove: () => setResponsibleFilter("all"),
        scope: "GLOBAL",
      });
    }

    // Search query
    if (searchQuery.trim()) {
      result.push({
        key: "searchQuery",
        label: "Поиск",
        value: searchQuery.length > 20 ? searchQuery.slice(0, 20) + "…" : searchQuery,
        onRemove: () => setSearchQuery(""),
        scope: "TABLE-ONLY",
      });
    }

    // Column filters
    columnFilters.forEach((cf) => {
      if (cf.value.trim()) {
        const field = fields.find((f) => f.id === cf.columnId);
        const fieldTitle = field?.title || cf.columnId;
        result.push({
          key: `col_${cf.columnId}`,
          label: `Столбец: ${fieldTitle}`,
          value: cf.value.length > 20 ? cf.value.slice(0, 20) + "…" : cf.value,
          onRemove: () => clearColumnFilter(cf.columnId),
          scope: "TABLE-ONLY",
        });
      }
    });

    return result;
  }, [
    dateFilter,
    pipelineFilter,
    responsibleFilter,
    searchQuery,
    columnFilters,
    fields,
    userNames,
    setDateFilter,
    setPipelineFilter,
    setResponsibleFilter,
    setSearchQuery,
    clearColumnFilter,
  ]);

  const globalFilters = filters.filter((f) => f.scope === "GLOBAL");
  const tableOnlyFilters = filters.filter((f) => f.scope === "TABLE-ONLY");

  const handleClearAll = useCallback(() => {
    clearAllColumnFilters();
    setDateFilter({ preset: "all" });
    setPipelineFilter("all");
    setResponsibleFilter("all");
    setSearchQuery("");
  }, [clearAllColumnFilters, setDateFilter, setPipelineFilter, setResponsibleFilter, setSearchQuery]);

  if (filters.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 h-7 px-2 rounded-md bg-brand-orange/20 border border-brand-orange/30 hover:bg-brand-orange/30 transition-colors filter-badge-pulse">
          <Filter className="h-3 w-3 text-brand-orange" />
          <span className="text-[11px] font-medium text-brand-orange tabular-nums">
            {filters.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-0 bg-popover border-border shadow-lg"
      >
        <div className="px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold text-foreground">
            Активные фильтры
          </span>
        </div>
        <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar space-y-1">
          {/* GLOBAL filters affect StatsCards + Table + Excel */}
          {globalFilters.length > 0 && (
            <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Глобальные (карточки, таблица, Excel)
            </div>
          )}
          {globalFilters.map((f) => (
            <FilterRow key={f.key} f={f} />
          ))}
          {/* TABLE-ONLY filters affect only the table population */}
          {tableOnlyFilters.length > 0 && (
            <div className="px-2 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Только таблица (не влияют на карточки)
            </div>
          )}
          {tableOnlyFilters.map((f) => (
            <FilterRow key={f.key} f={f} />
          ))}
        </div>
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={handleClearAll}
            className="w-full text-center text-xs font-medium text-destructive hover:text-destructive/80 transition-colors py-1"
          >
            Сбросить всё
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterRow({ f }: { f: ActiveFilterItem }) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 group"
      data-filter-scope={f.scope}
    >
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {f.label}
        </span>
        <div className="text-xs text-foreground truncate">{f.value}</div>
      </div>
      <button
        onClick={f.onRemove}
        className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={`Удалить фильтр: ${f.label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
