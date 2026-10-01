// src/__tests__/commercial-funnel-source-of-truth-correctness.test.ts
// ─────────────────────────────────────────────────────────────────────
// Mandatory regression suite for Commercial Funnel Source-of-Truth Correctness Patch.
// Tests A through H correspond strictly to §16 specifications.
// ─────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  normalizeCompanies,
  normalizeDeals,
} from "@/lib/commercial-funnel/normalize";
import {
  computeBottlenecks,
  computePeriodMetrics,
  computeWipMetrics,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import {
  computeFunnelView,
  computeSegmentBreakdown,
  getAnalyticalSegmentValues,
} from "@/lib/commercial-funnel/analytics";
import {
  isCommercialContinuationStage,
  isDealActiveStage,
  isTerminalLostStage,
  isTerminalStage,
  isTerminalWonStage,
} from "@/lib/commercial-funnel/stage-utils";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import {
  COMPANY_APPLICATION_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_GEL_GRADE_USED_FIELD_ID,
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_REGION_FIELD_ID,
} from "@/lib/crm-constants";
import type {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
  PeriodBoundaries,
} from "@/lib/commercial-funnel/types";

const FIXED_NOW = new Date("2026-09-30T12:00:00Z");
const bounds: PeriodBoundaries = computePeriodBoundaries(
  { periodPreset: "30days" },
  FIXED_NOW
);

const defaultFilters: CommercialFilters = {
  periodPreset: "30days",
  responsibleId: "all",
  productType: "all",
  industry: "all",
  direction: "all",
  region: "all",
};

function makeDeal(p: Partial<CommercialDeal> & { id: string }): CommercialDeal {
  const { id, ...rest } = p;
  return {
    id,
    title: `Deal ${id}`,
    companyId: "comp-1",
    responsibleId: "user-1",
    responsibleName: "Менеджер 1",
    stageId: "NEW",
    categoryId: "0",
    opportunity: 100000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    dateCreate: "2026-09-10",
    productType: [],
    productTypeRaw: [],
    industry: [],
    industryRaw: [],
    direction: [],
    directionRaw: [],
    sampleTestingStatus: [],
    sampleTestingStatusRaw: [],
    ...rest,
  } as CommercialDeal;
}

function makeCompany(p: Partial<CommercialCompany> & { id: string }): CommercialCompany {
  const { id, ...rest } = p;
  return {
    id,
    title: `Company ${id}`,
    responsibleId: "user-1",
    responsibleName: "Менеджер 1",
    companyFactsIncluded: true,
    dateCreate: "2026-09-01",
    direction: [],
    productType: [],
    sampleStatus: "—",
    sampleStatusSource: "NONE",
    sampleAllDates: [],
    gradeGel: [],
    gradeSol: [],
    deals: [],
    hasAttention: false,
    attentionReasons: [],
    ...rest,
  } as CommercialCompany;
}

describe("Section 16 Mandatory Regression Suite", () => {
  // ─── 16.A: Company dimensions ───
  it("16.A: Company normalization uses only current authoritative fields", () => {
    const rawCompanies = [
      {
        ID: "1001",
        TITLE: "Synthetic Company",
        ASSIGNED_BY_ID: "50",
        DATE_CREATE: "2026-09-05",
        // Current authoritative fields
        [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: "111", // Chemistry
        [COMPANY_DIRECTION_CURRENT_FIELD_ID]: "222", // Industrial
        [COMPANY_PRODUCT_TYPE_FIELD_ID]: ["333"], // Gel
        [COMPANY_REGION_FIELD_ID]: "Moscow",
        // Legacy fields that MUST NOT override
        INDUSTRY: "999", // Metallurgy (legacy crm_status)
        UF_CRM_6915D8C0C6814: "998", // Retired industry
      },
    ];

    const statusLabels = {
      [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: { "111": "Chemistry" },
      [COMPANY_DIRECTION_CURRENT_FIELD_ID]: { "222": "Industrial" },
      [COMPANY_PRODUCT_TYPE_FIELD_ID]: { "333": "Gel" },
      INDUSTRY: { "999": "Metallurgy" },
    };

    const normalized = normalizeCompanies(rawCompanies, [], {
      statusLabels,
      userNames: { "50": "Test Manager" },
    });

    expect(normalized).toHaveLength(1);
    const c = normalized[0];
    expect(c.industry).toBe("Chemistry");
    expect(c.industryRaw).toBe("111");
    expect(c.direction).toEqual(["Industrial"]);
    expect(c.directionRaw).toEqual(["222"]);
    expect(c.productType).toEqual(["Gel"]);
    expect(c.productTypeRaw).toEqual(["333"]);
    expect(c.region).toBe("Moscow");
  });

  // ─── 16.B: Application alias ───
  it("16.B: UF_CRM_1781806326214 (Gel grade) never populates Application (UF_CRM_69257337B8025 wins)", () => {
    const rawCompanies = [
      {
        ID: "1002",
        TITLE: "Company With Gel Grade and Application",
        [COMPANY_APPLICATION_FIELD_ID]: "Water treatment",
        [COMPANY_GEL_GRADE_USED_FIELD_ID]: "GEL-123",
      },
    ];

    const normalized = normalizeCompanies(rawCompanies, []);
    expect(normalized).toHaveLength(1);
    const c = normalized[0];
    expect(c.application).toBe("Water treatment");
    expect(c.application).not.toBe("GEL-123");
  });

  // ─── 16.C: Company-only classification filter ───
  it("16.C: Dimensional filters evaluate strictly on Company fields; Deal classification does not alter filter nor prune deals", () => {
    const paidDeal = makeDeal({
      id: "deal-1",
      companyId: "comp-c",
      industry: ["Metallurgy"], // Deal industry differs from Company
      paymentStatus: "113",
      paymentDate: "2026-09-15",
      opportunity: 500000,
    });

    const comp = makeCompany({
      id: "comp-c",
      industry: "Chemistry", // Authoritative Company industry
      deals: [paidDeal],
    });

    // 1. Filter by Chemistry -> Company is included
    const chemistryFiltered = filterCompaniesByDimensions([comp], {
      ...defaultFilters,
      industry: "Chemistry",
    });
    expect(chemistryFiltered).toHaveLength(1);
    // Crucial: The paid Deal is NOT discarded, and its payment is retained in KPI!
    expect(chemistryFiltered[0].deals).toHaveLength(1);
    expect(chemistryFiltered[0].deals[0].id).toBe("deal-1");

    const kpis = computePeriodMetrics(chemistryFiltered, bounds);
    const paidKpi = kpis.find((k) => k.id === "payments_received");
    expect(paidKpi?.currentValue).toBe(1);
    expect(paidKpi?.companyIds).toEqual(["comp-c"]);

    // 2. Filter by Metallurgy -> Company is excluded (child Deal does NOT rescue it)
    const metallurgyFiltered = filterCompaniesByDimensions([comp], {
      ...defaultFilters,
      industry: "Metallurgy",
    });
    expect(metallurgyFiltered).toHaveLength(0);
  });

  // ─── 16.D: Segments always use Company dimensions ───
  it("16.D: Under Responsible filter where Company owner differs from Deal owner, Segments always reflect Company dimensions", () => {
    // Company owner is User A (Alice), but Deal owner is User B (Bob)
    const bobDeal = makeDeal({
      id: "deal-bob",
      companyId: "comp-d",
      responsibleId: "user-bob",
      industry: ["Automotive"],
      direction: ["Transport"],
      productType: ["Sol"],
    });

    const comp = makeCompany({
      id: "comp-d",
      responsibleId: "user-alice", // Alice owns the company
      industry: "Chemistry",       // Factual Company industry
      direction: ["Industrial"],   // Factual Company direction
      productType: ["Gel"],        // Factual Company product
      deals: [bobDeal],
    });

    // Filter by Responsible = Bob
    const bobSlice = filterCompaniesByDimensions([comp], {
      ...defaultFilters,
      responsibleId: "user-bob",
    });
    expect(bobSlice).toHaveLength(1);
    const filteredComp = bobSlice[0];
    expect(filteredComp.companyFactsIncluded).toBe(false); // Bob does not own the company facts

    // Segment derivation MUST still use Company dimensions:
    expect(getAnalyticalSegmentValues(filteredComp, "industry")).toEqual(["Chemistry"]);
    expect(getAnalyticalSegmentValues(filteredComp, "direction")).toEqual(["Industrial"]);
    expect(getAnalyticalSegmentValues(filteredComp, "product")).toEqual(["Gel"]);

    // Compute segment breakdowns under Bob's slice
    const industryBd = computeSegmentBreakdown(bobSlice, bounds, "industry");
    expect(industryBd.rows.map((r) => r.label)).toEqual(["Chemistry"]);
    expect(industryBd.rows.find((r) => r.label === "Automotive")).toBeUndefined();

    const productBd = computeSegmentBreakdown(bobSlice, bounds, "product");
    expect(productBd.rows.map((r) => r.label)).toEqual(["Gel"]);
    expect(productBd.rows.find((r) => r.label === "Sol")).toBeUndefined();
  });

  // ─── 16.E: Terminal stage registry ───
  it("16.E: Terminal apology and lost stages are recognized as terminal non-success; process stages remain active", () => {
    const terminalApologyStages = [
      "1",
      "2",
      "4",
      "C1:3",
      "C1:4",
      "C1:5",
      "C1:6",
      "C3:2",
      "C3:3",
      "C5:APOLOGY",
      "C7:LOSE",
    ];

    for (const stage of terminalApologyStages) {
      expect(isTerminalLostStage(stage), `${stage} should be terminal lost/apology`).toBe(true);
      expect(isTerminalStage(stage), `${stage} should be terminal`).toBe(true);
      expect(isDealActiveStage(stage), `${stage} must NOT be active`).toBe(false);
    }

    const activeProcessStages = [
      "8",
      "5",
      "9",
      "10",
      "11",
      "C1:1",
      "C1:2",
      "C3:4",
      "C5:FINAL_INVOICE",
      "C7:FINAL_INVOICE",
    ];

    for (const stage of activeProcessStages) {
      expect(isTerminalLostStage(stage), `${stage} must not be terminal lost`).toBe(false);
      expect(isTerminalWonStage(stage), `${stage} must not be terminal won`).toBe(false);
      expect(isTerminalStage(stage), `${stage} must not be terminal`).toBe(false);
      expect(isDealActiveStage(stage), `${stage} MUST be active`).toBe(true);
    }
  });

  // ─── 16.F: Active Deal downstream reconciliation ───
  it("16.F: A company containing only terminal apology deal stages has activeDeals=0 and generates no stalled_deal bottleneck", () => {
    const testCases = ["1", "C1:3", "C3:2"];

    for (const stageId of testCases) {
      const deal = makeDeal({
        id: `deal-${stageId}`,
        stageId,
        dateCreate: "2026-05-01", // Old date (> 30 days)
        beginDate: "2026-05-01",
        activityLast: "2026-05-01",
        activityDataKnown: true,
      });

      const comp = makeCompany({
        id: `comp-${stageId}`,
        deals: [deal],
      });

      // Active deals count in Funnel Track B
      const funnel = computeFunnelView([comp], bounds);
      expect(funnel.commercial.current.activeDeals.count).toBe(0);

      // Stalled deal bottleneck evaluation
      const bottlenecks = computeBottlenecks([comp], FIXED_NOW);
      const stalled = bottlenecks.filter((b) => b.type === "stalled_deal");
      expect(stalled).toHaveLength(0);
    }
  });

  // ─── 16.G: Commercial continuation ───
  it("16.G: Commercial continuation correctly distinguishes progressed business stages from testing and lost stages", () => {
    // Category 0 + PREPARATION (договор) -> continuation = YES
    expect(isCommercialContinuationStage("PREPARATION", "0")).toBe(true);
    expect(isCommercialContinuationStage("8", "0")).toBe(true);
    expect(isCommercialContinuationStage("5", "0")).toBe(true);
    expect(isCommercialContinuationStage("WON", "0")).toBe(true);

    // Category 0 + UC_SP94UZ (тестирование образцов) -> continuation = NO
    expect(isCommercialContinuationStage("UC_SP94UZ", "0")).toBe(false);

    // Category 0 + NEW -> continuation = NO
    expect(isCommercialContinuationStage("NEW", "0")).toBe(false);

    // Category 0 + 1 (apology — не согласовали договор) -> continuation = NO
    expect(isCommercialContinuationStage("1", "0")).toBe(false);
    expect(isCommercialContinuationStage("2", "0")).toBe(false);
    expect(isCommercialContinuationStage("LOSE", "0")).toBe(false);

    // Funnel continuation link integration test
    const compPrep = makeCompany({
      id: "comp-prep",
      sampleStatus: "Подошли",
      deals: [makeDeal({ id: "d-prep", stageId: "PREPARATION", categoryId: "0" })],
    });

    const compTesting = makeCompany({
      id: "comp-test",
      sampleStatus: "Подошли",
      deals: [makeDeal({ id: "d-test", stageId: "UC_SP94UZ", categoryId: "0" })],
    });

    const compApology = makeCompany({
      id: "comp-apol",
      sampleStatus: "Подошли",
      deals: [makeDeal({ id: "d-apol", stageId: "1", categoryId: "0" })],
    });

    const funnel = computeFunnelView([compPrep, compTesting, compApology], bounds);
    expect(funnel.continuation.positiveResult.count).toBe(3);
    // Only compPrep has commercial continuation!
    expect(funnel.continuation.withCommercialContinuation.count).toBe(1);
    expect(funnel.continuation.withCommercialContinuation.companyIds).toEqual(["comp-prep"]);
  });

  // ─── 16.H: Sample WIP Deal count provenance ───
  it("16.H: Sample WIP dealCount strictly represents the Deal attached to the current canonical sample cycle", () => {
    // 1. Smart Process current cycle with sampleRelatedDealId
    const spLinkedDeal = makeDeal({ id: "deal-sp", stageId: "EXECUTING" });
    const compSpLinked = makeCompany({
      id: "comp-sp-linked",
      sampleStatus: "На испытании",
      sampleStatusSource: "SMART_PROCESS",
      sampleRelatedDealId: "deal-sp",
      deals: [spLinkedDeal],
    });

    const wipSpLinked = computeWipMetrics([compSpLinked]);
    const testingWip1 = wipSpLinked.find((w) => w.id === "На испытании")!;
    expect(testingWip1.companyCount).toBe(1);
    expect(testingWip1.dealCount).toBe(1);

    // 2. Smart Process current cycle WITHOUT linked Deal
    const compSpUnlinked = makeCompany({
      id: "comp-sp-unlinked",
      sampleStatus: "На испытании",
      sampleStatusSource: "SMART_PROCESS",
      sampleRelatedDealId: undefined,
      deals: [makeDeal({ id: "unrelated-deal", stageId: "EXECUTING" })],
    });

    const wipSpUnlinked = computeWipMetrics([compSpUnlinked]);
    const testingWip2 = wipSpUnlinked.find((w) => w.id === "На испытании")!;
    expect(testingWip2.companyCount).toBe(1);
    expect(testingWip2.dealCount).toBe(0);

    // 3. Company legacy fallback -> dealCount = 0
    const compLegacy = makeCompany({
      id: "comp-legacy",
      sampleStatus: "На испытании",
      sampleStatusSource: "COMPANY",
      deals: [makeDeal({ id: "sibling-deal", stageId: "EXECUTING" })],
    });

    const wipLegacy = computeWipMetrics([compLegacy]);
    const testingWip3 = wipLegacy.find((w) => w.id === "На испытании")!;
    expect(testingWip3.companyCount).toBe(1);
    expect(testingWip3.dealCount).toBe(0);
  });
});
