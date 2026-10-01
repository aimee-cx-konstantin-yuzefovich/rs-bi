"use client";

// src/components/commercial-funnel/filter-bar.tsx
// Global light inline business toolbar for Commercial Funnel.
// Flow controls left-to-right: Period preset, Responsible, Product, Industry, Direction, Region, Reset, Refresh, Export.

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, RefreshCw, RotateCcw } from "lucide-react";
import type { CommercialCompany, CommercialDeal, CommercialFilters, PeriodPreset } from "@/lib/commercial-funnel/types";
import { DEFAULT_COMMERCIAL_FILTERS } from "@/lib/commercial-funnel/constants";
import { useMemo } from "react";

interface FilterBarProps {
  filters: CommercialFilters;
  onFiltersChange: (newFilters: CommercialFilters) => void;
  companies: CommercialCompany[];
  deals: CommercialDeal[];
  userNames: Record<string, string>;
  onExportExcel: () => void;
  exportingExcel: boolean;
  /** Demo mode: export must be disabled — demo data is not a management report. */
  isDemoMode?: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}

const PERIOD_PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "7days", label: "7 дней" },
  { value: "30days", label: "30 дней" },
  { value: "90days", label: "90 дней" },
  { value: "quarter", label: "Квартал" },
  { value: "all", label: "За всё время" },
  { value: "custom", label: "Произвольный" },
];

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
}: FilterBarProps) {
  // Extract unique filter options from real data
  const responsibleOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) {
      if (c.responsibleId) {
        map.set(c.responsibleId, c.responsibleName || userNames[c.responsibleId] || `ID ${c.responsibleId}`);
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
        map.set(d.responsibleId, d.responsibleName || userNames[d.responsibleId] || `ID ${d.responsibleId}`);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [companies, deals, userNames]);

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.productType.forEach((p) => p && set.add(p)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies]);

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.industry && set.add(c.industry));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies]);

  const directionOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.direction.forEach((dir) => dir && set.add(dir)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies]);

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.region && set.add(c.region));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies]);

  const isFiltered =
    filters.periodPreset !== "30days" ||
    filters.responsibleId !== "all" ||
    filters.productType !== "all" ||
    filters.industry !== "all" ||
    filters.direction !== "all" ||
    filters.region !== "all" ||
    Boolean(filters.customFrom) ||
    Boolean(filters.customTo);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/60 p-2.5 shadow-2xs">
      {/* Period Preset Pills */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs font-medium text-muted-foreground mr-1 hidden sm:inline">Период:</span>
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onFiltersChange({ ...filters, periodPreset: p.value })}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
              filters.periodPreset === p.value
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}

        {/* Custom Date Inputs */}
        {filters.periodPreset === "custom" && (
          <div className="flex items-center gap-1 ml-1">
            <Input
              type="date"
              value={filters.customFrom || ""}
              onChange={(e) => onFiltersChange({ ...filters, customFrom: e.target.value })}
              className="h-7 w-28 text-xs"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <Input
              type="date"
              value={filters.customTo || ""}
              onChange={(e) => onFiltersChange({ ...filters, customTo: e.target.value })}
              className="h-7 w-28 text-xs"
            />
          </div>
        )}
      </div>

      <div className="hidden xl:block h-4 w-px bg-border/60" />

      {/* Dimensional Selects */}
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-[280px]">
        {/* Responsible */}
        <Select
          value={filters.responsibleId || "all"}
          onValueChange={(val) => onFiltersChange({ ...filters, responsibleId: val })}
        >
          <SelectTrigger className="h-7.5 w-[150px] text-xs">
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

        {/* Product Type */}
        <Select
          value={filters.productType || "all"}
          onValueChange={(val) => onFiltersChange({ ...filters, productType: val })}
        >
          <SelectTrigger className="h-7.5 w-[130px] text-xs">
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

        {/* Industry */}
        <Select
          value={filters.industry || "all"}
          onValueChange={(val) => onFiltersChange({ ...filters, industry: val })}
        >
          <SelectTrigger className="h-7.5 w-[130px] text-xs">
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

        {/* Direction */}
        <Select
          value={filters.direction || "all"}
          onValueChange={(val) => onFiltersChange({ ...filters, direction: val })}
        >
          <SelectTrigger className="h-7.5 w-[130px] text-xs">
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

        {/* Region */}
        <Select
          value={filters.region || "all"}
          onValueChange={(val) => onFiltersChange({ ...filters, region: val })}
        >
          <SelectTrigger className="h-7.5 w-[120px] text-xs">
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
      </div>

      {/* Action Controls: Reset, Refresh, Neutral Excel Export */}
      <div className="flex items-center gap-1.5 ml-auto">
        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFiltersChange(DEFAULT_COMMERCIAL_FILTERS)}
            className="h-7.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Сбросить
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-7.5 w-7.5 p-0"
          title="Обновить данные"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onExportExcel}
          disabled={exportingExcel || isDemoMode}
          title={
            isDemoMode
              ? "Экспорт отключён в демо-режиме: демонстрационные данные не могут использоваться как управленческий отчёт"
              : "Экспорт отчёта в Excel"
          }
          className="h-7.5 text-xs font-medium gap-1.5 px-2.5"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
          {exportingExcel ? "Экспорт..." : "Экспорт отчёта"}
        </Button>
      </div>
    </div>
  );
}
