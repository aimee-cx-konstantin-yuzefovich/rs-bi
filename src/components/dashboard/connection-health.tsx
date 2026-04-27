"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STATUS_CONFIG = {
  checking: {
    color: "bg-amber-400",
    pulse: true,
    text: "Проверка...",
  },
  connected: {
    color: "bg-emerald-400",
    pulse: false,
    text: "Подключена",
  },
  demo: {
    color: "bg-amber-400",
    pulse: false,
    text: "Демо-режим",
  },
  disconnected: {
    color: "bg-red-500",
    pulse: true,
    text: "Ошибка базы",
  },
} as const;

export function ConnectionHealth() {
  const { connectionStatus } = useDashboardStore();
  const config = STATUS_CONFIG[connectionStatus];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-default">
          <span
            className={`
              h-2 w-2 rounded-full block shrink-0
              ${config.color}
              ${config.pulse ? "animate-pulse" : ""}
            `}
          />
          <span className="text-[11px] font-medium text-white/70 whitespace-nowrap">
            {config.text}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={6}
        className="text-[11px] px-2 py-1"
      >
        Статус подключения к Bitrix24
      </TooltipContent>
    </Tooltip>
  );
}
