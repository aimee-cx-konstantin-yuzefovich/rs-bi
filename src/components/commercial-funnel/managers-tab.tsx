"use client";

// src/components/commercial-funnel/managers-tab.tsx
// Managers scorecard view.
// Operational visibility without artificial ranking (Section 19).
// Sorting (WP8): all data columns sortable — full dataset sorted before
// pagination; numeric columns sort numerically, text by displayed label;
// empties («—»/null) always last; keyboard-accessible headers with aria-sort.

import { useState, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { AggregateAmountQuality, ManagerScorecardRow } from "@/lib/commercial-funnel/types";
import { formatCurrencyAmount, getCurrencyUniverse } from "@/lib/commercial-funnel/currency";
import { CommercialTablePagination } from "./table-pagination";
import {
  sortRows,
  nextSortDirection,
  ariaSortValue,
  type SortDirection,
} from "@/lib/table-sorting";

interface ManagersTabProps {
  scorecard: ManagerScorecardRow[];
  onOpenDrillDown: (title: string, subtitle: string, companyIds: string[]) => void;
}

type ManagersSortField =
  | "name"
  | "newCompanies"
  | "samplesSent"
  | "inTesting"
  | "sampleSuccess"
  | "sampleFail"
  | "sampleRework"
  | "payments"
  | "activeCompanies"
  | "awaitingPayment"
  | "noNextStep"
  | "bottlenecks";

/** Sortable header: button + aria-sort + direction indicator. */
function SortableHead({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  className = "",
  title,
  rowSpan,
}: {
  label: string;
  field: ManagersSortField;
  sortField: ManagersSortField | null;
  sortDirection: SortDirection;
  onSort: (field: ManagersSortField) => void;
  className?: string;
  title?: string;
  rowSpan?: number;
}) {
  const isSorted = sortField === field && sortDirection !== null;
  return (
    <TableHead
      className={className}
      rowSpan={rowSpan}
      aria-sort={ariaSortValue(sortDirection, sortField === field)}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        title={title ?? (isSorted ? (sortDirection === "asc" ? "По возрастанию (нажмите для убывания)" : "По убыванию (нажмите для сброса)") : "Сортировка")}
        className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:text-foreground transition-colors cursor-pointer"
      >
        <span>{label}</span>
        {isSorted && sortDirection === "asc" && <ArrowUp className="h-3 w-3 text-brand-blue flex-shrink-0" aria-hidden="true" />}
        {isSorted && sortDirection === "desc" && <ArrowDown className="h-3 w-3 text-brand-blue flex-shrink-0" aria-hidden="true" />}
        {!isSorted && <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-30 transition-opacity flex-shrink-0" aria-hidden="true" />}
      </button>
    </TableHead>
  );
}

export function CommercialManagersTab({
  scorecard,
  onOpenDrillDown,
}: ManagersTabProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState<ManagersSortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  useEffect(() => {
    setPage(1);
  }, [scorecard.length]);

  const handleSort = (field: ManagersSortField) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDirection("asc");
    } else {
      const next = nextSortDirection(sortDirection);
      setSortDirection(next);
      if (next === null) setSortField(null);
    }
    setPage(1);
  };

  // 1. Sort the ENTIRE scorecard before pagination (numeric columns numeric,
  //    name by displayed label; null/undefined always last both directions).
  const sortedScorecard = useMemo(() => {
    if (!sortField || !sortDirection) return scorecard;
    return sortRows(
      scorecard,
      (row): number | string | null => {
        switch (sortField) {
          case "name":
            return row.name;
          case "newCompanies":
            return row.newCompanies ?? null;
          case "samplesSent":
            return row.samplesSent ?? null;
          case "inTesting":
            return row.inTesting ?? null;
          case "sampleSuccess":
            return row.sampleSuccess ?? null;
          case "sampleFail":
            return row.sampleFail ?? null;
          case "sampleRework":
            return row.sampleRework ?? null;
          case "payments":
            // Primary: the largest valid per-currency amount (multi-currency
            // isolation preserved — never cross-summed).
            return row.paymentAmount ?? null;
          case "activeCompanies":
            return row.activeCompanies ?? null;
          case "awaitingPayment":
            return row.awaitingPayment ?? null;
          case "noNextStep":
            return row.noNextStep ?? null;
          case "bottlenecks":
            return row.bottlenecksCount ?? null;
          default:
            return null;
        }
      },
      sortDirection
    );
  }, [scorecard, sortField, sortDirection]);

  const pagedScorecard = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedScorecard.slice(start, start + pageSize);
  }, [sortedScorecard, page, pageSize]);
  // Aggregate non-monetary totals row
  const totals = scorecard.reduce(
    (acc, row) => ({
      newCompanies: acc.newCompanies + row.newCompanies,
      samplesSent: acc.samplesSent + row.samplesSent,
      inTesting: acc.inTesting + row.inTesting,
      sampleSuccess: acc.sampleSuccess + row.sampleSuccess,
      sampleFail: acc.sampleFail + row.sampleFail,
      sampleRework: acc.sampleRework + row.sampleRework,
      dealsCreated: acc.dealsCreated + row.dealsCreated,
      paymentsReceived: acc.paymentsReceived + row.paymentsReceived,
      bottlenecksCount: acc.bottlenecksCount + row.bottlenecksCount,
    }),
    {
      newCompanies: 0,
      samplesSent: 0,
      inTesting: 0,
      sampleSuccess: 0,
      sampleFail: 0,
      sampleRework: 0,
      dealsCreated: 0,
      paymentsReceived: 0,
      bottlenecksCount: 0,
    }
  );

  // Compute multi-currency payment totals with quality preservation across all managers
  const allManagerCurrencies = getCurrencyUniverse(
    ...scorecard.map((r) => r.paymentAmountsByCurrency),
    ...scorecard.map((r) => r.paymentAmountsQualityByCurrency)
  );

  // Portfolio totals: unique companies across managers (NOT sum of per-manager counts,
  // because one company may have deals owned by different managers).
  const uniqueCompanyCount = (key: "activeCompaniesIds" | "awaitingPaymentIds" | "noNextStepIds") => {
    const ids = new Set<string>();
    for (const row of scorecard) for (const id of row[key]) ids.add(id);
    return ids.size;
  };

  const totalCurrencyBreakdown: Record<
    string,
    { amount: number | null; quality: AggregateAmountQuality }
  > = {};

  for (const cur of allManagerCurrencies) {
    let validSum = 0;
    let hasValid = false;
    const qualities = new Set<AggregateAmountQuality>();

    for (const row of scorecard) {
      const q = row.paymentAmountsQualityByCurrency?.[cur];
      const hasAmt = row.paymentAmountsByCurrency && cur in row.paymentAmountsByCurrency;
      const amt = row.paymentAmountsByCurrency?.[cur];

      if (q) {
        qualities.add(q);
      }
      if (hasAmt && typeof amt === "number") {
        validSum += amt;
        hasValid = true;
      }
    }

    if (hasValid) {
      const isPartial =
        qualities.has("PARTIAL") ||
        qualities.has("INVALID_ONLY") ||
        qualities.has("UNKNOWN");
      totalCurrencyBreakdown[cur] = {
        amount: validSum,
        quality: isPartial ? "PARTIAL" : "COMPLETE",
      };
    } else {
      let finalQuality: AggregateAmountQuality = "UNKNOWN";
      if (qualities.size > 0 && Array.from(qualities).every((q) => q === "INVALID_ONLY")) {
        finalQuality = "INVALID_ONLY";
      } else if (qualities.size > 0 && Array.from(qualities).every((q) => q === "UNKNOWN")) {
        finalQuality = "UNKNOWN";
      } else if (qualities.has("INVALID_ONLY") || qualities.has("UNKNOWN") || qualities.has("PARTIAL")) {
        finalQuality = "PARTIAL";
      }
      totalCurrencyBreakdown[cur] = {
        amount: null,
        quality: finalQuality,
      };
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Операционный срез по менеджерам ({scorecard.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Сводка активности за период и текущий портфель в работе (без искусственного ранжирования)
          </p>
        </div>
      </div>

      {scorecard.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground border rounded-lg bg-card">
          Нет данных по менеджерам для выбранных фильтров
        </div>
      ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
          <Table containerClassName="max-h-[calc(100vh-280px)] min-h-[400px] overflow-auto">
            <TableHeader>
              {/* Group header row: Поток | Результат | Портфель (current) */}
              <TableRow className="bg-muted/70 group">
                <TableHead
                  className="text-xs font-semibold"
                  rowSpan={2}
                  aria-sort={ariaSortValue(sortDirection, sortField === "name")}
                >
                  <button
                    type="button"
                    onClick={() => handleSort("name")}
                    title={sortField === "name" ? (sortDirection === "asc" ? "По возрастанию (нажмите для убывания)" : "По убыванию (нажмите для сброса)") : "Сортировка"}
                    className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:text-foreground transition-colors cursor-pointer"
                  >
                    <span>Менеджер</span>
                    {sortField === "name" && sortDirection === "asc" && <ArrowUp className="h-3 w-3 text-brand-blue" aria-hidden="true" />}
                    {sortField === "name" && sortDirection === "desc" && <ArrowDown className="h-3 w-3 text-brand-blue" aria-hidden="true" />}
                    {!(sortField === "name" && sortDirection) && <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-30 transition-opacity" aria-hidden="true" />}
                  </button>
                </TableHead>
                <TableHead colSpan={2} className="text-xs font-semibold text-center border-l border-border/60">Поток (за период)</TableHead>
                <TableHead colSpan={5} className="text-xs font-semibold text-center border-l border-border/60">Результат</TableHead>
                <TableHead colSpan={3} className="text-xs font-semibold text-center border-l border-border/60">Портфель (сейчас)</TableHead>
                <SortableHead
                  label="Внимание"
                  field="bottlenecks"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  rowSpan={2}
                  className="text-xs font-semibold text-center border-l border-border/60"
                  title="Записи, требующие внимания"
                />
              </TableRow>
              <TableRow className="bg-muted group">
                  <SortableHead label="Новые компании" field="newCompanies" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right border-l border-border/40" />
                  <SortableHead label="Образцы отправлены" field="samplesSent" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right" />
                  <SortableHead label="На испытании" field="inTesting" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right border-l border-border/40" />
                  <SortableHead label="Подошли" field="sampleSuccess" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right" />
                  <SortableHead label="Не подошли" field="sampleFail" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right" />
                  <SortableHead label="Доработка" field="sampleRework" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right" />
                  <SortableHead label="Сумма сделок с получ. оплатой" field="payments" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right" title="Сумма сделок с полученной оплатой (по валютам)" />
                  <SortableHead label="Компании в текущем контуре" field="activeCompanies" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right border-l border-border/40" />
                  <SortableHead label="Ожидают оплаты" field="awaitingPayment" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right" />
                  <SortableHead label="Без след. шага" field="noNextStep" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-xs font-semibold text-right" title="Активные сделки без указанного следующего шага (известные данные активностей)" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedScorecard.map((row) => (
                  <TableRow
                    key={row.responsibleId}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={() =>
                      onOpenDrillDown(
                        `Компании менеджера: ${row.name}`,
                        `Всего компаний в портфеле: ${row.companyIds.length}`,
                        row.companyIds
                      )
                    }
                  >
                    <TableCell className="text-xs font-medium whitespace-nowrap">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.newCompanies || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.samplesSent || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.inTesting || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right text-emerald-600 dark:text-emerald-400 font-medium">
                      {row.sampleSuccess || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right text-rose-600 dark:text-rose-400 font-medium">
                      {row.sampleFail || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right text-amber-600 dark:text-amber-400 font-medium">
                      {row.sampleRework || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-semibold whitespace-nowrap">
                      {(() => {
                        const managerCurrs = getCurrencyUniverse(
                          row.paymentAmountsByCurrency,
                          row.paymentAmountsQualityByCurrency
                        );
                        if (managerCurrs.length > 0) {
                          return (
                            <div className="flex flex-col gap-0.5 items-end">
                              {managerCurrs.map((cur) => {
                                const curQ = row.paymentAmountsQualityByCurrency?.[cur];
                                const hasAmt =
                                  row.paymentAmountsByCurrency && cur in row.paymentAmountsByCurrency;
                                const amt = row.paymentAmountsByCurrency?.[cur];

                                if (curQ === "INVALID_ONLY") {
                                  return (
                                    <span key={cur} className="text-destructive text-[11px] font-normal">
                                      {cur} — ошибка данных
                                    </span>
                                  );
                                }
                                if (curQ === "UNKNOWN") {
                                  return (
                                    <span key={cur} className="text-muted-foreground text-[11px] font-normal">
                                      {cur} — нет данных
                                    </span>
                                  );
                                }
                                const isPartial = curQ === "PARTIAL";
                                const displayAmt = hasAmt && typeof amt === "number" ? amt : 0;
                                return (
                                  <span key={cur}>
                                    {formatCurrencyAmount(displayAmt, cur)}
                                    {isPartial && (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-1 font-normal">
                                        (неполные данные)
                                      </span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        }
                        if (row.paymentAmount !== null && row.paymentAmount > 0) {
                          return (
                            <span>
                              {formatCurrencyAmount(row.paymentAmount, "UNKNOWN")}
                              {row.paymentAmountQuality === "PARTIAL" && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-1 font-normal">
                                  (неполные данные)
                                </span>
                              )}
                            </span>
                          );
                        }
                        if (row.paymentAmountQuality === "INVALID_ONLY") {
                          return <span className="text-destructive text-[11px] font-normal">— (ошибка данных)</span>;
                        }
                        if (row.paymentAmountQuality === "UNKNOWN" && row.paymentsReceived > 0) {
                          return <span className="text-muted-foreground text-[11px] font-normal">— (нет данных)</span>;
                        }
                        return "—";
                      })()}
                    </TableCell>
                    {/* Портфель (сейчас) */}
                    <TableCell className="text-xs text-right font-medium border-l border-border/40">
                      {row.activeCompanies || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.awaitingPayment || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {row.noNextStep || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {row.bottlenecksCount > 0 ? (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          {row.bottlenecksCount}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Totals row */}
                <TableRow className="bg-muted/60 font-semibold border-t-2">
                  <TableCell className="text-xs font-bold">ИТОГО</TableCell>
                  <TableCell className="text-xs text-right font-bold">{totals.newCompanies}</TableCell>
                  <TableCell className="text-xs text-right font-bold">{totals.samplesSent}</TableCell>
                  <TableCell className="text-xs text-right font-bold">{totals.inTesting}</TableCell>
                  <TableCell className="text-xs text-right font-bold text-emerald-600 dark:text-emerald-400">
                    {totals.sampleSuccess}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold text-rose-600 dark:text-rose-400">
                    {totals.sampleFail}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold text-amber-600 dark:text-amber-400">
                    {totals.sampleRework}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold whitespace-nowrap">
                    {allManagerCurrencies.length > 0 ? (
                      <div className="flex flex-col gap-0.5 items-end">
                        {allManagerCurrencies.map((cur) => {
                          const item = totalCurrencyBreakdown[cur];
                          if (!item) return null;
                          if (item.quality === "INVALID_ONLY" && item.amount === null) {
                            return (
                              <span key={cur} className="text-destructive text-[11px] font-normal">
                                {cur} — ошибка данных
                              </span>
                            );
                          }
                          if (item.quality === "UNKNOWN" && item.amount === null) {
                            return (
                              <span key={cur} className="text-muted-foreground text-[11px] font-normal">
                                {cur} — нет данных
                              </span>
                            );
                          }
                          return (
                            <span key={cur}>
                              {formatCurrencyAmount(item.amount ?? 0, cur)}
                              {item.quality === "PARTIAL" && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-1 font-normal">
                                  (неполные данные)
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {/* Портфель totals: unique company unions across managers */}
                  <TableCell className="text-xs text-right font-bold border-l border-border/40">
                    {uniqueCompanyCount("activeCompaniesIds")}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold">
                    {uniqueCompanyCount("awaitingPaymentIds")}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold">
                    {uniqueCompanyCount("noNextStepIds")}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold">
                    {totals.bottlenecksCount > 0 ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-bold">
                        {totals.bottlenecksCount}
                      </Badge>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <CommercialTablePagination
              page={page}
              pageSize={pageSize}
              totalItems={scorecard.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
      )}
    </div>
  );
}
