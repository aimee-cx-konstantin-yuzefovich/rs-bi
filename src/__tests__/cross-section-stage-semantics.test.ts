// ─────────────────────────────────────────────────────────────────────
// Cross-section stage semantics contract.
// ONE Deal must receive the SAME terminal/active classification everywhere:
// Dashboard (store filters, alerts), Commercial Funnel (engine/normalize),
// pipeline filters, previews and reconciliation fixtures.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import {
  isTerminalStage,
  isTerminalWonStage,
  isTerminalLostStage,
  isDealActiveStage,
} from "@/lib/stage-utils";
// The old funnel-local path must re-export the same authority (no copy).
import {
  isTerminalStage as funnelIsTerminalStage,
  isDealActiveStage as funnelIsDealActiveStage,
} from "@/lib/commercial-funnel/stage-utils";
import { isDealActive } from "@/lib/commercial-funnel/normalize";

const STAGE_CASES: Array<{ stage: string; won: boolean; lost: boolean; terminal: boolean }> = [
  { stage: "WON", won: true, lost: false, terminal: true },
  { stage: "C1:WON", won: true, lost: false, terminal: true },
  { stage: "LOSE", won: false, lost: true, terminal: true },
  { stage: "LOST", won: false, lost: true, terminal: true },
  { stage: "APOLOGY", won: false, lost: true, terminal: true },
  { stage: "C7:LOSE", won: false, lost: true, terminal: true },
  { stage: "C7:LOST", won: false, lost: true, terminal: true },
  { stage: "C7:APOLOGY", won: false, lost: true, terminal: true },
  { stage: "NEW", won: false, lost: false, terminal: false },
  { stage: "C7:PREPARATION", won: false, lost: false, terminal: false },
  { stage: "C1:EXECUTING", won: false, lost: false, terminal: false },
];

describe("cross-section stage classification", () => {
  it("classifies every stage identically across shared authority surfaces", () => {
    for (const { stage, won, lost, terminal } of STAGE_CASES) {
      expect(
        { stage, won: isTerminalWonStage(stage), lost: isTerminalLostStage(stage), terminal: isTerminalStage(stage) }
      ).toEqual({ stage, won, lost, terminal });

      // Funnel-local import path must be the SAME function semantics.
      expect(funnelIsTerminalStage(stage)).toBe(terminal);
      expect(funnelIsDealActiveStage(stage)).toBe(!terminal);

      // Commercial Funnel normalize helper agrees.
      expect(isDealActive({ stageId: stage } as any)).toBe(!terminal);
    }
  });

  it("dashboard store in_work filter uses the canonical !isTerminalStage semantics", async () => {
    // Apply the store's own filter logic against a synthetic deal set that
    // includes APOLOGY (previously missed by the duplicated literal array).
    const { useDashboardStore } = await import("@/store/dashboard-store");
    const deals = [
      { ID: "1", STAGE_ID: "NEW" },
      { ID: "2", STAGE_ID: "C1:WON" },
      { ID: "3", STAGE_ID: "C7:LOSE" },
      { ID: "4", STAGE_ID: "APOLOGY" },
      { ID: "5", STAGE_ID: "C2:EXECUTING" },
    ] as any[];

    useDashboardStore.setState({
      allDeals: deals,
      deals: deals,
      pipelineFilter: "in_work",
      responsibleFilter: "all",
      dateFilter: { preset: "all" },
    });
    useDashboardStore.getState().applyClientFilters();

    const visible = useDashboardStore.getState().deals.map((d) => String(d.ID));
    // in_work = active only: 1 (NEW) and 5 (EXECUTING); APOLOGY is terminal lost.
    expect(visible.sort()).toEqual(["1", "5"]);

    // LOSE filter includes APOLOGY and category-prefixed variants.
    useDashboardStore.setState({ pipelineFilter: "LOSE" });
    useDashboardStore.getState().applyClientFilters();
    expect(useDashboardStore.getState().deals.map((d) => String(d.ID)).sort()).toEqual([
      "3",
      "4",
    ]);

    // WON filter includes category-prefixed WON.
    useDashboardStore.setState({ pipelineFilter: "WON" });
    useDashboardStore.getState().applyClientFilters();
    expect(useDashboardStore.getState().deals.map((d) => String(d.ID))).toEqual(["2"]);

    // Restore
    useDashboardStore.setState({ pipelineFilter: "all", allDeals: [], deals: [] });
    useDashboardStore.getState().applyClientFilters();
  });
});
