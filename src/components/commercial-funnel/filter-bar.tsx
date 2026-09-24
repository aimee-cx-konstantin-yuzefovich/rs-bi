"use client";

// src/components/commercial-funnel/filter-bar.tsx
// Global filter bar for Commercial Funnel Release 1.
// Consistent filters across all 5 views and Excel export.

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, RefreshCw, RotateCcw } from "lucide-react";
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
  onRefresh: () => void;
  refreshing: boolean;
}

const PERIOD_PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "7days", label: "7 дней" },
  { value: "30days", label: "30 дней" },
  { value: "90days", label: "90 дней" },
  { value: "quarter", label: "Квартал" },
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
    }
    for (const d of deals) {
      if (d.responsibleId) {
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
    deals.forEach((d) => d.productType.forEach((p) => p && set.add(p)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies, deals]);

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.industry && set.add(c.industry));
    deals.forEach((d) => d.industry.forEach((i) => i && set.add(i)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies, deals]);

  const directionOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.direction.forEach((dir) => dir && set.add(dir)));
    deals.forEach((d) => d.direction.forEach((dir) => dir && set.add(dir)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies, deals]);

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.region && set.add(c.region));
    deals.forEach((d) => d.region && set.add(d.region));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
  }, [companies, deals]);

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
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3.5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Period Preset Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1">Период:</span>
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onFiltersChange({ ...filters, periodPreset: p.value })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                filters.periodPreset === p.value
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}

          {/* Custom Date Inputs */}
          {filters.periodPreset === "custom" && (
            <div className="flex items-center gap-1.5 ml-2">
              <Input
                type="date"
                value={filters.customFrom || ""}
                onChange={(e) => onFiltersChange({ ...filters, customFrom: e.target.value })}
                className="h-7 w-32 text-xs"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="date"
                value={filters.customTo || ""}
                onChange={(e) => onFiltersChange({ ...filters, customTo: e.target.value })}
                className="h-7 w-32 text-xs"
              />
            </div>
          )}
        </div>

        {/* Action Buttons: Reset & Excel Export */}
        <div className="flex items-center gap-2">
          {isFiltered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFiltersChange(DEFAULT_COMMERCIAL_FILTERS)}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Сбросить фильтры
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-8 text-xs"
            title="Обновить данные"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={onExportExcel}
            disabled={exportingExcel}
            className="h-8 text-xs font-medium gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Download className="h-3.5 w-3.5" />
            {exportingExcel ? "Формирование..." : "Экспорт отчёта"}
          </Button>
        </div>
      </div>

      {/* Dimensional Selects Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1 border-t border-border/50">
        {/* Responsible */}
        <div>
          <Select
            value={filters.responsibleId || "all"}
            onValueChange={(val) => onFiltersChange({ ...filters, responsibleId: val })}
          >
            <SelectTrigger className="h-8 text-xs">
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
        </div>

        {/* Product Type */}
        <div>
          <Select
            value={filters.productType || "all"}
            onValueChange={(val) => onFiltersChange({ ...filters, productType: val })}
          >
            <SelectTrigger className="h-8 text-xs">
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
        </div>

        {/* Industry */}
        <div>
          <Select
            value={filters.industry || "all"}
            onValueChange={(val) => onFiltersChange({ ...filters, industry: val })}
          >
            <SelectTrigger className="h-8 text-xs">
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
        </div>

        {/* Direction */}
        <div>
          <Select
            value={filters.direction || "all"}
            onValueChange={(val) => onFiltersChange({ ...filters, direction: val })}
          >
            <SelectTrigger className="h-8 text-xs">
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
        </div>

        {/* Region */}
        <div>
          <Select
            value={filters.region || "all"}
            onValueChange={(val) => onFiltersChange({ ...filters, region: val })}
          >
            <SelectTrigger className="h-8 text-xs">
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
      </div>
    </div>
  );
}
