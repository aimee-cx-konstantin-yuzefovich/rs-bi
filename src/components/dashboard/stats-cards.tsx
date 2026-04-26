"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, DollarSign, Hash, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMemo } from "react";

export function StatsCards() {
  const { deals, dealsLoading } = useDashboardStore();

  const stats = useMemo(() => {
    if (deals.length === 0) return null;

    const totalDeals = deals.length;

    // Sum opportunity
    const totalOpportunity = deals.reduce((sum, deal) => {
      const val = parseFloat(String(deal.OPPORTUNITY || "0"));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    // Average deal
    const avgDeal = totalDeals > 0 ? totalOpportunity / totalDeals : 0;

    // Recent deals (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentDeals = deals.filter((deal) => {
      const dc = deal.DATE_CREATE;
      if (!dc) return false;
      try {
        const d = new Date(String(dc));
        return d >= weekAgo;
      } catch {
        return false;
      }
    }).length;

    const prevWeekDeals = deals.filter((deal) => {
      const dc = deal.DATE_CREATE;
      if (!dc) return false;
      try {
        const d = new Date(String(dc));
        return d >= twoWeeksAgo && d < weekAgo;
      } catch {
        return false;
      }
    }).length;

    // Week over week change
    // Edge case: if prev week had 0 deals and current week has deals,
    // we can't calculate a meaningful percentage — show "new" indicator instead
    let wowChange = 0;
    let wowIsNew = false;
    if (prevWeekDeals > 0) {
      wowChange = ((recentDeals - prevWeekDeals) / prevWeekDeals) * 100;
    } else if (recentDeals > 0) {
      wowIsNew = true; // No prior data to compare
    }

    // Won/lost deals — Win Rate is calculated only on CLOSED deals (won + lost),
    // not on all deals (which would include in-progress deals and skew the metric)
    const wonDeals = deals.filter((deal) => {
      const stage = String(deal.STAGE_ID || "");
      return stage === "WON";
    }).length;
    const lostDeals = deals.filter((deal) => {
      const stage = String(deal.STAGE_ID || "");
      return stage === "LOSE";
    }).length;
    const closedDeals = wonDeals + lostDeals;
    const winRate = closedDeals > 0 ? (wonDeals / closedDeals) * 100 : 0;

    // Currency
    const currency =
      deals[0]?.CURRENCY_ID || deals[0]?.CURRENCY || "RUB";

    return {
      totalDeals,
      totalOpportunity,
      avgDeal,
      recentDeals,
      wowChange,
      wowIsNew,
      winRate,
      currency: String(currency),
    };
  }, [deals]);

  if (!stats || deals.length === 0) return null;

  const cards = [
    {
      title: "Всего сделок",
      value: stats.totalDeals.toLocaleString("ru-RU"),
      subtitle: `Win Rate: ${stats.winRate.toFixed(0)}%`,
      icon: Hash,
      accentBar: "stat-accent-bar-blue",
      iconColor: "text-brand-blue",
      iconBg: "bg-brand-blue/8 dark:bg-brand-blue/15",
    },
    {
      title: "Общая сумма",
      value: formatMoney(stats.totalOpportunity, stats.currency),
      subtitle: stats.currency,
      icon: DollarSign,
      accentBar: "stat-accent-bar-green",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-50 dark:bg-emerald-900/25",
    },
    {
      title: "Средняя сделка",
      value: formatMoney(stats.avgDeal, stats.currency),
      subtitle: "на сделку",
      icon: TrendingUp,
      accentBar: "stat-accent-bar-orange",
      iconColor: "text-brand-orange",
      iconBg: "bg-brand-orange/8 dark:bg-brand-orange/15",
    },
    {
      title: "За 7 дней",
      value: stats.recentDeals.toLocaleString("ru-RU"),
      subtitle: (
        <span className="flex items-center gap-0.5">
          {stats.wowIsNew ? (
            <span className="text-brand-blue font-medium text-[10px]">новые</span>
          ) : stats.wowChange >= 0 ? (
            <>
              <ArrowUpRight className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400">
                {Math.abs(stats.wowChange).toFixed(0)}%
              </span>
            </>
          ) : (
            <>
              <ArrowDownRight className="h-3 w-3 text-red-500 dark:text-red-400" />
              <span className="text-red-500 dark:text-red-400">
                {Math.abs(stats.wowChange).toFixed(0)}%
              </span>
            </>
          )}
        </span>
      ),
      icon: Clock,
      accentBar: "stat-accent-bar-violet",
      iconColor: "text-violet-600 dark:text-violet-400",
      iconBg: "bg-violet-50 dark:bg-violet-900/25",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 sm:px-6 py-4 animate-fade-in">
      {cards.map((card) => (
        <Card
          key={card.title}
          className={`rounded-md border-border shadow-sm hover:shadow-md transition-all duration-200 stat-accent-bar ${card.accentBar} group`}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-md ${card.iconBg} mt-0.5 group-hover:scale-105 transition-transform`}>
                <card.icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                  {card.title}
                </p>
                <p className="text-xl font-bold truncate tabular-nums leading-none">
                  {dealsLoading ? (
                    <span className="inline-block w-20 h-6 bg-muted rounded animate-pulse" />
                  ) : (
                    card.value
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                  {card.subtitle}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatMoney(value: number, currency: string): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + " " + currency;
}
