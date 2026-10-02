"use client";

// src/components/dashboard/samples/samples-filters.tsx
// Filter bar for /samples. Period semantics: a company matches when at
// least ONE valid sample sent date falls inside the selected period —
// never company/deal creation dates (Samples v1 §12.B).

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Download, X } from "lucide-react";
import type { NormalizedResult, SampleSummary } from "@/lib/samples/types";
import { NORMALIZED_RESULT_LABELS } from "@/lib/samples/constants";
import { parseStrictDate, BUSINESS_TIMEZONE } from "@/lib/scalar-safety";

export type SamplesPeriodPreset =
  | "7days"
  | "14days"
  | "30days"
  | "90days"
  | "custom";

export function normalizeSamplesPeriodPreset(preset?: string | null): SamplesPeriodPreset {
  if (
    preset === "7days" ||
    preset === "14days" ||
    preset === "30days" ||
    preset === "90days" ||
    preset === "custom"
  ) {
    return preset;
  }
  return "30days";
}

export interface SamplesFilters {
  period: SamplesPeriodPreset;
  customFrom?: string;
  customTo?: string;
  companyQuery: string;
  responsibleId: string; // "all" | ID
  productFamily: string; // "all" | family
  grade: string; // "all" | grade value
  industry: string; // "all" | value
  status: string; // "all" | observed indicator/status label
  result: string; // "all" | NormalizedResult
}

export const DEFAULT_SAMPLES_FILTERS: SamplesFilters = {
  period: "30days",
  companyQuery: "",
  responsibleId: "all",
  productFamily: "all",
  grade: "all",
  industry: "all",
  status: "all",
  result: "all",
};

export const PERIOD_OPTIONS: Array<{ value: SamplesPeriodPreset; label: string }> = [
  { value: "7days", label: "7 дней" },
  { value: "14days", label: "14 дней" },
  { value: "30days", label: "30 дней" },
  { value: "90days", label: "90 дней" },
  { value: "custom", label: "Указать вручную" },
];

/**
 * Computes the inclusive business-calendar window for a period preset.
 * Pure function: `now` is injectable for deterministic tests. Semantics are
 * fixed calendar days in the business timezone:
 *   7days   = current Europe/Moscow calendar day + previous 6 calendar days
 *   14days  = current day + previous 13
 *   30days  = current day + previous 29
 *   90days  = current day + previous 89
 * Ends at 23:59:59.999 of the current Moscow calendar day.
 * Never compares calendar dates to an arbitrary rolling clock timestamp.
 */
export function samplesPeriodWindow(
  filters: Pick<SamplesFilters, "period" | "customFrom" | "customTo">,
  now: Date = new Date()
): { from: Date | null; to: Date | null } {
  const period = normalizeSamplesPeriodPreset(filters.period);

  if (period === "custom") {
    if (!filters.customFrom || !filters.customTo) {
      return { from: null, to: null };
    }
    let from = parseStrictDate(`${filters.customFrom}T00:00:00`, { mode: "DATETIME_BUSINESS_TIMEZONE" });
    let to = parseStrictDate(`${filters.customTo}T23:59:59.999`, { mode: "DATETIME_BUSINESS_TIMEZONE" });
    if (!from || !to) {
      return { from: null, to: null };
    }
    if (from.getTime() > to.getTime()) {
      const tempFrom = parseStrictDate(`${filters.customTo}T00:00:00`, { mode: "DATETIME_BUSINESS_TIMEZONE" });
      const tempTo = parseStrictDate(`${filters.customFrom}T23:59:59.999`, { mode: "DATETIME_BUSINESS_TIMEZONE" });
      from = tempFrom;
      to = tempTo;
    }
    return { from, to };
  }

  const daysBackMap: Record<string, number> = {
    "7days": 6,
    "14days": 13,
    "30days": 29,
    "90days": 89,
  };
  const daysBack = daysBackMap[period];
  if (daysBack === undefined) return { from: null, to: null };

  // Current Moscow calendar day, expressed at 00:00 Moscow and 23:59:59.999 Moscow
  const moscowDayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const moscowStartOfDay = parseStrictDate(
    `${moscowDayStr}T00:00:00`,
    { mode: "DATETIME_BUSINESS_TIMEZONE" }
  );
  if (!moscowStartOfDay) return { from: null, to: null };

  const moscowEndOfDay = parseStrictDate(
    `${moscowDayStr}T23:59:59.999`,
    { mode: "DATETIME_BUSINESS_TIMEZONE" }
  );
  if (!moscowEndOfDay) return { from: null, to: null };

  const from = new Date(moscowStartOfDay.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return { from, to: moscowEndOfDay };
}

/** Returns true when the company matches the period by ≥1 sent date. */
export function matchesPeriod(
  summary: SampleSummary,
  filters: SamplesFilters,
  now: Date = new Date()
): boolean {
  if (summary.sentDates.length === 0) return false;

  const { from, to } = samplesPeriodWindow(filters, now);
  if (!from || !to) return false;

  return summary.sentDates.some((dateStr) => {
    // Strict parsing: "2026-02-31" never rolls to another valid date.
    const d = parseStrictDate(`${dateStr}T00:00:00`, { mode: "DATETIME_BUSINESS_TIMEZONE" });
    if (!d) return false;
    return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
  });
}

/**
 * Returns a truthful, human-readable period disclosure label for Samples.
 * Pure function: formats presets as "7 дней", "14 дней", "30 дней", "90 дней",
 * and valid custom periods as "DD.MM.YYYY — DD.MM.YYYY" using the normalized window.
 * Returns null if custom period is incomplete or invalid.
 */
export function formatSamplesPeriodLabel(
  filters: Pick<SamplesFilters, "period" | "customFrom" | "customTo">,
  now: Date = new Date()
): string | null {
  const period = normalizeSamplesPeriodPreset(filters.period);
  switch (period) {
    case "7days":
      return "7 дней";
    case "14days":
      return "14 дней";
    case "30days":
      return "30 дней";
    case "90days":
      return "90 дней";
    case "custom": {
      const { from, to } = samplesPeriodWindow(filters, now);
      if (!from || !to) return null;
      const formatRu = (d: Date) => {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: BUSINESS_TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d).split("-"); // [YYYY, MM, DD]
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
      };
      return `${formatRu(from)} — ${formatRu(to)}`;
    }
    default:
      return "30 дней";
  }
}

function SelectFilter({
  value,
  onChange,
  placeholder,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className={`h-8 text-xs min-w-[130px] ${className ?? ""}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SamplesFilterBar({
  filters,
  onChange,
  responsibleOptions,
  productFamilyOptions,
  gradeOptions,
  industryOptions,
  statusOptions,
  showKpis,
  onToggleKpis,
  onExport,
  exportDisabled,
  totalCount,
}: {
  filters: SamplesFilters;
  onChange: (next: SamplesFilters) => void;
  responsibleOptions: Array<{ value: string; label: string }>;
  productFamilyOptions: string[];
  gradeOptions: string[];
  industryOptions: string[];
  statusOptions: string[];
  showKpis?: boolean;
  onToggleKpis?: () => void;
  onExport?: () => void;
  exportDisabled?: boolean;
  totalCount?: number;
}) {
  const set = (patch: Partial<SamplesFilters>) => onChange({ ...filters, ...patch });
  const isDirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_SAMPLES_FILTERS);

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="samples-filters">
      {/* Period — по дате передачи образцов */}
      <div className="flex items-center gap-1.5">
        <SelectFilter
          value={normalizeSamplesPeriodPreset(filters.period)}
          onChange={(v) => set({ period: normalizeSamplesPeriodPreset(v) })}
          placeholder="Период"
          options={PERIOD_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
        />
        {filters.period === "custom" && (
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={filters.customFrom ?? ""}
              onChange={(e) => set({ customFrom: e.target.value })}
              className="h-8 w-[130px] text-xs"
              aria-label="Дата с"
              placeholder="Дата с"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={filters.customTo ?? ""}
              onChange={(e) => set({ customTo: e.target.value })}
              className="h-8 w-[130px] text-xs"
              aria-label="Дата по"
              placeholder="Дата по"
            />
          </div>
        )}
        <span className="hidden xl:inline text-[10px] text-muted-foreground">
          по дате передачи образцов
        </span>
      </div>

      {/* Company search */}
      <Input
        value={filters.companyQuery}
        onChange={(e) => set({ companyQuery: e.target.value })}
        placeholder="Поиск компании…"
        className="h-8 w-[170px] text-xs"
      />

      <SelectFilter
        value={filters.responsibleId}
        onChange={(v) => set({ responsibleId: v })}
        placeholder="Ответственный"
        options={[
          { value: "all", label: "Все ответственные" },
          ...responsibleOptions,
        ]}
      />

      <SelectFilter
        value={filters.productFamily}
        onChange={(v) => set({ productFamily: v })}
        placeholder="Продукт"
        options={[
          { value: "all", label: "Все продукты" },
          ...productFamilyOptions.map((f) => ({ value: f, label: f })),
        ]}
      />

      <SelectFilter
        value={filters.grade}
        onChange={(v) => set({ grade: v })}
        placeholder="Марка"
        options={[
          { value: "all", label: "Все марки" },
          ...gradeOptions.map((g) => ({ value: g, label: g })),
        ]}
      />

      <SelectFilter
        value={filters.industry}
        onChange={(v) => set({ industry: v })}
        placeholder="Отрасль"
        options={[
          { value: "all", label: "Все отрасли" },
          ...industryOptions.map((i) => ({ value: i, label: i })),
        ]}
      />

      <SelectFilter
        value={filters.status}
        onChange={(v) => set({ status: v })}
        placeholder="Статус"
        options={[
          { value: "all", label: "Любой статус" },
          ...statusOptions.map((s) => ({ value: s, label: s })),
        ]}
      />

      <SelectFilter
        value={filters.result}
        onChange={(v) => set({ result: v })}
        placeholder="Результат"
        options={[
          { value: "all", label: "Любой результат" },
          ...(["positive", "negative", "rework", "pending", "mixed", "unknown"] as NormalizedResult[]).map(
            (r) => ({ value: r, label: NORMALIZED_RESULT_LABELS[r] ?? r })
          ),
        ]}
      />

      {isDirty && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onChange(DEFAULT_SAMPLES_FILTERS)}
        >
          <X className="h-3.5 w-3.5" />
          Сбросить
        </Button>
      )}

      {onToggleKpis && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={onToggleKpis}
          type="button"
        >
          {showKpis ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span>Скрыть KPI</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Показать KPI</span>
            </>
          )}
        </Button>
      )}

      {onExport && (
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exportDisabled}
          className="h-8 gap-1.5 text-xs shrink-0"
          title="Экспорт реестра образцов в Excel"
          type="button"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Экспорт</span>
        </Button>
      )}

      {totalCount !== undefined && (
        <div className="ml-auto text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          Всего компаний: {totalCount}
        </div>
      )}
    </div>
  );
}
