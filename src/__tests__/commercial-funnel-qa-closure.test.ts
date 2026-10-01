// src/__tests__/commercial-funnel-qa-closure.test.ts
// ─────────────────────────────────────────────────────────────────────
// QA CLOSURE test matrix (Q01–Q31) for the Management Rebuild closure patch.
// Covers: canonical Funnel composition (Q01–Q03), real PeriodBoundaries in
// Segments (Q04), frozen analysisNow clock (Q05), sample-Deal provenance
// (Q06–Q08), Sample Testing management grain (Q09–Q14), «Компании в текущем
// контуре» semantics (Q15), segment provenance (Q16–Q19), fixture validity
// (Q20 — in engine.test.ts), determinism (Q27), empty states (Q28),
// MSK-midnight Excel date integrity (Q29), disclosure propagation (Q30).
// ─────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  buildSampleTestingSnapshot,
  computeActionPlan,
  computeFunnelView,
  computeManagementSignals,
  computeSegmentBreakdown,
  getAnalyticalSegmentValues,
  isActivePortfolioCompany,
} from "@/lib/commercial-funnel/analytics";
import {
  computeBottlenecks,
  computePeriodMetrics,
  computeWipMetrics,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import {
  ACTIVITY_PARTIAL_DISCLOSURE,
  buildExcelExtraWarnings,
  financialPartialDisclosure,
} from "@/lib/commercial-funnel/disclosure";
import type {
  CommercialCompany,
  CommercialDeal,
  PeriodBoundaries,
} from "@/lib/commercial-funnel/types";

const FIXED_NOW = new Date(2026, 8, 29, 12, 0, 0); // 2026-09-29 12:00 local
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
    sampleTestingStatus: [],
    sampleTestingStatusRaw: [],
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

// ─── Q01–Q03: Funnel composes canonical engine output ───

describe("Q01–Q03: Funnel uses canonical engine output", () => {
  const companies = [
    company({
      id: "1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "mgr-1",
      sampleResponsibleDealId: "d1",
      sampleShipmentDate: "2026-09-20",
      deals: [
        deal({ id: "d1", sampleSentDate: "2026-09-20", sampleTransferStatus: "На испытании" }),
      ],
    }),
    company({
      id: "2",
      sampleStatus: "Подошли",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "mgr-1",
      sampleResponsibleDealId: "d2",
      sampleShipmentDate: "2026-09-10",
      deals: [
        deal({
          id: "d2",
          stageId: "EXECUTING",
          dateCreate: "2026-09-15",
          paymentStatus: "103", // unpaid → awaiting payment
          sampleSentDate: "2026-09-10",
          sampleTransferStatus: "Подошли",
        }),
      ],
    }),
  ];

  it("Q01: Funnel WIP rows reconcile exactly with computeWipMetrics", () => {
    const view = computeFunnelView(companies, bounds);
    const wip = computeWipMetrics(companies);

    for (const stage of view.sampleTestingStages) {
      const kpi = wip.find((k) => k.id === stage.id)!;
      expect(stage.companyCount).toBe(kpi.companyCount);
      expect(stage.dealCount).toBe(kpi.dealCount);
      expect(stage.companyIds).toEqual(kpi.companyIds);
    }
  });

  it("Q02: Funnel period company IDs reconcile with computePeriodMetrics", () => {
    const view = computeFunnelView(companies, bounds);
    const kpis = computePeriodMetrics(companies, bounds);

    const samplesSent = kpis.find((k) => k.id === "samples_sent")!;
    const dealsCreated = kpis.find((k) => k.id === "deals_created")!;
    const paymentsReceived = kpis.find((k) => k.id === "payments_received")!;
    const shipments = kpis.find((k) => k.id === "shipments")!;

    const sentStage = view.sampleTestingStages.find((s) => s.id === "Образцы отправлены")!;
    expect(sentStage.periodEventCount).toBe(samplesSent.currentValue);
    expect(sentStage.periodEventCompanyIds).toEqual(samplesSent.companyIds);

    expect(view.commercial.period.dealsCreated.companyIds).toEqual(dealsCreated.companyIds);
    expect(view.commercial.period.paymentsReceived.companyIds).toEqual(paymentsReceived.companyIds);
    expect(view.commercial.period.shipments.companyIds).toEqual(shipments.companyIds);
  });

  it("Q03: Funnel payment amounts + quality reconcile exactly with canonical KPI (object-level)", () => {
    const view = computeFunnelView(companies, bounds);
    const kpis = computePeriodMetrics(companies, bounds);
    const paymentKpi = kpis.find((k) => k.id === "payment_amount")!;

    expect(view.commercial.period.paymentAmountsByCurrency).toEqual(
      paymentKpi.currencyBreakdown!.current
    );
    expect(view.commercial.period.paymentAmountQualityByCurrency).toEqual(
      paymentKpi.currencyBreakdownQuality!.current
    );
  });

  it("Q03b: multi-currency + PARTIAL/UNKNOWN quality stay isolated and truthful in Funnel", () => {
    const multi = [
      company({
        id: "10",
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        deals: [
          deal({
            id: "m1",
            stageId: "EXECUTING",
            currencyId: "USD",
            opportunity: 500,
            paymentStatus: "109",
            paymentDate: "2026-09-21",
          }),
          deal({
            id: "m2",
            stageId: "EXECUTING",
            currencyId: "EUR",
            opportunityQuality: "INVALID",
            opportunity: NaN as unknown as number,
            paymentStatus: "109",
            paymentDate: "2026-09-21",
          }),
        ],
      }),
    ];
    const view = computeFunnelView(multi, bounds);
    const kpis = computePeriodMetrics(multi, bounds);
    const paymentKpi = kpis.find((k) => k.id === "payment_amount")!;

    expect(view.commercial.period.paymentAmountsByCurrency).toEqual(
      paymentKpi.currencyBreakdown!.current
    );
    expect(view.commercial.period.paymentAmountQualityByCurrency).toEqual(
      paymentKpi.currencyBreakdownQuality!.current
    );
    // INVALID-only currency: truthful INVALID_ONLY, never 0 COMPLETE
    expect(view.commercial.period.paymentAmountQualityByCurrency["EUR"]).toBe("INVALID_ONLY");
    expect(view.commercial.period.paymentAmountsByCurrency["USD"]).toBe(500);
  });
});

// ─── Q04: Segments use the real PeriodBoundaries ───

describe("Q04: Segments use real PeriodBoundaries (no synthetic adapter)", () => {
  it("Q04: segment period metrics equal computePeriodMetrics on the same boundaries", () => {
    const c = company({ id: "1", industry: "ЛКМ", dateCreate: "2026-09-20" });
    const bd = computeSegmentBreakdown([c], bounds, "industry");
    const direct = computePeriodMetrics([c], bounds);

    expect(bd.rows[0].period.newCompanies.count).toBe(
      direct.find((k) => k.id === "new_companies")!.currentValue
    );
    expect(bd.rows[0].period.newCompanies.companyIds).toEqual(
      direct.find((k) => k.id === "new_companies")!.companyIds
    );
  });

  it("Q04b: all-time boundaries propagate (no implicit new Date() end)", () => {
    const allTime = computePeriodBoundaries({ periodPreset: "all" }, FIXED_NOW);
    const c = company({ id: "1", industry: "ЛКМ", dateCreate: "2020-01-01" });
    const bd = computeSegmentBreakdown([c], allTime, "industry");
    // All-time: every dated event is inside the open-ended period
    expect(bd.rows[0].period.newCompanies.count).toBe(1);
  });
});

// ─── Q05: Frozen analysisNow clock (WYSIWYG) ───

describe("Q05: frozen analysisNow produces identical UI/Excel boundaries across rollover", () => {
  it("Q05: boundaries frozen before midnight survive a simulated system rollover", () => {
    // analysisNow: 2026-09-30 23:59:59 MSK
    const analysisNow = new Date("2026-09-30T20:59:59Z"); // = 23:59:59 MSK
    const uiBoundaries = computePeriodBoundaries({ periodPreset: "30days" }, analysisNow);

    // Simulated system clock AFTER midnight (2026-10-01 00:00:01 MSK)
    const systemNowAfterRollover = new Date("2026-09-30T21:00:01Z");
    const staleSystemBoundaries = computePeriodBoundaries(
      { periodPreset: "30days" },
      systemNowAfterRollover
    );

    // Excel receives the FROZEN analytical timestamp → identical to UI
    const excelBoundaries = computePeriodBoundaries({ periodPreset: "30days" }, analysisNow);
    expect(excelBoundaries.currentStartStr).toBe(uiBoundaries.currentStartStr);
    expect(excelBoundaries.currentEndStr).toBe(uiBoundaries.currentEndStr);
    // The frozen clock differs from what a fresh clock would produce
    expect(staleSystemBoundaries.currentEndStr).not.toBe(uiBoundaries.currentEndStr);
  });

  it("Q05b: quarter boundaries stay stable with frozen clock", () => {
    const analysisNow = new Date("2026-09-30T20:59:59Z"); // last minute of Q3 MSK
    const ui = computePeriodBoundaries({ periodPreset: "quarter" }, analysisNow);
    const excel = computePeriodBoundaries({ periodPreset: "quarter" }, analysisNow);
    expect(excel.currentStartStr).toBe(ui.currentStartStr);
    expect(excel.currentEndStr).toBe(ui.currentEndStr);
    expect(ui.currentEndStr).toBe("2026-09-30"); // Q3 ends Sep 30, not Oct 1
  });

  it("Q05c: all-time boundaries remain unchanged by clock", () => {
    const analysisNow = new Date("2026-09-30T20:59:59Z");
    const ui = computePeriodBoundaries({ periodPreset: "all" }, analysisNow);
    expect(ui.isAllTime).toBe(true);
    expect(ui.currentStart).toBeNull();
    expect(ui.previousStart).toBeNull();
  });
});

// ─── Q06–Q08: Sample bottleneck Deal provenance ───

describe("Q06–Q08: sample bottleneck provenance follows sampleResponsibleDealId", () => {
  // Deal A: high opportunity, primary, manager A, has next action, no sample state.
  // Deal B: lower opportunity, current sample state, manager B, sample follow-up.
  const c = company({
    id: "1",
    title: "Компания Проба",
    responsibleId: "mgr-A",
    sampleStatus: "На испытании",
    sampleStatusSource: "DEAL",
    sampleResponsibleId: "mgr-B",
    sampleResponsibleName: "Менеджер Б",
    sampleResponsibleDealId: "deal-B",
    sampleShipmentDate: "2026-08-01", // ~59 days before FIXED_NOW → stalled
    deals: [
      deal({
        id: "deal-A",
        title: "Коммерческая сделка А",
        responsibleId: "mgr-A",
        opportunity: 900000,
        stageId: "EXECUTING",
        activityNext: "Primary commercial next action",
      }),
      deal({
        id: "deal-B",
        title: "Сделка по образцам Б",
        responsibleId: "mgr-B",
        opportunity: 50000,
        stageId: "NEW",
        sampleSentDate: "2026-08-01",
        sampleTransferStatus: "На испытании",
        activityNext: "Sample test follow-up",
      }),
    ],
  });

  it("Q06: sample_testing_stalled uses sampleResponsibleDealId, NOT primaryDealId", () => {
    const bottlenecks = computeBottlenecks([c], FIXED_NOW);
    const stalled = bottlenecks.find((b) => b.type === "sample_testing_stalled")!;
    expect(stalled).toBeDefined();
    expect(stalled.responsibleId).toBe("mgr-B");
    expect(stalled.dealId).toBe("deal-B");
    expect(stalled.dealTitle).toBe("Сделка по образцам Б");
    expect(stalled.nextAction).toBe("Sample test follow-up");
    expect(stalled.dealId).not.toBe("deal-A");
  });

  it("Q07: Action Plan uses the same sample Deal and exact activityNext", () => {
    const plan = computeActionPlan([c], FIXED_NOW);
    const row = plan.find((r) => r.stuckAt === "Испытание образцов затянулось")!;
    expect(row.dealId).toBe("deal-B");
    expect(row.dealTitle).toBe("Сделка по образцам Б");
    expect(row.nextAction).toBe("Sample test follow-up");
  });

  it("Q07b: sample_success_no_deal uses the sample Deal as well", () => {
    const success = company({
      id: "2",
      sampleStatus: "Подошли",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "mgr-B",
      sampleResponsibleDealId: "deal-B2",
      sampleShipmentDate: "2026-08-05",
      deals: [
        deal({
          id: "deal-A2",
          title: "Коммерческая А2",
          responsibleId: "mgr-A",
          opportunity: 900000,
          stageId: "NEW", // not progressed
          activityNext: "Primary commercial next action",
        }),
        deal({
          id: "deal-B2",
          title: "Образец Б2",
          responsibleId: "mgr-B",
          opportunity: 70000,
          sampleSentDate: "2026-08-05",
          sampleTransferStatus: "Подошли",
          activityNext: "Sample result follow-up",
        }),
      ],
    });
    const bottlenecks = computeBottlenecks([success], FIXED_NOW);
    const b = bottlenecks.find((x) => x.type === "sample_success_no_deal")!;
    expect(b).toBeDefined();
    expect(b.dealId).toBe("deal-B2");
    expect(b.nextAction).toBe("Sample result follow-up");
  });

  it("Q08: COMPANY-fallback sample bottleneck does not borrow unrelated primaryDeal", () => {
    const cFallback = company({
      id: "3",
      sampleStatus: "На испытании",
      sampleStatusSource: "COMPANY",
      sampleResponsibleId: "mgr-A",
      sampleShipmentDate: "2026-08-01",
      deals: [
        deal({
          id: "deal-A",
          title: "Коммерческая сделка А",
          responsibleId: "mgr-A",
          opportunity: 900000,
          stageId: "EXECUTING",
          activityNext: "Primary commercial next action",
        }),
      ],
    });
    const bottlenecks = computeBottlenecks([cFallback], FIXED_NOW);
    const stalled = bottlenecks.find((b) => b.type === "sample_testing_stalled")!;
    expect(stalled).toBeDefined();
    // No authoritative sample Deal exists → no borrowed representative Deal
    expect(stalled.dealId).toBeUndefined();
    expect(stalled.dealTitle).toBeUndefined();
    expect(stalled.amount).toBeUndefined();
    expect(stalled.nextAction).toBeUndefined();
  });
});

// ─── Q09–Q14: Sample Testing management grain ───

describe("Q09–Q14: Sample Testing is a current-cycle management snapshot", () => {
  it("Q09+Q10: exactly ONE row per company — current Deal, not historical sibling", () => {
    const c1 = company({
      id: "C1",
      title: "Компания C1",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleId: "mgr-1",
      sampleResponsibleDealId: "deal-current",
      sampleShipmentDate: "2026-09-20",
      deals: [
        deal({
          id: "deal-old",
          title: "Старая партия",
          sampleSentDate: "2026-03-01",
          sampleTransferStatus: "Не подошли",
        }),
        deal({
          id: "deal-current",
          title: "Текущая партия",
          sampleSentDate: "2026-09-20",
          sampleTransferStatus: "На испытании",
        }),
      ],
    });
    const snap = buildSampleTestingSnapshot([c1], FIXED_NOW);
    expect(snap).toHaveLength(1);
    expect(snap[0].dealId).toBe("deal-current");
    expect(snap[0].dealTitle).toBe("Текущая партия");
    expect(snap[0].testingStatus).toBe("На испытании");
  });

  it("Q11: Company-fallback sample state generates one row", () => {
    const c = company({
      id: "C2",
      sampleStatus: "Образцы отправлены",
      sampleStatusSource: "COMPANY",
      sampleResponsibleId: "mgr-1",
      sampleShipmentDate: "2026-09-10",
    });
    const snap = buildSampleTestingSnapshot([c], FIXED_NOW);
    expect(snap).toHaveLength(1);
    expect(snap[0].dealId).toBeUndefined(); // no authoritative sample Deal
    expect(snap[0].testingStatus).toBe("Образцы отправлены");
  });

  it("Q12: NONE / no-sample company generates zero rows", () => {
    const c = company({ id: "C3", sampleStatus: "—", sampleStatusSource: "NONE" });
    expect(buildSampleTestingSnapshot([c], FIXED_NOW)).toHaveLength(0);
  });

  it("Q13: old active testing remains despite send date outside period", () => {
    const c = company({
      id: "C4",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleDealId: "deal-old-active",
      sampleShipmentDate: "2026-01-10", // far outside the 30-day window
      deals: [
        deal({
          id: "deal-old-active",
          sampleSentDate: "2026-01-10",
          sampleTransferStatus: "На испытании",
        }),
      ],
    });
    const snap = buildSampleTestingSnapshot([c], FIXED_NOW);
    expect(snap).toHaveLength(1); // current WIP is not date-truncated
    expect(snap[0].shipmentDate).toBe("2026-01-10");
  });

  it("Q14: no unsupported planned/actual test-date value is invented (field removed)", () => {
    const c = company({
      id: "C5",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleDealId: "d1",
      deals: [deal({ id: "d1", sampleTransferStatus: "На испытании" })],
    });
    const snap = buildSampleTestingSnapshot([c], FIXED_NOW);
    // The removed field must not exist on rows at all (type-level removal).
    expect("plannedOrActualTestDate" in snap[0]).toBe(false);
  });
});

// ─── Q15: «Компании в текущем контуре» semantics ───

describe("Q15: companies-in-current-contour has explicit tested semantics", () => {
  // Documented rule: Company has a current sample state (any non-"—"
  // sampleStatus) and/or an active commercial Deal.
  const c1 = company({ id: "C1", sampleStatus: "На испытании", sampleStatusSource: "DEAL" });
  const c2 = company({ id: "C2", sampleStatus: "Не подошли", sampleStatusSource: "COMPANY" });
  const c3 = company({
    id: "C3",
    sampleStatus: "—",
    sampleStatusSource: "NONE",
    deals: [deal({ id: "d3", stageId: "EXECUTING" })],
  });
  const c4 = company({ id: "C4", sampleStatus: "—", sampleStatusSource: "NONE" });

  it("Q15: population follows the documented contour rule", () => {
    expect(isActivePortfolioCompany(c1)).toBe(true); // current sample state
    expect(isActivePortfolioCompany(c2)).toBe(true); // sample state (even terminal)
    expect(isActivePortfolioCompany(c3)).toBe(true); // active commercial deal
    expect(isActivePortfolioCompany(c4)).toBe(false); // neither
  });
});

// ─── Q16–Q19: Segment provenance under global filters ───

describe("Q16–Q19: effective segment provenance", () => {
  // Company factual: Product=Sol, Industry=A, Direction=X
  // Deal factual:   Product=Gel, Industry=B, Direction=Y
  function makeDealRetainedCompany(): CommercialCompany {
    return company({
      id: "P1",
      industry: "A",
      direction: ["X"],
      productType: ["Sol"],
      companyFactsIncluded: false, // retained ONLY via matching Deal
      deals: [
        deal({
          id: "pd1",
          industry: ["B"],
          direction: ["Y"],
          productType: ["Gel"],
        }),
      ],
    });
  }

  it("Q16: product provenance always uses Company dimensions (Section 7)", () => {
    const c = makeDealRetainedCompany();
    expect(getAnalyticalSegmentValues(c, "product")).toEqual(["Sol"]);
    expect(c.productType).toEqual(["Sol"]);
  });

  it("Q17: direction provenance always uses Company dimensions (Section 7)", () => {
    const c = makeDealRetainedCompany();
    expect(getAnalyticalSegmentValues(c, "direction")).toEqual(["X"]);
    expect(c.direction).toEqual(["X"]);
  });

  it("Q18: industry provenance always uses Company dimensions (Section 7)", () => {
    const c = makeDealRetainedCompany();
    expect(getAnalyticalSegmentValues(c, "industry")).toEqual(["A"]);
    expect(c.industry).toBe("A");
  });

  it("Q18b: company-matched slice keeps factual values", () => {
    const c = company({
      id: "P2",
      industry: "A",
      direction: ["X"],
      productType: ["Sol"],
      companyFactsIncluded: true,
      deals: [deal({ id: "pd2", productType: ["Gel"] })],
    });
    expect(getAnalyticalSegmentValues(c, "product")).toEqual(["Sol"]);
  });

  it("Q19: segment grand total remains unique under multi-value overlap", () => {
    const c = company({
      id: "P3",
      productType: ["Гель", "Золь"],
      sampleStatus: "На испытании",
      sampleStatusSource: "COMPANY",
    });
    const bd = computeSegmentBreakdown([c], bounds, "product");
    expect(bd.rows).toHaveLength(2); // Гель + Золь
    expect(bd.totalUniqueCompanyIds).toEqual(["P3"]); // counted once
  });

  it("Q19b: Deal-retained company lands in the Sol row (Company dimension), not Gel", () => {
    const c = makeDealRetainedCompany();
    const bd = computeSegmentBreakdown([c], bounds, "product");
    const gel = bd.rows.find((r) => r.label === "Gel");
    const sol = bd.rows.find((r) => r.label === "Sol");
    expect(sol).toBeDefined();
    expect(gel).toBeUndefined();
    expect(bd.totalUniqueCompanyIds).toEqual(["P1"]);
  });
});

// ─── Q27: Deterministic workbook ───

describe("Q27: deterministic Excel output for identical input", () => {
  it("Q27: two builds from identical input + fixed now produce identical business cells", async () => {
    const companies = [
      company({
        id: "1",
        title: "Компания Альфа",
        industry: "ЛКМ",
        direction: ["Авто"],
        productType: ["Гель"],
        sampleStatus: "На испытании",
        sampleStatusSource: "DEAL",
        sampleResponsibleId: "mgr-1",
        sampleResponsibleDealId: "d1",
        sampleShipmentDate: "2026-09-20",
        deals: [
          deal({
            id: "d1",
            title: "Сделка один",
            sampleSentDate: "2026-09-20",
            sampleTransferStatus: "На испытании",
            stageId: "EXECUTING",
            activityNext: "Позвонить клиенту",
          }),
        ],
      }),
      company({
        id: "2",
        title: "Компания Бета",
        industry: "Пищевая",
        direction: ["HoReCa"],
        productType: ["Золь"],
        sampleStatus: "Подошли",
        sampleStatusSource: "DEAL",
        sampleResponsibleDealId: "d2",
        sampleShipmentDate: "2026-09-10",
        deals: [
          deal({
            id: "d2",
            title: "Сделка два",
            sampleSentDate: "2026-09-10",
            sampleTransferStatus: "Подошли",
            stageId: "EXECUTING",
            paymentStatus: "104",
            paymentDate: "2026-09-22",
          }),
        ],
      }),
    ];

    const build = () =>
      createCommercialFunnelWorkbook({
        companies,
        deals: companies.flatMap((c) => c.deals),
        filters: { periodPreset: "30days" },
        userNames: { "mgr-1": "Менеджер Один" },
        now: FIXED_NOW,
      });

    const wb1 = await build();
    const wb2 = await build();

    expect(wb1.worksheets.length).toBe(6);
    expect(wb2.worksheets.length).toBe(6);

    for (let s = 0; s < 6; s++) {
      const sheet1 = wb1.worksheets[s];
      const sheet2 = wb2.worksheets[s];
      expect(sheet1.name).toBe(sheet2.name);
      expect(sheet1.rowCount).toBe(sheet2.rowCount);
      for (let r = 1; r <= sheet1.rowCount; r++) {
        const row1 = sheet1.getRow(r);
        const row2 = sheet2.getRow(r);
        for (let cIdx = 1; cIdx <= Math.max(row1.cellCount, row2.cellCount); cIdx++) {
          const v1 = row1.getCell(cIdx).value;
          const v2 = row2.getCell(cIdx).value;
          // Normalize Date objects to timestamps for comparison
          const n1 = v1 instanceof Date ? v1.getTime() : v1;
          const n2 = v2 instanceof Date ? v2.getTime() : v2;
          expect(n1).toEqual(n2);
        }
      }
    }
  });
});

// ─── Q28: Empty / zero-data states ───

describe("Q28: empty filtered slice stays valid and truthful", () => {
  it("Q28a: empty slice → zero KPIs with COMPLETE financial quality (engine contract)", () => {
    const kpis = computePeriodMetrics([], bounds);
    const paymentKpi = kpis.find((k) => k.id === "payment_amount")!;
    // Documented engine contract: 0 paid deals → 0, aggregate "COMPLETE"
    expect(paymentKpi.currentValue).toBe(0);
    expect(paymentKpi.amountQuality).toBe("COMPLETE");
    // No paid deals → no currency entries to disclose
    expect(Object.keys(paymentKpi.currencyBreakdownQuality!.current)).toEqual([]);

    const wip = computeWipMetrics([]);
    expect(wip.every((k) => k.companyCount === 0)).toBe(true);

    expect(computeBottlenecks([], FIXED_NOW)).toEqual([]);
    expect(computeActionPlan([], FIXED_NOW)).toEqual([]);
    expect(buildSampleTestingSnapshot([], FIXED_NOW)).toEqual([]);
    expect(computeManagementSignals([], FIXED_NOW)).toEqual([]);
  });

  it("Q28b: paid deals with only unknown amounts → UNKNOWN quality, never fake 0 COMPLETE", () => {
    const c = company({
      id: "1",
      deals: [
        deal({
          id: "u1",
          stageId: "EXECUTING",
          opportunity: undefined as never, // missing amount → unknown
          paymentStatus: "109",
          paymentDate: "2026-09-21",
        }),
      ],
    });
    const kpis = computePeriodMetrics([c], bounds);
    const paymentKpi = kpis.find((k) => k.id === "payment_amount")!;
    expect(paymentKpi.currentValue).toBeNull();
    expect(paymentKpi.amountQuality).toBe("UNKNOWN");
    expect(paymentKpi.currencyBreakdownQuality!.current["RUB"]).toBe("UNKNOWN");
  });

  it("Q28c: empty slice still generates a valid six-sheet workbook", async () => {
    const wb = await createCommercialFunnelWorkbook({
      companies: [],
      deals: [],
      filters: { periodPreset: "30days" },
      userNames: {},
      now: FIXED_NOW,
    });
    expect(wb.worksheets.length).toBe(6);
    // Headers and metadata present; freeze panes valid
    for (const sheet of wb.worksheets) {
      expect(sheet.rowCount).toBeGreaterThanOrEqual(1);
    }
    const funnel = wb.worksheets.find((s) => s.name === "Funnel")!;
    expect(funnel.views[0].state).toBe("frozen");
  });
});

// ─── Q29: MSK-midnight Excel date integrity ───

describe("Q29: business-timezone Excel date integrity around midnight", () => {
  it("Q29: date-only CRM values keep the intended business date in Excel cells", async () => {
    const c = company({
      id: "1",
      title: "Компания Дата",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleDealId: "d1",
      sampleShipmentDate: "2026-09-20", // date-only
      deals: [
        deal({
          id: "d1",
          sampleSentDate: "2026-09-20",
          sampleTransferStatus: "На испытании",
          // Naive datetime 23:30 MSK business semantics:
          activityLast: "2026-09-20 23:30:00",
          activityDataKnown: true,
          activityNext: "Связаться",
        }),
      ],
    });
    const wb = await createCommercialFunnelWorkbook({
      companies: [c],
      deals: c.deals,
      filters: { periodPreset: "30days" },
      userNames: {},
      now: FIXED_NOW,
    });
    const st = wb.worksheets.find((s) => s.name === "Sample Testing")!;
    // Find the shipment date cell (column 7) in the data row
    let found: Date | undefined;
    for (let r = 1; r <= st.rowCount; r++) {
      const cell = st.getRow(r).getCell(7);
      if (cell.value instanceof Date) found = cell.value;
    }
    expect(found).toBeDefined();
    // The Excel Date must render as Sep 20 in the business timezone.
    const msk = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(found!);
    expect(msk).toBe("2026-09-20");
  });

  it("Q29b: UTC late-evening datetime displays the MSK calendar date (no day shift)", async () => {
    // 2026-09-24 22:30 UTC == 2026-09-25 01:30 MSK → Excel cell must be Sep 25 in MSK
    const c = company({
      id: "1",
      title: "Компания UTC",
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleResponsibleDealId: "d1",
      // explicit-offset late-evening UTC datetime as the sample shipment value
      sampleShipmentDate: "2026-09-24T22:30:00Z",
      deals: [
        deal({
          id: "d1",
          sampleTransferStatus: "На испытании",
          sampleSentDate: "2026-09-24T22:30:00Z",
        }),
      ],
    });
    const wb = await createCommercialFunnelWorkbook({
      companies: [c],
      deals: c.deals,
      filters: { periodPreset: "30days" },
      userNames: {},
      now: FIXED_NOW,
    });
    const st = wb.worksheets.find((s) => s.name === "Sample Testing")!;
    let found: Date | undefined;
    for (let r = 1; r <= st.rowCount; r++) {
      const cell = st.getRow(r).getCell(7); // Дата отправки
      if (cell.value instanceof Date) found = cell.value;
    }
    expect(found).toBeDefined();
    const msk = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(found!);
    expect(msk).toBe("2026-09-25"); // MSK calendar date, not UTC Sep 24
  });
});

// ─── Q30: Disclosure propagation ───

describe("Q30: one shared disclosure rule", () => {
  it("Q30a: buildExcelExtraWarnings composes activity + financial disclosures", () => {
    const warnings = buildExcelExtraWarnings({
      activityPartial: true,
      financialQualitiesByCurrency: { RUB: "PARTIAL", USD: "UNKNOWN" },
    });
    expect(warnings).toContain(ACTIVITY_PARTIAL_DISCLOSURE);
    expect(warnings).toContain(financialPartialDisclosure("RUB"));
    expect(warnings.some((w) => w.includes("USD"))).toBe(true);
  });

  it("Q30b: no warnings when data is complete", () => {
    const warnings = buildExcelExtraWarnings({
      activityPartial: false,
      financialQualitiesByCurrency: { RUB: "COMPLETE" },
    });
    expect(warnings).toEqual([]);
  });
});
