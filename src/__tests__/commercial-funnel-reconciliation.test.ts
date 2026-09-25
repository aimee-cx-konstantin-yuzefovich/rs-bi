// @vitest-environment node
// src/__tests__/commercial-funnel-reconciliation.test.ts
// Mandatory reconciliation tests:
// 1. KPI count === drill-down unique Company count
// 2. UI metrics === Excel source metrics for identical fixture and filters
// 3. Unique company counting under multiple deals

import { describe, expect, it } from "vitest";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import { generateDemoCommercialDataset } from "@/lib/commercial-funnel/demo-data";
import type { CommercialCompany, CommercialFilters } from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Mandatory Reconciliation Tests", () => {
  const dataset = generateDemoCommercialDataset();
  const fixedNow = new Date(2026, 8, 24, 12, 0, 0);
  const filters: CommercialFilters = {
    periodPreset: "30days",
    responsibleId: "all",
    productType: "all",
    industry: "all",
    direction: "all",
    region: "all",
  };
  const bounds = computePeriodBoundaries(filters, fixedNow);
  const filtered = filterCompaniesByDimensions(dataset.companies, filters);

  it("RECONCILIATION 1: Every dated KPI count equals drill-down unique company count", () => {
    const datedKpis = computePeriodMetrics(filtered, bounds);

    for (const kpi of datedKpis) {
      if (kpi.id === "payment_amount") {
        // Currency sum: verify unique company ids array is deduplicated
        const uniqueSet = new Set(kpi.companyIds);
        expect(kpi.companyIds.length).toBe(uniqueSet.size);
      } else {
        expect(kpi.currentValue).toBe(kpi.companyIds.length);
        const uniqueSet = new Set(kpi.companyIds);
        expect(kpi.companyIds.length).toBe(uniqueSet.size);
      }

      // Proves drill-down filter produces the EXACT same count
      const drillDownCompanies = filtered.filter((c) => kpi.companyIds.includes(c.id));
      expect(drillDownCompanies.length).toBe(kpi.companyIds.length);
    }
  });

  it("RECONCILIATION 2: Every WIP KPI count equals drill-down unique company count", () => {
    const wipKpis = computeWipMetrics(filtered);

    for (const wip of wipKpis) {
      expect(wip.companyCount).toBe(wip.companyIds.length);
      const uniqueSet = new Set(wip.companyIds);
      expect(wip.companyIds.length).toBe(uniqueSet.size);

      // Proves drill-down filter produces the EXACT same count
      const drillDownCompanies = filtered.filter((c) => wip.companyIds.includes(c.id));
      expect(drillDownCompanies.length).toBe(wip.companyIds.length);
    }
  });

  it("RECONCILIATION 3: UI metrics === Excel source metrics for identical fixture and filters", async () => {
    // 1. Calculate UI metrics
    const uiDatedKpis = computePeriodMetrics(filtered, bounds);
    const uiWipKpis = computeWipMetrics(filtered);
    const uiBottlenecks = computeBottlenecks(filtered, fixedNow);
    const uiManagers = computeManagerScorecard(
      filtered,
      bounds,
      uiBottlenecks,
      dataset.userNames
    );

    // 2. Generate Excel workbook
    const workbook = await createCommercialFunnelWorkbook({
      companies: dataset.companies,
      deals: dataset.deals,
      filters,
      userNames: dataset.userNames,
      now: fixedNow,
    });

    // 3. Verify Companies sheet matches filtered companies count exactly
    const companiesSheet = workbook.getWorksheet("Companies")!;
    expect(companiesSheet.rowCount - 6).toBe(filtered.length);

    // 4. Verify Bottlenecks sheet matches UI bottlenecks count exactly
    const bottlenecksSheet = workbook.getWorksheet("Bottlenecks")!;
    expect(bottlenecksSheet.rowCount - 6).toBe(uiBottlenecks.length);

    // 5. Verify Managers sheet matches UI managers scorecard count exactly
    const managersSheet = workbook.getWorksheet("Managers")!;
    expect(managersSheet.rowCount - 6).toBe(uiManagers.length);

    // 6. Verify Executive Summary sheet contains the exact dated KPI values
    const summarySheet = workbook.getWorksheet("Executive Summary")!;
    let foundNewCompanies = false;
    let foundPaymentsReceived = false;

    summarySheet.eachRow((row) => {
      const cell1 = String(row.getCell(1).value || "");
      if (cell1 === "Новые компании") {
        foundNewCompanies = true;
        const newCompUi = uiDatedKpis.find((k) => k.id === "new_companies")!;
        expect(row.getCell(2).value).toBe(newCompUi.currentValue);
        expect(row.getCell(6).value).toBe(newCompUi.companyIds.length);
      }
      if (cell1 === "Получено оплат") {
        foundPaymentsReceived = true;
        const paymentsUi = uiDatedKpis.find((k) => k.id === "payments_received")!;
        expect(row.getCell(2).value).toBe(paymentsUi.currentValue);
        expect(row.getCell(6).value).toBe(paymentsUi.companyIds.length);
      }
    });

    expect(foundNewCompanies).toBe(true);
    expect(foundPaymentsReceived).toBe(true);
  });

  it("RECONCILIATION 4: Multi-deal company never counted more than once in KPIs", () => {
    const multiDealCompany: CommercialCompany = {
      id: "999",
      title: "Мультисделочная Компания",
      responsibleId: "1",
      dateCreate: "2026-09-10",
      direction: [],
      productType: [],
      sampleStatus: "На испытании",
      sampleStatusSource: "DEAL",
      sampleShipmentDate: "2026-09-10",
      sampleAllDates: ["2026-09-10"],
      gradeGel: [],
      gradeSol: [],
      deals: [
        {
          id: "1",
          title: "Сделка А",
          companyId: "999",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 100_000,
          currencyId: "RUB",
          dateCreate: "2026-09-11",
          sampleTestingStatus: ["На испытании"],
          productType: [],
          industry: [],
          direction: [],
        },
        {
          id: "2",
          title: "Сделка Б",
          companyId: "999",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 200_000,
          currencyId: "RUB",
          dateCreate: "2026-09-12",
          sampleTestingStatus: ["На испытании"],
          productType: [],
          industry: [],
          direction: [],
        },
        {
          id: "3",
          title: "Сделка В",
          companyId: "999",
          responsibleId: "1",
          stageId: "EXECUTING",
          categoryId: "0",
          opportunity: 300_000,
          currencyId: "RUB",
          dateCreate: "2026-09-13",
          sampleTestingStatus: [],
          productType: [],
          industry: [],
          direction: [],
        },
      ],
      hasAttention: false,
      attentionReasons: [],
    };

    const kpis = computePeriodMetrics([multiDealCompany], bounds);
    const dealsCreatedKpi = kpis.find((k) => k.id === "deals_created")!;

    // 3 deals created in period, but unique company count is strictly 1
    expect(dealsCreatedKpi.currentValue).toBe(1);
    expect(dealsCreatedKpi.companyIds).toEqual(["999"]);

    const wip = computeWipMetrics([multiDealCompany]);
    const inTestingWip = wip.find((w) => w.id === "На испытании")!;
    expect(inTestingWip.companyCount).toBe(1);
    // Only the 2 deals matching the sample testing status are counted, excluding unrelated deal 3
    expect(inTestingWip.dealCount).toBe(2);
    expect(inTestingWip.companyIds).toEqual(["999"]);
  });
});
