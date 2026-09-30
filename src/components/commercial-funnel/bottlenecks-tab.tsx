"use client";

// src/components/commercial-funnel/bottlenecks-tab.tsx
// Tab 5 — Требуют внимания: ACTION CENTER.
// "Что конкретно нужно сделать сейчас?"
// Columns per management contract; authoritative data only:
// - Следующий шаг: activityNext only; absent → "Следующий шаг не указан"
//   (never invented — 58a0dfb contract).
// - Последняя активность: activityLast when activityDataKnown; otherwise an
//   explicit "данные активности недоступны" disclosure.
// - No Приоритет column: no deterministic priority rule exists in source.

import { ExternalLink } from "lucide-react";
import { NEXT_ACTION_MISSING_LABEL } from "@/lib/commercial-funnel/analytics";
import { ACTIVITY_PARTIAL_DISCLOSURE } from "@/lib/commercial-funnel/disclosure";
import type { ActionPlanRow } from "@/lib/commercial-funnel/types";

interface BottlenecksTabProps {
  actionPlan: ActionPlanRow[];
  activityPartial: boolean;
  onSelectCompany: (companyId: string) => void;
  onSelectDeal: (dealId: string) => void;
  onOpenDrillDown: (title: string, subtitle: string, companyIds: string[]) => void;
}

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
  onOpenDrillDown,
}: BottlenecksTabProps) {
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
        <div className="rounded-xl border bg-card/60 shadow-2xs overflow-x-auto">
          <table className="w-full text-xs" data-testid="action-plan-table">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="font-semibold px-3 py-2 min-w-[180px]">Компания</th>
                <th className="font-semibold px-3 py-2">Менеджер</th>
                <th className="font-semibold px-3 py-2">Где зависло</th>
                <th className="font-semibold px-3 py-2">Текущее состояние</th>
                <th className="font-semibold px-3 py-2 whitespace-nowrap">Дней ожидания</th>
                <th className="font-semibold px-3 py-2 whitespace-nowrap">Последняя активность</th>
                <th className="font-semibold px-3 py-2 min-w-[200px]">Следующий шаг</th>
                <th className="font-semibold px-3 py-2 whitespace-nowrap">Срок следующего шага</th>
                <th className="font-semibold px-3 py-2">Сделка</th>
              </tr>
            </thead>
            <tbody>
              {actionPlan.map((row) => (
                <tr key={row.id} className="border-b border-border/40 hover:bg-accent/30 align-top">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onSelectCompany(row.companyId)}
                      className="font-medium text-primary hover:underline cursor-pointer text-left"
                    >
                      {row.companyTitle}
                    </button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.responsibleName}</td>
                  <td className="px-3 py-2">{row.stuckAt}</td>
                  <td className="px-3 py-2">{row.currentState}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatDays(row.daysWaiting)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {row.lastActivityKnown ? (
                      formatDate(row.lastActivity)
                    ) : (
                      <span className="italic text-muted-foreground" title="Данные активностей недоступны">
                        данные активности недоступны
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.nextAction ? (
                      <span className="whitespace-normal">{row.nextAction}</span>
                    ) : (
                      <span className="italic text-muted-foreground">{NEXT_ACTION_MISSING_LABEL}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatDate(row.nextActionDate)}</td>
                  <td className="px-3 py-2">
                    {row.dealId && row.dealTitle ? (
                      <button
                        type="button"
                        onClick={() => onSelectDeal(row.dealId!)}
                        className="inline-flex items-center gap-1 text-primary hover:underline cursor-pointer text-left"
                      >
                        {row.dealTitle}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
