"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  Clock,
  AlertTriangle,
  TrendingDown,
  FileWarning,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

interface AlertItem {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  severity: "destructive" | "warning" | "info" | "success";
  count: number;
  pipelineValue?: string;
}

const severityStyles: Record<string, { border: string; icon: string; bg: string }> = {
  destructive: {
    border: "border-l-red-500",
    icon: "text-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  warning: {
    border: "border-l-amber-500",
    icon: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  info: {
    border: "border-l-blue-500",
    icon: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  success: {
    border: "border-l-emerald-500",
    icon: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
};

export function AlertsBell() {
  const { allDeals, setPipelineFilter } = useDashboardStore();
  const [open, setOpen] = useState(false);

  const alerts = useMemo<AlertItem[]>(() => {
    const now = new Date();
    const result: AlertItem[] = [];

    // 1. Stalled Deals (Зависшие сделки)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const stalledDeals = allDeals.filter((deal) => {
      const stage = String(deal.STAGE_ID || "");
      if (stage === "WON" || stage === "LOSE") return false;
      const modifyStr = String(deal.DATE_MODIFY || "");
      if (!modifyStr) return false;
      const modifyDate = new Date(modifyStr);
      if (isNaN(modifyDate.getTime())) return false;
      return modifyDate < thirtyDaysAgo;
    });
    if (stalledDeals.length > 0) {
      result.push({
        id: "stalled",
        icon: Clock,
        title: "Зависшие сделки",
        description: `${stalledDeals.length} сделок без движения более 30 дней — требуется внимание менеджера`,
        severity: "warning",
        count: stalledDeals.length,
        pipelineValue: "in_work",
      });
    }

    // 2. Unpaid Large Deals (Неоплаченные крупные сделки)
    const unpaidLarge = allDeals.filter((deal) => {
      const paymentStatus = String(deal.UF_CRM_1584464068013 || "");
      if (paymentStatus !== "103" && paymentStatus !== "105") return false;
      const opportunity = parseFloat(String(deal.OPPORTUNITY || "0"));
      return opportunity > 500000;
    });
    if (unpaidLarge.length > 0) {
      const totalUnpaid = unpaidLarge.reduce(
        (sum, d) => sum + parseFloat(String(d.OPPORTUNITY || "0")),
        0
      );
      result.push({
        id: "unpaid-large",
        icon: AlertTriangle,
        title: "Неоплаченные крупные сделки",
        description: `${unpaidLarge.length} неоплаченных сделок на сумму ${Math.round(totalUnpaid).toLocaleString("ru-RU")} \u20BD — кассовый разрыв`,
        severity: "destructive",
        count: unpaidLarge.length,
        pipelineValue: "in_work",
      });
    }

    // 3. Win Rate Drop (Снижение Win Rate)
    const wonDeals = allDeals.filter((d) => String(d.STAGE_ID) === "WON");
    const lostDeals = allDeals.filter((d) => String(d.STAGE_ID) === "LOSE");
    const totalClosed = wonDeals.length + lostDeals.length;
    if (totalClosed >= 5) {
      const winRate = (wonDeals.length / totalClosed) * 100;
      if (winRate < 20) {
        result.push({
          id: "winrate",
          icon: TrendingDown,
          title: "Снижение Win Rate",
          description: `Win Rate упал до ${winRate.toFixed(1)}% — ниже нормы для промышленных продаж`,
          severity: "warning",
          count: 1,
          pipelineValue: "WON",
        });
      }
    }

    // 4. Large Deals Stuck in Negotiation (Крупные сделки на согласовании)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const stuckLarge = allDeals.filter((deal) => {
      const opportunity = parseFloat(String(deal.OPPORTUNITY || "0"));
      if (opportunity <= 1000000) return false;
      const stage = String(deal.STAGE_ID || "");
      if (stage !== "PREPARATION" && stage !== "PREPAYMENT_INVOICE") return false;
      const modifyStr = String(deal.DATE_MODIFY || "");
      if (!modifyStr) return false;
      const modifyDate = new Date(modifyStr);
      if (isNaN(modifyDate.getTime())) return false;
      return modifyDate < fourteenDaysAgo;
    });
    if (stuckLarge.length > 0) {
      const totalStuck = stuckLarge.reduce(
        (sum, d) => sum + parseFloat(String(d.OPPORTUNITY || "0")),
        0
      );
      result.push({
        id: "stuck-large",
        icon: FileWarning,
        title: "Крупные сделки на согласовании",
        description: `${stuckLarge.length} крупных сделок (${Math.round(totalStuck).toLocaleString("ru-RU")} \u20BD) на согласовании более 14 дней`,
        severity: "info",
        count: stuckLarge.length,
        pipelineValue: "in_work",
      });
    }

    // 5. New Deals This Week (Новые сделки за неделю)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newThisWeek = allDeals.filter((deal) => {
      const createStr = String(deal.DATE_CREATE || "");
      if (!createStr) return false;
      const createDate = new Date(createStr);
      if (isNaN(createDate.getTime())) return false;
      return createDate >= sevenDaysAgo;
    });
    if (newThisWeek.length > 0) {
      const totalNew = newThisWeek.reduce(
        (sum, d) => sum + parseFloat(String(d.OPPORTUNITY || "0")),
        0
      );
      result.push({
        id: "new-week",
        icon: TrendingUp,
        title: "Новые сделки за неделю",
        description: `${newThisWeek.length} новых сделок за неделю на сумму ${Math.round(totalNew).toLocaleString("ru-RU")} \u20BD`,
        severity: "success",
        count: newThisWeek.length,
      });
    }

    return result;
  }, [allDeals]);

  const totalCount = alerts.reduce((sum, a) => sum + a.count, 0);

  const handleAlertClick = (alert: AlertItem) => {
    if (alert.pipelineValue) {
      setPipelineFilter(alert.pipelineValue);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative h-7 w-7 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Уведомления"
        >
          <Bell className="h-3.5 w-3.5" />
          {totalCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] font-bold rounded-full bg-red-500 text-white border-0 p-0 flex items-center justify-center">
              {totalCount > 99 ? "99+" : totalCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 shadow-lg border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Уведомления</span>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 rounded-sm font-medium">
              {totalCount}
            </Badge>
          )}
        </div>

        {/* Alert list */}
        <div className="max-h-80 overflow-y-auto custom-scrollbar">
          {alerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Нет уведомлений
            </div>
          ) : (
            <div className="py-1">
              {alerts.map((alert) => {
                const Icon = alert.icon;
                const style = severityStyles[alert.severity];
                return (
                  <button
                    key={alert.id}
                    onClick={() => handleAlertClick(alert)}
                    className={`w-full text-left px-3 py-2.5 border-l-[3px] ${style.border} ${style.bg} hover:opacity-80 transition-opacity cursor-pointer`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.icon}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">
                            {alert.title}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[9px] h-4 min-w-4 px-1 rounded-sm font-bold"
                          >
                            {alert.count}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {alert.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-3 py-2">
          <span className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            Показать все
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
