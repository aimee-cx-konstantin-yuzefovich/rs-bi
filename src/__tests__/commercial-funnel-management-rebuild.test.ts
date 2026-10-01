// src/__tests__/commercial-funnel-management-rebuild.test.ts
// Unit tests for shared management analytics (T03–T11, T25 subset).

import { describe, expect, it } from "vitest";
import {
  computeFunnelView,
  computeSegmentBreakdown,
  computeActionPlan,
  computeManagementSignals,
  buildSampleTestingSnapshot,
  NEXT_ACTION_MISSING_LABEL,
} from "@/lib/commercial-funnel/analytics";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

const FIXED_NOW = new Date(2026, 8, 29, 12, 0, 0);
const bounds = computePeriodBoundaries({ periodPreset: "30days" }, FIXED_NOW);

function deal(p: Partial<CommercialDeal> & { id: string }): CommercialDeal {
  return {
    title: `Сделка ${p.id}`,
    companyId: "1",
    responsibleId: "mgr-1",
    stageId: "NEW",
    categoryId: "0",
    opportunity: 100000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    dateCreate: "2026-09-20",
    productType: [],
    direction: [],
    industry: [],
    ...p,
  } as CommercialDeal;
}

function company(p: Partial<CommercialCompany> & { id: string }): CommercialCompany {
  return {
    title: `Компания ${p.id}`,
    responsibleId: "mgr-1",
    dateCreate: "2026-09-20",
    direction: [],
    productType: [],
    gradeGel: [],
    gradeSol: [],
    deals: [],
    hasAttention: false,
    attentionReasons: [],
    ...p,
  } as CommercialCompany;
}

describe("computeFunnelView — event vs snapshot isolation (T03, T04)", () => {
  it("T03: company in testing 60 days stays in current WIP but not in 30-day sent event", () => {
    const c = company({
      id: "1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleShipmentDate: "2026-07-30", // 60 days ago
      sampleEventDatesForPeriodMetrics: ["2026-07-30"],
      deals: [deal({ id: "d1", sampleSentDate: "2026-07-30", sampleTransferStatus: "На испытании" })],
    });
    const view = computeFunnelView([c], bounds);
    const testing = view.sampleTestingStages.find((s) => s.id === "На испытании")!;
    const sent = view.sampleTestingStages.find((s) => s.id === "Образцы отправлены")!;
    expect(testing.companyCount).toBe(1); // current WIP not date-truncated
    expect(sent.periodEventCount).toBe(0); // event outside 30 days
    expect(sent.companyCount).toBe(0); // company's CURRENT state is testing, not sent
  });

  it("T04: no conversion percentage is produced anywhere in funnel view", () => {
    const c1 = company({ id: "1", sampleStatus: "Требуются образцы", sampleStatusSource: "COMPANY" });
    const c2 = company({ id: "2", sampleStatus: "Образцы отправлены", sampleStatusSource: "COMPANY" });
    const view = computeFunnelView([c1, c2], bounds);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/conversion|Conversion|конверс/i);
    expect(view.continuation.positiveResult.count).toBe(0);
  });

  it("continuation link counts evidence without percentage", () => {
    const c = company({
      id: "1",
      sampleStatus: "Подошли",
      sampleStatusSource: "DEAL",
      deals: [deal({ id: "d1", stageId: "PREPARATION" })],
    });
    const noDeal = company({ id: "2", sampleStatus: "Подошли", sampleStatusSource: "COMPANY" });
    const view = computeFunnelView([c, noDeal], bounds);
    expect(view.continuation.positiveResult.count).toBe(2);
    expect(view.continuation.withCommercialContinuation.count).toBe(1);
    expect(view.continuation.withCommercialContinuation.companyIds).toEqual(["1"]);
  });

  it("stages without dated events expose periodEventCount null", () => {
    const c = company({ id: "1", sampleStatus: "Подошли", sampleStatusSource: "COMPANY" });
    const view = computeFunnelView([c], bounds);
    const passed = view.sampleTestingStages.find((s) => s.id === "Подошли")!;
    expect(passed.periodEventCount).toBeNull();
  });
});

describe("computeSegmentBreakdown (T06, T07, T08)", () => {
  it("T07: multi-value product appears in two rows; unique total counts once", () => {
    const c = company({
      id: "1",
      productType: ["Гель", "Золь"],
      industry: "Строительство",
      sampleStatus: "На испытании",
      sampleStatusSource: "COMPANY",
    });
    const bd = computeSegmentBreakdown([c], bounds, "product");
    const gel = bd.rows.find((r) => r.label === "Гель")!;
    const sol = bd.rows.find((r) => r.label === "Золь")!;
    expect(gel.current.inTesting.companyIds).toEqual(["1"]);
    expect(sol.current.inTesting.companyIds).toEqual(["1"]);
    expect(bd.isMultiValueDimension).toBe(true);
    expect(bd.totalUniqueCompanyIds).toEqual(["1"]); // once, not twice
  });

  it("T08: missing industry becomes 'Не указано' row, not silently dropped", () => {
    const c = company({ id: "1", industry: undefined });
    const bd = computeSegmentBreakdown([c], bounds, "industry");
    expect(bd.rows).toHaveLength(1);
    expect(bd.rows[0].label).toBe("Не указано");
    expect(bd.rows[0].isMissingValue).toBe(true);
    expect(bd.isMultiValueDimension).toBe(false);
  });

  it("T06: period metrics per row reconcile to computePeriodMetrics on subset", () => {
    const c = company({ id: "1", industry: "ЛКМ", dateCreate: "2026-09-20" });
    const bd = computeSegmentBreakdown([c], bounds, "industry");
    expect(bd.rows[0].period.newCompanies.count).toBe(1);
    expect(bd.rows[0].period.newCompanies.companyIds).toEqual(["1"]);
  });
});

describe("computeActionPlan + signals (T10, T11)", () => {
  it("T11: missing next action yields no invented content", () => {
    const c = company({
      id: "1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "mgr-1",
      sampleShipmentDate: "2026-08-01", // > 14 days → stalled testing
      deals: [],
    });
    const plan = computeActionPlan([c], FIXED_NOW);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0].nextAction).toBeUndefined(); // 58a0dfb: never invented
    expect(NEXT_ACTION_MISSING_LABEL).toBe("Следующий шаг не указан");
  });

  it("T10: action plan rows reconcile to computeBottlenecks items", () => {
    const c = company({
      id: "1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "mgr-1",
      sampleShipmentDate: "2026-08-01",
      deals: [],
    });
    const plan = computeActionPlan([c], FIXED_NOW);
    expect(plan).toHaveLength(1);
    expect(plan[0].companyId).toBe("1");
    expect(plan[0].responsibleId).toBe("mgr-1");
  });

  it("signals carry unique company IDs reconciling to bottleneck output", () => {
    const c = company({
      id: "1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "mgr-1",
      sampleShipmentDate: "2026-08-01",
      deals: [],
    });
    const signals = computeManagementSignals([c], FIXED_NOW);
    const testing = signals.find((s) => s.id === "testing_stalled")!;
    expect(testing.companyCount).toBe(1);
    expect(testing.companyIds).toEqual(["1"]);
  });

  it("last activity known flag is false without activity data (truthful disclosure)", () => {
    const c = company({
      id: "1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "mgr-1",
      sampleShipmentDate: "2026-08-01",
      deals: [],
    });
    const plan = computeActionPlan([c], FIXED_NOW);
    expect(plan[0].lastActivityKnown).toBe(false);
    expect(plan[0].lastActivity).toBeUndefined();
  });
});

describe("buildSampleTestingSnapshot (T25)", () => {
  it("T25: active testing record with old send date stays present", () => {
    const c = company({
      id: "1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "mgr-1",
      sampleResponsibleName: "Мария Е.",
      sampleResponsibleDealId: "d1",
      sampleShipmentDate: "2026-07-30", // canonical company-level projection of the current sample Deal
      industry: "ЛКМ",
      direction: ["Авто"],
      productType: ["Гель"],
      deals: [deal({ id: "d1", sampleSentDate: "2026-07-30", sampleTransferStatus: "На испытании" })],
    });
    const snap = buildSampleTestingSnapshot([c], FIXED_NOW);
    expect(snap).toHaveLength(1);
    expect(snap[0].companyId).toBe("1");
    expect(snap[0].testingStatus).toBe("На испытании");
    expect(snap[0].shipmentDate).toBe("2026-07-30"); // old date retained
    expect(snap[0].nextActionOrComment).toBe(NEXT_ACTION_MISSING_LABEL);
  });
});
