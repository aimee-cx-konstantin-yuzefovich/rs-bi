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
});
