"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, Clock } from "lucide-react";
import { useMemo } from "react";
import CountUp from "react-countup";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCurrencySymbol,
  normalizeCurrencyCode,
  sortCurrencyCodes,
} from "@/lib/currency";

const isTestEnv =
  typeof process !== "undefined" && process.env?.NODE_ENV === "test";

export function StatsCards() {
  const { deals, dealsLoading, dateFilter } = useDashboardStore();

  const stats = useMemo(() => {
    if (deals.length === 0) return null;

    const totalDeals = deals.length;

    // Bucket opportunity strictly by currency without cross-currency scalar summation
    const opportunityByCurrency: Record<string, number> = {};

    for (const deal of deals) {
      const rawOpp = (deal as any).OPPORTUNITY ?? (deal as any).opportunity;
      const val = parseFloat(String(rawOpp || "0"));
      if (!isNaN(val) && val > 0) {
        const rawCurrency =
          (deal as any).CURRENCY_ID ??
          (deal as any).CURRENCY ??
          (deal as any).currencyId;
        const cur = normalizeCurrencyCode(rawCurrency ? String(rawCurrency) : null);
        opportunityByCurrency[cur] = Math.round(((opportunityByCurrency[cur] || 0) + val) * 100) / 100;
      }
    }

    const currencies = Object.keys(opportunityByCurrency).sort(sortCurrencyCodes);

    // ─── Dynamic "New Deals" Calculation ───
    let periodTitle = "За период";

    if (dateFilter.preset === "all") {
      periodTitle = "За всё время";
    } else {
      let days = 7;

      if (dateFilter.preset === "custom" && dateFilter.customFrom && dateFilter.customTo) {
        const currentStart = new Date(dateFilter.customFrom);
        const currentEnd = new Date(dateFilter.customTo);
        days = Math.round((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
        if (days === 0) days = 1; // Prevent division by zero if same day selected
      } else {
        if (dateFilter.preset === "14days") days = 14;
        else if (dateFilter.preset === "30days") days = 30;
        else if (dateFilter.preset === "90days") days = 90;
      }

      periodTitle = `За ${days} ${getDaysWord(days)}`;
    }

    return {
      totalDeals,
      opportunityByCurrency,
      currencies,
      periodTitle,
    };
  }, [deals, dateFilter]);

  if (!stats || deals.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 px-4 sm:px-6 py-4 animate-fade-in">
      {/* Card 1: Deal Opportunity Total (Truthful currency isolation) */}
      <Card className="rounded-md border-border shadow-sm hover:shadow-md transition-all duration-200 stat-accent-bar stat-accent-bar-green group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-900/25 mt-0.5 group-hover:scale-105 transition-transform">
              <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                Сумма сделок
              </p>
              {dealsLoading ? (
                <Skeleton className="h-6 w-24 rounded" />
              ) : stats.currencies.length === 0 ? (
                /* CASE A: No deals with monetary value -> 0 without currency suffix */
                <p className="text-xl font-bold truncate tabular-nums leading-none">
                  0
                </p>
              ) : stats.currencies.length === 1 ? (
                /* CASE B / CASE D: Exactly one currency */
                (() => {
                  const cur = stats.currencies[0];
                  const amount = stats.opportunityByCurrency[cur];
                  if (cur === "UNKNOWN") {
                    return (
                      <p className="text-xl font-bold truncate tabular-nums leading-none flex items-baseline gap-1.5">
                        <span>{Math.round(amount).toLocaleString("ru-RU")}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          — валюта не указана
                        </span>
                      </p>
                    );
                  }
                  return (
                    <p className="text-xl font-bold truncate tabular-nums leading-none">
                      <CountUp
                        end={amount}
                        duration={isTestEnv ? 0 : 1}
                        separator=" "
                        decimals={0}
                        suffix={` ${getCurrencySymbol(cur)}`}
                      />
                    </p>
                  );
                })()
              ) : (
                /* CASE C: Multiple currencies -> Compact per-currency breakdown without cross-currency sum */
                <div className="flex flex-col gap-1 min-w-0" data-testid="mixed-currency-breakdown">
                  {stats.currencies.map((cur) => {
                    const amount = stats.opportunityByCurrency[cur];
                    const formatted = Math.round(amount).toLocaleString("ru-RU");
                    const isUnknown = cur === "UNKNOWN";
                    const symbol = getCurrencySymbol(cur);
                    return (
                      <div
                        key={cur}
                        className="flex items-baseline gap-1.5 text-base sm:text-lg font-bold tabular-nums text-foreground leading-tight truncate"
                        data-currency={cur}
                      >
                        <span>{formatted}</span>
                        {isUnknown ? (
                          <span className="text-xs font-normal text-muted-foreground">
                            — валюта не указана
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-muted-foreground">
                            {symbol}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                за выбранный период
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Deal Count (Unchanged behavior) */}
      <Card className="rounded-md border-border shadow-sm hover:shadow-md transition-all duration-200 stat-accent-bar stat-accent-bar-violet group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-violet-50 dark:bg-violet-900/25 mt-0.5 group-hover:scale-105 transition-transform">
              <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                {stats.periodTitle}
              </p>
              <p className="text-xl font-bold truncate tabular-nums leading-none">
                {dealsLoading ? (
                  <Skeleton className="h-6 w-24 rounded" />
                ) : (
                  <CountUp
                    end={stats.totalDeals}
                    duration={isTestEnv ? 0 : 1}
                    separator=" "
                    decimals={0}
                  />
                )}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                новые
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function getDaysWord(days: number): string {
  const lastDigit = days % 10;
  const lastTwoDigits = days % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
}
