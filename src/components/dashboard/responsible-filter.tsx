"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCircle, ChevronDown, Check } from "lucide-react";
import { useMemo } from "react";

interface ResponsibleOption {
  id: string;
  name: string;
  count: number;
}

export function ResponsibleFilter() {
  const { allDeals, responsibleFilter, setResponsibleFilter, userNames } = useDashboardStore();

  const responsibleOptions = useMemo<ResponsibleOption[]>(() => {
    const map = new Map<string, { name: string; count: number }>();

    // Use allDeals so counts are stable regardless of active filters
    for (const deal of allDeals) {
      const id = String(deal.ASSIGNED_BY_ID || "");
      if (!id) continue;

      // Priority: userNames from API/fetch > ASSIGNED_BY_NAME from deal data > fallback
      const name = userNames[id] || String(deal.ASSIGNED_BY_NAME || "");

      const existing = map.get(id);
      if (existing) {
        existing.count++;
      } else {
        map.set(id, { name: name || `ID ${id}`, count: 1 });
      }
    }

    return Array.from(map.entries())
      .map(([id, data]) => ({ id, name: data.name, count: data.count }))
      .sort((a, b) => b.count - a.count);
  }, [allDeals, userNames]);

  // Simplified version if no responsible persons in data
  if (responsibleOptions.length === 0) {
    return (
      <div className="h-7 px-2 flex items-center gap-1.5 rounded bg-white/5 border border-white/10 text-[11px] text-white/50">
        <UserCircle className="h-3.5 w-3.5" />
        <span>Все</span>
      </div>
    );
  }

  const activeName =
    responsibleFilter === "all"
      ? "Все ответственные"
      : responsibleOptions.find((r) => r.id === responsibleFilter)?.name || "Все ответственные";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-7 px-2 flex items-center gap-1.5 rounded bg-white/5 border border-white/10 text-[11px] text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors cursor-pointer">
          <UserCircle className="h-3.5 w-3.5" />
          <span className="max-w-[100px] truncate">{activeName}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          Ответственный менеджер
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* All option */}
        <DropdownMenuItem
          onClick={() => setResponsibleFilter("all")}
          className="flex items-center gap-2 text-xs cursor-pointer"
        >
          <span className="w-4 flex items-center justify-center">
            {responsibleFilter === "all" && <Check className="h-3 w-3 text-brand-orange" />}
          </span>
          <span className="flex-1">Все ответственные</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {allDeals.length}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {responsibleOptions.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onClick={() => setResponsibleFilter(option.id)}
            className="flex items-center gap-2 text-xs cursor-pointer"
          >
            <span className="w-4 flex items-center justify-center">
              {responsibleFilter === option.id && (
                <Check className="h-3 w-3 text-brand-orange" />
              )}
            </span>
            <span className="flex-1 truncate ответственный-имя">{option.name}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {option.count}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
