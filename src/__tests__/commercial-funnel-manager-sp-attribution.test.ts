// @vitest-environment node
// src/__tests__/commercial-funnel-manager-sp-attribution.test.ts
// ─────────────────────────────────────────────────────────────────────
// Phase C manager attribution matrix (M1–M4) + awaiting-payment
// regression guard (§36).
//
// Attribution invariants:
// - Current sample state: SMART_PROCESS → SP ASSIGNED_BY_ID; DEAL →
//   Deal responsible; COMPANY → Company owner.
// - Period sent events: per-event attribution (SP event → SP
//   responsible; Deal event → Deal responsible; Company event → owner).
// - Global KPI counts unique companies; manager rows count unique
//   companies per manager; union reconciles to the attributable global
//   event population (sum of manager rows may exceed the global count).
// - Multiple active SP cycles with different managers: NO arbitrary
//   current manager.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/samples/smart-process-contract", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/samples/smart-process-contract")>();
  return {
    ...real,
    SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
    SMART_PROCESS_SENT_DATE_FIELD_ID: "UF_CRM_SP_SENT",
    SMART_PROCESS_DEAL_FIELD_ID: "UF_CRM_SP_DEAL",
    SMART_PROCESS_GRADE_GEL_FIELD_ID: "UF_CRM_SP_GEL",
    SMART_PROCESS_GRADE_SOL_FIELD_ID: "UF_CRM_SP_SOL",
    SMART_PROCESS_TEST_RESULT_FIELD_ID: "UF_CRM_SP_RESULT",
  };
});

import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
import {
  applyCanonicalSampleDomain,
  normalizeCompanies,
  normalizeDeals,
} from "@/lib/commercial-funnel/normalize";
import {
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import {
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
} from "@/lib/crm-constants";

const BOUNDS = computePeriodBoundaries({
  periodPreset: "custom",
  customFrom: "2026-09-01",
  customTo: "2026-09-30",
});

function pipeline(
  rawCompanies: Array<Record<string, unknown>>,
  rawDeals: Array<Record<string, unknown>>,
  spItems: Array<Record<string, unknown>>,
  userNames: Record<string, string> = {}
) {
  const deals = normalizeDeals(rawDeals as any, { userNames });
  const companies = normalizeCompanies(rawCompanies as any, deals, { userNames });
  const domain = buildCanonicalSampleDomain(rawCompanies as any, rawDeals as any, spItems as any);
  return {
    companies: applyCanonicalSampleDomain(companies, domain, { userNames }),
    domain,
  };
}

describe("Phase C — Manager attribution (M1–M4)", () => {
  it("M1: SP current responsible = M1, Company owner = M2 → current sample portfolio → M1", () => {
    const { companies } = pipeline(
      [{ ID: "100", TITLE: "C", ASSIGNED_BY_ID: "mgr-2" }],
      [],
      [{
        id: "9001",
        stageId: "DT1032_15:CLIENT",
        assignedById: "mgr-1",
        companyId: "100",
        createdTime: "2026-09-01T10:00:00+03:00",
      }],
      { "mgr-1": "Менеджер 1", "mgr-2": "Менеджер 2" }
    );

    expect(companies[0].sampleStatusSource).toBe("SMART_PROCESS");
    expect(companies[0].sampleResponsibleId).toBe("mgr-1");

    const scorecard = computeManagerScorecard(companies, BOUNDS, [], {
      "mgr-1": "Менеджер 1",
      "mgr-2": "Менеджер 2",
    });
    const row1 = scorecard.find((r) => r.responsibleId === "mgr-1")!;
    expect(row1).toBeDefined();
    expect(row1.inTesting).toBe(1);
    expect(row1.activeCompaniesIds).toContain("100");
    // Company owner does NOT receive the SP current-sample attribution.
    const row2 = scorecard.find((r) => r.responsibleId === "mgr-2");
    expect(row2?.inTesting ?? 0).toBe(0);
  });

  it("M2: SP sent event manager = M1 → samplesSent attributed to M1", () => {
    const { companies } = pipeline(
      [{ ID: "100", TITLE: "C", ASSIGNED_BY_ID: "mgr-2" }],
      [],
      [{
        id: "9001",
        stageId: "DT1032_15:UC_ZARRMX",
        assignedById: "mgr-1",
        companyId: "100",
        createdTime: "2026-09-01T10:00:00+03:00",
        UF_CRM_SP_SENT: "2026-09-10",
      }],
      { "mgr-1": "Менеджер 1", "mgr-2": "Менеджер 2" }
    );

    const scorecard = computeManagerScorecard(companies, BOUNDS, [], {
      "mgr-1": "Менеджер 1",
      "mgr-2": "Менеджер 2",
    });
    const row1 = scorecard.find((r) => r.responsibleId === "mgr-1")!;
    expect(row1.samplesSent).toBe(1);
    expect(row1.companyIds).toContain("100");

    const kpis = computePeriodMetrics(companies, BOUNDS);
    const sentKpi = kpis.find((k) => k.id === "samples_sent")!;
    expect(sentKpi.currentValue).toBe(1);
    expect(sentKpi.companyIds).toEqual(["100"]);
  });

  it("M3: legacy sent (M1) + SP sent (M2) same period → global count 1, each manager 1, union reconciles", () => {
    const { companies } = pipeline(
      [{ ID: "100", TITLE: "C", ASSIGNED_BY_ID: "mgr-1" }],
      [{
        ID: "50",
        COMPANY_ID: "100",
        ASSIGNED_BY_ID: "mgr-1",
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:UC_ZARRMX",
        [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-09-05",
      }],
      [{
        id: "9001",
        stageId: "DT1032_15:UC_ZARRMX",
        assignedById: "mgr-2",
        companyId: "100",
        createdTime: "2026-09-01T10:00:00+03:00",
        UF_CRM_SP_SENT: "2026-09-20",
      }],
      { "mgr-1": "Менеджер 1", "mgr-2": "Менеджер 2" }
    );

    const kpis = computePeriodMetrics(companies, BOUNDS);
    const sentKpi = kpis.find((k) => k.id === "samples_sent")!;
    // Global: unique Company count = 1 (dedup at Company+date level is NOT
    // applied across DIFFERENT dated events — two factual events exist).
    expect(sentKpi.currentValue).toBe(1);
    expect(sentKpi.companyIds).toEqual(["100"]);

    const scorecard = computeManagerScorecard(companies, BOUNDS, [], {
      "mgr-1": "Менеджер 1",
      "mgr-2": "Менеджер 2",
    });
    const row1 = scorecard.find((r) => r.responsibleId === "mgr-1")!;
    const row2 = scorecard.find((r) => r.responsibleId === "mgr-2")!;
    expect(row1.samplesSent).toBe(1);
    expect(row2.samplesSent).toBe(1);
    // Union of manager Company IDs reconciles to the attributable global population.
    const union = new Set([...row1.companyIds, ...row2.companyIds]);
    expect(Array.from(union)).toEqual(["100"]);
  });

  it("M4: two active SP items with different managers → no arbitrary current manager", () => {
    const { companies, domain } = pipeline(
      [{ ID: "100", TITLE: "C", ASSIGNED_BY_ID: "mgr-1" }],
      [],
      [
        {
          id: "9001",
          stageId: "DT1032_15:CLIENT",
          assignedById: "mgr-1",
          companyId: "100",
          createdTime: "2026-09-01T10:00:00+03:00",
        },
        {
          id: "9002",
          stageId: "DT1032_15:UC_ZARRMX",
          assignedById: "mgr-2",
          companyId: "100",
          createdTime: "2026-09-02T10:00:00+03:00",
        },
      ],
      { "mgr-1": "Менеджер 1", "mgr-2": "Менеджер 2" }
    );

    expect(domain.qualityCounts.multipleActiveCount).toBe(1);
    expect(companies[0].sampleCurrentResolutionQuality).toBe("AMBIGUOUS_MULTIPLE_ACTIVE");
    expect(companies[0].sampleResponsibleId).toBeUndefined();

    const scorecard = computeManagerScorecard(companies, BOUNDS, [], {
      "mgr-1": "Менеджер 1",
      "mgr-2": "Менеджер 2",
    });
    // Neither manager receives fabricated current-sample attribution.
    expect(scorecard.find((r) => r.responsibleId === "mgr-1")?.inTesting ?? 0).toBe(0);
    expect(scorecard.find((r) => r.responsibleId === "mgr-2")?.inTesting ?? 0).toBe(0);
  });
});

describe("Phase C — Awaiting payment regression guard (§36)", () => {
  it("105/107 are awaiting payment; 103 is NOT; independent of Deal stage", () => {
    const companies = normalizeCompanies(
      [{ ID: "100", TITLE: "C", ASSIGNED_BY_ID: "1" }],
      normalizeDeals(
        [
          {
            ID: "50",
            COMPANY_ID: "100",
            ASSIGNED_BY_ID: "1",
            STAGE_ID: "C4:WON", // terminal stage
            [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:SUCCESS",
            UF_CRM_1584460062014: "",
          },
        ],
        {}
      ),
      {}
    );
    // Simulate awaiting payment statuses on normalized deals.
    companies[0].deals[0].paymentStatus = "105";

    const wip = computeWipMetrics(companies);
    const awaiting = wip.find((w) => w.id === "awaiting_payment")!;
    expect(awaiting.companyCount).toBe(1);
    expect(awaiting.dealCount).toBe(1);

    // 103 is NOT awaiting payment.
    companies[0].deals[0].paymentStatus = "103";
    const wip103 = computeWipMetrics(companies);
    expect(wip103.find((w) => w.id === "awaiting_payment")!.companyCount).toBe(0);

    // 107 IS awaiting payment.
    companies[0].deals[0].paymentStatus = "107";
    const wip107 = computeWipMetrics(companies);
    expect(wip107.find((w) => w.id === "awaiting_payment")!.companyCount).toBe(1);
  });
});
