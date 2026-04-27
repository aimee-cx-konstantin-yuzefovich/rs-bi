"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { BarChart3 } from "lucide-react";

export function Footer() {
  const { isDemoMode } = useDashboardStore();

  return (
    <footer className="mt-auto border-t border-border bg-card/50">
      <div className="px-4 sm:px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground/50 tracking-wide">
            RusSilica BI Terminal v2.1
          </span>
          {isDemoMode && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 ml-1">
              DEMO
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground/35">
          © 2020-2026 ООО "РусСилика" ОГРН 1205500027710, ИНН 5501267734, КПП 524901001
        </div>
      </div>
    </footer>
  );
}
