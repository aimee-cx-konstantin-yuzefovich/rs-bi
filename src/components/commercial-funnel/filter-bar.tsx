"use client";

// src/components/commercial-funnel/filter-bar.tsx
// Global light inline business toolbar for Commercial Funnel.
// Desktop flow left-to-right:
// Period dropdown, Responsible, Product, Industry, Direction, Region, Reset, Refresh, Export, Chevron.

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  ChevronDown,
  FileSpreadsheet,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
  PeriodPreset,
} from "@/lib/commercial-funnel/types";
import { DEFAULT_COMMERCIAL_FILTERS } from "@/lib/commercial-funnel/constants";

import { normalizeCommercialPeriodPreset } from "@/lib/commercial-funnel/date-utils";

interface FilterBarProps {
  filters: CommercialFilters;
  onFiltersChange: (newFilters: CommercialFilters) => void;
  companies: CommercialCompany[];
  deals: CommercialDeal[];
  userNames: Record<string, string>;
  onExportExcel: () => void;
  exportingExcel: boolean;
  exportDisabled?: boolean;
  /** Demo mode: export must be disabled — demo data is not a management report. */
  isDemoMode?: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const PERIOD_PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "7days", label: "7 дней" },
  { value: "14days", label: "14 дней" },
  { value: "30days", label: "30 дней" },
  { value: "90days", label: "90 дней" },
  { value: "custom", label: "Указать вручную" },
];

function isNumericId(str: string): boolean {
  return /^\d+$/.test(str.trim());
}

export function CommercialFilterBar({
  filters,
  onFiltersChange,
  companies,
  deals,
  userNames,
  onExportExcel,
  exportingExcel,
  isDemoMode = false,
  onRefresh,
  refreshing,
  collapsed = false,
  onToggleCollapse,
}: FilterBarProps) {
  // Extract unique filter options from real company/deal facts
  const responsibleOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) {
      if (c.responsibleId) {
        map.set(
          c.responsibleId,
          c.responsibleName || userNames[c.responsibleId] || `ID ${c.responsibleId}`
        );
      }
      if (c.sampleResponsibleId && !map.has(c.sampleResponsibleId)) {
        map.set(
          c.sampleResponsibleId,
          c.sampleResponsibleName || userNames[c.sampleResponsibleId] || `ID ${c.sampleResponsibleId}`
        );
      }
    }
    for (const d of deals) {
      if (d.responsibleId && !map.has(d.responsibleId)) {
        map.set(
          d.responsibleId,
          d.responsibleName || userNames[d.responsibleId] || `ID ${d.responsibleId}`
        );
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [companies, deals, userNames]);

  // Product, Industry, Direction, Region: strictly from Company facts, no raw numeric IDs
  const productOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) =>
      c.productType.forEach((p) => {
        if (p && !isNumericId(p)) set.add(p);
      })
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies]);

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => {
      if (c.industry && !isNumericId(c.industry)) set.add(c.industry);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies]);

  const directionOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) =>
      c.direction.forEach((dir) => {
        if (dir && !isNumericId(dir)) set.add(dir);
      })
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies]);

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => {
      if (c.region && !isNumericId(c.region)) set.add(c.region);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.periodPreset !== "30days") count++;
    if (filters.responsibleId && filters.responsibleId !== "all") count++;
    if (filters.productType && filters.productType !== "all") count++;
    if (filters.industry && filters.industry !== "all") count++;
    if (filters.direction && filters.direction !== "all") count++;
    if (filters.region && filters.region !== "all") count++;
    if (filters.customFrom || filters.customTo) count++;
    return count;
  }, [filters]);

  const isFiltered = activeFilterCount > 0;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card/60 p-2 shadow-2xs"
      data-testid="commercial-filter-bar"
    >
      {!collapsed ? (
        <>
          {/* 1. Period Dropdown (single dropdown with calendar icon, matching Deals page) */}
          <div className="flex items-center gap-1">
            <Select
              value={normalizeCommercialPeriodPreset(filters.periodPreset)}
              onValueChange={(val) =>
                onFiltersChange({ ...filters, periodPreset: val as PeriodPreset })
              }
            >
              <SelectTrigger
                className="h-7.5 w-[130px] text-xs gap-1.5"
                data-testid="period-preset-trigger"
              >
                <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Период" />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Custom From/To inputs when 'custom' is active */}
            {filters.periodPreset === "custom" && (
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={filters.customFrom || ""}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, customFrom: e.target.value })
                  }
                  className="h-7.5 w-28 text-xs"
                  aria-label="Дата с"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <Input
                  type="date"
                  value={filters.customTo || ""}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, customTo: e.target.value })
                  }
                  className="h-7.5 w-28 text-xs"
                  aria-label="Дата по"
                />
              </div>
            )}
          </div>

          {/* 2. Responsible */}
          <Select
            value={filters.responsibleId || "all"}
            onValueChange={(val) =>
              onFiltersChange({ ...filters, responsibleId: val })
            }
          >
            <SelectTrigger className="h-7.5 w-[140px] text-xs">
              <SelectValue placeholder="Ответственный" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все ответственные</SelectItem>
              {responsibleOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 3. Product */}
          <Select
            value={filters.productType || "all"}
            onValueChange={(val) =>
              onFiltersChange({ ...filters, productType: val })
            }
          >
            <SelectTrigger className="h-7.5 w-[125px] text-xs">
              <SelectValue placeholder="Продукт" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все продукты</SelectItem>
              {productOptions.map((prod) => (
                <SelectItem key={prod} value={prod}>
                  {prod}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 4. Industry */}
          <Select
            value={filters.industry || "all"}
            onValueChange={(val) =>
              onFiltersChange({ ...filters, industry: val })
            }
          >
            <SelectTrigger className="h-7.5 w-[125px] text-xs">
              <SelectValue placeholder="Отрасль" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все отрасли</SelectItem>
              {industryOptions.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 5. Direction */}
          <Select
            value={filters.direction || "all"}
            onValueChange={(val) =>
              onFiltersChange({ ...filters, direction: val })
            }
          >
            <SelectTrigger className="h-7.5 w-[125px] text-xs">
              <SelectValue placeholder="Направление" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все направления</SelectItem>
              {directionOptions.map((dir) => (
                <SelectItem key={dir} value={dir}>
                  {dir}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 6. Region */}
          <Select
            value={filters.region || "all"}
            onValueChange={(val) =>
              onFiltersChange({ ...filters, region: val })
            }
          >
            <SelectTrigger className="h-7.5 w-[115px] text-xs">
              <SelectValue placeholder="Регион" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все регионы</SelectItem>
              {regionOptions.map((reg) => (
                <SelectItem key={reg} value={reg}>
                  {reg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : (
        /* Collapsed Summary Indicator */
        <div className="flex items-center gap-2 mr-auto text-xs text-muted-foreground font-medium px-1">
          {activeFilterCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
              {activeFilterCount} активных
            </span>
          ) : (
            <span>Фильтры свернуты (по умолчанию: 30 дней)</span>
          )}
        </div>
      )}

      {/* Action Controls & Chevron: Reset, Refresh, Neutral Excel Export, Chevron */}
      <div className="flex items-center gap-1.5 ml-auto shrink-0">
        {/* 7. Reset (visible when filtered) */}
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFiltersChange(DEFAULT_COMMERCIAL_FILTERS)}
            className="h-7.5 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            title="Сбросить все фильтры"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Сбросить
          </Button>
        )}

        {/* 8. Refresh */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-7.5 w-7.5 p-0 cursor-pointer"
          title="Обновить данные (сброс кэша)"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </Button>

        {/* 9. Export */}
        <Button
          variant="outline"
          size="sm"
          onClick={onExportExcel}
          disabled={exportingExcel || isDemoMode || exportDisabled}
          title={
            isDemoMode
              ? "Экспорт отключён в демо-режиме: демонстрационные данные не могут использоваться как управленческий отчёт"
              : exportDisabled
              ? "Экспорт недоступен: данные отсутствуют или не загружены"
              : "Экспорт отчёта в Excel"
          }
          className="h-7.5 text-xs font-medium gap-1.5 px-2.5 cursor-pointer"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
          {exportingExcel ? "Экспорт..." : "Экспорт отчёта"}
        </Button>

        {/* 10. Chevron (Collapsible toggle) */}
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="h-7.5 w-7.5 p-0 cursor-pointer text-muted-foreground hover:text-foreground"
            title={collapsed ? "Развернуть фильтры" : "Свернуть фильтры"}
            aria-label={collapsed ? "Развернуть фильтры" : "Свернуть фильтры"}
            data-testid="filter-bar-collapse-toggle"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                collapsed ? "" : "rotate-180"
              }`}
            />
          </Button>
        )}
      </div>
    </div>
  );
}
