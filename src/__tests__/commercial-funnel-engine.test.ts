// @vitest-environment node
// src/__tests__/commercial-funnel-engine.test.ts
// Unit tests for the Commercial Funnel pure analytics engine.

import { describe, expect, it } from "vitest";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import {
  calculateDaysWaiting,
  computePeriodBoundaries,
  safeDeltaPercent,
} from "@/lib/commercial-funnel/date-utils";
import { normalizeCompanies, normalizeDeals } from "@/lib/commercial-funnel/normalize";
import type { CommercialCompany, CommercialDeal, CommercialFilters } from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Date Utilities & Safe Deltas", () => {
  it("safeDeltaPercent handles zero denominator safely", () => {
    expect(safeDeltaPercent(10, 0)).toBeNull(); // 0 -> 10, division by zero
    expect(safeDeltaPercent(0, 0)).toBe(0);
    expect(safeDeltaPercent(15, 10)).toBe(50); // 10 -> 15 (+50%)
    expect(safeDeltaPercent(5, 10)).toBe(-50); // 10 -> 5 (-50%)
    expect(safeDeltaPercent(NaN, 10)).toBeNull();
    expect(safeDeltaPercent(10, Infinity)).toBeNull();
  });

  it("computePeriodBoundaries creates equal-duration prior periods", () => {
    const fixedNow = new Date(2026, 8, 24, 12, 0, 0); // 2026-09-24
    const filters: CommercialFilters = { periodPreset: "30days" };
    const bounds = computePeriodBoundaries(filters, fixedNow);

    const currentDuration = bounds.currentEnd.getTime() - bounds.currentStart.getTime();
    const previousDuration = bounds.previousEnd.getTime() - bounds.previousStart.getTime();

    expect(Math.abs(currentDuration - previousDuration)).toBeLessThanOrEqual(1000);
    expect(bounds.previousEnd.getTime()).toBeLessThan(bounds.currentStart.getTime());
  });

  it("calculateDaysWaiting returns null for missing or invalid dates", () => {
    expect(calculateDaysWaiting(undefined)).toBeNull();
    expect(calculateDaysWaiting("")).toBeNull();
    expect(calculateDaysWaiting("invalid-date")).toBeNull();

    const now = new Date(2026, 8, 24, 12, 0, 0);
    expect(calculateDaysWaiting("2026-09-10", now)).toBe(14);
  });
});

describe("Commercial Funnel — Normalization & Precedence", () => {
  it("Deal sample state takes precedence over Company fallback", () => {
    const rawCompany = {
      ID: "100",
      TITLE: "Компания Альфа",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1753187313314: ["263"], // "Требуются образцы"
    };

    const rawDeal = {
      ID: "501",
      TITLE: "Сделка Альфа",
      COMPANY_ID: "100",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1779386185: "DT1032_15:CLIENT", // "На испытании"
    };

    const deals = normalizeDeals([rawDeal]);
    const companies = normalizeCompanies([rawCompany], deals);

    expect(companies).toHaveLength(1);
    expect(companies[0].sampleStatus).toBe("На испытании");
    expect(companies[0].sampleStatusSource).toBe("DEAL");
  });

  it("Company fallback is used when no deal sample state exists", () => {
    const rawCompany = {
      ID: "101",
      TITLE: "Компания Бета",
      ASSIGNED_BY_ID: "2",
      UF_CRM_1753187313314: ["261"], // "Образцы отправлены"
    };

    const companies = normalizeCompanies([rawCompany], []);
    expect(companies).toHaveLength(1);
    expect(companies[0].sampleStatus).toBe("Образцы отправлены");
    expect(companies[0].sampleStatusSource).toBe("COMPANY");
  });

  it("Unknown/unclassified enum values (265, 267) are preserved and never dropped", () => {
    const rawCompany = {
      ID: "102",
      TITLE: "Компания Гамма",
      ASSIGNED_BY_ID: "2",
      UF_CRM_1753187313314: ["265"], // Unclassified
    };

    const companies = normalizeCompanies([rawCompany], []);
    expect(companies).toHaveLength(1);
    expect(companies[0].sampleStatus).toContain("Не классифицировано");
    expect(companies[0].sampleStatus).toContain("265");
  });

  it("Multiple deals for one company are grouped under that company", () => {
    const rawCompany = {
      ID: "200",
      TITLE: "Компания Дельта",
      ASSIGNED_BY_ID: "3",
    };

    const rawDeals = [
      { ID: "601", TITLE: "Сделка 1", COMPANY_ID: "200", OPPORTUNITY: "100000" },
      { ID: "602", TITLE: "Сделка 2", COMPANY_ID: "200", OPPORTUNITY: "300000" },
    ];

    const deals = normalizeDeals(rawDeals);
    const companies = normalizeCompanies([rawCompany], deals);

    expect(companies).toHaveLength(1);
    expect(companies[0].deals).toHaveLength(2);
    expect(companies[0].primaryDealOpportunity).toBe(300000); // Highest opportunity
  });
});

describe("Commercial Funnel — Pure Analytics & Unique Company Counting", () => {
  const fixedNow = new Date(2026, 8, 24, 12, 0, 0);
  const bounds = computePeriodBoundaries({ periodPreset: "30days" }, fixedNow);

  it("Unique company counting: 1 company with 3 deals in period counts as 1 company in KPI", () => {
    const mockCompany: CommercialCompany = {
      id: "300",
      title: "ООО Крупный Заказчик",
      responsibleId: "1",
      dateCreate: "2026-09-15", // Inside current period
      direction: [],
      productType: [],
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleShipmentDate: "2026-09-16",
      sampleAllDates: ["2026-09-16"],
      gradeGel: [],
      gradeSol: [],
      deals: [
        {
          id: "701",
          title: "Сделка 1",
          companyId: "300",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 100000,
          currencyId: "RUB",
          dateCreate: "2026-09-17",
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
        {
          id: "702",
          title: "Сделка 2",
          companyId: "300",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 200000,
          currencyId: "RUB",
          dateCreate: "2026-09-18",
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
      ],
      hasAttention: false,
      attentionReasons: [],
    };

    const kpis = computePeriodMetrics([mockCompany], bounds);

    const newCompaniesKpi = kpis.find((k) => k.id === "new_companies")!;
    const dealsCreatedKpi = kpis.find((k) => k.id === "deals_created")!;
    const samplesSentKpi = kpis.find((k) => k.id === "samples_sent")!;

    expect(newCompaniesKpi.currentValue).toBe(1);
    expect(newCompaniesKpi.companyIds).toEqual(["300"]);

    // Both deals belong to the same company, so unique company count is 1
    expect(dealsCreatedKpi.currentValue).toBe(1);
    expect(dealsCreatedKpi.companyIds).toEqual(["300"]);

    expect(samplesSentKpi.currentValue).toBe(1);
    expect(samplesSentKpi.companyIds).toEqual(["300"]);
  });

  it("WIP metrics accurately aggregate current states without event date filtering", () => {
    const companies: CommercialCompany[] = [
      {
        id: "1",
        title: "C1",
        responsibleId: "1",
        direction: [],
        productType: [],
        sampleStatus: "На испытании",
        sampleStatusSource: "DEAL",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
      {
        id: "2",
        title: "C2",
        responsibleId: "1",
        direction: [],
        productType: [],
        sampleStatus: "Подошли",
        sampleStatusSource: "DEAL",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
      {
        id: "3",
        title: "C3",
        responsibleId: "2",
        direction: [],
        productType: [],
        sampleStatus: "Не классифицировано (999)",
        sampleStatusSource: "COMPANY",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
    ];

    const wip = computeWipMetrics(companies);

    const inTesting = wip.find((w) => w.id === "На испытании")!;
    const success = wip.find((w) => w.id === "Подошли")!;
    const unclassified = wip.find((w) => w.id === "Не классифицировано")!;

    expect(inTesting.companyCount).toBe(1);
    expect(inTesting.companyIds).toEqual(["1"]);

    expect(success.companyCount).toBe(1);
    expect(success.companyIds).toEqual(["2"]);

    expect(unclassified.companyCount).toBe(1);
    expect(unclassified.companyIds).toEqual(["3"]);
  });

  it("computeBottlenecks detects stalled sample testing > 14 days", () => {
    const companies: CommercialCompany[] = [
      {
        id: "1",
        title: "Зависшая компания",
        responsibleId: "1",
        responsibleName: "Иванов",
        direction: [],
        productType: [],
        sampleStatus: "На испытании",
        sampleStatusSource: "DEAL",
        sampleShipmentDate: "2026-09-01", // 23 days before fixedNow (2026-09-24)
        sampleAllDates: ["2026-09-01"],
        gradeGel: [],
        gradeSol: [],
        deals: [],
        hasAttention: true,
        attentionReasons: [],
      },
    ];

    const bottlenecks = computeBottlenecks(companies, fixedNow);
    expect(bottlenecks).toHaveLength(1);
    expect(bottlenecks[0].type).toBe("sample_testing_stalled");
    expect(bottlenecks[0].daysWaiting).toBe(23);
  });

  it("computeManagerScorecard calculates manager metrics without ranking", () => {
    const companies: CommercialCompany[] = [
      {
        id: "1",
        title: "C1",
        responsibleId: "user-1",
        dateCreate: "2026-09-10",
        direction: [],
        productType: [],
        sampleStatus: "На испытании",
        sampleStatusSource: "DEAL",
        sampleAllDates: ["2026-09-10"],
        gradeGel: [],
        gradeSol: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
      {
        id: "2",
        title: "C2",
        responsibleId: "user-2",
        dateCreate: "2026-09-12",
        direction: [],
        productType: [],
        sampleStatus: "Подошли",
        sampleStatusSource: "DEAL",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
    ];

    const scorecard = computeManagerScorecard(
      companies,
      bounds,
      [],
      { "user-1": "Анна С.", "user-2": "Борис П." }
    );

    expect(scorecard).toHaveLength(2);
    // Alphabetical order
    expect(scorecard[0].name).toBe("Анна С.");
    expect(scorecard[1].name).toBe("Борис П.");

    expect(scorecard[0].newCompanies).toBe(1);
    expect(scorecard[0].samplesSent).toBe(1);
    expect(scorecard[0].inTesting).toBe(1);

    expect(scorecard[1].newCompanies).toBe(1);
    expect(scorecard[1].sampleSuccess).toBe(1);
  });

  it("filterCompaniesByDimensions respects dimensional filters", () => {
    const companies: CommercialCompany[] = [
      {
        id: "1",
        title: "C1",
        responsibleId: "user-1",
        direction: ["Агрохимия"],
        productType: ["Гель"],
        industry: "Химия",
        region: "Москва",
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
      {
        id: "2",
        title: "C2",
        responsibleId: "user-2",
        direction: ["Строительство"],
        productType: ["Золь"],
        industry: "Строительство",
        region: "Казань",
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      },
    ];

    const filtered = filterCompaniesByDimensions(companies, {
      periodPreset: "30days",
      productType: "Гель",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");
  });

  it("handles inverted custom date boundaries safely", () => {
    const fixedNow = new Date(2026, 8, 24, 12, 0, 0);
    const bounds = computePeriodBoundaries(
      { periodPreset: "custom", customFrom: "2026-09-30", customTo: "2026-09-01" },
      fixedNow
    );

    expect(bounds.currentStart.getTime()).toBeLessThan(bounds.currentEnd.getTime());
    expect(bounds.currentStartStr).toBe("2026-09-01");
    expect(bounds.currentEndStr).toBe("2026-09-30");
  });

  it("detects stalled deal older than 30 days (COMMERCIAL_THRESHOLDS.STALLED_DEAL_DAYS)", () => {
    const companies: CommercialCompany[] = [
      {
        id: "comp-stalled",
        title: "Компания со старой сделкой",
        responsibleId: "1",
        direction: [],
        productType: [],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [
          {
            id: "deal-old",
            title: "Зависшая сделка",
            companyId: "comp-stalled",
            responsibleId: "1",
            stageId: "EXECUTING",
            categoryId: "0",
            opportunity: 500_000,
            currencyId: "RUB",
            dateCreate: "2026-08-01", // 54 days before fixedNow (2026-09-24)
            sampleTestingStatus: [],
            productType: [],
            industry: [],
            direction: [],
          },
        ],
        hasAttention: false,
        attentionReasons: [],
      },
    ];

    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const stalledDeal = bottlenecks.find((b) => b.type === "stalled_deal");

    expect(stalledDeal).toBeDefined();
    expect(stalledDeal?.dealId).toBe("deal-old");
    expect(stalledDeal?.daysWaiting).toBe(54);
    expect(stalledDeal?.daysWaiting).toBeGreaterThan(30);
  });

  it("manager scorecard drill-down includes companies where manager owns a deal", () => {
    const companies: CommercialCompany[] = [
      {
        id: "comp-owner-A",
        title: "Компания Владельца А",
        responsibleId: "user-A",
        direction: [],
        productType: [],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [
          {
            id: "deal-mgr-B",
            title: "Сделка Менеджера Б",
            companyId: "comp-owner-A",
            responsibleId: "user-B",
            stageId: "EXECUTING",
            categoryId: "0",
            opportunity: 200_000,
            currencyId: "RUB",
            sampleTestingStatus: [],
            productType: [],
            industry: [],
            direction: [],
          },
        ],
        hasAttention: false,
        attentionReasons: [],
      },
    ];

    const scorecard = computeManagerScorecard(
      companies,
      bounds,
      [],
      { "user-A": "Менеджер А", "user-B": "Менеджер Б" }
    );

    const rowB = scorecard.find((m) => m.responsibleId === "user-B")!;
    expect(rowB).toBeDefined();
    expect(rowB.companyIds).toContain("comp-owner-A");
  });
});
