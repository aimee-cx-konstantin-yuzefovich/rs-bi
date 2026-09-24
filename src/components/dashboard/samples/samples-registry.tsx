"use client";

// src/components/dashboard/samples/samples-registry.tsx
// Main registry: ONE row per company (primary SampleSummary grain).
// Arrays render as compact badges; multiplicity is never exploded into rows.

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NORMALIZED_RESULT_LABELS,
  SOURCE_QUALITY_LABELS,
} from "@/lib/samples/constants";
import type { NormalizedResult, SampleSummary } from "@/lib/samples/types";

const RESULT_BADGE_CLASS: Record<NormalizedResult, string> = {
  positive: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  negative: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  rework: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  mixed: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  unknown: "bg-muted text-muted-foreground",
};

const QUALITY_BADGE_CLASS: Record<string, string> = {
  structured: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  partial: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  legacy: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ambiguous: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300",
};

export function formatDateRu(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function Badges({ items, max = 3 }: { items: string[]; max?: number }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>;
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((item) => (
        <Badge
          key={item}
          variant="secondary"
          className="text-[10px] px-1.5 py-0 font-normal max-w-[180px] truncate"
          title={items.join(", ")}
        >
          {item}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
          +{rest}
        </Badge>
      )}
    </div>
  );
}

function formatQuantity(q: { value: number | string; unit?: string }): string {
  const value =
    typeof q.value === "number" ? q.value.toLocaleString("ru-RU") : q.value;
  return q.unit ? `${value} ${q.unit}` : value;
}

export function SamplesRegistry({
  summaries,
  onSelect,
}: {
  summaries: SampleSummary[];
  onSelect: (summary: SampleSummary) => void;
}) {
  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Нет компаний с образцами по текущим условиям фильтрации
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Данные берутся напрямую из Bitrix24 — попробуйте изменить фильтры или сбросить период
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs min-w-[200px]">Компания</TableHead>
            <TableHead className="text-xs">Ответственный</TableHead>
            <TableHead className="text-xs min-w-[160px]">Отрасль / применение</TableHead>
            <TableHead className="text-xs">Продукт</TableHead>
            <TableHead className="text-xs min-w-[140px]">Марка</TableHead>
            <TableHead className="text-xs">Количество</TableHead>
            <TableHead className="text-xs">Дата передачи</TableHead>
            <TableHead className="text-xs min-w-[140px]">Статус</TableHead>
            <TableHead className="text-xs">Результат</TableHead>
            <TableHead className="text-xs">Сделки</TableHead>
            <TableHead className="text-xs">Качество данных</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaries.map((s) => (
            <TableRow
              key={s.companyId}
              data-company-id={s.companyId}
              className="cursor-pointer"
              onClick={() => onSelect(s)}
            >
              <TableCell className="text-sm font-medium">
                <span className="block max-w-[260px] truncate" title={s.companyTitle}>
                  {s.companyTitle}
                </span>
                {s.dataIssues.length > 0 && (
                  <span
                    className="text-[10px] text-amber-600 dark:text-amber-400"
                    title={s.dataIssues.join("; ")}
                  >
                    ⚠ {s.dataIssues.length}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {s.responsibleName ?? s.responsibleId ?? "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <span className="block max-w-[180px] truncate">
                  {[s.industry, s.application].filter(Boolean).join(" · ") || "—"}
                </span>
              </TableCell>
              <TableCell>
                <Badges items={s.productFamilies} />
              </TableCell>
              <TableCell>
                <Badges items={s.grades.map((g) => g.value)} />
              </TableCell>
              <TableCell className="text-xs tabular-nums">
                {s.quantities.length > 0 ? (
                  <Badges items={s.quantities.map(formatQuantity)} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-xs tabular-nums">
                {s.sentDates.length > 0 ? (
                  <Badges items={s.sentDates.map(formatDateRu)} max={2} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badges items={[...s.sampleIndicators, ...s.processStatuses]} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge
                    className={`text-[10px] px-1.5 py-0 font-normal ${RESULT_BADGE_CLASS[s.normalizedResult]}`}
                  >
                    {NORMALIZED_RESULT_LABELS[s.normalizedResult] ?? s.normalizedResult}
                  </Badge>
                  {s.rawTestResult && s.normalizedResult !== "unknown" && (
                    <span
                      className="max-w-[160px] truncate text-[10px] text-muted-foreground"
                      title={s.rawTestResult}
                    >
                      «{s.rawTestResult}»
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs tabular-nums">
                {s.relatedDeals.length > 0 ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                    {s.relatedDeals.length}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge
                  className={`text-[10px] px-1.5 py-0 font-normal ${QUALITY_BADGE_CLASS[s.sourceQuality] ?? ""}`}
                >
                  {SOURCE_QUALITY_LABELS[s.sourceQuality] ?? s.sourceQuality}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
