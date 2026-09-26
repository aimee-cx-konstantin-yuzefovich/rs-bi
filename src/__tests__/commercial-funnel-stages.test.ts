// src/__tests__/commercial-funnel-stages.test.ts
import { describe, it, expect } from "vitest";
import {
  isTerminalWonStage,
  isTerminalLostStage,
  isTerminalStage,
  isDealActiveStage,
  isProgressedCommercialStage,
} from "@/lib/commercial-funnel/stage-utils";
import { computeBottlenecks } from "@/lib/commercial-funnel/engine";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

describe("Commercial Funnel Stage Semantics (TC-STAGE-01 to TC-STAGE-10)", () => {
  it("TC-STAGE-01: WON is terminal won", () => {
    expect(isTerminalWonStage("WON")).toBe(true);
    expect(isTerminalStage("WON")).toBe(true);
    expect(isDealActiveStage("WON")).toBe(false);
  });

  it("TC-STAGE-02: LOSE is terminal lost", () => {
    expect(isTerminalLostStage("LOSE")).toBe(true);
    expect(isTerminalStage("LOSE")).toBe(true);
    expect(isDealActiveStage("LOSE")).toBe(false);
  });

  it("TC-STAGE-03: LOST is terminal lost", () => {
    expect(isTerminalLostStage("LOST")).toBe(true);
    expect(isTerminalStage("LOST")).toBe(true);
    expect(isDealActiveStage("LOST")).toBe(false);
  });

  it("TC-STAGE-04: C1:WON is terminal won", () => {
    expect(isTerminalWonStage("C1:WON")).toBe(true);
    expect(isTerminalStage("C1:WON")).toBe(true);
    expect(isDealActiveStage("C1:WON")).toBe(false);
  });

  it("TC-STAGE-05: C7:LOSE is terminal lost", () => {
    expect(isTerminalLostStage("C7:LOSE")).toBe(true);
    expect(isTerminalStage("C7:LOSE")).toBe(true);
    expect(isDealActiveStage("C7:LOSE")).toBe(false);
  });

  it("TC-STAGE-06: C7:LOST is terminal lost", () => {
    expect(isTerminalLostStage("C7:LOST")).toBe(true);
    expect(isTerminalStage("C7:LOST")).toBe(true);
    expect(isDealActiveStage("C7:LOST")).toBe(false);
  });

  it("TC-STAGE-07: NEW is active", () => {
    expect(isTerminalStage("NEW")).toBe(false);
    expect(isDealActiveStage("NEW")).toBe(true);
    expect(isProgressedCommercialStage("NEW")).toBe(false);
  });

  it("TC-STAGE-08: C7:PREPARATION is active", () => {
    expect(isTerminalStage("C7:PREPARATION")).toBe(false);
    expect(isDealActiveStage("C7:PREPARATION")).toBe(true);
    expect(isProgressedCommercialStage("C7:PREPARATION")).toBe(false);
  });

  it("TC-STAGE-09: A C1:WON Deal older than 100 days must NOT generate stalled_deal", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const oldDate = "2026-05-01"; // 123 days ago (> 30 days)

    const deal: CommercialDeal = {
      id: "deal-won-1",
      title: "Closed Won Deal",
      companyId: "comp-1",
      responsibleId: "user-1",
      stageId: "C1:WON",
      categoryId: "1",
      opportunity: 100000,
      currencyId: "RUB",
      dateCreate: oldDate,
      beginDate: oldDate,
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const company: CommercialCompany = {
      id: "comp-1",
      title: "Test Company 1",
      responsibleId: "user-1",
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals: [deal],
      hasAttention: false,
      attentionReasons: [],
    };

    const bottlenecks = computeBottlenecks([company], now);
    const stalled = bottlenecks.filter((b) => b.type === "stalled_deal");
    expect(stalled).toHaveLength(0);
  });

  it("TC-STAGE-10: A C1:LOSE Deal older than 100 days must NOT generate stalled_deal", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const oldDate = "2026-05-01"; // 123 days ago (> 30 days)

    const deal: CommercialDeal = {
      id: "deal-lose-1",
      title: "Closed Lost Deal",
      companyId: "comp-2",
      responsibleId: "user-1",
      stageId: "C1:LOSE",
      categoryId: "1",
      opportunity: 50000,
      currencyId: "RUB",
      dateCreate: oldDate,
      beginDate: oldDate,
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const company: CommercialCompany = {
      id: "comp-2",
      title: "Test Company 2",
      responsibleId: "user-1",
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals: [deal],
      hasAttention: false,
      attentionReasons: [],
    };

    const bottlenecks = computeBottlenecks([company], now);
    const stalled = bottlenecks.filter((b) => b.type === "stalled_deal");
    expect(stalled).toHaveLength(0);
  });
});
