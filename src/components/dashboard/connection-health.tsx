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
    text: "Проверка подключения...",
  },
  connected: {
    color: "bg-emerald-400",
    pulse: false,
    text: "Bitrix24 подключён",
  },
  demo: {
    color: "bg-amber-400",
    pulse: false,
    text: "Демо-режим",
  },
  disconnected: {
    color: "bg-red-500",
    pulse: true,
    text: "Bitrix24 недоступен",
  },
} as const;

export function ConnectionHealth() {
  const { connectionStatus } = useDashboardStore();
  const config = STATUS_CONFIG[connectionStatus];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center cursor-default">
          <span
            className={`
              h-2 w-2 rounded-full block
              ${config.color}
              ${config.pulse ? "animate-pulse" : ""}
            `}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={6}
        className="text-[11px] px-2 py-1"
      >
        {config.text}
      </TooltipContent>
    </Tooltip>
  );
}
