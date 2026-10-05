"use client";

// src/components/dashboard/samples/samples-registry.tsx
// Main registry: ONE row per company (primary SampleSummary grain).
// Arrays render as compact badges; multiplicity is never exploded into rows.

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NORMALIZED_RESULT_LABELS } from "@/lib/samples/constants";
import type { NormalizedResult, SampleSummary } from "@/lib/samples/types";
import { useDashboardStore } from "@/store/dashboard-store";
import { resolveResponsibleDisplay } from "@/lib/enrichment-coverage";

const RESULT_BADGE_CLASS: Record<NormalizedResult, string> = {
  positive: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  negative: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  rework: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  mixed: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  unknown: "bg-muted text-muted-foreground",
};

export function formatDateRu(iso: string): string {
  if (!iso) return iso;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  const ruMatch = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(iso.trim());
  if (ruMatch) return `${ruMatch[1]}.${ruMatch[2]}.${ruMatch[3]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function Badges({ items, max = 3 }: { items: string[]; max?: number }) {
  if (items.length === 0) return <span className="text-muted-foreground">–</span>;
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

const PAGE_SIZES = [25, 50, 100, 250];

export function SamplesRegistry({
  summaries,
  onSelect,
}: {
  summaries: SampleSummary[];
  onSelect: (summary: SampleSummary) => void;
}) {
  const userNames = useDashboardStore((s) => s.userNames);
  const usersCoverage = useDashboardStore((s) => s.usersCoverage);

  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [summaries]);

  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Нет компаний с образцами по текущим условиям фильтрации
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Данные берутся напрямую из Bitrix24 – попробуйте изменить фильтры или сбросить период
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(summaries.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const pageItems = summaries.slice(startIndex, startIndex + pageSize);

  return (
    <div className="flex-1 flex flex-col min-h-0 rounded-md border border-border bg-card shadow-sm overflow-hidden">
      <div data-testid="samples-table-scroll" className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        <div className="min-w-full relative">
          <table className="data-table w-full border-separate border-spacing-0">
            <thead className="bg-card shadow-sm">
              <tr>
                <th
                  data-testid="samples-header-index"
                  className="text-center sticky top-0 left-0 z-30 bg-card border-r border-b border-border w-10 min-w-[40px] px-2 py-2 text-xs font-medium text-muted-foreground"
                >
                  №
                </th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground min-w-[200px]">Компания</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground">Ответственный компании</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground min-w-[160px]">Отрасль / применение</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground">Продукт</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground min-w-[140px]">Марка</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground">Количество</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground">Дата передачи</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground min-w-[140px]">Статус</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground min-w-[120px]">Текущий этап тестирования</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground">Активных процессов</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground">Результат</th>
                <th className="text-left sticky top-0 z-20 group bg-card border-b border-border py-2 px-2 text-xs font-medium text-muted-foreground">Сделки</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((s, idx) => (
                <tr
                  key={s.companyId}
                  data-company-id={s.companyId}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => onSelect(s)}
                >
                  <td className="text-xs font-mono tabular-nums text-muted-foreground text-center sticky left-0 z-10 bg-card border-r border-b border-border/60 py-1.5 px-2">
                    {startIndex + idx + 1}
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2 text-xs font-medium">
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
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2 text-xs text-muted-foreground">
                    {/* COMPANY grain: company owner (ASSIGNED_BY_ID), never
                        the current SP/legacy process responsible — the
                        physical SP cycle keeps its own responsible. */}
                    {s.companyResponsibleId
                      ? resolveResponsibleDisplay(s.companyResponsibleId, userNames, usersCoverage)
                      : s.companyResponsibleName ?? "–"}
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2 text-xs text-muted-foreground">
                    <span className="block max-w-[180px] truncate">
                      {[s.industry, s.application].filter(Boolean).join(" · ") || "–"}
                    </span>
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2">
                    <Badges items={s.productFamilies} />
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2">
                    <Badges items={s.grades.map((g) => g.value)} />
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2 text-xs tabular-nums">
                    {s.quantities.length > 0 ? (
                      <Badges items={s.quantities.map(formatQuantity)} />
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2 text-xs tabular-nums">
                    {s.sentDates.length > 0 ? (
                      <Badges items={s.sentDates.map(formatDateRu)} max={2} />
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2">
                    <Badges items={[...s.sampleIndicators, ...s.processStatuses]} />
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2 text-xs text-muted-foreground">
                    {s.currentActiveStageLabels && s.currentActiveStageLabels.length > 0 ? (
                      s.currentActiveStageLabels.length === 1 ? (
                        <span className="block max-w-[180px] truncate" title={s.currentActiveStageLabels[0]}>
                          {s.currentActiveStageLabels[0]}
                        </span>
                      ) : (
                        <Badges items={s.currentActiveStageLabels} max={2} />
                      )
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2 text-xs tabular-nums">
                    {s.activeSmartProcessCount && s.activeSmartProcessCount > 0 ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 font-normal"
                        title={`${s.activeSmartProcessCount} активных процессов тестирования`}
                      >
                        {s.activeSmartProcessCount}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2">
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
                  </td>
                  <td className="border-b border-border/60 py-1.5 px-2 text-xs tabular-nums">
                    {s.relatedDeals.length > 0 ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        {s.relatedDeals.length}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination footer */}
      <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {summaries.length > 0
              ? `${startIndex + 1}–${Math.min(startIndex + pageSize, summaries.length)} из ${summaries.length}`
              : "0 из 0"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground hidden sm:inline">Строк:</span>
            <select
              aria-label="Строк на странице"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="h-7 rounded-sm border-0 bg-muted/80 text-[11px] px-1.5 py-0 focus:ring-1 cursor-pointer"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={activePage <= 1}
              aria-label="Предыдущая страница"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] text-muted-foreground min-w-[50px] text-center tabular-nums">
              {activePage} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={activePage >= totalPages}
              aria-label="Следующая страница"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
