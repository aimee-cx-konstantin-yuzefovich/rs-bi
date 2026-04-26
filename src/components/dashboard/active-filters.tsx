"use client";

import { useMemo, useCallback } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Filter, X } from "lucide-react";

interface ActiveFilterItem {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
}

export function ActiveFilters() {
  const {
    dateFilter,
    pipelineFilter,
    responsibleFilter,
    searchQuery,
    columnFilters,
    fields,
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
      });
    }

    // Pipeline filter
    if (pipelineFilter !== "all") {
      const pipelineLabels: Record<string, string> = {
        in_work: "В работе",
        WON: "Успешно",
        LOSE: "Провал",
      };
      result.push({
        key: "pipelineFilter",
        label: "Воронка",
        value: pipelineLabels[pipelineFilter] || pipelineFilter,
        onRemove: () => setPipelineFilter("all"),
      });
    }

    // Responsible filter
    if (responsibleFilter !== "all") {
      result.push({
        key: "responsibleFilter",
        label: "Ответственный",
        value: responsibleFilter,
        onRemove: () => setResponsibleFilter("all"),
      });
    }

    // Search query
    if (searchQuery.trim()) {
      result.push({
        key: "searchQuery",
        label: "Поиск",
        value: searchQuery.length > 20 ? searchQuery.slice(0, 20) + "…" : searchQuery,
        onRemove: () => setSearchQuery(""),
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
    setDateFilter,
    setPipelineFilter,
    setResponsibleFilter,
    setSearchQuery,
    clearColumnFilter,
  ]);

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
          {filters.map((f) => (
            <div
              key={f.key}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 group"
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
