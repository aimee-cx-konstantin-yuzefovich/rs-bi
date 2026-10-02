// @vitest-environment node
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
} from "@/lib/commercial-funnel/engine";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
} from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Legacy Period Presets Normalization to 30days", () => {
  const fixedNow = new Date("2026-09-24T12:00:00Z");

  const filters: CommercialFilters = {
    periodPreset: "all" as any,
    responsibleId: "all",
    productType: "all",
    industry: "all",
    direction: "all",
    region: "all",
  };

  const deal2022: CommercialDeal = {
    id: "deal-2022",
    title: "Сделка 2022",
    companyId: "c-2022",
    responsibleId: "u-1",
    responsibleName: "Менеджер 1",
    stageId: "C4:EXECUTING",
    categoryId: "0",
    dateCreate: "2022-03-20",
    sampleSentDate: "2022-04-01",
    opportunity: null,
    opportunityQuality: "UNKNOWN",
    currencyId: "RUB",
    productType: [],
    direction: [],
    industry: [],
  };

  const comp2022: CommercialCompany = {
    id: "c-2022",
    title: "Компания 2022",
    responsibleId: "u-1",
    responsibleName: "Менеджер 1",
    dateCreate: "2022-03-15",
    companyFactsIncluded: true,
    sampleStatus: "На испытании",
    sampleStatusSource: "DEAL",
    sampleResponsibleId: "u-1",
    sampleResponsibleName: "Менеджер 1",
    sampleShipmentDate: "2022-04-01",
    sampleEventDatesForPeriodMetrics: ["2022-04-01"],
    sampleAllDates: ["2022-04-01"],
    sampleSentEvents: [{ date: "2022-04-01", source: "DEAL", responsibleId: "u-1", dealId: "deal-2022" }],
    deals: [deal2022],
    productType: [],
    direction: [],
    gradeGel: [],
    gradeSol: [],
    hasAttention: false,
    attentionReasons: [],
  };

  const deal2024: CommercialDeal = {
    id: "deal-2024",
    title: "Сделка 2024",
    companyId: "c-2024",
    responsibleId: "u-1",
    responsibleName: "Менеджер 1",
    stageId: "C4:WON",
    categoryId: "0",
    dateCreate: "2024-06-15",
    paymentStatus: "113",
    paymentDate: "2024-07-01",
    opportunity: 300000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    shipmentDate: "2024-07-15",
    sampleTransferStatus: "Подошли",
    productType: [],
    direction: [],
    industry: [],
  };

  const comp2024: CommercialCompany = {
    id: "c-2024",
    title: "Компания 2024",
    responsibleId: "u-1",
    responsibleName: "Менеджер 1",
    dateCreate: "2024-06-10",
    companyFactsIncluded: true,
    sampleStatus: "Подошли",
    sampleStatusSource: "DEAL",
    sampleResponsibleId: "u-1",
    sampleResponsibleName: "Менеджер 1",
    deals: [deal2024],
    productType: [],
    direction: [],
    gradeGel: [],
    gradeSol: [],
    sampleAllDates: [],
    hasAttention: false,
    attentionReasons: [],
  };

  const allCompanies = [comp2022, comp2024];
  const allDeals = [deal2022, deal2024];
  const userNames = { "u-1": "Менеджер 1" };

  it("normalizes legacy preset 'all' to canonical 30days contract", async () => {
    const boundaries = computePeriodBoundaries(filters, fixedNow);
    const thirtyDaysBoundaries = computePeriodBoundaries({ periodPreset: "30days" }, fixedNow);

    expect(boundaries.currentStartStr).toBe(thirtyDaysBoundaries.currentStartStr);
    expect(boundaries.currentEndStr).toBe(thirtyDaysBoundaries.currentEndStr);
    expect(boundaries.comparisonAvailable).toBe(true);

    // Current WIP metrics remain active and independent of period boundaries
    const wipKpis = computeWipMetrics(allCompanies);
    const wipTesting = wipKpis.find((w) => w.id === "На испытании")!;
    expect(wipTesting.companyCount).toBe(1);
    expect(wipTesting.companyIds).toContain("c-2022");

    const wipSuccess = wipKpis.find((w) => w.id === "Подошли")!;
    expect(wipSuccess.companyCount).toBe(1);
    expect(wipSuccess.companyIds).toContain("c-2024");

    // Excel workbook receives normalized "30 дней"
    const workbook = await createCommercialFunnelWorkbook({
      companies: allCompanies,
      deals: allDeals,
      filters,
      userNames,
      now: fixedNow,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);

    const summarySheet = reloaded.getWorksheet("Executive Summary")!;
    let periodCellVal: any = undefined;
    summarySheet.eachRow((row) => {
      if (String(row.getCell(1).value || "").includes("Период анализа")) {
        periodCellVal = row.getCell(2).value;
      }
    });
    expect(String(periodCellVal)).toContain("30 дней");
    expect(String(periodCellVal)).not.toContain("За всё время");
  });

  it("normalizes all prohibited presets to 30days identically", () => {
    const prohibitedPresets = ["all", "quarter", "year", "365days", "unknown", "invalid"];
    const expected = computePeriodBoundaries({ periodPreset: "30days" }, fixedNow);

    for (const p of prohibitedPresets) {
      const b = computePeriodBoundaries({ periodPreset: p as any }, fixedNow);
      expect(b.currentStartStr).toBe(expected.currentStartStr);
      expect(b.currentEndStr).toBe(expected.currentEndStr);
      expect(b.comparisonAvailable).toBe(true);
    }
  });
});
