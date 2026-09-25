"use client";

// src/components/commercial-funnel/bottlenecks-tab.tsx
// Actionable bottlenecks & items requiring attention (Section 18).
// Derived strictly from reliable event date + current state.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type { BottleneckItem } from "@/lib/commercial-funnel/types";
import { formatCurrencyAmount } from "@/lib/commercial-funnel/normalize";

interface BottlenecksTabProps {
  bottlenecks: BottleneckItem[];
  onSelectCompany: (companyId: string) => void;
  onSelectDeal: (dealId: string) => void;
}

export function CommercialBottlenecksTab({
  bottlenecks,
  onSelectCompany,
  onSelectDeal,
}: BottlenecksTabProps) {
  const getBadgeClass = (type: BottleneckItem["type"]) => {
    switch (type) {
      case "sample_testing_stalled":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700";
      case "payment_overdue":
        return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-700";
      case "sample_success_no_deal":
        return "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-700";
      case "stalled_deal":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-700";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Узкие места и точки внимания ({bottlenecks.length})
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Компании и сделки, требующие оперативного вмешательства руководителя (задержки испытаний, счетов, отсутствие следующих шагов)
          </p>
        </div>
      </div>

      {bottlenecks.length === 0 ? (
        <div className="py-12 text-center text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20">
          Зависших процессов и критических задержек не обнаружено
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Компания</TableHead>
                  <TableHead className="text-xs font-semibold">Менеджер</TableHead>
                  <TableHead className="text-xs font-semibold">Проблема</TableHead>
                  <TableHead className="text-xs font-semibold">Текущее состояние</TableHead>
                  <TableHead className="text-xs font-semibold">Дата события</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Дней ожидания</TableHead>
                  <TableHead className="text-xs font-semibold">Сделка</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Сумма</TableHead>
                  <TableHead className="text-xs font-semibold">Следующий шаг / Рекомендация</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bottlenecks.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    {/* Компания */}
                    <TableCell className="text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => onSelectCompany(item.companyId)}
                        className="text-left font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span className="truncate max-w-[170px]">{item.companyTitle}</span>
                        <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                      </button>
                    </TableCell>

                    {/* Менеджер */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.responsibleName}
                    </TableCell>

                    {/* Проблема */}
                    <TableCell className="text-xs whitespace-nowrap">
                      <Badge variant="outline" className={`text-[10px] font-medium ${getBadgeClass(item.type)}`}>
                        {item.issueLabel}
                      </Badge>
                    </TableCell>

                    {/* Текущее состояние */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.currentState}
                    </TableCell>

                    {/* Дата */}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.relevantDate || "—"}
                    </TableCell>

                    {/* Дней ожидания */}
                    <TableCell className="text-xs text-right whitespace-nowrap">
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {item.daysWaiting} дн.
                      </span>
                    </TableCell>

                    {/* Сделка */}
                    <TableCell className="text-xs text-muted-foreground">
                      {item.dealId ? (
                        <button
                          type="button"
                          onClick={() => onSelectDeal(item.dealId!)}
                          className="text-left hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span className="truncate max-w-[140px]">{item.dealTitle}</span>
                          <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>

                    {/* Сумма */}
                    <TableCell className="text-xs text-right font-medium whitespace-nowrap">
                      {item.amount
                        ? formatCurrencyAmount(item.amount, item.currencyId || "RUB")
                        : "—"}
                    </TableCell>

                    {/* Следующий шаг */}
                    <TableCell className="text-xs max-w-[240px] truncate text-muted-foreground" title={item.nextAction}>
                      {item.nextAction || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
