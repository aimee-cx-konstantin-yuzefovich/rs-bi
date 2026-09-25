// @vitest-environment node
// src/__tests__/commercial-funnel-engine.test.ts
// Unit tests for the Commercial Funnel pure analytics engine.

import { describe, expect, it } from "vitest";
import {
  buildSampleRegister,
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
import {
  formatCurrencyAmount,
  getCurrencySymbol,
  normalizeCompanies,
  normalizeCurrencyCode,
  normalizeDeals,
} from "@/lib/commercial-funnel/normalize";
import type { CommercialCompany, CommercialDeal, CommercialFilters } from "@/lib/commercial-funnel/types";
import { COMMERCIAL_TIMEZONE, PAYMENT_AMOUNT_LABEL } from "@/lib/commercial-funnel/constants";

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

describe("Commercial Funnel — Remediation & Provenance Hardening", () => {
  it("multiplicity: preserves multiple company sample statuses in sampleStatuses and raw values", () => {
    const rawCompany = {
      ID: "105",
      TITLE: "Компания с несколькими статусами",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1753187313314: ["261", "2695"], // 261 = "Образцы отправлены", 2695 = "Подошли"
    };
    const companies = normalizeCompanies([rawCompany], []);
    expect(companies).toHaveLength(1);
    expect(companies[0].sampleStatuses).toBeDefined();
    expect(companies[0].sampleStatuses).toContain("Образцы отправлены");
    expect(companies[0].sampleStatuses).toContain("Подошли");
    expect(companies[0].sampleStatusRawValues).toEqual(["261", "2695"]);
  });

  it("multiplicity: preserves multiple deal sample statuses and unknown enums", () => {
    const rawDeal = {
      ID: "502",
      TITLE: "Сделка с образцами",
      COMPANY_ID: "106",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1779386185: "DT1032_15:CLIENT", // Deal sample transfer: "На испытании"
      UF_CRM_1779394379: ["265", "267"], // Deal sample testing: 2 unknown enums
    };
    const deals = normalizeDeals([rawDeal]);
    expect(deals[0].sampleTransferStatus).toBe("На испытании");
    expect(deals[0].sampleTestingStatus.some((s) => s.includes("265"))).toBe(true);
    expect(deals[0].sampleTestingStatus.some((s) => s.includes("267"))).toBe(true);
    expect(deals[0].sampleTestingStatusRaw).toEqual(["265", "267"]);
  });

  it("provenance: Case A (Deal shipment date only) -> authoritative Deal date used in period metrics", () => {
    const rawCompany = {
      ID: "201",
      TITLE: "Компания Кейс А",
      ASSIGNED_BY_ID: "1",
    };
    const rawDeal = {
      ID: "601",
      TITLE: "Сделка А",
      COMPANY_ID: "201",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1779386185: "DT1032_15:CLIENT",
      UF_CRM_1774879952785: "2026-09-10", // DEAL_SAMPLE_SENT_DATE_FIELD_ID
    };
    const deals = normalizeDeals([rawDeal]);
    const companies = normalizeCompanies([rawCompany], deals);
    expect(companies[0].sampleShipmentDate).toBe("2026-09-10");
    expect(companies[0].sampleStatusSource).toBe("DEAL");
    expect(companies[0].sampleDealSentDates).toContain("2026-09-10");
    expect(companies[0].sampleCompanyTransferDates).toEqual([]);
    expect(companies[0].sampleEventDatesForPeriodMetrics).toEqual(["2026-09-10"]);

    const bounds = computePeriodBoundaries({ periodPreset: "30days" }, new Date(2026, 8, 24));
    const kpis = computePeriodMetrics(companies, bounds);
    const sentKpi = kpis.find((k) => k.id === "samples_sent")!;
    expect(sentKpi.currentValue).toBe(1);
  });

  it("provenance: Case B (Company transfer date only) -> fallback Company date used in period metrics", () => {
    const rawCompany = {
      ID: "202",
      TITLE: "Компания Кейс Б",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1753187313314: ["261"],
      UF_CRM_1764156557536: ["2026-09-12"], // COMPANY_SAMPLES_DATE_MULTI_FIELD_ID
    };
    const companies = normalizeCompanies([rawCompany], []);
    expect(companies[0].sampleShipmentDate).toBe("2026-09-12");
    expect(companies[0].sampleStatusSource).toBe("COMPANY");
    expect(companies[0].sampleCompanyTransferDates).toContain("2026-09-12");
    expect(companies[0].sampleDealSentDates).toEqual([]);
    expect(companies[0].sampleEventDatesForPeriodMetrics).toEqual(["2026-09-12"]);

    const bounds = computePeriodBoundaries({ periodPreset: "30days" }, new Date(2026, 8, 24));
    const kpis = computePeriodMetrics(companies, bounds);
    const sentKpi = kpis.find((k) => k.id === "samples_sent")!;
    expect(sentKpi.currentValue).toBe(1);
  });

  it("provenance: Case C (Both Deal shipment date and Company transfer date) -> Deal date is authoritative, company date excluded from period metrics", () => {
    const rawCompany = {
      ID: "203",
      TITLE: "Компания Кейс В",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1753187313314: ["261"],
      UF_CRM_1764156557536: ["2026-08-01"], // Old company transfer date outside current period
    };
    const rawDeal = {
      ID: "603",
      TITLE: "Сделка В",
      COMPANY_ID: "203",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1779386185: "DT1032_15:CLIENT",
      UF_CRM_1774879952785: "2026-09-15", // Recent deal shipment date inside current period
    };
    const deals = normalizeDeals([rawDeal]);
    const companies = normalizeCompanies([rawCompany], deals);

    // Authoritative date is Deal shipment date (2026-09-15)
    expect(companies[0].sampleShipmentDate).toBe("2026-09-15");
    expect(companies[0].sampleDealSentDates).toContain("2026-09-15");
    expect(companies[0].sampleCompanyTransferDates).toContain("2026-08-01");
    // Period metrics must ONLY evaluate sampleDealSentDates when present
    expect(companies[0].sampleEventDatesForPeriodMetrics).toEqual(["2026-09-15"]);

    const bounds = computePeriodBoundaries({ periodPreset: "30days" }, new Date(2026, 8, 24));
    const kpis = computePeriodMetrics(companies, bounds);
    const sentKpi = kpis.find((k) => k.id === "samples_sent")!;
    expect(sentKpi.currentValue).toBe(1);
  });

  it("provenance: Case D (Neither Deal nor Company date) -> not counted in period metrics, but included in WIP", () => {
    const rawCompany = {
      ID: "204",
      TITLE: "Компания Кейс Г",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1753187313314: ["2695"], // "Подошли" without date
    };
    const companies = normalizeCompanies([rawCompany], []);
    expect(companies[0].sampleShipmentDate).toBeUndefined();
    expect(companies[0].sampleEventDatesForPeriodMetrics).toEqual([]);

    const bounds = computePeriodBoundaries({ periodPreset: "30days" }, new Date(2026, 8, 24));
    const kpis = computePeriodMetrics(companies, bounds);
    const sentKpi = kpis.find((k) => k.id === "samples_sent")!;
    expect(sentKpi.currentValue).toBe(0);

    const wip = computeWipMetrics(companies);
    const successWip = wip.find((w) => w.id === "Подошли")!;
    expect(successWip.companyCount).toBe(1);
  });

  it("timezone: boundary inclusion respects Europe/Moscow (MSK, UTC+3)", () => {
    // A date string "2026-08-31T21:30:00Z" is 2026-09-01 00:30:00 MSK (UTC+3)
    // A date string "2026-09-30T21:00:00Z" is 2026-10-01 00:00:00 MSK (UTC+3)
    const bounds = computePeriodBoundaries(
      { periodPreset: "custom", customFrom: "2026-09-01", customTo: "2026-09-30" },
      new Date(2026, 8, 24)
    );

    const companyInTz: CommercialCompany = {
      id: "tz-1",
      title: "Комп ТЗ Внутри",
      responsibleId: "1",
      dateCreate: "2026-08-31T21:30:00Z", // 00:30 Sept 1 in MSK -> inside Sept
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
    };

    const companyOutsideTz: CommercialCompany = {
      id: "tz-2",
      title: "Комп ТЗ Снаружи",
      responsibleId: "1",
      dateCreate: "2026-09-30T21:00:00Z", // 00:00 Oct 1 in MSK -> outside Sept
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
    };

    const kpis = computePeriodMetrics([companyInTz, companyOutsideTz], bounds);
    const newCompKpi = kpis.find((k) => k.id === "new_companies")!;
    expect(newCompKpi.currentValue).toBe(1);
    expect(newCompKpi.companyIds).toEqual(["tz-1"]);
  });

  it("inverted custom date range includes both boundary calendar days fully", () => {
    // User entered customFrom: "2026-09-20", customTo: "2026-09-10"
    const bounds = computePeriodBoundaries(
      { periodPreset: "custom", customFrom: "2026-09-20", customTo: "2026-09-10" },
      new Date(2026, 8, 24)
    );

    expect(bounds.currentStartStr).toBe("2026-09-10");
    expect(bounds.currentEndStr).toBe("2026-09-20");

    const companyStart: CommercialCompany = {
      id: "inv-start",
      title: "Утро начального дня",
      responsibleId: "1",
      dateCreate: "2026-09-10T02:00:00+03:00",
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
    };

    const companyEnd: CommercialCompany = {
      id: "inv-end",
      title: "Вечер конечного дня",
      responsibleId: "1",
      dateCreate: "2026-09-20T22:30:00+03:00",
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
    };

    const kpis = computePeriodMetrics([companyStart, companyEnd], bounds);
    const newCompKpi = kpis.find((k) => k.id === "new_companies")!;
    expect(newCompKpi.currentValue).toBe(2);
    expect(newCompKpi.companyIds).toContain("inv-start");
    expect(newCompKpi.companyIds).toContain("inv-end");
  });

  it("payment KPI uses truthful label and sums deal opportunity with payment in period", () => {
    const bounds = computePeriodBoundaries({ periodPreset: "30days" }, new Date(2026, 8, 24));
    const companyWithPayment: CommercialCompany = {
      id: "pay-1",
      title: "Оплатившая Компания",
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
          id: "deal-pay",
          title: "Оплаченная сделка",
          companyId: "pay-1",
          responsibleId: "1",
          stageId: "WON",
          categoryId: "0",
          opportunity: 450_000,
          currencyId: "RUB",
          dateCreate: "2026-09-01",
          paymentStatus: "113",
          paymentDate: "2026-09-14", // in period
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
      ],
      hasAttention: false,
      attentionReasons: [],
    };

    const kpis = computePeriodMetrics([companyWithPayment], bounds);
    const paymentKpi = kpis.find((k) => k.id === "payment_amount")!;
    expect(paymentKpi.label).toBe(PAYMENT_AMOUNT_LABEL);
    expect(paymentKpi.currentValue).toBe(450_000);
  });

  it("invoice age is not fabricated from dateCreate and does not trigger premature stalled bottleneck", () => {
    const fixedNow = new Date(2026, 8, 24, 12, 0, 0); // 2026-09-24

    // Deal created 20 days ago in INVOICE stage without payment
    const youngInvoiceCompany: CommercialCompany = {
      id: "c-invoice-young",
      title: "Компания с молодым счетом",
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
          id: "deal-inv-20d",
          title: "Сделка со счетом 20 дней",
          companyId: "c-invoice-young",
          responsibleId: "1",
          stageId: "FINAL_INVOICE",
          categoryId: "0",
          opportunity: 200_000,
          currencyId: "RUB",
          dateCreate: "2026-09-04", // 20 days before fixedNow
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
      ],
      hasAttention: false,
      attentionReasons: [],
    };

    const bottlenecks = computeBottlenecks([youngInvoiceCompany], fixedNow);
    // Must NOT have fabricated invoice_waiting bottleneck or stalled_deal (<= 30 days)
    expect(bottlenecks.some((b) => (b.type as string) === "invoice_waiting")).toBe(false);
    expect(bottlenecks.some((b) => b.type === "stalled_deal")).toBe(false);
  });

  it("stalled deal boundary: 29 and 30 days do not trigger, 31 days triggers stalled_deal", () => {
    const fixedNow = new Date(2026, 8, 24, 12, 0, 0); // 2026-09-24

    // 29 days old: 2026-08-26
    const deal29: CommercialDeal = {
      id: "deal-29",
      title: "Сделка 29 дней",
      companyId: "c-boundary",
      responsibleId: "1",
      stageId: "EXECUTING",
      categoryId: "0",
      opportunity: 100_000,
      currencyId: "RUB",
      dateCreate: "2026-08-26",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    // 30 days old: 2026-08-25
    const deal30: CommercialDeal = {
      id: "deal-30",
      title: "Сделка 30 дней",
      companyId: "c-boundary",
      responsibleId: "1",
      stageId: "EXECUTING",
      categoryId: "0",
      opportunity: 100_000,
      currencyId: "RUB",
      dateCreate: "2026-08-25",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    // 31 days old: 2026-08-24
    const deal31: CommercialDeal = {
      id: "deal-31",
      title: "Сделка 31 день",
      companyId: "c-boundary",
      responsibleId: "1",
      stageId: "EXECUTING",
      categoryId: "0",
      opportunity: 100_000,
      currencyId: "RUB",
      dateCreate: "2026-08-24",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const company29: CommercialCompany = {
      id: "c-29",
      title: "C29",
      responsibleId: "1",
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals: [deal29],
      hasAttention: false,
      attentionReasons: [],
    };

    const company30: CommercialCompany = {
      id: "c-30",
      title: "C30",
      responsibleId: "1",
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals: [deal30],
      hasAttention: false,
      attentionReasons: [],
    };

    const company31: CommercialCompany = {
      id: "c-31",
      title: "C31",
      responsibleId: "1",
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals: [deal31],
      hasAttention: false,
      attentionReasons: [],
    };

    const b29 = computeBottlenecks([company29], fixedNow);
    expect(b29.some((b) => b.dealId === "deal-29")).toBe(false);

    const b30 = computeBottlenecks([company30], fixedNow);
    expect(b30.some((b) => b.dealId === "deal-30")).toBe(false);

    const b31 = computeBottlenecks([company31], fixedNow);
    const stalled31 = b31.find((b) => b.dealId === "deal-31");
    expect(stalled31).toBeDefined();
    expect(stalled31?.type).toBe("stalled_deal");
    expect(stalled31?.daysWaiting).toBe(31);
  });

  it("sample WIP dealCount counts only deals with sample evidence and excludes unrelated deals", () => {
    const companyWithMixedDeals: CommercialCompany = {
      id: "c-mixed",
      title: "Компания со смешанными сделками",
      responsibleId: "1",
      direction: [],
      productType: [],
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals: [
        {
          id: "deal-sample-1",
          title: "Сделка на испытании",
          companyId: "c-mixed",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 100_000,
          currencyId: "RUB",
          sampleTestingStatus: ["На испытании"],
          productType: [],
          industry: [],
          direction: [],
        },
        {
          id: "deal-commercial-2",
          title: "Коммерческая сделка без образцов 1",
          companyId: "c-mixed",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 200_000,
          currencyId: "RUB",
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
        {
          id: "deal-commercial-3",
          title: "Коммерческая сделка без образцов 2",
          companyId: "c-mixed",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 300_000,
          currencyId: "RUB",
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
      ],
      hasAttention: false,
      attentionReasons: [],
    };

    const wip = computeWipMetrics([companyWithMixedDeals]);
    const inTestingWip = wip.find((w) => w.id === "На испытании")!;
    expect(inTestingWip.companyCount).toBe(1);
    // Exactly 1 deal matches sample status, unrelated commercial deals 2 and 3 are excluded
    expect(inTestingWip.dealCount).toBe(1);

    // Company with sample status on company card only and 2 commercial deals without sample status
    const companyCardOnly: CommercialCompany = {
      id: "c-card-only",
      title: "Компания со статусом только на карточке",
      responsibleId: "1",
      direction: [],
      productType: [],
      sampleStatus: "На испытании",
      sampleStatusSource: "COMPANY",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals: [
        {
          id: "deal-c1",
          title: "Сделка 1",
          companyId: "c-card-only",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 100_000,
          currencyId: "RUB",
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
        {
          id: "deal-c2",
          title: "Сделка 2",
          companyId: "c-card-only",
          responsibleId: "1",
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
    };

    const wipCard = computeWipMetrics([companyCardOnly]);
    const inTestingCardWip = wipCard.find((w) => w.id === "На испытании")!;
    expect(inTestingCardWip.companyCount).toBe(1);
    // Deal count is 0 because no deals carry sample testing evidence
    expect(inTestingCardWip.dealCount).toBe(0);
  });

  it("multiplicity: raw numeric deal transfer status wraps in UNCLASSIFIED_LABEL", () => {
    const rawDeal = {
      ID: "505",
      TITLE: "Сделка с неизвестным трансфером",
      COMPANY_ID: "107",
      ASSIGNED_BY_ID: "1",
      UF_CRM_1779386185: "9999", // Unknown numeric enum
    };
    const deals = normalizeDeals([rawDeal]);
    expect(deals[0].sampleTransferStatus).toBe("Не классифицировано (9999)");
  });

  it("sample register includes deal having only sampleTestingStatus", () => {
    const companyWithTestingOnlyDeal: CommercialCompany = {
      id: "c-testing-only",
      title: "Компания только с испытанием",
      responsibleId: "1",
      direction: [],
      productType: [],
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      deals: [
        {
          id: "deal-testing-only",
          title: "Сделка на испытании",
          companyId: "c-testing-only",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 150_000,
          currencyId: "RUB",
          sampleTestingStatus: ["На испытании", "Не классифицировано (265)"],
          productType: [],
          industry: [],
          direction: [],
        },
      ],
      hasAttention: false,
      attentionReasons: [],
    };

    const register = buildSampleRegister([companyWithTestingOnlyDeal], new Date(2026, 8, 24));
    expect(register).toHaveLength(1);
    expect(register[0].dealId).toBe("deal-testing-only");
    expect(register[0].statusSource).toBe("DEAL");
    expect(register[0].statuses).toContain("На испытании");
    expect(register[0].statuses).toContain("Не классифицировано (265)");
  });

  describe("Multi-Currency Monetary Correctness (P1 Invariants)", () => {
    const fixedNow = new Date(2026, 8, 24, 12, 0, 0); // 2026-09-24
    const filters: CommercialFilters = {
      periodPreset: "30days",
      responsibleId: "all",
      productType: "all",
      industry: "all",
      direction: "all",
      region: "all",
    };
    const bounds = computePeriodBoundaries(filters, fixedNow);

    it("Section 12: isolates currencies and never aggregates RUB + USD + EUR into one sum", () => {
      const companyA: CommercialCompany = {
        id: "comp-A",
        title: "Компания А",
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
            id: "deal-A",
            title: "Сделка А (RUB)",
            companyId: "comp-A",
            responsibleId: "1",
            stageId: "WON",
            categoryId: "0",
            opportunity: 1_000_000,
            currencyId: "RUB",
            paymentStatus: "113",
            paymentDate: "2026-09-15",
            productType: [],
            industry: [],
            direction: [],
            sampleTestingStatus: [],
          },
        ],
        hasAttention: false,
        attentionReasons: [],
      };

      const companyB: CommercialCompany = {
        id: "comp-B",
        title: "Компания Б",
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
            id: "deal-B",
            title: "Сделка Б (USD)",
            companyId: "comp-B",
            responsibleId: "1",
            stageId: "WON",
            categoryId: "0",
            opportunity: 20_000,
            currencyId: "USD",
            paymentStatus: "113",
            paymentDate: "2026-09-16",
            productType: [],
            industry: [],
            direction: [],
            sampleTestingStatus: [],
          },
        ],
        hasAttention: false,
        attentionReasons: [],
      };

      const companyC: CommercialCompany = {
        id: "comp-C",
        title: "Компания В",
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
            id: "deal-C",
            title: "Сделка В (EUR)",
            companyId: "comp-C",
            responsibleId: "1",
            stageId: "WON",
            categoryId: "0",
            opportunity: 10_000,
            currencyId: "EUR",
            paymentStatus: "113",
            paymentDate: "2026-09-17",
            productType: [],
            industry: [],
            direction: [],
            sampleTestingStatus: [],
          },
        ],
        hasAttention: false,
        attentionReasons: [],
      };

      const companyD: CommercialCompany = {
        id: "comp-D",
        title: "Компания Г",
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
            id: "deal-D",
            title: "Сделка Г (Unpaid USD)",
            companyId: "comp-D",
            responsibleId: "1",
            stageId: "EXECUTING",
            categoryId: "0",
            opportunity: 50_000,
            currencyId: "USD",
            paymentStatus: "103", // Unpaid
            paymentDate: "2026-09-18",
            productType: [],
            industry: [],
            direction: [],
            sampleTestingStatus: [],
          },
        ],
        hasAttention: false,
        attentionReasons: [],
      };

      const kpis = computePeriodMetrics([companyA, companyB, companyC, companyD], bounds);

      // Unique count must be strictly 3 unique paid companies
      const paymentsCountKpi = kpis.find((k) => k.id === "payments_received")!;
      expect(paymentsCountKpi.currentValue).toBe(3);
      expect(paymentsCountKpi.companyIds).toHaveLength(3);
      expect(paymentsCountKpi.companyIds).toContain("comp-A");
      expect(paymentsCountKpi.companyIds).toContain("comp-B");
      expect(paymentsCountKpi.companyIds).toContain("comp-C");
      expect(paymentsCountKpi.companyIds).not.toContain("comp-D");

      // Monetary amount KPI must be isolated by currency
      const amountKpi = kpis.find((k) => k.id === "payment_amount")!;
      expect(amountKpi.isMultiCurrency).toBe(true);
      expect(amountKpi.currentValue).toBeNull(); // No false single aggregate!
      expect(amountKpi.currencyBreakdown).toBeDefined();

      const currentBreakdown = amountKpi.currencyBreakdown!.current;
      expect(currentBreakdown.RUB).toBe(1_000_000);
      expect(currentBreakdown.USD).toBe(20_000);
      expect(currentBreakdown.EUR).toBe(10_000);

      // Unpaid deal 50,000 USD contributed 0
      expect(currentBreakdown.USD).not.toBe(70_000);

      // Hard check: NO 1,030,000 anywhere
      expect(JSON.stringify(amountKpi)).not.toContain("1030000");
    });

    it("Section 13: calculates per-currency delta without cross-currency global delta", () => {
      // CURRENT: RUB 1,000,000; USD 20,000
      // PREVIOUS: RUB 800,000; USD 30,000; EUR 5,000
      const currentDealA: CommercialDeal = {
        id: "d-curr-1",
        title: "Сделка Текущая RUB",
        companyId: "c-1",
        responsibleId: "1",
        stageId: "WON",
        categoryId: "0",
        opportunity: 1_000_000,
        currencyId: "RUB",
        paymentStatus: "113",
        paymentDate: "2026-09-10", // In current period (2026-08-25 to 2026-09-24)
        sampleTestingStatus: [],
        productType: [],
        industry: [],
        direction: [],
      };
      const currentDealB: CommercialDeal = {
        id: "d-curr-2",
        title: "Сделка Текущая USD",
        companyId: "c-2",
        responsibleId: "1",
        stageId: "WON",
        categoryId: "0",
        opportunity: 20_000,
        currencyId: "USD",
        paymentStatus: "113",
        paymentDate: "2026-09-12",
        sampleTestingStatus: [],
        productType: [],
        industry: [],
        direction: [],
      };

      const prevDealA: CommercialDeal = {
        id: "d-prev-1",
        title: "Сделка Прошлая RUB",
        companyId: "c-3",
        responsibleId: "1",
        stageId: "WON",
        categoryId: "0",
        opportunity: 800_000,
        currencyId: "RUB",
        paymentStatus: "113",
        paymentDate: "2026-08-10", // In previous period (2026-07-26 to 2026-08-24)
        sampleTestingStatus: [],
        productType: [],
        industry: [],
        direction: [],
      };
      const prevDealB: CommercialDeal = {
        id: "d-prev-2",
        title: "Сделка Прошлая USD",
        companyId: "c-4",
        responsibleId: "1",
        stageId: "WON",
        categoryId: "0",
        opportunity: 30_000,
        currencyId: "USD",
        paymentStatus: "113",
        paymentDate: "2026-08-12",
        sampleTestingStatus: [],
        productType: [],
        industry: [],
        direction: [],
      };
      const prevDealC: CommercialDeal = {
        id: "d-prev-3",
        title: "Сделка Прошлая EUR",
        companyId: "c-5",
        responsibleId: "1",
        stageId: "WON",
        categoryId: "0",
        opportunity: 5_000,
        currencyId: "EUR",
        paymentStatus: "113",
        paymentDate: "2026-08-14",
        sampleTestingStatus: [],
        productType: [],
        industry: [],
        direction: [],
      };

      const makeCompany = (id: string, deals: CommercialDeal[]): CommercialCompany => ({
        id,
        title: `Компания ${id}`,
        responsibleId: "1",
        direction: [],
        productType: [],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals,
        hasAttention: false,
        attentionReasons: [],
      });

      const companies = [
        makeCompany("c-1", [currentDealA]),
        makeCompany("c-2", [currentDealB]),
        makeCompany("c-3", [prevDealA]),
        makeCompany("c-4", [prevDealB]),
        makeCompany("c-5", [prevDealC]),
      ];

      const kpis = computePeriodMetrics(companies, bounds);
      const amountKpi = kpis.find((k) => k.id === "payment_amount")!;

      expect(amountKpi.isMultiCurrency).toBe(true);
      expect(amountKpi.currentValue).toBeNull();
      expect(amountKpi.previousValue).toBeNull();
      expect(amountKpi.delta).toBeNull(); // No cross-currency delta!

      const currBreakdown = amountKpi.currencyBreakdown!.current;
      const prevBreakdown = amountKpi.currencyBreakdown!.previous;

      expect(currBreakdown.RUB).toBe(1_000_000);
      expect(currBreakdown.USD).toBe(20_000);
      expect(currBreakdown.EUR).toBeUndefined();

      expect(prevBreakdown.RUB).toBe(800_000);
      expect(prevBreakdown.USD).toBe(30_000);
      expect(prevBreakdown.EUR).toBe(5_000);

      // Independent currency deltas
      const rubDelta = (currBreakdown.RUB || 0) - (prevBreakdown.RUB || 0);
      expect(rubDelta).toBe(200_000);

      const usdDelta = (currBreakdown.USD || 0) - (prevBreakdown.USD || 0);
      expect(usdDelta).toBe(-10_000);

      const eurDelta = (currBreakdown.EUR || 0) - (prevBreakdown.EUR || 0);
      expect(eurDelta).toBe(-5_000);
    });
  });

  describe("Currency Normalization & Truthful Formatting", () => {
    it("normalizeCurrencyCode handles all standard and edge cases correctly", () => {
      expect(normalizeCurrencyCode("RUB")).toBe("RUB");
      expect(normalizeCurrencyCode("rub")).toBe("RUB");
      expect(normalizeCurrencyCode("RUR")).toBe("RUB");
      expect(normalizeCurrencyCode("rur")).toBe("RUB");
      expect(normalizeCurrencyCode("USD")).toBe("USD");
      expect(normalizeCurrencyCode("usd")).toBe("USD");
      expect(normalizeCurrencyCode("EUR")).toBe("EUR");
      expect(normalizeCurrencyCode("eur")).toBe("EUR");
      expect(normalizeCurrencyCode("GBP")).toBe("GBP");
      expect(normalizeCurrencyCode("CNY")).toBe("CNY");
      expect(normalizeCurrencyCode("")).toBe("UNKNOWN");
      expect(normalizeCurrencyCode("   ")).toBe("UNKNOWN");
      expect(normalizeCurrencyCode(null)).toBe("UNKNOWN");
      expect(normalizeCurrencyCode(undefined)).toBe("UNKNOWN");
    });

    it("getCurrencySymbol provides correct symbol without assuming RUB", () => {
      expect(getCurrencySymbol("RUB")).toBe("₽");
      expect(getCurrencySymbol("USD")).toBe("$");
      expect(getCurrencySymbol("EUR")).toBe("€");
      expect(getCurrencySymbol("UNKNOWN")).toBe("валюта не указана");
      expect(getCurrencySymbol(null)).toBe("валюта не указана");
      expect(getCurrencySymbol(undefined)).toBe("валюта не указана");
      expect(getCurrencySymbol("GBP")).toBe("GBP");
    });

    it("formatCurrencyAmount formats truthfully and never forces RUB on missing currency", () => {
      expect(formatCurrencyAmount(1_000_000, "RUB")).toBe("1\u00A0000\u00A0000 ₽");
      expect(formatCurrencyAmount(25_000, "USD")).toBe("25\u00A0000 $");
      expect(formatCurrencyAmount(5_000, "EUR")).toBe("5\u00A0000 €");
      expect(formatCurrencyAmount(10_000, "UNKNOWN")).toBe("10\u00A0000 — валюта не указана");
      expect(formatCurrencyAmount(10_000, null)).toBe("10\u00A0000 — валюта не указана");
      expect(formatCurrencyAmount(10_000, undefined)).toBe("10\u00A0000 — валюта не указана");
      expect(formatCurrencyAmount(10_000, "")).toBe("10\u00A0000 — валюта не указана");
    });

    it("computeManagerScorecard isolates currencies per manager without cross-summation", () => {
      const bounds = computePeriodBoundaries({ periodPreset: "30days" }, new Date(2026, 8, 24));
      const makeDeal = (id: string, amount: number, currency: string, responsibleId: string): CommercialDeal => ({
        id,
        title: `Сделка ${id}`,
        companyId: `c-${id}`,
        responsibleId,
        stageId: "WON",
        categoryId: "0",
        opportunity: amount,
        currencyId: currency,
        paymentStatus: "113", // Paid
        paymentDate: "2026-09-10",
        sampleTestingStatus: [],
        productType: [],
        industry: [],
        direction: [],
      });

      const makeCompany = (id: string, deals: CommercialDeal[], responsibleId: string): CommercialCompany => ({
        id,
        title: `Компания ${id}`,
        responsibleId,
        responsibleName: `Менеджер ${responsibleId}`,
        sampleStatus: "Не требуется",
        sampleStatusSource: "NONE",
        gradeGel: [],
        gradeSol: [],
        productType: [],
        direction: [],
        sampleAllDates: [],
        deals,
        hasAttention: false,
        attentionReasons: [],
      });

      const companies: CommercialCompany[] = [
        makeCompany("c-1", [makeDeal("d-1", 1_000_000, "RUB", "mgr-1")], "mgr-1"),
        makeCompany("c-2", [makeDeal("d-2", 15_000, "USD", "mgr-1")], "mgr-1"),
        makeCompany("c-3", [makeDeal("d-3", 5_000, "EUR", "mgr-2")], "mgr-2"),
      ];

      const scorecard = computeManagerScorecard(companies, bounds);
      const mgr1 = scorecard.find((m) => m.responsibleId === "mgr-1")!;
      const mgr2 = scorecard.find((m) => m.responsibleId === "mgr-2")!;

      expect(mgr1).toBeDefined();
      expect(mgr1.paymentsReceived).toBe(2);
      expect(mgr1.paymentAmountsByCurrency).toEqual({
        RUB: 1_000_000,
        USD: 15_000,
      });

      expect(mgr2).toBeDefined();
      expect(mgr2.paymentsReceived).toBe(1);
      expect(mgr2.paymentAmountsByCurrency).toEqual({
        EUR: 5_000,
      });
    });
  });
});
