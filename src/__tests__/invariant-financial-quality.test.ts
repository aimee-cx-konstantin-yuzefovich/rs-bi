// src/__tests__/invariant-financial-quality.test.ts
// ─────────────────────────────────────────────────────────────────────
// Invariant Test Suite: Financial Aggregate Quality (Finding B)
// Enforces truth table across period metrics, manager scorecard, and per-currency breakdowns.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  computePeriodMetrics,
  computeManagerScorecard,
  evaluateAggregateAmountQuality,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

describe("Invariant Financial Quality Contract (Finding B)", () => {
  const fixedNow = new Date("2026-03-25T12:00:00Z");
  const boundaries = computePeriodBoundaries({ periodPreset: "90days" }, fixedNow);

  const makeCompany = (
    id: string,
    deals: Partial<CommercialDeal>[],
    respId = "1"
  ): CommercialCompany => ({
    id,
    title: `Company ${id}`,
    responsibleId: respId,
    responsibleName: `Manager ${respId}`,
    dateCreate: "2026-01-10",
    sampleStatus: "—",
    sampleStatusSource: "NONE",
    sampleStatuses: [],
    sampleStatusRawValues: [],
    sampleStatusEntries: [],
    sampleDealSentDates: [],
    sampleCompanyTransferDates: [],
    sampleEventDatesForPeriodMetrics: [],
    sampleAllDates: [],
    hasAttention: false,
    attentionReasons: [],
    deals: deals.map((d, idx) => ({
      id: d.id || `${id}-${idx + 1}`,
      companyId: id,
      title: d.title || `Deal ${idx + 1}`,
      stageId: d.stageId || "WON",
      currencyId: d.currencyId || "RUB",
      dateCreate: d.dateCreate || "2026-02-01",
      paymentStatus: d.paymentStatus ?? "113", // Paid
      paymentDate: d.paymentDate ?? "2026-03-01",
      sampleTestingStatus: [],
      ...d,
    })),
  });

  describe("Aggregate Quality Truth Table", () => {
    it("A. True Zero: valid numeric 0 produces 0 with COMPLETE quality", () => {
      const res = evaluateAggregateAmountQuality(0, 2, 0, 0);
      expect(res.amount).toBe(0);
      expect(res.quality).toBe("COMPLETE");
    });

    it("B. No Known Amount: paid deals missing amount produce null with UNKNOWN quality", () => {
      const res = evaluateAggregateAmountQuality(0, 0, 0, 3);
      expect(res.amount).toBeNull();
      expect(res.quality).toBe("UNKNOWN");
    });

    it("C. Invalid Amount: paid deals with malformed amount produce null with INVALID_ONLY quality", () => {
      const res = evaluateAggregateAmountQuality(0, 0, 2, 0);
      expect(res.amount).toBeNull();
      expect(res.quality).toBe("INVALID_ONLY");
    });

    it("D. Partial Amount: valid subtotal + invalid/unknown deals produces known subtotal with PARTIAL quality", () => {
      const res1 = evaluateAggregateAmountQuality(100000, 1, 1, 0);
      expect(res1.amount).toBe(100000);
      expect(res1.quality).toBe("PARTIAL");

      const res2 = evaluateAggregateAmountQuality(250000, 2, 0, 1);
      expect(res2.amount).toBe(250000);
      expect(res2.quality).toBe("PARTIAL");
    });
  });

  describe("Executive Financial KPIs", () => {
    it("produces PARTIAL quality when 1 deal is valid (100k) and 1 deal is invalid in the same currency", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 100000, opportunityQuality: "VALID", currencyId: "RUB" },
        ]),
        makeCompany("C2", [
          { id: "D2", opportunity: null, opportunityQuality: "INVALID", currencyId: "RUB" },
        ]),
      ];

      const kpis = computePeriodMetrics(companies, boundaries);
      const payAmtKpi = kpis.find((k) => k.id === "payment_amount")!;

      expect(payAmtKpi.currentValue).toBe(100000);
      expect(payAmtKpi.amountQuality).toBe("PARTIAL");
      expect(payAmtKpi.currencyBreakdown?.current.RUB).toBe(100000);
      expect(payAmtKpi.currencyBreakdownQuality?.current.RUB).toBe("PARTIAL");
    });

    it("produces separate per-currency qualities in multi-currency scenario", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 100000, opportunityQuality: "VALID", currencyId: "RUB" },
          { id: "D2", opportunity: null, opportunityQuality: "INVALID", currencyId: "RUB" },
        ]),
        makeCompany("C2", [
          { id: "D3", opportunity: 1000, opportunityQuality: "VALID", currencyId: "USD" },
        ]),
      ];

      const kpis = computePeriodMetrics(companies, boundaries);
      const payAmtKpi = kpis.find((k) => k.id === "payment_amount")!;

      expect(payAmtKpi.isMultiCurrency).toBe(true);
      expect(payAmtKpi.currentValue).toBeNull(); // scalar sum forbidden
      expect(payAmtKpi.currencyBreakdown?.current.RUB).toBe(100000);
      expect(payAmtKpi.currencyBreakdown?.current.USD).toBe(1000);
      expect(payAmtKpi.currencyBreakdownQuality?.current.RUB).toBe("PARTIAL");
      expect(payAmtKpi.currencyBreakdownQuality?.current.USD).toBe("COMPLETE");
    });
  });

  describe("Manager Scorecard Financial Quality", () => {
    it("does NOT produce paymentAmount = 0 COMPLETE when paid deals have INVALID opportunity", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: null, opportunityQuality: "INVALID", currencyId: "RUB" },
        ], "M1"),
      ];

      const scorecard = computeManagerScorecard(companies, boundaries);
      const m1 = scorecard.find((s) => s.responsibleId === "M1")!;

      expect(m1).toBeDefined();
      expect(m1.paymentsReceived).toBe(1);
      // Critical invariant: must NOT be 0 COMPLETE!
      expect(m1.paymentAmount).toBeNull();
      expect(m1.paymentAmountQuality).toBe("INVALID_ONLY");
      expect(m1.paymentAmountsQualityByCurrency?.RUB).toBe("INVALID_ONLY");
    });

    it("preserves PARTIAL quality for manager with 1 valid and 1 invalid deal", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 75000, opportunityQuality: "VALID", currencyId: "RUB" },
          { id: "D2", opportunity: null, opportunityQuality: "INVALID", currencyId: "RUB" },
        ], "M2"),
      ];

      const scorecard = computeManagerScorecard(companies, boundaries);
      const m2 = scorecard.find((s) => s.responsibleId === "M2")!;

      expect(m2).toBeDefined();
      expect(m2.paymentsReceived).toBe(2);
      expect(m2.paymentAmount).toBe(75000);
      expect(m2.paymentAmountQuality).toBe("PARTIAL");
      expect(m2.paymentAmountsQualityByCurrency?.RUB).toBe("PARTIAL");
    });

    it("preserves genuine 0 COMPLETE when manager has valid paid deal with opportunity 0", () => {
      const companies = [
        makeCompany("C1", [
          { id: "D1", opportunity: 0, opportunityQuality: "VALID", currencyId: "RUB" },
        ], "M3"),
      ];

      const scorecard = computeManagerScorecard(companies, boundaries);
      const m3 = scorecard.find((s) => s.responsibleId === "M3")!;

      expect(m3).toBeDefined();
      expect(m3.paymentsReceived).toBe(1);
      expect(m3.paymentAmount).toBe(0);
      expect(m3.paymentAmountQuality).toBe("COMPLETE");
      expect(m3.paymentAmountsQualityByCurrency?.RUB).toBe("COMPLETE");
    });
  });
});
