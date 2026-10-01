// @vitest-environment node
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
} from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — All-Time End-to-End Proof (Section 12)", () => {
  const fixedNow = new Date("2026-09-24T12:00:00Z");

  const filters: CommercialFilters = {
    periodPreset: "all",
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

  const deal2025: CommercialDeal = {
    id: "deal-2025",
    title: "Сделка 2025",
    companyId: "c-2025",
    responsibleId: "u-2",
    responsibleName: "Менеджер 2",
    stageId: "C4:WON",
    categoryId: "0",
    dateCreate: "2025-11-25",
    paymentStatus: "113",
    paymentDate: "2025-12-01",
    opportunity: 200000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    productType: [],
    direction: [],
    industry: [],
  };

  const comp2025: CommercialCompany = {
    id: "c-2025",
    title: "Компания 2025",
    responsibleId: "u-2",
    responsibleName: "Менеджер 2",
    dateCreate: "2025-11-20",
    companyFactsIncluded: true,
    sampleStatus: "—",
    sampleStatusSource: "NONE",
    deals: [deal2025],
    productType: [],
    direction: [],
    gradeGel: [],
    gradeSol: [],
    sampleAllDates: [],
    hasAttention: false,
    attentionReasons: [],
  };

  const deal2026: CommercialDeal = {
    id: "deal-2026",
    title: "Сделка 2026",
    companyId: "c-2026",
    responsibleId: "u-2",
    responsibleName: "Менеджер 2",
    stageId: "C4:EXECUTING",
    categoryId: "0",
    dateCreate: "2026-05-15",
    shipmentDate: "2026-05-20",
    opportunity: null,
    opportunityQuality: "UNKNOWN",
    currencyId: "RUB",
    productType: [],
    direction: [],
    industry: [],
  };

  const comp2026: CommercialCompany = {
    id: "c-2026",
    title: "Компания 2026",
    responsibleId: "u-2",
    responsibleName: "Менеджер 2",
    dateCreate: "2026-05-10",
    companyFactsIncluded: true,
    sampleStatus: "—",
    sampleStatusSource: "NONE",
    deals: [deal2026],
    productType: [],
    direction: [],
    gradeGel: [],
    gradeSol: [],
    sampleAllDates: [],
    hasAttention: false,
    attentionReasons: [],
  };

  // Negative case 1: invalid date strings
  const dealInvalid: CommercialDeal = {
    id: "deal-inv",
    title: "Сделка Невалидная",
    companyId: "c-inv",
    responsibleId: "u-1",
    stageId: "C4:WON",
    categoryId: "0",
    dateCreate: "invalid-deal-date-XYZ",
    sampleSentDate: "invalid-sample-date-XYZ",
    paymentStatus: "113",
    paymentDate: "invalid-payment-date-XYZ",
    opportunity: 888888,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    shipmentDate: "invalid-shipment-date-XYZ",
    productType: [],
    direction: [],
    industry: [],
  };

  const compInvalid: CommercialCompany = {
    id: "c-inv",
    title: "Компания Невалидная",
    responsibleId: "u-1",
    dateCreate: "invalid-date-create-XYZ",
    companyFactsIncluded: true,
    sampleStatus: "—",
    sampleStatusSource: "NONE",
    deals: [dealInvalid],
    productType: [],
    direction: [],
    gradeGel: [],
    gradeSol: [],
    sampleAllDates: [],
    hasAttention: false,
    attentionReasons: [],
  };

  // Negative case 2: future dates after `now` (2027)
  const dealFuture: CommercialDeal = {
    id: "deal-future",
    title: "Сделка Будущая",
    companyId: "c-future",
    responsibleId: "u-2",
    stageId: "C4:WON",
    categoryId: "0",
    dateCreate: "2027-01-20",
    sampleSentDate: "2027-02-01",
    paymentStatus: "113",
    paymentDate: "2027-03-01",
    opportunity: 999999,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    shipmentDate: "2027-03-15",
    productType: [],
    direction: [],
    industry: [],
  };

  const compFuture: CommercialCompany = {
    id: "c-future",
    title: "Компания Будущая",
    responsibleId: "u-2",
    dateCreate: "2027-01-15",
    companyFactsIncluded: true,
    sampleStatus: "—",
    sampleStatusSource: "NONE",
    deals: [dealFuture],
    productType: [],
    direction: [],
    gradeGel: [],
    gradeSol: [],
    sampleAllDates: [],
    hasAttention: false,
    attentionReasons: [],
  };

  const allCompanies = [comp2022, comp2024, comp2025, comp2026, compInvalid, compFuture];
  const allDeals = [deal2022, deal2024, deal2025, deal2026, dealInvalid, dealFuture];
  const userNames = { "u-1": "Менеджер 1", "u-2": "Менеджер 2" };

  it("proves complete all-time engine, scorecard, and Excel reconciliation (Points 1–14)", async () => {
    const boundaries = computePeriodBoundaries(filters, fixedNow);

    expect(boundaries.isAllTime).toBe(true);
    expect(boundaries.comparisonAvailable).toBe(false);
    expect(boundaries.currentStart).toBeNull();
    expect(boundaries.previousStart).toBeNull();
    expect(boundaries.previousEnd).toBeNull();

    const datedKpis = computePeriodMetrics(allCompanies, boundaries);
    const wipKpis = computeWipMetrics(allCompanies);
    const bottlenecks = computeBottlenecks(allCompanies, fixedNow);
    const scorecard = computeManagerScorecard(allCompanies, boundaries, bottlenecks, userNames);

    // 1. Every valid historical event <= currentEnd is counted:
    // - New companies: 2022, 2024, 2025, 2026 (4 companies)
    const kpiNew = datedKpis.find((k) => k.id === "new_companies")!;
    expect(kpiNew.currentValue).toBe(4);
    expect(kpiNew.companyIds).toContain("c-2022");
    expect(kpiNew.companyIds).toContain("c-2024");
    expect(kpiNew.companyIds).toContain("c-2025");
    expect(kpiNew.companyIds).toContain("c-2026");

    // 2. Invalid date is not counted
    expect(kpiNew.companyIds).not.toContain("c-inv");

    // 3. Future event is not counted
    expect(kpiNew.companyIds).not.toContain("c-future");

    // - Samples sent: 1 (2022 deal shipment)
    const kpiSamples = datedKpis.find((k) => k.id === "samples_sent")!;
    expect(kpiSamples.currentValue).toBe(1);
    expect(kpiSamples.companyIds).toContain("c-2022");

    // - Deals created: 4 (2022, 2024, 2025, 2026)
    const kpiDeals = datedKpis.find((k) => k.id === "deals_created")!;
    expect(kpiDeals.currentValue).toBe(4);

    // - Payments received: 2 (2024, 2025)
    const kpiPayments = datedKpis.find((k) => k.id === "payments_received")!;
    expect(kpiPayments.currentValue).toBe(2);

    // - Payment amount: 500,000 RUB (300k + 200k; 999,999 future deal excluded)
    const kpiAmount = datedKpis.find((k) => k.id === "payment_amount")!;
    expect(kpiAmount.currentValue).toBe(500000);
    expect(kpiAmount.amountQuality).toBe("COMPLETE");

    // - Shipments: 2 (2024, 2026)
    const kpiShipments = datedKpis.find((k) => k.id === "shipments")!;
    expect(kpiShipments.currentValue).toBe(2);

    // 4. previousValue = null for all dated KPIs
    // 5. delta = null
    // 6. deltaPercent = null
    // 7. comparisonAvailable = false
    for (const k of datedKpis) {
      expect(k.previousValue).toBeNull();
      expect(k.delta).toBeNull();
      expect(k.deltaPercent).toBeNull();
      expect(k.comparisonAvailable).toBe(false);
    }

    // 8. Current WIP still works normally
    const wipTesting = wipKpis.find((w) => w.id === "На испытании")!;
    expect(wipTesting.companyCount).toBe(1);
    expect(wipTesting.companyIds).toContain("c-2022");

    const wipSuccess = wipKpis.find((w) => w.id === "Подошли")!;
    expect(wipSuccess.companyCount).toBe(1);
    expect(wipSuccess.companyIds).toContain("c-2024");

    // 9. computeManagerScorecard sees all valid historical event metrics
    const mgr1 = scorecard.find((m) => m.responsibleId === "u-1")!;
    expect(mgr1).toBeDefined();
    expect(mgr1.newCompanies).toBe(2); // 2022, 2024
    expect(mgr1.samplesSent).toBe(1);
    expect(mgr1.inTesting).toBe(1);
    expect(mgr1.sampleSuccess).toBe(1);
    expect(mgr1.dealsCreated).toBe(2);
    expect(mgr1.paymentsReceived).toBe(1);
    expect(mgr1.paymentAmount).toBe(300000);

    const mgr2 = scorecard.find((m) => m.responsibleId === "u-2")!;
    expect(mgr2).toBeDefined();
    expect(mgr2.newCompanies).toBe(2); // 2025, 2026
    expect(mgr2.dealsCreated).toBe(2);
    expect(mgr2.paymentsReceived).toBe(1);
    expect(mgr2.paymentAmount).toBe(200000);

    // 10–14. Excel workbook end-to-end generation and reload
    const workbook = await createCommercialFunnelWorkbook({
      companies: allCompanies,
      deals: allDeals,
      filters,
      userNames,
      now: fixedNow,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    // 14. XLSX reload succeeds
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);

    const summarySheet = reloaded.getWorksheet("Executive Summary")!;

    // 10. Excel shows "За всё время"
    let periodCellVal: any = undefined;
    summarySheet.eachRow((row) => {
      if (String(row.getCell(1).value || "").includes("Период анализа")) {
        periodCellVal = row.getCell(2).value;
      }
    });
    expect(String(periodCellVal)).toContain("За всё время");

    // Inspect Section 1 KPI rows
    const excelRows: Record<string, { curr: any; prev: any; delta: any; pct: any }> = {};
    let inSection1 = false;
    summarySheet.eachRow((row) => {
      const col1 = String(row.getCell(1).value || "");
      if (col1 === "Метрика") {
        inSection1 = true;
        return;
      }
      if (col1.includes("ТЕКУЩИЙ ПОРТФЕЛЬ")) {
        inSection1 = false;
        return;
      }
      if (inSection1 && col1.trim().length > 0) {
        excelRows[col1] = {
          curr: row.getCell(2).value,
          prev: row.getCell(3).value,
          delta: row.getCell(4).value,
          pct: row.getCell(5).value,
        };
      }
    });

    // 11. Excel previous period is "—"
    // 12. Excel comparison columns are unavailable ("—"), not zero
    // 13. Excel current amounts/counts reconcile exactly with engine
    for (const [lbl, row] of Object.entries(excelRows)) {
      expect(row.prev).toBe("—");
      expect(row.delta).toBe("—");
      expect(row.pct).toBe("—");
    }

    const newRow = Object.entries(excelRows).find(([k]) => k.includes("Новые компании"))![1];
    expect(newRow.curr).toBe(4);

    const samplesRow = Object.entries(excelRows).find(([k]) => k.includes("образц"))![1];
    expect(samplesRow.curr).toBe(1);

    const dealsRow = Object.entries(excelRows).find(([k]) => k.includes("созданными сделками"))![1];
    expect(dealsRow.curr).toBe(4);

    const paymentsRow = Object.entries(excelRows).find(([k]) => k.includes("полученной оплатой") && !k.includes("Сумма"))![1];
    expect(paymentsRow.curr).toBe(2);

    const amtRow = Object.entries(excelRows).find(([k]) => k.includes("Сумма сделок"))![1];
    expect(amtRow.curr).toBe(500000);

    const shipRow = Object.entries(excelRows).find(([k]) => k.toLowerCase().includes("отгруз"))![1];
    expect(shipRow.curr).toBe(2);
  });
});
