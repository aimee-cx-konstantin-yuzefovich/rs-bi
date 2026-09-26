import { describe, it, expect } from "vitest";
import {
  evaluateAggregateAmountQuality,
  computePeriodMetrics,
  computeManagerScorecard,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

describe("Fix A: Aggregate Financial Data Quality & Contract Decision A (Natural-Grain Pruning)", () => {
  const fixedNow = new Date("2026-03-25T12:00:00Z");
  const bounds = computePeriodBoundaries({ periodPreset: "30days" }, fixedNow);

  describe("evaluateAggregateAmountQuality truth table", () => {
    it("0 paid deals -> COMPLETE with amount 0", () => {
      const res = evaluateAggregateAmountQuality(0, 0, 0, 0);
      expect(res.amount).toBe(0);
      expect(res.quality).toBe("COMPLETE");
    });

    it("all valid deals -> COMPLETE with exact sum", () => {
      const res = evaluateAggregateAmountQuality(300_000, 3, 0, 0);
      expect(res.amount).toBe(300_000);
      expect(res.quality).toBe("COMPLETE");
    });

    it("only unknown opportunity deals -> UNKNOWN with amount null", () => {
      const res = evaluateAggregateAmountQuality(0, 0, 0, 2);
      expect(res.amount).toBeNull();
      expect(res.quality).toBe("UNKNOWN");
    });

    it("only invalid opportunity deals -> INVALID_ONLY with amount null", () => {
      const res = evaluateAggregateAmountQuality(0, 0, 2, 0);
      expect(res.amount).toBeNull();
      expect(res.quality).toBe("INVALID_ONLY");
    });

    it("valid deals plus at least 1 unknown deal -> PARTIAL with valid subtotal", () => {
      const res = evaluateAggregateAmountQuality(150_000, 1, 0, 1);
      expect(res.amount).toBe(150_000);
      expect(res.quality).toBe("PARTIAL");
    });

    it("valid deals plus at least 1 invalid deal -> PARTIAL with valid subtotal", () => {
      const res = evaluateAggregateAmountQuality(200_000, 2, 1, 0);
      expect(res.amount).toBe(200_000);
      expect(res.quality).toBe("PARTIAL");
    });
  });

  describe("Contract Decision A: Natural-grain deal pruning in filterCompaniesByDimensions", () => {
    const mkCompany = (deals: CommercialDeal[]): CommercialCompany => ({
      id: "C1",
      title: "Компания Альфа",
      responsibleId: "user-B",
      direction: ["Агрохимия"],
      productType: ["Гель"],
      industry: "Химия",
      region: "Москва",
      dateCreate: "2026-03-01",
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals,
      hasAttention: false,
      attentionReasons: [],
    });

    const deal1: CommercialDeal = {
      id: "D1",
      title: "Сделка 1 - Гель",
      companyId: "C1",
      responsibleId: "user-B",
      stageId: "WON",
      categoryId: "0",
      opportunity: 100,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      productType: ["Гель"],
      direction: ["Агрохимия"],
      industry: ["Химия"],
      region: "Москва",
      paymentStatus: "113",
      paymentDate: "2026-03-10",
      sampleTestingStatus: [],
    };

    const deal2: CommercialDeal = {
      id: "D2",
      title: "Сделка 2 - Золь",
      companyId: "C1",
      responsibleId: "user-C",
      stageId: "WON",
      categoryId: "0",
      opportunity: 900,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      productType: ["Золь"],
      direction: ["Строительство"],
      industry: ["Строительство"],
      region: "Казань",
      paymentStatus: "113",
      paymentDate: "2026-03-12",
      sampleTestingStatus: [],
    };

    it("filtering for responsibleId=user-B prunes deal2 and sums only deal1 (100 RUB)", () => {
      const company = mkCompany([deal1, deal2]);
      const filtered = filterCompaniesByDimensions([company], {
        periodPreset: "30days",
        responsibleId: "user-B",
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].deals).toHaveLength(1);
      expect(filtered[0].deals[0].id).toBe("D1");

      const kpis = computePeriodMetrics(filtered, bounds);
      const payKpi = kpis.find((k) => k.id === "payment_amount")!;
      expect(payKpi.currentValue).toBe(100);
      expect(payKpi.amountQuality).toBe("COMPLETE");
    });

    it("filtering for productType=Гель prunes deal2 and sums only deal1 (100 RUB)", () => {
      const company = mkCompany([deal1, deal2]);
      const filtered = filterCompaniesByDimensions([company], {
        periodPreset: "30days",
        productType: "Гель",
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].deals).toHaveLength(1);
      expect(filtered[0].deals[0].id).toBe("D1");

      const kpis = computePeriodMetrics(filtered, bounds);
      const payKpi = kpis.find((k) => k.id === "payment_amount")!;
      expect(payKpi.currentValue).toBe(100);
    });

    it("manager scorecard assigns payment amounts strictly per manager without cross-contamination", () => {
      const company = mkCompany([deal1, deal2]);
      const scorecard = computeManagerScorecard([company], bounds, [], {
        "user-B": "Борис",
        "user-C": "Сергей",
      });

      const b = scorecard.find((s) => s.responsibleId === "user-B")!;
      const c = scorecard.find((s) => s.responsibleId === "user-C")!;

      expect(b).toBeDefined();
      expect(b.paymentAmount).toBe(100);
      expect(b.paymentAmountQuality).toBe("COMPLETE");

      expect(c).toBeDefined();
      expect(c.paymentAmount).toBe(900);
      expect(c.paymentAmountQuality).toBe("COMPLETE");
    });
  });
});
