import { describe, it, expect } from "vitest";
import {
  applyCanonicalSampleDomain,
  isCrmClassificationEmpty,
  cleanCrmClassificationString,
  toCrmClassificationArray,
  normalizeCompanies,
  reprojectCompanyForFilteredGrain,
} from "@/lib/commercial-funnel/normalize";
import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
import {
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
} from "@/lib/crm-constants";

/** Phase C helper: canonical pipeline over raw CommercialDeal objects. */
function canonicalFromDeals(
  rawCompanies: Array<Record<string, unknown>>,
  deals: CommercialDeal[]
): CommercialCompany[] {
  const rawDeals = deals.map((d) => ({
    ID: d.id,
    COMPANY_ID: d.companyId,
    ASSIGNED_BY_ID: d.responsibleId,
    STAGE_ID: d.stageId,
    DATE_CREATE: d.dateCreate,
    ...(d.sampleTransferStatus
      ? {
          [DEAL_SAMPLE_TRANSFER_FIELD_ID]:
            // Reverse-map known labels to stage IDs for the canonical adapter.
            ({
              "На испытании": "DT1032_15:CLIENT",
              "Подошли": "DT1032_15:SUCCESS",
              "Не подошли": "DT1032_15:FAIL",
              "Образцы отправлены": "DT1032_15:UC_ZARRMX",
              "Подготовка к отправке": "DT1032_15:NEW",
            } as Record<string, string>)[d.sampleTransferStatus] ?? d.sampleTransferStatus,
        }
      : {}),
    ...(d.sampleSentDate ? { [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: d.sampleSentDate } : {}),
    ...(d.productType.length ? { UF_CRM_69257BBACD471: d.productType } : {}),
  }));
  const normalized = normalizeCompanies(rawCompanies, deals);
  const domain = buildCanonicalSampleDomain(rawCompanies as any, rawDeals as any, []);
  return applyCanonicalSampleDomain(normalized, domain);
}
import {
  computePeriodMetrics,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import {
  CommercialCompany,
  CommercialDeal,
} from "@/lib/commercial-funnel/types";

describe("Commercial Funnel Remediation — Targeted Tests (T1 - T10)", () => {
  // --------------------------------------------------------------------------
  // T1: Sentinels cleanup
  // --------------------------------------------------------------------------
  it("T1: cleanses Bitrix sentinel values (null, undefined, false, 'false', 'null', 'undefined', '')", () => {
    expect(isCrmClassificationEmpty(null)).toBe(true);
    expect(isCrmClassificationEmpty(undefined)).toBe(true);
    expect(isCrmClassificationEmpty(false)).toBe(true);
    expect(isCrmClassificationEmpty("")).toBe(true);
    expect(isCrmClassificationEmpty("   ")).toBe(true);
    expect(isCrmClassificationEmpty("false")).toBe(true);
    expect(isCrmClassificationEmpty("False")).toBe(true);
    expect(isCrmClassificationEmpty("FALSE")).toBe(true);
    expect(isCrmClassificationEmpty("null")).toBe(true);
    expect(isCrmClassificationEmpty("NULL")).toBe(true);
    expect(isCrmClassificationEmpty("undefined")).toBe(true);

    expect(cleanCrmClassificationString("false")).toBeUndefined();
    expect(cleanCrmClassificationString("null")).toBeUndefined();
    expect(cleanCrmClassificationString("undefined")).toBeUndefined();
    expect(cleanCrmClassificationString("")).toBeUndefined();
    expect(cleanCrmClassificationString("  ")).toBeUndefined();

    const arr = toCrmClassificationArray([
      "false",
      null,
      "undefined",
      "",
      "101",
      "null",
      false,
    ]);
    expect(arr).toEqual(["101"]);
  });

  // --------------------------------------------------------------------------
  // T2: Preserves valid enum strings including '0', '265', '9999'
  // --------------------------------------------------------------------------
  it("T2: preserves unknown or numerical zero enum values ('0', '265', '9999')", () => {
    expect(isCrmClassificationEmpty("0")).toBe(false);
    expect(isCrmClassificationEmpty("265")).toBe(false);
    expect(isCrmClassificationEmpty("9999")).toBe(false);

    expect(cleanCrmClassificationString("0")).toBe("0");
    expect(cleanCrmClassificationString("265")).toBe("265");
    expect(cleanCrmClassificationString("9999")).toBe("9999");

    const arr = toCrmClassificationArray(["0", "265", "9999", "false", null]);
    expect(arr).toEqual(["0", "265", "9999"]);
  });

  // --------------------------------------------------------------------------
  // T3: Filtered WIP status reflects ONLY matching deals
  // --------------------------------------------------------------------------
  it("T3: when filtering by product, WIP sample status reflects ONLY matching deals", () => {
    const rawCompany = {
      ID: "1",
      TITLE: "Тест Компания 1",
      ASSIGNED_BY_ID: "10",
      DATE_CREATE: "2026-08-01",
      UF_CRM_69257BBAB86F6: ["Гель", "Золь"], // Product types at company level
    };

    const dealGel: CommercialDeal = {
      id: "101",
      title: "Сделка Гель (Тестирование)",
      companyId: "1",
      responsibleId: "10",
      stageId: "C4:EXECUTING",
      categoryId: "0",
      opportunity: 100000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      dateCreate: "2026-08-01",
      sampleTransferStatus: "На испытании",
      sampleTestingStatus: ["На испытании"],
      sampleSentDate: "2026-08-05",
      productType: ["Гель"],
      direction: [],
      industry: [],
    };

    const dealSol: CommercialDeal = {
      id: "102",
      title: "Сделка Золь (Успех)",
      companyId: "1",
      responsibleId: "10",
      stageId: "C4:WON",
      categoryId: "0",
      opportunity: 200000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      dateCreate: "2026-08-10",
      sampleTransferStatus: "Подошли",
      sampleTestingStatus: ["Подошли"],
      sampleSentDate: "2026-08-15",
      productType: ["Золь"],
      direction: [],
      industry: [],
    };

    const companies = canonicalFromDeals([rawCompany], [dealGel, dealSol]);
    expect(companies).toHaveLength(1);

    // Filter by productType = "Гель"
    const filteredForGel = filterCompaniesByDimensions(companies, {
      periodPreset: "30days",
      responsibleId: "all",
      productType: "Гель",
      industry: "all",
      direction: "all",
      region: "all",
    });

    expect(filteredForGel).toHaveLength(1);
    const projGel = filteredForGel[0];
    // Under Defect C: deals are not pruned by productType filter.
    // The company matches because its company productType contains "Гель",
    // and all company deals remain intact to prevent undercount in KPIs.
    expect(projGel.deals).toHaveLength(2);
    expect(projGel.deals.map((d) => d.id).sort()).toEqual(["101", "102"]);
    expect(projGel.sampleStatus).toBe("Подошли");
    expect(projGel.sampleStatusSource).toBe("DEAL");
  });

  // --------------------------------------------------------------------------
  // T4: Filtered event date does NOT leak from non-matching companies
  // --------------------------------------------------------------------------
  it("T4: shipment date of non-matching company does not leak into company metrics", () => {
    const rawCompanyGel = {
      ID: "2",
      TITLE: "Тест Компания Гель",
      ASSIGNED_BY_ID: "10",
      DATE_CREATE: "2026-08-01",
      UF_CRM_69257BBAB86F6: ["Гель"],
    };

    const rawCompanySol = {
      ID: "3",
      TITLE: "Тест Компания Золь",
      ASSIGNED_BY_ID: "10",
      DATE_CREATE: "2026-08-01",
      UF_CRM_69257BBAB86F6: ["Золь"],
    };

    // Deal Gel: sent in August 2026
    const dealGel: CommercialDeal = {
      id: "201",
      title: "Сделка Гель",
      companyId: "2",
      responsibleId: "10",
      stageId: "C4:PREPARATION",
      categoryId: "0",
      opportunity: 50000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      dateCreate: "2026-08-01",
      sampleTransferStatus: "Образцы отправлены",
      sampleTestingStatus: [],
      sampleSentDate: "2026-08-10", // Sent in August
      productType: ["Гель"],
      direction: [],
      industry: [],
    };

    // Deal Sol: sent in September 2026
    const dealSol: CommercialDeal = {
      id: "202",
      title: "Сделка Золь",
      companyId: "3",
      responsibleId: "10",
      stageId: "C4:PREPARATION",
      categoryId: "0",
      opportunity: 75000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      dateCreate: "2026-08-10",
      sampleTransferStatus: "Образцы отправлены",
      sampleTestingStatus: [],
      sampleSentDate: "2026-09-10", // Sent in September
      productType: ["Золь"],
      direction: [],
      industry: [],
    };

    const companies = canonicalFromDeals(
      [rawCompanyGel, rawCompanySol],
      [dealGel, dealSol]
    );
    const boundaries = computePeriodBoundaries({
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
    });

    // Unfiltered: company 3 has sample shipment in September via Deal Sol
    const metricsUnfiltered = computePeriodMetrics(companies, boundaries);
    const samplesKpiUnfiltered = metricsUnfiltered.find(
      (k) => k.id === "samples_sent"
    )!;
    expect(samplesKpiUnfiltered.currentValue).toBe(1);

    // Filtered by Gel: Company 3 (Золь) is excluded! Deal Gel was sent in August, NOT September.
    const filteredForGel = filterCompaniesByDimensions(companies, {
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
      responsibleId: "all",
      productType: "Гель",
      industry: "all",
      direction: "all",
      region: "all",
    });
    expect(filteredForGel).toHaveLength(1);
    expect(filteredForGel[0].id).toBe("2");
    const metricsGel = computePeriodMetrics(filteredForGel, boundaries);
    const samplesKpiGel = metricsGel.find((k) => k.id === "samples_sent")!;
    expect(samplesKpiGel.currentValue).toBe(0);
    expect(samplesKpiGel.companyIds).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // T5: Company fallback isolation
  // --------------------------------------------------------------------------
  it("T5: company fallback applies only when matching deals have no sample evidence and company matches", () => {
    // Case 1: Company has fallback sample info, matching deal has NO sample info -> fallback used
    const compWithFallback: CommercialCompany = {
      id: "10",
      title: "Компания Fallback",
      responsibleId: "1",
      dateCreate: "2026-08-01",
      direction: ["Direct1"],
      productType: ["Гель"],
      sampleStatus: "Образцы отправлены",
      sampleStatusSource: "COMPANY",
      sampleShipmentDate: "2026-09-05",
      sampleCompanyTransferDates: ["2026-09-05"],
      sampleAllDates: ["2026-09-05"],
      sampleStatusEntries: [
        {
          label: "Образцы отправлены",
          rawValue: "261",
          source: "COMPANY",
          fieldId: "UF_CRM_1753187313314",
          eventDate: "2026-09-05",
        },
      ],
      gradeGel: ["101"],
      gradeSol: [],
      hasAttention: false,
      attentionReasons: [],
      deals: [
        {
          id: "1001",
          title: "Сделка без образца",
          companyId: "10",
          responsibleId: "1",
          dateCreate: "2026-08-01",
          stageId: "C4:NEW",
          categoryId: "0",
          opportunity: 10000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
          direction: ["Direct1"],
          productType: ["Гель"],
          industry: [],
          sampleTestingStatus: [],
        },
      ],
    };

    // When filtering by Gel (both company and deal match):
    const proj = reprojectCompanyForFilteredGrain(
      compWithFallback,
      compWithFallback.deals,
      true
    );
    expect(proj.sampleStatus).toBe("Образцы отправлены");
    expect(proj.sampleStatusSource).toBe("COMPANY");
    expect(proj.sampleShipmentDate).toBe("2026-09-05");

    // Case 2: Company does NOT match filter (companyMatches = false), but deal matches:
    // Company fallback must NOT leak!
    const projNoCompanyMatch = reprojectCompanyForFilteredGrain(
      compWithFallback,
      compWithFallback.deals,
      false // company does not match
    );
    expect(projNoCompanyMatch.sampleStatus).toBe("—");
    expect(projNoCompanyMatch.sampleStatusSource).toBe("NONE");
    expect(projNoCompanyMatch.sampleShipmentDate).toBeFalsy();
  });

  // --------------------------------------------------------------------------
  // T6: Null delta when comparison is unavailable
  // --------------------------------------------------------------------------
  it("T6: null delta when comparison is unavailable (e.g. all-time preset)", () => {
    const comp: CommercialCompany = {
      id: "20",
      title: "Компания All Time",
      responsibleId: "1",
      dateCreate: "2026-05-01",
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleShipmentDate: undefined,
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      hasAttention: false,
      attentionReasons: [],
      deals: [
        {
          id: "2001",
          title: "Сделка",
          companyId: "20",
          responsibleId: "1",
          dateCreate: "2026-05-01",
          stageId: "C4:WON",
          categoryId: "0",
          opportunity: 50000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
          direction: [],
          productType: [],
          industry: [],
          sampleTestingStatus: [],
          paymentStatus: "113",
          paymentDate: "2026-05-02",
        },
      ],
    };

    const allTimeBoundaries = computePeriodBoundaries({ periodPreset: "all" });
    expect(allTimeBoundaries.isAllTime).toBe(true);
    expect(allTimeBoundaries.comparisonAvailable).toBe(false);

    const metrics = computePeriodMetrics([comp], allTimeBoundaries);
    for (const kpi of metrics) {
      expect(kpi.delta).toBeNull();
      expect(kpi.deltaPercent).toBeNull();
      expect(kpi.comparisonAvailable).toBe(false);
    }
  });

  // --------------------------------------------------------------------------
  // T7: Zero denominator: previous = 0, current > 0 -> deltaPercent is null
  // --------------------------------------------------------------------------
  it("T7: zero denominator yields null deltaPercent (never infinity)", () => {
    const comp: CommercialCompany = {
      id: "30",
      title: "Компания Тест Нулевая База",
      responsibleId: "1",
      dateCreate: "2026-09-10", // September only
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleShipmentDate: undefined,
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      hasAttention: false,
      attentionReasons: [],
      deals: [
        {
          id: "3001",
          title: "Сделка в сентябре",
          companyId: "30",
          responsibleId: "1",
          dateCreate: "2026-09-10",
          stageId: "C4:NEW",
          categoryId: "0",
          opportunity: 100000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
          direction: [],
          productType: [],
          industry: [],
          sampleTestingStatus: [],
        },
      ],
    };

    // Current: Sept 1 - Sept 30. Previous: Aug 1 - Aug 31.
    const boundaries = computePeriodBoundaries({
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
    });
    const metrics = computePeriodMetrics([comp], boundaries);
    const newCompKpi = metrics.find((k) => k.id === "new_companies")!;

    expect(newCompKpi.currentValue).toBe(1);
    expect(newCompKpi.previousValue).toBe(0);
    expect(newCompKpi.delta).toBe(1);
    // When previous is 0 and current > 0, deltaPercent must be null
    expect(newCompKpi.deltaPercent).toBeNull();
  });

  // --------------------------------------------------------------------------
  // T8: PARTIAL financial data quality masks delta
  // --------------------------------------------------------------------------
  it("T8: PARTIAL financial data quality masks delta and deltaPercent to null", () => {
    const comp: CommercialCompany = {
      id: "40",
      title: "Компания Частичные Данные",
      responsibleId: "1",
      dateCreate: "2026-08-01",
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleShipmentDate: undefined,
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      hasAttention: false,
      attentionReasons: [],
      deals: [
        {
          id: "4001",
          title: "Сделка с неполной суммой",
          companyId: "40",
          responsibleId: "1",
          dateCreate: "2026-08-01",
          stageId: "C4:WON",
          categoryId: "0",
          opportunity: null, // Unset / missing financial amount
          opportunityQuality: "UNKNOWN",
          currencyId: "RUB",
          direction: [],
          productType: [],
          industry: [],
          sampleTestingStatus: [],
          paymentStatus: "113",
          paymentDate: "2026-09-10",
        },
      ],
    };

    const boundaries = computePeriodBoundaries({
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
    });
    const metrics = computePeriodMetrics([comp], boundaries);
    const payKpi = metrics.find((k) => k.id === "payment_amount")!;

    // Financial quality is UNKNOWN or PARTIAL because opportunity is null
    expect(["PARTIAL", "UNKNOWN"]).toContain(payKpi.amountQuality);
    expect(payKpi.delta).toBeNull();
    expect(payKpi.deltaPercent).toBeNull();
  });

  // --------------------------------------------------------------------------
  // T9: COMPLETE financial data quality computes delta
  // --------------------------------------------------------------------------
  it("T9: COMPLETE financial data quality computes delta accurately", () => {
    const comp: CommercialCompany = {
      id: "50",
      title: "Компания Полные Данные",
      responsibleId: "1",
      dateCreate: "2026-07-01",
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleShipmentDate: undefined,
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      hasAttention: false,
      attentionReasons: [],
      deals: [
        {
          id: "5001",
          title: "Оплата Август",
          companyId: "50",
          responsibleId: "1",
          dateCreate: "2026-07-01",
          stageId: "C4:WON",
          categoryId: "0",
          opportunity: 100000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
          direction: [],
          productType: [],
          industry: [],
          sampleTestingStatus: [],
          paymentStatus: "113",
          paymentDate: "2026-08-15",
        },
        {
          id: "5002",
          title: "Оплата Сентябрь",
          companyId: "50",
          responsibleId: "1",
          dateCreate: "2026-07-01",
          stageId: "C4:WON",
          categoryId: "0",
          opportunity: 150000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
          direction: [],
          productType: [],
          industry: [],
          sampleTestingStatus: [],
          paymentStatus: "113",
          paymentDate: "2026-09-15",
        },
      ],
    };

    const boundaries = computePeriodBoundaries({
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
    });
    const metrics = computePeriodMetrics([comp], boundaries);
    const payKpi = metrics.find((k) => k.id === "payment_amount")!;

    expect(payKpi.amountQuality).toBe("COMPLETE");
    expect(payKpi.currencyBreakdownQuality?.current?.["RUB"]).toBe("COMPLETE");
    expect(payKpi.currencyBreakdownQuality?.previous?.["RUB"]).toBe("COMPLETE");
    expect(payKpi.currentValue).toBe(150000);
    expect(payKpi.previousValue).toBe(100000);
    expect(payKpi.delta).toBe(50000);
    expect(payKpi.deltaPercent).toBe(50);
  });

  // --------------------------------------------------------------------------
  // T10: Multi-currency isolation
  // --------------------------------------------------------------------------
  it("T10: isolates currencies in financial metrics without cross-summation", () => {
    const comp: CommercialCompany = {
      id: "60",
      title: "Компания Мультивалютная",
      responsibleId: "1",
      dateCreate: "2026-08-01",
      direction: [],
      productType: [],
      sampleStatus: "—",
      sampleStatusSource: "NONE",
      sampleShipmentDate: undefined,
      sampleAllDates: [],
      gradeGel: [],
      gradeSol: [],
      hasAttention: false,
      attentionReasons: [],
      deals: [
        {
          id: "6001",
          title: "Оплата RUB",
          companyId: "60",
          responsibleId: "1",
          dateCreate: "2026-08-01",
          stageId: "C4:WON",
          categoryId: "0",
          opportunity: 300000,
          opportunityQuality: "VALID",
          currencyId: "RUB",
          direction: [],
          productType: [],
          industry: [],
          sampleTestingStatus: [],
          paymentStatus: "113",
          paymentDate: "2026-09-10",
        },
        {
          id: "6002",
          title: "Оплата USD",
          companyId: "60",
          responsibleId: "1",
          dateCreate: "2026-08-01",
          stageId: "C4:WON",
          categoryId: "0",
          opportunity: 5000,
          opportunityQuality: "VALID",
          currencyId: "USD",
          direction: [],
          productType: [],
          industry: [],
          sampleTestingStatus: [],
          paymentStatus: "113",
          paymentDate: "2026-09-12",
        },
      ],
    };

    const boundaries = computePeriodBoundaries({
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-30",
    });
    const metrics = computePeriodMetrics([comp], boundaries);
    const payKpi = metrics.find((k) => k.id === "payment_amount")!;

    expect(payKpi.isMultiCurrency).toBe(true);
    expect(payKpi.currencyBreakdown?.current?.["RUB"]).toBe(300000);
    expect(payKpi.currencyBreakdown?.current?.["USD"]).toBe(5000);
    // When multiple currencies exist, single global delta must be null
    expect(payKpi.delta).toBeNull();
    expect(payKpi.currentValue).toBeNull();
  });
});
