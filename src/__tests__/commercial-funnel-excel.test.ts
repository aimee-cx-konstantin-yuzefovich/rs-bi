// @vitest-environment node
// src/__tests__/commercial-funnel-excel.test.ts
// Unit tests for the 5-sheet Commercial Funnel Excel export.

import { describe, expect, it } from "vitest";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import { generateDemoCommercialDataset } from "@/lib/commercial-funnel/demo-data";
import { computeBottlenecks, computeManagerScorecard, computePeriodMetrics, computeWipMetrics } from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import type { CommercialFilters } from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Excel Export", () => {
  const demoData = generateDemoCommercialDataset();
  const filters: CommercialFilters = {
    periodPreset: "30days",
    responsibleId: "all",
    productType: "all",
    industry: "all",
    direction: "all",
    region: "all",
  };
  const fixedNow = new Date(2026, 8, 24, 12, 0, 0);

  it("creates exactly the 5 required management sheets", async () => {
    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters,
      userNames: demoData.userNames,
      now: fixedNow,
    });

    const sheetNames = workbook.worksheets.map((s) => s.name);
    expect(sheetNames).toEqual([
      "Executive Summary",
      "Companies",
      "Samples",
      "Managers",
      "Bottlenecks",
    ]);
  });

  it("reconciles metric counts between engine and Excel sheets", async () => {
    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters,
      userNames: demoData.userNames,
      now: fixedNow,
    });

    const companiesSheet = workbook.getWorksheet("Companies")!;
    // Row 1 is header, data rows start at row 2
    const excelCompanyRowCount = companiesSheet.rowCount - 1;
    expect(excelCompanyRowCount).toBe(demoData.companies.length);

    const bottlenecksSheet = workbook.getWorksheet("Bottlenecks")!;
    const engineBottlenecks = computeBottlenecks(demoData.companies, fixedNow);
    const excelBottlenecksRowCount = bottlenecksSheet.rowCount - 1;
    expect(excelBottlenecksRowCount).toBe(engineBottlenecks.length);

    const bounds = computePeriodBoundaries(filters, fixedNow);
    const engineManagers = computeManagerScorecard(
      demoData.companies,
      bounds,
      engineBottlenecks,
      demoData.userNames
    );
    const managersSheet = workbook.getWorksheet("Managers")!;
    const excelManagersRowCount = managersSheet.rowCount - 1;
    expect(excelManagersRowCount).toBe(engineManagers.length);
  });

  it("produces valid binary xlsx buffer without error", async () => {
    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters,
      userNames: demoData.userNames,
      now: fixedNow,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it("exports dates as native Excel Date objects with dd.mm.yyyy numFmt and nulls for absent dates", async () => {
    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters,
      userNames: demoData.userNames,
      now: fixedNow,
    });

    const companiesSheet = workbook.getWorksheet("Companies")!;
    let verifiedDateCreate = false;
    let verifiedNullDate = false;

    // Iterate data rows (row 2 onwards)
    companiesSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      // Col 4: dateCreate
      const dateCreateCell = row.getCell(4);
      if (dateCreateCell.value !== null) {
        expect(dateCreateCell.value).toBeInstanceOf(Date);
        expect(dateCreateCell.numFmt).toBe("dd.mm.yyyy");
        verifiedDateCreate = true;
      }
      // Col 10: sampleDate
      const sampleDateCell = row.getCell(10);
      if (sampleDateCell.value !== null) {
        expect(sampleDateCell.value).toBeInstanceOf(Date);
        expect(sampleDateCell.numFmt).toBe("dd.mm.yyyy");
      } else {
        expect(sampleDateCell.value).toBeNull();
        verifiedNullDate = true;
      }
    });

    expect(verifiedDateCreate).toBe(true);
    expect(verifiedNullDate).toBe(true);

    const samplesSheet = workbook.getWorksheet("Samples")!;
    samplesSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      // Col 7: shipmentDate
      const shipmentCell = row.getCell(7);
      if (shipmentCell.value !== null) {
        expect(shipmentCell.value).toBeInstanceOf(Date);
        expect(shipmentCell.numFmt).toBe("dd.mm.yyyy");
      } else {
        expect(shipmentCell.value).toBeNull();
      }
    });
  });

  it("includes full filter disclosures and truthful payment KPI label in Executive Summary", async () => {
    const customFilters: CommercialFilters = {
      periodPreset: "custom",
      customFrom: "2026-09-01",
      customTo: "2026-09-15",
      responsibleId: "user-1",
      productType: "Гель",
      industry: "Химия",
      direction: "Агрохимия",
      region: "Москва",
    };

    const workbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters: customFilters,
      userNames: { "user-1": "Иван Тестов" },
      now: fixedNow,
    });

    const summarySheet = workbook.getWorksheet("Executive Summary")!;
    const allCellTexts: string[] = [];
    summarySheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value) allCellTexts.push(String(cell.value));
      });
    });

    // Timezone disclosure
    expect(allCellTexts.some((t) => t.includes("Europe/Moscow"))).toBe(true);
    // Period disclosure
    expect(allCellTexts.some((t) => t.includes("2026-09-01 — 2026-09-15"))).toBe(true);
    // Filters disclosure
    expect(allCellTexts.some((t) => t.includes("Иван Тестов"))).toBe(true);
    expect(allCellTexts.some((t) => t.includes("Гель"))).toBe(true);
    expect(allCellTexts.some((t) => t.includes("Химия"))).toBe(true);
    expect(allCellTexts.some((t) => t.includes("Агрохимия"))).toBe(true);
    expect(allCellTexts.some((t) => t.includes("Москва"))).toBe(true);

    // Truthful payment label
    expect(allCellTexts.some((t) => t.includes("Сумма сделок с полученной оплатой"))).toBe(true);
  });
});
