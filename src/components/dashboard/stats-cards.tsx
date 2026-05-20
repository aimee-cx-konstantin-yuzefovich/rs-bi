"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, RussianRuble, Hash, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMemo } from "react";
import CountUp from "react-countup";
import { Skeleton } from "@/components/ui/skeleton";

export function StatsCards() {
  const { deals, allDeals, dealsLoading, dateFilter, pipelineFilter, responsibleFilter } = useDashboardStore();

  const stats = useMemo(() => {
    if (deals.length === 0) return null;

    const totalDeals = deals.length;

    // Sum opportunity
    const totalOpportunity = deals.reduce((sum, deal) => {
      const val = parseFloat(String(deal.OPPORTUNITY || "0"));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    // Average deal (calculated only on deals with non-zero opportunity for mathematical accuracy)
    const dealsWithValue = deals.filter(d => parseFloat(String(d.OPPORTUNITY || "0")) > 0);
    const avgDeal = dealsWithValue.length > 0 ? totalOpportunity / dealsWithValue.length : 0;

    // Currency
    const currency = deals[0]?.CURRENCY_ID || deals[0]?.CURRENCY || "RUB";

    // ─── Dynamic "New Deals" Calculation ───
    let periodTitle = "За период";

    if (dateFilter.preset === "all") {
      periodTitle = "За всё время";
    } else {
      const now = new Date();
      let days = 7;
      let currentStart: Date;
      let currentEnd: Date;
      
      if (dateFilter.preset === "custom" && dateFilter.customFrom && dateFilter.customTo) {
        currentStart = new Date(dateFilter.customFrom);
        currentEnd = new Date(dateFilter.customTo);
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
      totalOpportunity,
      avgDeal,
      currency: String(currency),
      periodTitle,
    };
  }, [deals, dateFilter]);

  if (!stats || deals.length === 0) return null;

  const cards = [
    {
      title: "Общая сумма",
      value: stats.totalOpportunity,
      isCurrency: true,
      subtitle: "за выбранный период", // Neutral text replacing duplicate currency
      icon: RussianRuble, // Changed from DollarSign to RussianRuble
      accentBar: "stat-accent-bar-green",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-50 dark:bg-emerald-900/25",
    },
    {
      title: stats.periodTitle, // Dynamic title based on global filter
      value: stats.totalDeals, // New deals in current period = total deals in current period
      isCurrency: false,
      subtitle: "новые",
      icon: Clock,
      accentBar: "stat-accent-bar-violet",
      iconColor: "text-violet-600 dark:text-violet-400",
      iconBg: "bg-violet-50 dark:bg-violet-900/25",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 px-4 sm:px-6 py-4 animate-fade-in">
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
                    <Skeleton className="h-6 w-24 rounded" />
                  ) : (
                    <CountUp
                      end={card.value}
                      duration={1}
                      separator=" "
                      decimals={0}
                      suffix={card.isCurrency ? ` ${stats.currency}` : ""}
                    />
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

function getDaysWord(days: number): string {
  const lastDigit = days % 10;
  const lastTwoDigits = days % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
}
