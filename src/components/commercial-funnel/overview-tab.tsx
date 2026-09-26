"use client";

// src/components/commercial-funnel/overview-tab.tsx
// Overview view: Period Activity (Dated events) + Current Portfolio (WIP).
// Full drill-down support on every KPI card.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Clock,
  CreditCard,
  FileCheck2,
  FlaskConical,
  Handshake,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import type {
  CommercialCompany,
  DatedKpi,
  PeriodBoundaries,
  WipKpi,
} from "@/lib/commercial-funnel/types";
import { formatCurrencyAmount } from "@/lib/commercial-funnel/normalize";

interface OverviewTabProps {
  datedKpis: DatedKpi[];
  wipKpis: WipKpi[];
  boundaries: PeriodBoundaries;
  onOpenDrillDown: (title: string, subtitle: string, companyIds: string[]) => void;
}

export function CommercialOverviewTab({
  datedKpis,
  wipKpis,
  boundaries,
  onOpenDrillDown,
}: OverviewTabProps) {
  const getIconForDatedKpi = (id: string) => {
    switch (id) {
      case "new_companies":
        return Building2;
      case "samples_sent":
        return FlaskConical;
      case "deals_created":
        return Handshake;
      case "payments_received":
      case "payment_amount":
        return CreditCard;
      case "shipments":
        return Truck;
      default:
        return Calendar;
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── BLOCK 1: DATED EVENTS (Активность за период) ─── */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Активность за период
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              События с надёжной датой за период {boundaries.currentStartStr} — {boundaries.currentEndStr} в сравнении с предыдущим периодом
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Кликните на карточку для просмотра списка компаний
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {datedKpis.map((kpi) => {
            const Icon = getIconForDatedKpi(kpi.id);
            const isPositive = kpi.delta !== null && kpi.delta > 0;
            const isNegative = kpi.delta !== null && kpi.delta < 0;

            return (
              <Card
                key={kpi.id}
                onClick={() =>
                  onOpenDrillDown(
                    kpi.label,
                    `Период: ${boundaries.currentStartStr} — ${boundaries.currentEndStr}`,
                    kpi.companyIds
                  )
                }
                className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-xs group"
              >
                <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
                  <span className="text-xs font-medium text-muted-foreground line-clamp-1 group-hover:text-primary transition-colors">
                    {kpi.label}
                  </span>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {kpi.isMultiCurrency && kpi.currencyBreakdown ? (
                    <div className="space-y-0.5">
                      {(() => {
                        const allCurrs = Array.from(
                          new Set([
                            ...Object.keys(kpi.currencyBreakdown.current),
                            ...Object.keys(kpi.currencyBreakdown.previous),
                          ])
                        ).sort();
                        if (allCurrs.length === 0) {
                          return <div className="text-lg font-bold tracking-tight">0</div>;
                        }
                        return allCurrs.map((cur) => {
                          const amt = kpi.currencyBreakdown!.current[cur] || 0;
                          const curQuality =
                            kpi.currencyBreakdownQuality?.current?.[cur] ||
                            (Object.keys(kpi.currencyBreakdown!.current).length === 1
                              ? kpi.amountQuality
                              : undefined);
                          const isPartial = curQuality === "PARTIAL";
                          return (
                            <div key={cur} className="text-base font-bold tracking-tight">
                              {formatCurrencyAmount(amt, cur)}
                              {isPartial && (
                                <span className="ml-1.5 text-xs font-normal text-amber-600 dark:text-amber-400">
                                  (неполные)
                                </span>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  ) : (
                    <div className="text-lg font-bold tracking-tight">
                      {kpi.isCurrency ? (
                        kpi.currentValue !== null ? (
                          <>
                            {formatCurrencyAmount(kpi.currentValue, kpi.currencyId)}
                            {kpi.amountQuality === "PARTIAL" && (
                              <span className="ml-1.5 text-xs font-normal text-amber-600 dark:text-amber-400">
                                (неполные данные)
                              </span>
                            )}
                          </>
                        ) : kpi.amountQuality === "INVALID_ONLY" ? (
                          <span className="text-sm font-normal text-rose-600 dark:text-rose-400">— (ошибка данных)</span>
                        ) : kpi.amountQuality === "UNKNOWN" ? (
                          <span className="text-sm font-normal text-muted-foreground">— (нет данных)</span>
                        ) : (
                          "—"
                        )
                      ) : (
                        kpi.currentValue ?? 0
                      )}
                    </div>
                  )}

                  {/* Previous period comparison */}
                  <div className="mt-1 text-[11px]">
                    {kpi.isMultiCurrency && kpi.currencyBreakdown ? (
                      <div className="flex flex-col gap-0.5">
                        {Array.from(
                          new Set([
                            ...Object.keys(kpi.currencyBreakdown.current),
                            ...Object.keys(kpi.currencyBreakdown.previous),
                          ])
                        ).sort().map((cur) => {
                          const cVal = kpi.currencyBreakdown!.current[cur] || 0;
                          const pVal = kpi.currencyBreakdown!.previous[cur] || 0;
                          const curDelta = cVal - pVal;
                          if (curDelta === 0) return null;
                          const isCurPos = curDelta > 0;
                          return (
                            <span
                              key={cur}
                              className={`inline-flex items-center font-medium ${
                                isCurPos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                              }`}
                            >
                              {isCurPos ? (
                                <ArrowUpRight className="h-3 w-3 inline mr-0.5 shrink-0" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3 inline mr-0.5 shrink-0" />
                              )}
                              {curDelta > 0 ? "+" : ""}{formatCurrencyAmount(curDelta, cur)}
                            </span>
                          );
                        })}
                      </div>
                    ) : kpi.delta !== null && kpi.delta !== 0 ? (
                      <span
                        className={`inline-flex items-center font-medium ${
                          isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {isPositive ? (
                          <ArrowUpRight className="h-3 w-3 inline mr-0.5" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 inline mr-0.5" />
                        )}
                        {kpi.isCurrency
                          ? `${kpi.delta > 0 ? "+" : ""}${formatCurrencyAmount(kpi.delta, kpi.currencyId)}`
                          : `${kpi.delta > 0 ? "+" : ""}${kpi.delta}`}
                        {kpi.deltaPercent !== null && ` (${kpi.deltaPercent > 0 ? "+" : ""}${kpi.deltaPercent}%)`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0% без изм.</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ─── BLOCK 2: CURRENT STATE / WIP (Сейчас в работе) ─── */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Сейчас в работе (текущий портфель)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Текущий статус по уникальным компаниям (не зависит от выбранного диапазона дат)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {wipKpis.map((wip) => {
            return (
              <Card
                key={wip.id}
                onClick={() =>
                  onOpenDrillDown(
                    wip.label,
                    `Текущий статус: ${wip.label} (${wip.companyCount} компаний)`,
                    wip.companyIds
                  )
                }
                className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-xs group"
              >
                <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
                  <span className="text-xs font-medium text-muted-foreground line-clamp-1 group-hover:text-primary transition-colors">
                    {wip.label}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">
                    {wip.dealCount} сделок
                  </Badge>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="text-xl font-bold tracking-tight">
                    {wip.companyCount}
                    <span className="text-xs font-normal text-muted-foreground ml-1.5">
                      компаний
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
