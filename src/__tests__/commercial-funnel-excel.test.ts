// @vitest-environment node
// src/__tests__/commercial-funnel-excel.test.ts
// Unit tests for the 5-sheet Commercial Funnel Excel export.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import { generateDemoCommercialDataset } from "@/lib/commercial-funnel/demo-data";
import { computeBottlenecks, computeManagerScorecard, computePeriodMetrics, computeWipMetrics } from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import type { CommercialCompany, CommercialDeal, CommercialFilters } from "@/lib/commercial-funnel/types";

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
    // Rows 1-5 are operational header, row 6 is table header, data rows start at row 7
    const excelCompanyRowCount = companiesSheet.rowCount - 6;
    expect(excelCompanyRowCount).toBe(demoData.companies.length);

    const bottlenecksSheet = workbook.getWorksheet("Bottlenecks")!;
    const engineBottlenecks = computeBottlenecks(demoData.companies, fixedNow);
    const excelBottlenecksRowCount = bottlenecksSheet.rowCount - 6;
    expect(excelBottlenecksRowCount).toBe(engineBottlenecks.length);

    const bounds = computePeriodBoundaries(filters, fixedNow);
    const engineManagers = computeManagerScorecard(
      demoData.companies,
      bounds,
      engineBottlenecks,
      demoData.userNames
    );
    const managersSheet = workbook.getWorksheet("Managers")!;
    const excelManagersRowCount = managersSheet.rowCount - 6;
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

    // Iterate data rows (row 7 onwards, after branded header rows 1-6)
    companiesSheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 6) return;
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
      if (rowNumber <= 6) return;
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

  it("exports multi-currency dataset truthfully without cross-currency sum or false RUB assumptions", async () => {
    const multiCurCompanies: CommercialCompany[] = [
      {
        id: "c-rub",
        title: "Компания Рублевая",
        responsibleId: "u1",
        responsibleName: "Менеджер Рублев",
        dateCreate: "2026-09-01",
        direction: [],
        productType: [],
        sampleAllDates: [],
        deals: [
          {
            id: "d-rub",
            title: "Сделка Руб",
            companyId: "c-rub",
            responsibleId: "u1",
            stageId: "EXECUTING",
            categoryId: "0",
            opportunity: 1_500_000,
            currencyId: "RUB",
            paymentStatus: "109",
            paymentDate: "2026-09-10",
            sampleTestingStatus: [],
            productType: [],
            industry: [],
            direction: [],
          },
        ],
        primaryDealId: "d-rub",
        primaryDealTitle: "Сделка Руб",
        primaryDealOpportunity: 1_500_000,
        primaryDealCurrencyId: "RUB",
        primaryDealPaymentStatus: "109",
        primaryDealPaymentDate: "2026-09-10",
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        gradeGel: [],
        gradeSol: [],
        hasAttention: false,
        attentionReasons: [],
      },
      {
        id: "c-usd",
        title: "Компания Долларовая",
        responsibleId: "u2",
        responsibleName: "Менеджер Долларов",
        dateCreate: "2026-09-02",
        direction: [],
        productType: [],
        sampleAllDates: [],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        gradeGel: [],
        gradeSol: [],
        deals: [
          {
            id: "d-usd",
            title: "Сделка Долл",
            companyId: "c-usd",
            responsibleId: "u2",
            stageId: "EXECUTING",
            categoryId: "0",
            opportunity: 25_000,
            currencyId: "USD",
            dateCreate: "2026-07-01",
            paymentStatus: "113",
            paymentDate: "2026-09-12",
            sampleTestingStatus: [],
            productType: [],
            industry: [],
            direction: [],
          },
        ],
        primaryDealId: "d-usd",
        primaryDealTitle: "Сделка Долл",
        primaryDealOpportunity: 25_000,
        primaryDealCurrencyId: "USD",
        primaryDealPaymentStatus: "113",
        primaryDealPaymentDate: "2026-09-12",
        hasAttention: true,
        attentionReasons: ["Нет задач"],
      },
    ];

    const multiCurDeals = multiCurCompanies.flatMap((c) => c.deals);

    const workbook = await createCommercialFunnelWorkbook({
      companies: multiCurCompanies,
      deals: multiCurDeals,
      filters: {
        periodPreset: "30days",
        responsibleId: "all",
        productType: "all",
        industry: "all",
        direction: "all",
        region: "all",
      },
      userNames: { u1: "Менеджер Рублев", u2: "Менеджер Долларов" },
      now: fixedNow,
    });

    // 1. Executive Summary: Section 1 should have per-currency payment rows
    const summarySheet = workbook.getWorksheet("Executive Summary")!;
    let foundRubRow = false;
    let foundUsdRow = false;

    summarySheet.eachRow((row) => {
      const lbl = String(row.getCell(1).value || "");
      if (lbl.includes("Сумма сделок с полученной оплатой — RUB")) {
        foundRubRow = true;
        expect(row.getCell(2).value).toBe(1_500_000);
        expect(row.getCell(2).numFmt).toContain("₽");
      }
      if (lbl.includes("Сумма сделок с полученной оплатой — USD")) {
        foundUsdRow = true;
        expect(row.getCell(2).value).toBe(25_000);
        expect(row.getCell(2).numFmt).toContain("$");
        expect(row.getCell(2).numFmt).not.toContain("₽");
      }
    });

    expect(foundRubRow).toBe(true);
    expect(foundUsdRow).toBe(true);

    // 2. Companies Sheet: Headers must NOT have hardcoded (₽)
    const compSheet = workbook.getWorksheet("Companies")!;
    const compHeaderRow = compSheet.getRow(6);
    expect(compHeaderRow.getCell(14).value).toBe("Сумма");

    // Row 7 is c-rub, Row 8 is c-usd
    const rubCompRow = compSheet.getRow(7);
    expect(rubCompRow.getCell(14).value).toBe(1_500_000);
    expect(rubCompRow.getCell(14).numFmt).toContain("₽");

    const usdCompRow = compSheet.getRow(8);
    expect(usdCompRow.getCell(14).value).toBe(25_000);
    expect(usdCompRow.getCell(14).numFmt).toContain("$");
    expect(usdCompRow.getCell(14).numFmt).not.toContain("₽");

    // 3. Managers Sheet: Per-currency payment columns
    const mgrSheet = workbook.getWorksheet("Managers")!;
    const mgrHeaderRow = mgrSheet.getRow(6);
    const mgrHeaders = (mgrHeaderRow.values as string[]).slice(1);
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (RUB)");
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (USD)");

    // 4. Bottlenecks Sheet: Header is "Сумма", formatted with USD for usd deal
    const botSheet = workbook.getWorksheet("Bottlenecks")!;
    const botHeaderRow = botSheet.getRow(6);
    expect(botHeaderRow.getCell(8).value).toBe("Сумма");
    const botRow = botSheet.getRow(7);
    expect(botRow.getCell(8).value).toBe(25_000);
    expect(botRow.getCell(8).numFmt).toContain("$");
    expect(botRow.getCell(8).numFmt).not.toContain("₽");
  });

  it("preserves neutral format #,##0 for deals without currency in Excel export (never coerces to RUB)", async () => {
    const dealWithoutCur: CommercialDeal = {
      id: "d-nocurr",
      title: "Сделка без валюты",
      companyId: "c-nocurr",
      responsibleId: "u1",
      stageId: "WON",
      categoryId: "0",
      opportunity: 50_000,
      currencyId: "", // intentionally empty
      paymentStatus: "113",
      paymentDate: "2026-09-10",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const companyWithoutCur: CommercialCompany = {
      id: "c-nocurr",
      title: "Компания Без Валюты",
      responsibleId: "u1",
      responsibleName: "Менеджер",
      sampleStatus: "Не требуется",
      sampleStatusSource: "NONE",
      gradeGel: [],
      gradeSol: [],
      productType: [],
      direction: [],
      sampleAllDates: [],
      deals: [dealWithoutCur],
      primaryDealId: "d-nocurr",
      primaryDealTitle: "Сделка без валюты",
      primaryDealOpportunity: 50_000,
      primaryDealCurrencyId: undefined, // intentionally undefined
      primaryDealPaymentStatus: "Оплачен",
      primaryDealPaymentDate: "2026-09-10",
      hasAttention: true,
      attentionReasons: ["Проверка"],
    };

    const workbook = await createCommercialFunnelWorkbook({
      companies: [companyWithoutCur],
      deals: [dealWithoutCur],
      filters,
      userNames: { u1: "Менеджер" },
      now: fixedNow,
    });

    // Companies sheet: primaryDealOpportunity numFmt must NOT contain ₽ or $ or €
    const compSheet = workbook.getWorksheet("Companies")!;
    const compRow = compSheet.getRow(7);
    expect(compRow.getCell(14).value).toBe(50_000);
    expect(compRow.getCell(14).numFmt).toBe("#,##0");
    expect(compRow.getCell(14).numFmt).not.toContain("₽");
    expect(compRow.getCell(14).numFmt).not.toContain("$");
    expect(compRow.getCell(14).numFmt).not.toContain("€");
  });

  it("OpenXML Round-Trip: preserves per-currency formats, UNKNOWN neutral format, and explicit labels after XLSX reload", async () => {
    const dealRub: CommercialDeal = {
      id: "d-rub",
      title: "Сделка RUB",
      companyId: "c-1",
      responsibleId: "u1",
      stageId: "WON",
      categoryId: "0",
      opportunity: 1_000_000,
      currencyId: "RUB",
      paymentStatus: "113",
      paymentDate: "2026-09-10",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const dealUsd: CommercialDeal = {
      id: "d-usd",
      title: "Сделка USD",
      companyId: "c-2",
      responsibleId: "u2",
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

    const dealUnknown: CommercialDeal = {
      id: "d-unk",
      title: "Сделка UNKNOWN",
      companyId: "c-3",
      responsibleId: "u3",
      stageId: "WON",
      categoryId: "0",
      opportunity: 10_000,
      currencyId: "", // UNKNOWN
      paymentStatus: "113",
      paymentDate: "2026-09-14",
      sampleTestingStatus: [],
      productType: [],
      industry: [],
      direction: [],
    };

    const makeComp = (id: string, deal: CommercialDeal, respId: string, curId?: string): CommercialCompany => ({
      id,
      title: `Компания ${id}`,
      responsibleId: respId,
      responsibleName: `Менеджер ${respId}`,
      sampleStatus: "Не требуется",
      sampleStatusSource: "NONE",
      gradeGel: [],
      gradeSol: [],
      productType: [],
      direction: [],
      sampleAllDates: [],
      deals: [deal],
      primaryDealId: deal.id,
      primaryDealTitle: deal.title,
      primaryDealOpportunity: deal.opportunity,
      primaryDealCurrencyId: curId,
      primaryDealPaymentStatus: "Оплачен",
      primaryDealPaymentDate: deal.paymentDate,
      hasAttention: false,
      attentionReasons: [],
    });

    const companies = [
      makeComp("c-1", dealRub, "u1", "RUB"),
      makeComp("c-2", dealUsd, "u2", "USD"),
      makeComp("c-3", dealUnknown, "u3", undefined),
    ];

    const sourceWb = await createCommercialFunnelWorkbook({
      companies,
      deals: [dealRub, dealUsd, dealUnknown],
      filters,
      userNames: { u1: "Менеджер Рублев", u2: "Менеджер Долларов", u3: "Менеджер Безвалютный" },
      now: fixedNow,
    });

    // Write binary buffer and reload via ExcelJS
    const buffer = await sourceWb.xlsx.writeBuffer();
    const reloadedWb = new ExcelJS.Workbook();
    await reloadedWb.xlsx.load(buffer as any);

    // 1. Executive Summary: Check Section 1 currency rows
    const summarySheet = reloadedWb.getWorksheet("Executive Summary")!;
    const rowLabels: string[] = [];
    const rowNumFmts: Record<string, string | undefined> = {};
    summarySheet.eachRow((row) => {
      const lbl = String(row.getCell(1).value || "");
      if (lbl) {
        rowLabels.push(lbl);
        rowNumFmts[lbl] = row.getCell(2).numFmt;
      }
    });

    expect(rowLabels).toContain("Сумма сделок с полученной оплатой — RUB");
    expect(rowLabels).toContain("Сумма сделок с полученной оплатой — USD");
    expect(rowLabels).toContain("Сумма сделок с полученной оплатой — валюта не указана");

    expect(rowNumFmts["Сумма сделок с полученной оплатой — RUB"]).toContain("₽");
    expect(rowNumFmts["Сумма сделок с полученной оплатой — USD"]).toContain("$");
    expect(rowNumFmts["Сумма сделок с полученной оплатой — валюта не указана"]).toBe("#,##0");

    // 2. Managers sheet: Check headers include (валюта не указана)
    const mgrSheet = reloadedWb.getWorksheet("Managers")!;
    const mgrHeaderRow = mgrSheet.getRow(6);
    const mgrHeaders = (mgrHeaderRow.values as string[]).slice(1);
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (RUB)");
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (USD)");
    expect(mgrHeaders).toContain("Сумма сделок с полученной оплатой (валюта не указана)");

    // 3. Companies sheet: Check row numFmts
    const compSheet = reloadedWb.getWorksheet("Companies")!;
    expect(compSheet.getRow(7).getCell(14).numFmt).toContain("₽");
    expect(compSheet.getRow(8).getCell(14).numFmt).toContain("$");
    expect(compSheet.getRow(9).getCell(14).numFmt).toBe("#,##0");
  });
});
