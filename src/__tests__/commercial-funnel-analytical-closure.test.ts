// @vitest-environment node
// src/__tests__/commercial-funnel-analytical-closure.test.ts
// ─────────────────────────────────────────────────────────────────────
// Adversarial Regression Test Suite for Commercial Funnel Analytical Closure:
// Covers Scenarios A through R and Section 18 exact drill-down reconciliation.
// All expected values are manually specified (reference-style, no self-referential assertions).
// ─────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
} from "@/lib/commercial-funnel/engine";
import {
  computeFunnelView,
  computeManagementSignals,
} from "@/lib/commercial-funnel/analytics";
import {
  buildActiveDealsDrillDown,
  buildAwaitingPaymentDrillDown,
  buildContinuationDrillDown,
  buildDealsCreatedDrillDown,
  buildNewCompaniesDrillDown,
  buildPaymentsReceivedDrillDown,
  buildSampleStageDrillDown,
  buildSamplesSentDrillDown,
  buildShipmentsDrillDown,
  buildSignalDrillDown,
} from "@/lib/commercial-funnel/drill-down";
import {
  COMMERCIAL_THRESHOLDS,
  UNCLASSIFIED_LABEL,
} from "@/lib/commercial-funnel/constants";
import {
  normalizeCompanies,
  normalizeDeals,
  applyCanonicalSampleDomain,
} from "@/lib/commercial-funnel/normalize";
import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
import { isActiveDealMissingNextStep } from "@/lib/commercial-funnel/bottlenecks";
import type {
  CommercialCompany,
  CommercialDeal,
  PeriodBoundaries,
} from "@/lib/commercial-funnel/types";

function createMockBoundaries(
  startStr: string = "2026-03-01T00:00:00+03:00",
  endStr: string = "2026-03-31T23:59:59+03:00"
): PeriodBoundaries {
  return {
    currentStart: new Date(startStr),
    currentEnd: new Date(endStr),
    previousStart: new Date("2026-01-29T00:00:00+03:00"),
    previousEnd: new Date("2026-02-28T23:59:59+03:00"),
    currentStartStr: startStr,
    currentEndStr: endStr,
    previousStartStr: "2026-01-29T00:00:00+03:00",
    previousEndStr: "2026-02-28T23:59:59+03:00",
    isAllTime: false,
  };
}

function mockDeal(partial: Partial<CommercialDeal>): CommercialDeal {
  return {
    id: partial.id || "D1",
    companyId: partial.companyId || "C1",
    title: partial.title || "Deal 1",
    stageId: partial.stageId || "PREPARATION",
    categoryId: String(partial.categoryId ?? "0"),
    responsibleId: partial.responsibleId || "10",
    opportunity: partial.opportunity ?? null,
    opportunityQuality:
      partial.opportunityQuality ||
      (typeof partial.opportunity === "number"
        ? "VALID"
        : partial.opportunity === null
        ? "UNKNOWN"
        : undefined),
    currencyId: partial.currencyId || "RUB",
    dateCreate: partial.dateCreate,
    paymentStatus: partial.paymentStatus,
    paymentDate: partial.paymentDate,
    shipmentDate: partial.shipmentDate,
    activityDataKnown: partial.activityDataKnown ?? true,
    activityLast: partial.activityLast,
    activityNext: partial.activityNext,
    productType: partial.productType || [],
    industry: partial.industry || [],
    direction: partial.direction || [],
    ...partial,
  };
}

function mockCompany(partial: Partial<CommercialCompany>): CommercialCompany {
  return {
    id: partial.id || "C1",
    title: partial.title || "Company 1",
    responsibleId: partial.responsibleId || "10",
    direction: partial.direction || [],
    productType: partial.productType || [],
    sampleStatus: partial.sampleStatus || "—",
    sampleStatusSource: partial.sampleStatusSource || "NONE",
    deals: partial.deals || [],
    hasAttention: partial.hasAttention ?? false,
    attentionReasons: partial.attentionReasons || [],
    sampleAllDates: partial.sampleAllDates || [],
    gradeGel: partial.gradeGel || [],
    gradeSol: partial.gradeSol || [],
    ...partial,
  };
}

function runCanonicalPipeline(
  rawCompanies: Array<Record<string, unknown>>,
  rawDeals: Array<Record<string, unknown>>,
  spItems: Array<Record<string, unknown>> = [],
  options: { now?: Date } = {}
): CommercialCompany[] {
  const deals = normalizeDeals(rawDeals as any, options as any);
  const companies = normalizeCompanies(rawCompanies as any, deals, options as any);
  const domain = buildCanonicalSampleDomain(rawCompanies as any, rawDeals as any, spItems as any);
  return applyCanonicalSampleDomain(companies, domain, options as any);
}

describe("Commercial Funnel Analytical Closure — Scenarios A through R", () => {
  const boundaries = createMockBoundaries();
  const testNow = new Date("2026-03-31T12:00:00+03:00");

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO A: Period vs WIP
  // Company currently testing (SP CLIENT stage).
  // Shipment was 60 days ago (2026-01-30, outside March period).
  // Current testing WIP = 1, period sent Companies = 0.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario A: Period vs WIP — current testing WIP is not truncated by period", () => {
    const rawCompanies = [{ ID: "C1", TITLE: "Company A", ASSIGNED_BY_ID: "10" }];
    const spItems = [
      {
        id: "1001",
        stageId: "DT1032_15:CLIENT", // "На испытании"
        companyId: "C1",
        assignedById: "10",
        ufCrm15_1740000000: "2026-01-30", // shipped 60 days ago
      },
    ];

    const companies = runCanonicalPipeline(rawCompanies, [], spItems, { now: testNow });
    const funnel = computeFunnelView(companies, boundaries);
    const datedKpis = computePeriodMetrics(companies, boundaries);

    const testingStage = funnel.sampleTestingStages.find((s) => s.label === "На испытании");
    expect(testingStage?.companyCount).toBe(1);
    expect(testingStage?.companyIds).toEqual(["C1"]);

    // Sent in March period must be 0 because shipment was 2026-01-30
    const sentKpi = datedKpis.find((k) => k.id === "samples_sent");
    expect(sentKpi?.currentValue).toBe(0);
    expect(sentKpi?.companyIds).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO B: Multiple Sent Evidence
  // One company has multiple sent evidence records inside period.
  // Expected: Overview sent Companies = 1, Funnel periodCompanyCount = 1.
  // Must NOT count physical shipments or duplicate the company.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario B: Multiple sent evidence — deduplicates to 1 unique company", () => {
    const company = mockCompany({
      id: "C1",
      sampleStatus: "Образцы отправлены",
      sampleStatusSource: "SMART_PROCESS",
      sampleSentEvents: [
        {
          date: "2026-03-10",
          source: "SMART_PROCESS",
          processItemId: "1002",
        },
        {
          date: "2026-03-15",
          source: "DEAL",
          dealId: "D1",
        },
      ],
      sampleAllDates: ["2026-03-10", "2026-03-15"],
    });

    const companies = [company];
    const datedKpis = computePeriodMetrics(companies, boundaries);
    const funnel = computeFunnelView(companies, boundaries);

    const sentKpi = datedKpis.find((k) => k.id === "samples_sent");
    expect(sentKpi?.currentValue).toBe(1);
    expect(sentKpi?.companyIds).toEqual(["C1"]);

    const sentStage = funnel.sampleTestingStages.find((s) => s.label === "Образцы отправлены");
    expect(sentStage?.periodCompanyCount).toBe(1);
    expect(sentStage?.periodCompanyIds).toEqual(["C1"]);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO C: Ambiguous Smart Process
  // SP1 active NEW, SP2 active CLIENT.
  // Expected: AMBIGUOUS_MULTIPLE_ACTIVE, specific WIP = 0, Не классифицировано = 1,
  // no fabricated manager or deal.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario C: Ambiguous Smart Process fails closed to unclassified with no manager attribution", () => {
    const rawCompanies = [{ ID: "C1", TITLE: "Company C", ASSIGNED_BY_ID: "10" }];
    const spItems = [
      { id: "1001", stageId: "DT1032_15:NEW", companyId: "C1", assignedById: "10" },
      { id: "1002", stageId: "DT1032_15:CLIENT", companyId: "C1", assignedById: "20" },
    ];

    const companies = runCanonicalPipeline(rawCompanies, [], spItems, { now: testNow });
    const c = companies[0];

    expect(c.sampleCurrentResolutionQuality).toBe("AMBIGUOUS_MULTIPLE_ACTIVE");
    expect(c.sampleStatus).toBe(UNCLASSIFIED_LABEL);
    expect(c.sampleResponsibleId).toBeUndefined();
    expect(c.sampleResponsibleProcessItemId).toBeUndefined();

    const funnel = computeFunnelView(companies, boundaries);
    const unclassStage = funnel.sampleTestingStages.find((s) => s.label === UNCLASSIFIED_LABEL);
    expect(unclassStage?.companyCount).toBe(1);
    expect(unclassStage?.companyIds).toEqual(["C1"]);

    const newStage = funnel.sampleTestingStages.find((s) => s.label === "Подготовка к отправке");
    expect(newStage?.companyCount).toBe(0);
    const clientStage = funnel.sampleTestingStages.find((s) => s.label === "На испытании");
    expect(clientStage?.companyCount).toBe(0);

    // Scorecard: manager must NOT receive attribution for ambiguous SP
    const scorecard = computeManagerScorecard(companies, boundaries, [], {});
    const mgr10 = scorecard.find((r) => r.responsibleId === "10");
    const mgr20 = scorecard.find((r) => r.responsibleId === "20");
    expect(mgr10?.activeCompanies ?? 0).toBe(0);
    expect(mgr20?.activeCompanies ?? 0).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO D: Ambiguous Legacy Deals
  // Two undated conflicting legacy Deal sample states.
  // Expected: Не классифицировано = 1, no arbitrary deal selected.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario D: Ambiguous legacy deals fail closed without arbitrary selection", () => {
    const company = mockCompany({
      id: "C1",
      sampleStatus: UNCLASSIFIED_LABEL,
      sampleStatusSource: "NONE",
      sampleCurrentResolutionQuality: "AMBIGUOUS",
    });

    const funnel = computeFunnelView([company], boundaries);
    const unclassStage = funnel.sampleTestingStages.find((s) => s.label === UNCLASSIFIED_LABEL);
    expect(unclassStage?.companyCount).toBe(1);
    expect(unclassStage?.companyIds).toEqual(["C1"]);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO E: Active Deal Multiplicity
  // Company C1: D1 active, D2 active, D3 terminal.
  // Expected: active company count = 1, active deal count = 2.
  // Drill-down evidence: D1, D2, never D3.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario E: Active deal multiplicity — company count 1, deal count 2, evidence D1+D2 never D3", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({ id: "D1", title: "Active 1", stageId: "PREPARATION", categoryId: "0" }),
        mockDeal({ id: "D2", title: "Active 2", stageId: "5", categoryId: "0" }),
        mockDeal({ id: "D3", title: "Terminal 3", stageId: "1", categoryId: "0" }), // Lost terminal
      ],
    });

    const companies = [company];
    const funnel = computeFunnelView(companies, boundaries);

    expect(funnel.commercial.current.activeDeals.count).toBe(1);
    expect(funnel.commercial.current.activeDeals.companyIds).toEqual(["C1"]);
    expect(funnel.commercial.current.dealCount).toBe(2);

    const drillDown = buildActiveDealsDrillDown(companies);
    expect(drillDown.companyIds).toEqual(["C1"]);
    expect(drillDown.expectedCompanyCount).toBe(1);
    expect(drillDown.expectedDealCount).toBe(2);

    const evidenceDealIds = drillDown.evidence.map((e) => e.dealId);
    expect(evidenceDealIds).toContain("D1");
    expect(evidenceDealIds).toContain("D2");
    expect(evidenceDealIds).not.toContain("D3");
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO F: Awaiting Payment Provenance
  // C1: D1 representative Deal (paymentStatus=103 / unpaid),
  // D2 paymentStatus=105, D3 paymentStatus=107.
  // Expected: awaiting companies = 1, awaiting deals = 2, drill-down: D2 + D3, never D1.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario F: Awaiting payment provenance — D2 + D3 qualify, never D1", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({ id: "D1", title: "Unpaid Deal", stageId: "WON", paymentStatus: "103" }),
        mockDeal({ id: "D2", title: "Invoice Sent", stageId: "WON", paymentStatus: "105" }),
        mockDeal({ id: "D3", title: "Awaiting Confirmation", stageId: "1", paymentStatus: "107" }),
      ],
    });

    const companies = [company];
    const funnel = computeFunnelView(companies, boundaries);

    expect(funnel.commercial.current.awaitingPayment.count).toBe(1);
    expect(funnel.commercial.current.awaitingPayment.companyIds).toEqual(["C1"]);
    expect(funnel.commercial.current.awaitingPaymentDealCount).toBe(2);

    const drillDown = buildAwaitingPaymentDrillDown(companies);
    expect(drillDown.companyIds).toEqual(["C1"]);
    expect(drillDown.expectedCompanyCount).toBe(1);
    expect(drillDown.expectedDealCount).toBe(2);

    const evidenceDealIds = drillDown.evidence.map((e) => e.dealId);
    expect(evidenceDealIds).toContain("D2");
    expect(evidenceDealIds).toContain("D3");
    expect(evidenceDealIds).not.toContain("D1");
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO G: Paid Deal in Period
  // D2 paid inside period, D1 outside period.
  // Expected: payment evidence contains only D2.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario G: Paid deal in period — only D2 qualifies, D1 outside period is excluded", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({
          id: "D1",
          title: "Paid Feb",
          paymentStatus: "109",
          paymentDate: "2026-02-15",
          opportunity: 500000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
        }),
        mockDeal({
          id: "D2",
          title: "Paid March",
          paymentStatus: "109",
          paymentDate: "2026-03-20",
          opportunity: 700000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
        }),
      ],
    });

    const companies = [company];
    const drillDown = buildPaymentsReceivedDrillDown(companies, boundaries);

    expect(drillDown.companyIds).toEqual(["C1"]);
    expect(drillDown.expectedCompanyCount).toBe(1);
    expect(drillDown.expectedDealCount).toBe(1);
    expect(drillDown.evidence.map((e) => e.dealId)).toEqual(["D2"]);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO H: Shipment in Period
  // D2 shipment inside period, D1 outside.
  // Expected: only D2 qualifies.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario H: Shipment in period — only D2 qualifies", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({ id: "D1", title: "Shipment Feb", shipmentDate: "2026-02-10" }),
        mockDeal({ id: "D2", title: "Shipment March", shipmentDate: "2026-03-12" }),
      ],
    });

    const companies = [company];
    const drillDown = buildShipmentsDrillDown(companies, boundaries);

    expect(drillDown.companyIds).toEqual(["C1"]);
    expect(drillDown.expectedCompanyCount).toBe(1);
    expect(drillDown.expectedDealCount).toBe(1);
    expect(drillDown.evidence.map((e) => e.dealId)).toEqual(["D2"]);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO I: Known Stalled Deal
  // Active, activityDataKnown=true, last activity older than threshold.
  // Expected: deals_stalled = 1.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario I: Known stalled deal emits deals_stalled signal", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({
          id: "D1",
          title: "Stalled Deal",
          stageId: "PREPARATION",
          activityDataKnown: true,
          activityLast: "2026-01-10T10:00:00+03:00", // > 30 days before testNow
        }),
      ],
    });

    const companies = [company];
    const signals = computeManagementSignals(companies, testNow);

    const stalledSignal = signals.find((s) => s.id === "deals_stalled");
    expect(stalledSignal?.companyCount).toBe(1);
    expect(stalledSignal?.companyIds).toEqual(["C1"]);

    const unknownSignal = signals.find((s) => s.id === "deals_unknown_activity");
    expect(unknownSignal?.companyCount ?? 0).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO J: Unknown Activity
  // Active, activityDataKnown=false, old create date.
  // Expected: deals_stalled = 0, deals_unknown_activity = 1.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario J: Unknown activity emits deals_unknown_activity signal, not deals_stalled", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({
          id: "D1",
          title: "Unknown Activity Deal",
          stageId: "PREPARATION",
          activityDataKnown: false,
          dateCreate: "2025-01-01T10:00:00+03:00",
        }),
      ],
    });

    const companies = [company];
    const signals = computeManagementSignals(companies, testNow);

    const stalledSignal = signals.find((s) => s.id === "deals_stalled");
    expect(stalledSignal?.companyCount ?? 0).toBe(0);

    const unknownSignal = signals.find((s) => s.id === "deals_unknown_activity");
    expect(unknownSignal?.companyCount).toBe(1);
    expect(unknownSignal?.companyIds).toEqual(["C1"]);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO K: Missing Next Step, Recent
  // Active, activityDataKnown=true, activityLast=yesterday, activityNext absent.
  // Expected: Overview no_next_step = 1, Manager scorecard noNextStep = 1.
  // Must NOT be classified as stalled.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario K: Missing next step on recent deal emits no_next_step signal and is NOT stalled", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({
          id: "D1",
          title: "Recent Deal Missing Next",
          stageId: "PREPARATION",
          activityDataKnown: true,
          activityLast: "2026-03-30T10:00:00+03:00", // Yesterday
          activityNext: undefined,
        }),
      ],
    });

    const companies = [company];
    const signals = computeManagementSignals(companies, testNow);
    const scorecard = computeManagerScorecard(companies, boundaries, [], {});
    const bottlenecks = computeBottlenecks(companies, testNow);

    const noNextSignal = signals.find((s) => s.id === "no_next_step");
    expect(noNextSignal?.companyCount).toBe(1);
    expect(noNextSignal?.companyIds).toEqual(["C1"]);

    const mgr = scorecard.find((r) => r.responsibleId === "10");
    expect(mgr?.noNextStep).toBe(1);

    // Active yesterday -> NOT stalled
    const stalledItem = bottlenecks.find((b) => b.dealId === "D1");
    expect(stalledItem).toBeUndefined();
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO L: Terminal Without Next Step
  // Terminal deal without next step.
  // Expected: isActiveDealMissingNextStep is false, no_next_step = 0.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario L: Terminal deal without next step does not emit missing next step", () => {
    const deal = mockDeal({
      id: "D1",
      title: "Lost Deal",
      stageId: "1", // Terminal lost
      activityDataKnown: true,
      activityNext: undefined,
    });

    expect(isActiveDealMissingNextStep(deal)).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO M: Unknown Activity Without Next Step
  // Active deal with activityDataKnown=false.
  // Expected: isActiveDealMissingNextStep is false (fails closed).
  // ───────────────────────────────────────────────────────────────────
  it("Scenario M: Unknown activity without next step fails closed to false", () => {
    const deal = mockDeal({
      id: "D1",
      title: "Active Unknown Deal",
      stageId: "PREPARATION",
      activityDataKnown: false,
      activityNext: undefined,
    });

    expect(isActiveDealMissingNextStep(deal)).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO N: Multi-Currency Isolation
  // Paid Deal 1: RUB 1,000,000. Paid Deal 2: USD 10,000.
  // Expected: single scalar = null, RUB bucket = 1,000,000, USD bucket = 10,000.
  // No cross-sum.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario N: Multi-currency isolation never cross-sums different currencies", () => {
    const companies = [
      mockCompany({
        id: "C1",
        deals: [
          mockDeal({
            id: "D1",
            paymentStatus: "109",
            paymentDate: "2026-03-10",
            opportunity: 1000000,
            opportunityQuality: "VALID",
            currencyId: "RUB",
          }),
        ],
      }),
      mockCompany({
        id: "C2",
        deals: [
          mockDeal({
            id: "D2",
            paymentStatus: "109",
            paymentDate: "2026-03-15",
            opportunity: 10000,
            opportunityQuality: "VALID",
            currencyId: "USD",
          }),
        ],
      }),
    ];

    const datedKpis = computePeriodMetrics(companies, boundaries);
    const paymentAmountKpi = datedKpis.find((k) => k.id === "payment_amount")!;

    expect(paymentAmountKpi.isMultiCurrency).toBe(true);
    expect(paymentAmountKpi.currentValue).toBeNull(); // No misleading scalar cross-sum
    expect(paymentAmountKpi.currencyBreakdown?.current["RUB"]).toBe(1000000);
    expect(paymentAmountKpi.currencyBreakdown?.current["USD"]).toBe(10000);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO O: Quality Only (Missing Opportunity)
  // Paid RUB Deal with missing opportunity.
  // Expected: RUB quality = UNKNOWN, amount is not 0 ₽.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario O: Quality only — missing opportunity yields UNKNOWN quality, not 0 ₽", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({
          id: "D1",
          paymentStatus: "109",
          paymentDate: "2026-03-10",
          opportunity: undefined,
          opportunityQuality: "UNKNOWN",
          currencyId: "RUB",
        }),
      ],
    });

    const datedKpis = computePeriodMetrics([company], boundaries);
    const paymentAmountKpi = datedKpis.find((k) => k.id === "payment_amount")!;

    expect(paymentAmountKpi.currencyBreakdownQuality?.current["RUB"]).toBe("UNKNOWN");
    expect(paymentAmountKpi.currencyBreakdown?.current["RUB"]).toBeUndefined();
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO P: Invalid Amount
  // Paid RUB Deal with invalid opportunity.
  // Expected: RUB quality = INVALID_ONLY.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario P: Invalid amount yields INVALID_ONLY quality", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({
          id: "D1",
          paymentStatus: "109",
          paymentDate: "2026-03-10",
          opportunity: undefined,
          opportunityQuality: "INVALID",
          currencyId: "RUB",
        }),
      ],
    });

    const datedKpis = computePeriodMetrics([company], boundaries);
    const paymentAmountKpi = datedKpis.find((k) => k.id === "payment_amount")!;

    expect(paymentAmountKpi.currencyBreakdownQuality?.current["RUB"]).toBe("INVALID_ONLY");
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO Q: Unclassified Overview Reconciliation
  // Unclassified current sample Company.
  // Expected: Overview unclassified card = 1, Funnel stage = 1, same Company ID.
  // ───────────────────────────────────────────────────────────────────
  it("Scenario Q: Unclassified sample company reconciles between Overview and Funnel", () => {
    const company = mockCompany({
      id: "C1",
      sampleStatus: UNCLASSIFIED_LABEL,
      sampleStatusSource: "NONE",
      sampleCurrentResolutionQuality: "AMBIGUOUS",
    });

    const funnel = computeFunnelView([company], boundaries);
    const funnelUnclass = funnel.sampleTestingStages.find((s) => s.id === UNCLASSIFIED_LABEL);
    expect(funnelUnclass?.companyCount).toBe(1);
    expect(funnelUnclass?.companyIds).toEqual(["C1"]);

    const drillDown = buildSampleStageDrillDown([company], UNCLASSIFIED_LABEL);
    expect(drillDown.companyIds).toEqual(["C1"]);
    expect(drillDown.title).toBe(UNCLASSIFIED_LABEL);
  });

  // ───────────────────────────────────────────────────────────────────
  // SCENARIO R: Sample Aging Duration Signal
  // Testing for threshold + 5 days.
  // Expected label: derived from constant, no "без движения".
  // ───────────────────────────────────────────────────────────────────
  it("Scenario R: Sample aging signal derives duration dynamically and avoids 'без движения'", () => {
    const company = mockCompany({
      id: "C1",
      sampleStatus: "На испытании",
      sampleShipmentDate: "2026-01-15", // ~75 days before testNow
      sampleStatusSource: "SMART_PROCESS",
    });

    const signals = computeManagementSignals([company], testNow);
    const testingSignal = signals.find((s) => s.id === "testing_stalled")!;

    expect(testingSignal).toBeDefined();
    expect(testingSignal.companyCount).toBe(1);
    expect(testingSignal.label).toBe(`Испытания более ${COMMERCIAL_THRESHOLDS.SAMPLE_TESTING_ATTENTION_DAYS} дней`);
    expect(testingSignal.label).not.toContain("без движения");
  });
});

describe("Section 18: Exact Drill-Down Reconciliation Tests", () => {
  const boundaries = createMockBoundaries();
  const testNow = new Date("2026-03-31T12:00:00+03:00");

  it("reconciles unique company and deal counts for Active Deals drill-down", () => {
    const companies = [
      mockCompany({
        id: "C1",
        deals: [
          mockDeal({ id: "D1", stageId: "PREPARATION", categoryId: "0" }),
          mockDeal({ id: "D2", stageId: "5", categoryId: "0" }),
        ],
      }),
      mockCompany({
        id: "C2",
        deals: [
          mockDeal({ id: "D3", stageId: "6", categoryId: "0" }),
          mockDeal({ id: "D4", stageId: "WON", categoryId: "0" }), // not active
        ],
      }),
    ];

    const funnel = computeFunnelView(companies, boundaries);
    const drillDown = buildActiveDealsDrillDown(companies);

    // Card asserts: 2 companies, 3 active deals
    expect(funnel.commercial.current.activeDeals.count).toBe(2);
    expect(funnel.commercial.current.dealCount).toBe(3);

    // Drill-down reconciliation:
    const uniqueCompanyIds = new Set(drillDown.evidence.map((x) => x.companyId));
    const uniqueDealIds = new Set(drillDown.evidence.map((x) => x.dealId).filter(Boolean));

    expect(uniqueCompanyIds.size).toBe(funnel.commercial.current.activeDeals.count);
    expect(uniqueDealIds.size).toBe(funnel.commercial.current.dealCount);
    expect(drillDown.expectedCompanyCount).toBe(2);
    expect(drillDown.expectedDealCount).toBe(3);
  });

  it("reconciles unique company and deal counts for Awaiting Payment drill-down", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({ id: "D1", stageId: "WON", paymentStatus: "105" }),
        mockDeal({ id: "D2", stageId: "1", paymentStatus: "107" }),
      ],
    });

    const companies = [company];
    const funnel = computeFunnelView(companies, boundaries);
    const drillDown = buildAwaitingPaymentDrillDown(companies);

    expect(funnel.commercial.current.awaitingPayment.count).toBe(1);
    expect(funnel.commercial.current.awaitingPaymentDealCount).toBe(2);

    const uniqueCompanyIds = new Set(drillDown.evidence.map((x) => x.companyId));
    const uniqueDealIds = new Set(drillDown.evidence.map((x) => x.dealId).filter(Boolean));

    expect(uniqueCompanyIds.size).toBe(1);
    expect(uniqueDealIds.size).toBe(2);
    expect(drillDown.expectedCompanyCount).toBe(1);
    expect(drillDown.expectedDealCount).toBe(2);
  });

  it("reconciles exact paid deals in period for Payments Received drill-down", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({
          id: "D1",
          stageId: "WON",
          paymentStatus: "109",
          paymentDate: "2026-03-10",
          opportunity: 100000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
        }),
        mockDeal({
          id: "D2",
          stageId: "WON",
          paymentStatus: "109",
          paymentDate: "2026-03-20",
          opportunity: 200000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
        }),
      ],
    });

    const companies = [company];
    const drillDown = buildPaymentsReceivedDrillDown(companies, boundaries);

    expect(drillDown.companyIds).toEqual(["C1"]);
    expect(drillDown.expectedCompanyCount).toBe(1);
    expect(drillDown.expectedDealCount).toBe(2);
    expect(drillDown.evidence.map((e) => e.dealId)).toEqual(["D1", "D2"]);
  });

  it("reconciles exact shipment deals in period for Shipments drill-down", () => {
    const company = mockCompany({
      id: "C1",
      deals: [
        mockDeal({
          id: "D1",
          stageId: "WON",
          shipmentDate: "2026-03-10",
        }),
      ],
    });

    const companies = [company];
    const drillDown = buildShipmentsDrillDown(companies, boundaries);

    expect(drillDown.companyIds).toEqual(["C1"]);
    expect(drillDown.expectedCompanyCount).toBe(1);
    expect(drillDown.expectedDealCount).toBe(1);
    expect(drillDown.evidence[0].dealId).toBe("D1");
  });
});
