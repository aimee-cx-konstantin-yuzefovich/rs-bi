"use client";

// src/components/commercial-funnel/bottlenecks-tab.tsx
// Tab 5 — Требуют внимания: ACTION CENTER.
// "Что конкретно нужно сделать сейчас?"
// Rebuilt to Deals standard with:
// - 10 columns: №, Компания, Менеджер, Где зависло, Текущее состояние, Дней ожидания,
//   Последняя активность, Следующий шаг, Срок следующего шага, Сделка.
// - Sticky header, sticky № column, sticky top-left corner, constrained viewport container.
// - 50 items/page pagination (sort-before-paginate).
// - Type-aware 3-state sorting (nulls always last).
// - Exact deal title & link (opens DealPreview).
// - Selected row highlight (subtle blue tint: bg-primary/10 border-primary/20).

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import { NEXT_ACTION_MISSING_LABEL } from "@/lib/commercial-funnel/analytics";
import { ACTIVITY_PARTIAL_DISCLOSURE } from "@/lib/commercial-funnel/disclosure";
import { CommercialTablePagination } from "@/components/commercial-funnel/table-pagination";
import type { ActionPlanRow } from "@/lib/commercial-funnel/types";

interface BottlenecksTabProps {
  actionPlan: ActionPlanRow[];
  activityPartial: boolean;
  onSelectCompany: (companyId: string) => void;
  onSelectDeal: (dealId: string) => void;
  onOpenDrillDown?: (title: string, subtitle: string, companyIds: string[]) => void;
}

export type SortField =
  | "index"
  | "companyTitle"
  | "responsibleName"
  | "stuckAt"
  | "currentState"
  | "daysWaiting"
  | "lastActivity"
  | "nextAction"
  | "nextActionDate"
  | "dealTitle";

export type SortDirection = "asc" | "desc" | null;

function formatDate(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDays(days: number | null): string {
  return days === null ? "—" : `${days} дн.`;
}

export function CommercialBottlenecksTab({
  actionPlan,
  activityPartial,
  onSelectCompany,
  onSelectDeal,
}: BottlenecksTabProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDirection("asc");
    } else {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    }
    setPage(1);
  };

  // 1. Sort entire dataset before pagination (Type-aware, nulls always last)
  const sortedPlan = useMemo(() => {
    const indexed = actionPlan.map((row, idx) => ({ row, originalIndex: idx }));

    if (!sortField || !sortDirection) {
      return indexed;
    }

    return indexed.slice().sort((a, b) => {
      const itemA = a.row;
      const itemB = b.row;

      if (sortField === "index") {
        return sortDirection === "asc"
          ? a.originalIndex - b.originalIndex
          : b.originalIndex - a.originalIndex;
      }

      if (sortField === "daysWaiting") {
        const valA = itemA.daysWaiting;
        const valB = itemB.daysWaiting;
        if (valA === null && valB === null) return 0;
        if (valA === null) return 1;
        if (valB === null) return -1;
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }

      if (sortField === "lastActivity") {
        const dateA =
          itemA.lastActivityKnown && itemA.lastActivity
            ? Date.parse(itemA.lastActivity)
            : NaN;
        const dateB =
          itemB.lastActivityKnown && itemB.lastActivity
            ? Date.parse(itemB.lastActivity)
            : NaN;
        const validA = !isNaN(dateA);
        const validB = !isNaN(dateB);
        if (!validA && !validB) return 0;
        if (!validA) return 1;
        if (!validB) return -1;
        return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
      }

      if (sortField === "nextActionDate") {
        const dateA = itemA.nextActionDate ? Date.parse(itemA.nextActionDate) : NaN;
        const dateB = itemB.nextActionDate ? Date.parse(itemB.nextActionDate) : NaN;
        const validA = !isNaN(dateA);
        const validB = !isNaN(dateB);
        if (!validA && !validB) return 0;
        if (!validA) return 1;
        if (!validB) return -1;
        return sortDirection === "asc" ? dateA - dateB : dateB - dateA;
      }

      const strA = (itemA[sortField as keyof ActionPlanRow] as string | undefined)?.trim() || "";
      const strB = (itemB[sortField as keyof ActionPlanRow] as string | undefined)?.trim() || "";
      if (!strA && !strB) return 0;
      if (!strA) return 1;
      if (!strB) return -1;
      const cmp = strA.localeCompare(strB, "ru", { sensitivity: "base", numeric: true });
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [actionPlan, sortField, sortDirection]);

  // 2. Paginate
  const totalItems = sortedPlan.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedPlan = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedPlan.slice(start, start + pageSize);
  }, [sortedPlan, safePage, pageSize]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field || !sortDirection) {
      return <ArrowUpDown className="h-3 w-3 opacity-40 ml-1 inline shrink-0" />;
    }
    if (sortDirection === "asc") {
      return <ArrowUp className="h-3 w-3 text-primary ml-1 inline shrink-0" />;
    }
    return <ArrowDown className="h-3 w-3 text-primary ml-1 inline shrink-0" />;
  };

  return (
    <div className="space-y-3" data-testid="attention-tab">
      {/* Truthful activity-data disclosure */}
      {activityPartial && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
            {ACTIVITY_PARTIAL_DISCLOSURE}
          </span>
        </div>
      )}

      {actionPlan.length === 0 ? (
        <div className="rounded-xl border bg-card/60 p-8 text-center">
          <p className="text-sm font-medium">Записей не найдено</p>
          <p className="text-xs text-muted-foreground mt-1">
            По текущим объективным правилам ни одна запись не требует вмешательства.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-2xs overflow-hidden flex flex-col">
          {/* Viewport-bounded scroll container with sticky header & sticky № column */}
          <div className="max-h-[calc(100vh-280px)] overflow-auto relative">
            <table className="w-full text-xs border-collapse" data-testid="action-plan-table">
              <thead>
                <tr className="border-b bg-muted/90 backdrop-blur-xs text-left">
                  {/* Sticky top-left corner */}
                  <th
                    className="font-semibold px-2.5 py-2 w-12 sticky top-0 left-0 z-30 bg-muted/95 shadow-[1px_0_0_0_hsl(var(--border))] cursor-pointer select-none"
                    onClick={() => handleSort("index")}
                    title="Сортировка по номеру"
                  >
                    <div className="flex items-center justify-center">
                      <span>№</span>
                      {renderSortIcon("index")}
                    </div>
                  </th>
                  <th
                    className="font-semibold px-3 py-2 min-w-[180px] sticky top-0 z-20 bg-muted/95 cursor-pointer select-none"
                    onClick={() => handleSort("companyTitle")}
                  >
                    <div className="flex items-center">
                      <span>Компания</span>
                      {renderSortIcon("companyTitle")}
                    </div>
                  </th>
                  <th
                    className="font-semibold px-3 py-2 whitespace-nowrap sticky top-0 z-20 bg-muted/95 cursor-pointer select-none"
                    onClick={() => handleSort("responsibleName")}
                  >
                    <div className="flex items-center">
                      <span>Менеджер</span>
                      {renderSortIcon("responsibleName")}
                    </div>
                  </th>
                  <th
                    className="font-semibold px-3 py-2 sticky top-0 z-20 bg-muted/95 cursor-pointer select-none"
                    onClick={() => handleSort("stuckAt")}
                  >
                    <div className="flex items-center">
                      <span>Где зависло</span>
                      {renderSortIcon("stuckAt")}
                    </div>
                  </th>
                  <th
                    className="font-semibold px-3 py-2 sticky top-0 z-20 bg-muted/95 cursor-pointer select-none"
                    onClick={() => handleSort("currentState")}
                  >
                    <div className="flex items-center">
                      <span>Текущее состояние</span>
                      {renderSortIcon("currentState")}
                    </div>
                  </th>
                  <th
                    className="font-semibold px-3 py-2 whitespace-nowrap sticky top-0 z-20 bg-muted/95 cursor-pointer select-none"
                    onClick={() => handleSort("daysWaiting")}
                  >
                    <div className="flex items-center">
                      <span>Дней ожидания</span>
                      {renderSortIcon("daysWaiting")}
                    </div>
                  </th>
                  <th
                    className="font-semibold px-3 py-2 whitespace-nowrap sticky top-0 z-20 bg-muted/95 cursor-pointer select-none"
                    onClick={() => handleSort("lastActivity")}
                  >
                    <div className="flex items-center">
                      <span>Последняя активность</span>
                      {renderSortIcon("lastActivity")}
                    </div>
                  </th>
                  <th
                    className="font-semibold px-3 py-2 min-w-[200px] sticky top-0 z-20 bg-muted/95 cursor-pointer select-none"
                    onClick={() => handleSort("nextAction")}
                  >
                    <div className="flex items-center">
                      <span>Следующий шаг</span>
                      {renderSortIcon("nextAction")}
                    </div>
                  </th>
                  <th
                    className="font-semibold px-3 py-2 whitespace-nowrap sticky top-0 z-20 bg-muted/95 cursor-pointer select-none"
                    onClick={() => handleSort("nextActionDate")}
                  >
                    <div className="flex items-center">
                      <span>Срок следующего шага</span>
                      {renderSortIcon("nextActionDate")}
                    </div>
                  </th>
                  <th
                    className="font-semibold px-3 py-2 sticky top-0 z-20 bg-muted/95 cursor-pointer select-none"
                    onClick={() => handleSort("dealTitle")}
                  >
                    <div className="flex items-center">
                      <span>Сделка</span>
                      {renderSortIcon("dealTitle")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedPlan.map(({ row }, pageRowIndex) => {
                  const isSelected = selectedRowId === row.id;
                  const rowNumber = (safePage - 1) * pageSize + pageRowIndex + 1;

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRowId((prev) => (prev === row.id ? null : row.id))}
                      className={`border-b border-border/40 align-top transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-primary/10 border-primary/20 text-foreground"
                          : "hover:bg-accent/40"
                      }`}
                    >
                      {/* Sticky left № column */}
                      <td
                        className={`px-2.5 py-2 text-center tabular-nums text-muted-foreground sticky left-0 z-10 shadow-[1px_0_0_0_hsl(var(--border))] ${
                          isSelected ? "bg-primary/10 font-semibold text-primary" : "bg-card"
                        }`}
                      >
                        {rowNumber}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCompany(row.companyId);
                          }}
                          className="font-medium text-primary hover:underline cursor-pointer text-left"
                        >
                          {row.companyTitle}
                        </button>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.responsibleName}</td>
                      <td className="px-3 py-2">{row.stuckAt}</td>
                      <td className="px-3 py-2">{row.currentState}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap font-medium">
                        {formatDays(row.daysWaiting)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.lastActivityKnown ? (
                          formatDate(row.lastActivity)
                        ) : (
                          <span
                            className="italic text-muted-foreground"
                            title="Данные активностей недоступны"
                          >
                            данные активности недоступны
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.nextAction ? (
                          <span className="whitespace-normal">{row.nextAction}</span>
                        ) : (
                          <span className="italic text-muted-foreground">
                            {NEXT_ACTION_MISSING_LABEL}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                        {formatDate(row.nextActionDate)}
                      </td>
                      <td className="px-3 py-2">
                        {row.dealId && row.dealTitle ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDeal(row.dealId!);
                            }}
                            className="inline-flex items-center gap-1 text-primary hover:underline cursor-pointer text-left"
                            title="Открыть сделку"
                          >
                            <span>{row.dealTitle}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Client-side table pagination footer */}
          <CommercialTablePagination
            page={safePage}
            pageSize={pageSize}
            totalItems={totalItems}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[25, 50, 100]}
          />
        </div>
      )}
    </div>
  );
}
