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
import { useQueryState } from "nuqs";
import { searchParams } from "@/lib/search-params";

interface ResponsibleOption {
  id: string;
  name: string;
  count: number;
}

export function ResponsibleFilter() {
  const { allDeals, setResponsibleFilter, userNames, usersCoverage } = useDashboardStore();
  const [responsibleFilter, setResponsibleFilterUrl] = useQueryState("responsible", searchParams.responsible);

  const responsibleOptions = useMemo<ResponsibleOption[]>(() => {
    // Counts are computed ONLY from the currently loaded (possibly capped)
    // deal window — they are NOT global CRM counts and are labeled as such
    // in the dropdown footer.
    const counts = new Map<string, number>();
    for (const deal of allDeals) {
      const id = String(deal.ASSIGNED_BY_ID || "");
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }

    // Option universe must NOT be restricted to the current capped deal
    // window: a manager whose deals all lie outside the first window would
    // otherwise be unselectable. The authoritative source is the user
    // directory (userNames, independent of deal pagination); observed deal
    // owners are unioned in as a fallback while the directory loads.
    const ids = new Set<string>([...Object.keys(userNames), ...counts.keys()]);

    const options: ResponsibleOption[] = Array.from(ids).map((id) => ({
      id,
      name: userNames[id] || `ID ${id}`,
      count: counts.get(id) || 0,
    }));

    return options.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
  }, [allDeals, userNames]);

  const handleFilterChange = (id: string) => {
    setResponsibleFilterUrl(id);
    setResponsibleFilter(id);
  };

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
      : (responsibleOptions.find((r) => r.id === responsibleFilter)?.name ??
        (userNames[responsibleFilter] || `ID ${responsibleFilter}`));

  // Provenance disclosure: the option universe may be incomplete when the
  // user directory itself is partial/capped or has not loaded yet.
  const directoryIncomplete =
    !usersCoverage || usersCoverage.status === "PARTIAL" || usersCoverage.status === "CAPPED";

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
          onClick={() => handleFilterChange("all")}
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

        <div className="max-h-64 overflow-y-auto">
          {responsibleOptions.map((option) => (
            <DropdownMenuItem
              key={option.id}
              onClick={() => handleFilterChange(option.id)}
              className="flex items-center gap-2 text-xs cursor-pointer"
            >
              <span className="w-4 flex items-center justify-center">
                {responsibleFilter === option.id && (
                  <Check className="h-3 w-3 text-brand-orange" />
                )}
              </span>
              <span className="flex-1 truncate">{option.name}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {option.count}
              </span>
            </DropdownMenuItem>
          ))}
        </div>

        {/* Counts provenance: numbers beside managers come from the currently
            loaded dataset, never the full CRM. */}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
          Счётчики — по загруженному набору данных.
          {directoryIncomplete && (
            <span className="block text-amber-600 dark:text-amber-400">
              Список сотрудников может быть неполным.
            </span>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
