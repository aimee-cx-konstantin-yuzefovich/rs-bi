"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, Clock } from "lucide-react";
import { useMemo } from "react";
import CountUp from "react-countup";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCurrencySymbol,
  sortCurrencyCodes,
} from "@/lib/currency";
import {
  aggregateAmountsByCurrency,
  describeAggregateQuality,
  type AggregateAmountQuality,
} from "@/lib/financial-quality";
import {
  countInclusiveCalendarDays,
  parseStrictDate,
} from "@/lib/scalar-safety";

const isTestEnv =
  typeof process !== "undefined" && process.env?.NODE_ENV === "test";

export function StatsCards() {
  const { deals, dealsLoading, dateFilter } = useDashboardStore();

  const stats = useMemo(() => {
    if (deals.length === 0) return null;

    const totalDeals = deals.length;

    // Strict per-currency aggregation with aggregate quality states.
    // Never converts currency, never drops quality-only currencies,
    // never turns UNKNOWN/INVALID into numeric zero.
    const { amountByCurrency, qualityByCurrency } = aggregateAmountsByCurrency(
      deals.map((deal) => ({
        rawAmount: (deal as any).OPPORTUNITY ?? (deal as any).opportunity,
        rawCurrency:
          (deal as any).CURRENCY_ID ??
          (deal as any).CURRENCY ??
          (deal as any).currencyId,
      }))
    );

    const currencies = Object.keys(amountByCurrency).sort(sortCurrencyCodes);

    // ─── Dynamic "New Deals" Calculation ───
    // Inclusive business-calendar semantics: 2026-09-01 → 2026-09-30 = 30 дней.
    let periodTitle = "За период";

    if (dateFilter.preset === "all") {
      periodTitle = "За всё время";
    } else {
      let days = 7;

      if (dateFilter.preset === "custom" && dateFilter.customFrom && dateFilter.customTo) {
        const from = parseStrictDate(dateFilter.customFrom, { mode: "DATETIME_BUSINESS_TIMEZONE" });
        const to = parseStrictDate(dateFilter.customTo, { mode: "DATETIME_BUSINESS_TIMEZONE" });
        if (from && to) {
          const inclusive = countInclusiveCalendarDays(from, to);
          if (inclusive > 0) days = inclusive;
        }
      } else {
        if (dateFilter.preset === "14days") days = 14;
        else if (dateFilter.preset === "30days") days = 30;
        else if (dateFilter.preset === "90days") days = 90;
      }

      periodTitle = `За ${days} ${getDaysWord(days)}`;
    }

    return {
      totalDeals,
      amountByCurrency,
      qualityByCurrency,
      currencies,
      periodTitle,
    };
  }, [deals, dateFilter]);

  if (!stats || deals.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 px-4 sm:px-6 py-4 animate-fade-in">
      {/* Card 1: Deal Opportunity Total (Truthful currency isolation + quality) */}
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
                /* CASE A: No deals in scope at all → genuine zero, COMPLETE */
                <p className="text-xl font-bold truncate tabular-nums leading-none">
                  0
                </p>
              ) : stats.currencies.length === 1 ? (
                /* CASE B / D: Exactly one currency */
                (() => {
                  const cur = stats.currencies[0];
                  const amount = stats.amountByCurrency[cur];
                  const quality = stats.qualityByCurrency[cur];
                  return (
                    <SingleCurrencyAmount
                      cur={cur}
                      amount={amount}
                      quality={quality}
                    />
                  );
                })()
              ) : (
                /* CASE C: Multiple currencies → Compact per-currency breakdown
                   without cross-currency sum, preserving per-currency quality */
                <div className="flex flex-col gap-1 min-w-0" data-testid="mixed-currency-breakdown">
                  {stats.currencies.map((cur) => {
                    const amount = stats.amountByCurrency[cur];
                    const quality = stats.qualityByCurrency[cur];
                    const isUnknown = cur === "UNKNOWN";
                    const symbol = getCurrencySymbol(cur);
                    return (
                      <div
                        key={cur}
                        className="flex items-baseline gap-1.5 text-base sm:text-lg font-bold tabular-nums text-foreground leading-tight truncate"
                        data-currency={cur}
                        data-quality={quality}
                      >
                        <AmountValue amount={amount} quality={quality} />
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

function AmountValue({
  amount,
  quality,
}: {
  amount: number | null;
  quality: AggregateAmountQuality;
}) {
  if (quality === "INVALID_ONLY") {
    return (
      <span
        className="text-amber-600 dark:text-amber-400"
        data-testid="amount-invalid"
      >
        ошибка данных
      </span>
    );
  }
  if (quality === "UNKNOWN") {
    return (
      <span
        className="text-muted-foreground"
        data-testid="amount-unknown"
      >
        нет данных
      </span>
    );
  }
  // COMPLETE and PARTIAL both carry a numeric amount — including VALID zero.
  return (
    <span>
      {Math.round(amount ?? 0).toLocaleString("ru-RU")}
    </span>
  );
}

function SingleCurrencyAmount({
  cur,
  amount,
  quality,
}: {
  cur: string;
  amount: number | null;
  quality: AggregateAmountQuality;
}) {
  const isUnknown = cur === "UNKNOWN";

  if (quality === "INVALID_ONLY" || quality === "UNKNOWN") {
    return (
      <p className="text-xl font-bold truncate tabular-nums leading-none flex items-baseline gap-1.5">
        <span
          className={
            quality === "INVALID_ONLY"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
          }
          data-testid={quality === "INVALID_ONLY" ? "amount-invalid" : "amount-unknown"}
        >
          {quality === "INVALID_ONLY" ? "ошибка данных" : "нет данных"}
        </span>
        {isUnknown && (
          <span className="text-xs font-normal text-muted-foreground">
            — валюта не указана
          </span>
        )}
      </p>
    );
  }

  return (
    <p className="text-xl font-bold truncate tabular-nums leading-none flex items-baseline gap-1.5">
      {isUnknown ? (
        <>
          <CountUp
            end={Math.round(amount ?? 0)}
            duration={isTestEnv ? 0 : 1}
            separator=" "
            decimals={0}
          />
          <span className="text-xs font-normal text-muted-foreground">
            — валюта не указана
          </span>
        </>
      ) : (
        <CountUp
          end={Math.round(amount ?? 0)}
          duration={isTestEnv ? 0 : 1}
          separator=" "
          decimals={0}
          suffix={` ${getCurrencySymbol(cur)}`}
        />
      )}
      {quality === "PARTIAL" && (
        <span className="text-[10px] font-normal text-amber-600 dark:text-amber-400 whitespace-nowrap">
          неполные данные
        </span>
      )}
    </p>
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
