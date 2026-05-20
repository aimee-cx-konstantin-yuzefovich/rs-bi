"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { searchParams } from "@/lib/search-params";

const PIPELINE_TABS = [
  { key: "all", label: "Все" },
  { key: "in_work", label: "В работе" },
  { key: "WON", label: "WON" },
  { key: "LOSE", label: "LOSE" },
] as const;

export function PipelineFilter() {
  const { allDeals, setPipelineFilter } = useDashboardStore();
  const [pipelineFilter, setPipelineFilterUrl] = useQueryState("pipeline", searchParams.pipeline);

  // Use allDeals for counts so they don't change when pipeline filter is active
  const counts = useMemo(() => {
    const all = allDeals.length;
    const inWork = allDeals.filter((d) => {
      const stage = String(d.STAGE_ID || "");
      return !["WON", "LOSE"].includes(stage);
    }).length;
    const won = allDeals.filter((d) => String(d.STAGE_ID) === "WON").length;
    const lose = allDeals.filter((d) => String(d.STAGE_ID) === "LOSE").length;
    return { all, in_work: inWork, WON: won, LOSE: lose };
  }, [allDeals]);

  const handleFilterChange = (key: string) => {
    setPipelineFilterUrl(key);
    setPipelineFilter(key);
  };

  return (
    <div className="flex items-center gap-1">
      {PIPELINE_TABS.map((tab) => {
        const isActive = pipelineFilter === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => handleFilterChange(tab.key)}
            className={`
              h-7 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer
              flex items-center gap-1 border
              ${
                isActive
                  ? "bg-white/15 text-white border-white/20"
                  : "bg-white/5 text-white/50 border-white/10 hover:text-white/70 hover:bg-white/10"
              }
            `}
          >
            {tab.label}
            <span
              className={`
                text-[9px] font-bold tabular-nums leading-none
                ${isActive ? "text-white/70" : "text-white/30"}
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
