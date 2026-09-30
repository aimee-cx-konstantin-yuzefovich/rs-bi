"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { searchParams } from "@/lib/search-params";

const PIPELINE_TABS = [
  { key: "all", label: "Все" },
  { key: "in_work", label: "В работе" },
  { key: "WON", label: "Успешные" },
  { key: "LOSE", label: "Проиграны" },
] as const;

export function PipelineFilter() {
  const { allDeals, setPipelineFilter } = useDashboardStore();
  const [pipelineFilter, setPipelineFilterUrl] = useQueryState("pipeline", searchParams.pipeline);

  // Use allDeals for counts so they don't change when pipeline filter is active
  const counts = useMemo(() => {
    const all = allDeals.length;
    const inWork = allDeals.filter((d) => {
      const stage = String(d.STAGE_ID || "").toUpperCase();
      return !["WON", "LOSE"].includes(stage) && !stage.endsWith(":WON") && !stage.endsWith(":LOSE");
    }).length;
    const won = allDeals.filter((d) => {
      const stage = String(d.STAGE_ID || "").toUpperCase();
      return stage === "WON" || stage.endsWith(":WON");
    }).length;
    const lose = allDeals.filter((d) => {
      const stage = String(d.STAGE_ID || "").toUpperCase();
      return stage === "LOSE" || stage === "LOST" || stage.endsWith(":LOSE") || stage.endsWith(":LOST");
    }).length;
    return { all, in_work: inWork, WON: won, LOSE: lose };
  }, [allDeals]);

  const handleFilterChange = (key: string) => {
    setPipelineFilterUrl(key);
    setPipelineFilter(key);
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      {PIPELINE_TABS.map((tab) => {
        const isActive = pipelineFilter === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleFilterChange(tab.key)}
            className={`
              h-8 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer
              flex items-center gap-1.5 border shrink-0
              ${
                isActive
                  ? "bg-muted border-border text-foreground font-semibold shadow-2xs"
                  : "bg-background border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }
            `}
          >
            {tab.label}
            <span
              className={`
                text-[10px] font-semibold tabular-nums leading-none
                ${isActive ? "text-foreground/80" : "text-muted-foreground/70"}
              `}
            >
              {counts[tab.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
