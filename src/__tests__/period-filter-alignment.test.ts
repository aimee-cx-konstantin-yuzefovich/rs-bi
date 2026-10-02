import { describe, expect, it } from "vitest";
import {
  computePeriodBoundaries,
  normalizeCommercialPeriodPreset,
} from "@/lib/commercial-funnel/date-utils";
import { computeWipMetrics, computePeriodMetrics } from "@/lib/commercial-funnel/engine";
import type { CommercialCompany } from "@/lib/commercial-funnel/types";

describe("Commercial Funnel Period Filter Alignment (Part B)", () => {
  const FIXED_NOW = new Date("2026-10-02T12:00:00Z"); // 15:00 MSK on 2026-10-02

  it("normalizes obsolete and unknown presets to 30days", () => {
    expect(normalizeCommercialPeriodPreset("7days")).toBe("7days");
    expect(normalizeCommercialPeriodPreset("14days")).toBe("14days");
    expect(normalizeCommercialPeriodPreset("30days")).toBe("30days");
    expect(normalizeCommercialPeriodPreset("90days")).toBe("90days");
    expect(normalizeCommercialPeriodPreset("custom")).toBe("custom");

    // Obsolete presets normalize to 30days
    expect(normalizeCommercialPeriodPreset("all")).toBe("30days");
    expect(normalizeCommercialPeriodPreset("quarter")).toBe("30days");
    expect(normalizeCommercialPeriodPreset("year")).toBe("30days");
    expect(normalizeCommercialPeriodPreset("365days")).toBe("30days");
    expect(normalizeCommercialPeriodPreset("unknown" as any)).toBe("30days");
    expect(normalizeCommercialPeriodPreset(null)).toBe("30days");
  });

  it("legacy presets (all, quarter, year, 365days, unknown) produce identical boundaries as 30days", () => {
    const b30 = computePeriodBoundaries({ periodPreset: "30days" }, FIXED_NOW);
    for (const legacy of ["all", "quarter", "year", "365days", "unknown", null, undefined]) {
      const bLegacy = computePeriodBoundaries({ periodPreset: legacy as any }, FIXED_NOW);
      expect(bLegacy.currentStartStr).toBe(b30.currentStartStr);
      expect(bLegacy.currentEndStr).toBe(b30.currentEndStr);
      expect(bLegacy.previousStartStr).toBe(b30.previousStartStr);
      expect(bLegacy.previousEndStr).toBe(b30.previousEndStr);
      expect(bLegacy.comparisonAvailable).toBe(true);
    }
  });

  it("7days boundary spans 7 calendar days with 7 days preceding comparison", () => {
    const bounds = computePeriodBoundaries({ periodPreset: "7days" }, FIXED_NOW);
    expect(bounds.currentStartStr).toBe("2026-09-26");
    expect(bounds.currentEndStr).toBe("2026-10-02");
    expect(bounds.previousStartStr).toBe("2026-09-19");
    expect(bounds.previousEndStr).toBe("2026-09-25");
    expect(bounds.comparisonAvailable).toBe(true);

    const currentDurationMs = bounds.currentEnd!.getTime() - bounds.currentStart!.getTime() + 1;
    const prevDurationMs = bounds.previousEnd!.getTime() - bounds.previousStart!.getTime() + 1;
    expect(currentDurationMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(prevDurationMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("14days boundary spans 14 calendar days with 14 days preceding comparison", () => {
    const bounds = computePeriodBoundaries({ periodPreset: "14days" }, FIXED_NOW);
    expect(bounds.currentStartStr).toBe("2026-09-19");
    expect(bounds.currentEndStr).toBe("2026-10-02");
    expect(bounds.previousStartStr).toBe("2026-09-05");
    expect(bounds.previousEndStr).toBe("2026-09-18");
    expect(bounds.comparisonAvailable).toBe(true);

    const currentDurationMs = bounds.currentEnd!.getTime() - bounds.currentStart!.getTime() + 1;
    const prevDurationMs = bounds.previousEnd!.getTime() - bounds.previousStart!.getTime() + 1;
    expect(currentDurationMs).toBe(14 * 24 * 60 * 60 * 1000);
    expect(prevDurationMs).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("30days boundary spans 30 calendar days with 30 days preceding comparison", () => {
    const bounds = computePeriodBoundaries({ periodPreset: "30days" }, FIXED_NOW);
    expect(bounds.currentStartStr).toBe("2026-09-03");
    expect(bounds.currentEndStr).toBe("2026-10-02");
    expect(bounds.comparisonAvailable).toBe(true);

    const currentDurationMs = bounds.currentEnd!.getTime() - bounds.currentStart!.getTime() + 1;
    expect(currentDurationMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("90days boundary spans 90 calendar days with 90 days preceding comparison", () => {
    const bounds = computePeriodBoundaries({ periodPreset: "90days" }, FIXED_NOW);
    expect(bounds.currentEndStr).toBe("2026-10-02");
    expect(bounds.comparisonAvailable).toBe(true);

    const currentDurationMs = bounds.currentEnd!.getTime() - bounds.currentStart!.getTime() + 1;
    expect(currentDurationMs).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("custom mode safely swaps From > To boundaries", () => {
    const bounds = computePeriodBoundaries(
      { periodPreset: "custom", customFrom: "2026-09-30", customTo: "2026-09-01" },
      FIXED_NOW
    );
    expect(bounds.currentStartStr).toBe("2026-09-01");
    expect(bounds.currentEndStr).toBe("2026-09-30");
    expect(bounds.currentStart!.getTime()).toBeLessThan(bounds.currentEnd!.getTime());
  });

  it("custom mode with incomplete boundaries returns empty/null boundaries and NEVER falls back to 30 days", () => {
    const missingBoth = computePeriodBoundaries({ periodPreset: "custom" }, FIXED_NOW);
    expect(missingBoth.currentStart).toBeNull();
    expect(missingBoth.currentEnd).toBeNull();
    expect(missingBoth.previousStart).toBeNull();
    expect(missingBoth.previousEnd).toBeNull();
    expect(missingBoth.currentStartStr).toBe("");
    expect(missingBoth.currentEndStr).toBe("");
    expect(missingBoth.comparisonAvailable).toBe(false);

    const missingTo = computePeriodBoundaries(
      { periodPreset: "custom", customFrom: "2026-09-01" },
      FIXED_NOW
    );
    expect(missingTo.currentStart).toBeNull();
    expect(missingTo.currentEnd).toBeNull();
    expect(missingTo.currentStartStr).toBe("");
    expect(missingTo.currentEndStr).toBe("");
    expect(missingTo.comparisonAvailable).toBe(false);

    const missingFrom = computePeriodBoundaries(
      { periodPreset: "custom", customTo: "2026-09-30" },
      FIXED_NOW
    );
    expect(missingFrom.currentStart).toBeNull();
    expect(missingFrom.currentEnd).toBeNull();
    expect(missingFrom.currentStartStr).toBe("");
    expect(missingFrom.currentEndStr).toBe("");
    expect(missingFrom.comparisonAvailable).toBe(false);
  });

  it("custom mode with invalid dates (e.g. 2026-02-31) returns null boundaries without throwing uncaught errors", () => {
    expect(() => {
      const invalidFrom = computePeriodBoundaries(
        { periodPreset: "custom", customFrom: "2026-02-31", customTo: "2026-03-20" },
        FIXED_NOW
      );
      expect(invalidFrom.currentStart).toBeNull();
      expect(invalidFrom.currentEnd).toBeNull();
      expect(invalidFrom.currentStartStr).toBe("");
      expect(invalidFrom.currentEndStr).toBe("");
      expect(invalidFrom.comparisonAvailable).toBe(false);
    }).not.toThrow();

    expect(() => {
      const invalidTo = computePeriodBoundaries(
        { periodPreset: "custom", customFrom: "2026-03-01", customTo: "2026-02-31" },
        FIXED_NOW
      );
      expect(invalidTo.currentStart).toBeNull();
      expect(invalidTo.currentEnd).toBeNull();
    }).not.toThrow();
  });

  it("WIP metrics remain strictly independent of period filtering", () => {
    const testCompanies: CommercialCompany[] = [
      {
        id: "c-1",
        title: "Компания 1",
        responsibleId: "u-1",
        companyFactsIncluded: true,
        sampleStatus: "На испытании",
        sampleStatusSource: "SMART_PROCESS",
        sampleRelatedDealId: "d-1",
        deals: [
          {
            id: "d-1",
            title: "Сделка 1",
            companyId: "c-1",
            responsibleId: "u-1",
            stageId: "8",
            categoryId: "0",
            currencyId: "RUB",
            opportunity: 100000,
            opportunityQuality: "VALID",
            productType: [],
            industry: [],
            direction: [],
          },
        ],
        productType: [],
        direction: [],
        gradeGel: [],
        gradeSol: [],
        sampleAllDates: [],
        hasAttention: false,
        attentionReasons: [],
      },
    ];

    // WIP metrics don't take any boundaries and are identical regardless of period
    const wip = computeWipMetrics(testCompanies);
    expect(wip.find((k) => k.id === "На испытании")?.companyCount).toBe(1);
    expect(wip.find((k) => k.id === "На испытании")?.dealCount).toBe(1);
  });

  it("Defect 8 Regression Fixture: sample sent 60 days ago, current WIP = 1, sent-in-period KPI = 0", () => {
    // FIXED_NOW: 2026-10-02 MSK
    // Sample sent 60 days ago: 2026-08-03
    // Selected period: 7days (2026-09-26 to 2026-10-02)
    const bounds7d = computePeriodBoundaries({ periodPreset: "7days" }, FIXED_NOW);

    const companyWithOlderSample: CommercialCompany = {
      id: "c-old-sample",
      title: "Компания с образцом 60 дней назад",
      responsibleId: "u-1",
      companyFactsIncluded: true,
      sampleStatus: "На испытании",
      sampleStatusSource: "SMART_PROCESS",
      sampleShipmentDate: "2026-08-03", // 60 days before 2026-10-02
      sampleRelatedDealId: "d-old",
      deals: [],
      productType: [],
      direction: [],
      gradeGel: [],
      gradeSol: [],
      sampleAllDates: ["2026-08-03"],
      hasAttention: false,
      attentionReasons: [],
    };

    // 1. Current WIP metric evaluates truthfully to 1 (not truncated by period)
    const wip = computeWipMetrics([companyWithOlderSample]);
    const testingWip = wip.find((k) => k.id === "На испытании");
    expect(testingWip?.companyCount).toBe(1);

    // 2. Dated event KPI for samples sent in period evaluates truthfully to 0
    const datedMetrics = computePeriodMetrics([companyWithOlderSample], bounds7d);
    const sentKpi = datedMetrics.find((k) => k.id === "samples_sent");
    expect(sentKpi?.currentValue).toBe(0);
  });
});
