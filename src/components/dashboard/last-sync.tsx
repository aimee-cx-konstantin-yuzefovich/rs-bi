"use client";

import { useEffect, useState, useMemo } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { pluralRu } from "@/lib/i18n";

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return "Только что";
  if (diffMin < 60) return `${diffMin} ${pluralRu(diffMin, ["минуту", "минуты", "минут"])} назад`;
  if (diffHour < 24) return `${diffHour} ${pluralRu(diffHour, ["час", "часа", "часов"])} назад`;

  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays} ${pluralRu(diffDays, ["день", "дня", "дней"])} назад`;
}

export function LastSync() {
  const lastSyncAt = useDashboardStore((s) => s.lastSyncAt);
  const [tick, setTick] = useState(0);

  // Refresh relative time every 30 seconds
  useEffect(() => {
    if (lastSyncAt === null) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30_000);

    return () => clearInterval(interval);
  }, [lastSyncAt]);

  const relativeTime = useMemo(() => {
    // Use tick to trigger recalculation
    void tick;
    if (lastSyncAt === null) return null;
    return getRelativeTime(lastSyncAt);
  }, [lastSyncAt, tick]);

  const exactTime = useMemo(() => {
    if (lastSyncAt === null) return null;
    return new Date(lastSyncAt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [lastSyncAt]);

  if (lastSyncAt === null || relativeTime === null) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-[10px] text-white/40 cursor-default whitespace-nowrap">
          Обновлено {relativeTime}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[10px]">
        {exactTime}
      </TooltipContent>
    </Tooltip>
  );
}
