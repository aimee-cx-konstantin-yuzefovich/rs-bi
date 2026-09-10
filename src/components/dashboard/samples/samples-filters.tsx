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
import { X } from "lucide-react";
import type { NormalizedResult, SampleSummary } from "@/lib/samples/types";
import { NORMALIZED_RESULT_LABELS, SOURCE_QUALITY_LABELS } from "@/lib/samples/constants";

export type SamplesPeriodPreset =
  | "all"
  | "30days"
  | "90days"
  | "365days"
  | "custom";

export interface SamplesFilters {
  period: SamplesPeriodPreset;
  customFrom?: string;
  customTo?: string;
  companyQuery: string;
  responsibleId: string; // "all" | ID
  productFamily: string; // "all" | family
  grade: string; // "all" | grade value
  industry: string; // "all" | value
  application: string; // "all" | value
  status: string; // "all" | observed indicator/status label
  result: string; // "all" | NormalizedResult
  hasDeals: string; // "all" | "yes" | "no"
  quality: string; // "all" | SampleQuality
}

export const DEFAULT_SAMPLES_FILTERS: SamplesFilters = {
  period: "all",
  companyQuery: "",
  responsibleId: "all",
  productFamily: "all",
  grade: "all",
  industry: "all",
  application: "all",
  status: "all",
  result: "all",
  hasDeals: "all",
  quality: "all",
};

const PERIOD_OPTIONS: Array<{ value: SamplesPeriodPreset; label: string }> = [
  { value: "all", label: "За всё время" },
  { value: "30days", label: "30 дней" },
  { value: "90days", label: "90 дней" },
  { value: "365days", label: "Год" },
  { value: "custom", label: "Период…" },
];

/** Returns true when the company matches the period by ≥1 sent date. */
export function matchesPeriod(
  summary: SampleSummary,
  filters: SamplesFilters
): boolean {
  if (filters.period === "all") return true;
  if (summary.sentDates.length === 0) return false;

  let from: Date | null = null;
  let to: Date | null = null;

  if (filters.period === "custom") {
    if (filters.customFrom) from = new Date(`${filters.customFrom}T00:00:00`);
    if (filters.customTo) to = new Date(`${filters.customTo}T23:59:59`);
  } else {
    const days = { "30days": 30, "90days": 90, "365days": 365 }[
      filters.period as "30days" | "90days" | "365days"
    ];
    if (!days) return true;
    from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  return summary.sentDates.some((dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
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
  applicationOptions,
  statusOptions,
}: {
  filters: SamplesFilters;
  onChange: (next: SamplesFilters) => void;
  responsibleOptions: Array<{ value: string; label: string }>;
  productFamilyOptions: string[];
  gradeOptions: string[];
  industryOptions: string[];
  applicationOptions: string[];
  statusOptions: string[];
}) {
  const set = (patch: Partial<SamplesFilters>) => onChange({ ...filters, ...patch });
  const isDirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_SAMPLES_FILTERS);

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="samples-filters">
      {/* Period — по дате передачи образцов */}
      <div className="flex items-center gap-1.5">
        <SelectFilter
          value={filters.period}
          onChange={(v) => set({ period: v as SamplesPeriodPreset })}
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
              aria-label="Дата передачи с"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <Input
              type="date"
              value={filters.customTo ?? ""}
              onChange={(e) => set({ customTo: e.target.value })}
              className="h-8 w-[130px] text-xs"
              aria-label="Дата передачи по"
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
        value={filters.application}
        onChange={(v) => set({ application: v })}
        placeholder="Применение"
        options={[
          { value: "all", label: "Все применения" },
          ...applicationOptions.map((a) => ({ value: a, label: a })),
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

      <SelectFilter
        value={filters.hasDeals}
        onChange={(v) => set({ hasDeals: v })}
        placeholder="Связанные сделки"
        options={[
          { value: "all", label: "Сделки: любые" },
          { value: "yes", label: "Есть связанные сделки" },
          { value: "no", label: "Без связанных сделок" },
        ]}
      />

      <SelectFilter
        value={filters.quality}
        onChange={(v) => set({ quality: v })}
        placeholder="Качество данных"
        options={[
          { value: "all", label: "Любое качество" },
          ...(["structured", "partial", "legacy", "ambiguous"] as const).map((q) => ({
            value: q,
            label: SOURCE_QUALITY_LABELS[q] ?? q,
          })),
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
    </div>
  );
}
