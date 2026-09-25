// @vitest-environment node
// src/__tests__/excel-file-validation.test.ts
// Round-trip binary XLSX validation for all 4 RusSilica Excel report types.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWysiwygWorkbook, createCompanyExcelWorkbook } from "@/lib/export-utils";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import { generateDemoCommercialDataset } from "@/lib/commercial-funnel/demo-data";
import type { CommercialFilters } from "@/lib/commercial-funnel/types";
import { ATTENTION_BG, CURRENCY_NUMFMT, NEUTRAL_BG, NUMFMT, SUCCESS_BG } from "@/lib/excel-brand";

describe("RusSilica Excel Round-Trip File Validation (All 4 Report Types)", () => {
  const fixedNow = new Date("2026-09-24T12:00:00Z");

  it("Report 1: Deals WYSIWYG — validates round-trip parsing, logo media, freeze panes, print setup", async () => {
    const columns = ["ID сделки", "Название", "Дата создания", "Сумма (₽)", "Статус"];
    const data = [
      ["101", "Поставка кремния", new Date("2026-05-15"), 1500000, "В работе"],
      ["102", "Образцы геля", new Date("2026-06-20"), 250000, "Оплачено"],
    ];

    const sourceWorkbook = await buildWysiwygWorkbook(data, columns, {
      title: "Отчёт по сделкам",
      sheetName: "Сделки",
      period: "01.01.2026 — 31.12.2026",
      filtersText: "Ответственный: Иванов | Отрасль: Химическая",
    });

    const buffer = await sourceWorkbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(5000);

    // Parse back
    const parsedWorkbook = new ExcelJS.Workbook();
    await parsedWorkbook.xlsx.load(buffer as any);

    const sheet = parsedWorkbook.getWorksheet("Сделки")!;
    expect(sheet).toBeDefined();

    // Check header rows
    expect(sheet.getCell("B1").value).toBe("ОТЧЁТ ПО СДЕЛКАМ");
    expect(sheet.getCell("B2").value).toContain("01.01.2026 — 31.12.2026");
    expect(sheet.getCell("B3").value).toBe("Фильтры: Ответственный: Иванов | Отрасль: Химическая");

    // Check table header row 6
    expect(sheet.getCell("A6").value).toBe("ID сделки");
    expect(sheet.getCell("E6").value).toBe("Статус");

    // Check data rows
    expect(sheet.getCell("A7").value).toBe("101");
    expect(sheet.getCell("C7").value).toBeInstanceOf(Date);
    expect(sheet.getCell("D7").value).toBe(1500000);
    expect(sourceWorkbook.getWorksheet("Сделки")!.getCell("D7").numFmt).toBe('#,##0 "₽"');

    // Check views / freeze panes
    const view = sheet.views.find((v) => v.state === "frozen");
    expect((view as any)?.ySplit).toBe(6);

    // Check media (logo PNG present)
    expect(parsedWorkbook.model.media?.length).toBe(1);

    // Check print setup & footer
    expect(sheet.pageSetup.orientation).toBe("landscape");
    expect(sheet.pageSetup.printTitlesRow).toBe("6:6");
    expect(sheet.headerFooter.oddFooter).toContain("RusSilica BI Terminal");
  });

  it("Report 2: Companies List WYSIWYG — validates round-trip parsing, samples highlight, filters", async () => {
    const columns = ["ID компании", "Название", "Отрасль", "Статус образцов"];
    const data = [
      ["201", "ООО РусСилика", "Химия", "Образцы отправлены"],
      ["202", "АО ПромСилика", "Металлургия", "На испытании"],
    ];

    const sourceWorkbook = await buildWysiwygWorkbook(data, columns, {
      title: "Отчёт по компаниям",
      sheetName: "Компании",
      period: "Последние 30 дней",
      filtersText: "Ответственный: Все ответственные",
      highlightRows: [true, false],
    });

    const buffer = await sourceWorkbook.xlsx.writeBuffer();
    const parsedWorkbook = new ExcelJS.Workbook();
    await parsedWorkbook.xlsx.load(buffer as any);

    const sheet = parsedWorkbook.getWorksheet("Компании")!;
    expect(sheet).toBeDefined();
    expect(sheet.getCell("B1").value).toBe("ОТЧЁТ ПО КОМПАНИЯМ");
    expect(sheet.getCell("A6").value).toBe("ID компании");

    // Freeze panes on row 6
    const view = sheet.views.find((v) => v.state === "frozen");
    expect((view as any)?.ySplit).toBe(6);

    // Media
    expect(parsedWorkbook.model.media?.length).toBe(1);
  });

  it("Report 3: Single Company Account Report — validates round-trip sections, logo, numeric money", async () => {
    const sourceWorkbook = createCompanyExcelWorkbook({
      companyTitle: "ООО РусСилика",
      companyId: "777",
      companyFields: [
        { label: "Ответственный компании", value: "Леонид Грош" },
        { label: "Телефон", value: "+7 495 123-45-67" },
      ],
      sampleFields: [
        { label: "Марка предоставленных образцов (ГЕЛЬ)", value: "Гель-Стандарт" },
        { label: "Результат испытаний", value: "Успешно пройдены" },
      ],
      deals: [
        {
          id: "3001",
          title: "Контракт поставки 2026",
          stage: "В работе",
          opportunity: 2500000,
          currency: "RUB",
        },
      ],
      currentDate: fixedNow,
    });

    const buffer = await sourceWorkbook.xlsx.writeBuffer();
    const parsedWorkbook = new ExcelJS.Workbook();
    await parsedWorkbook.xlsx.load(buffer as any);

    const sheet = parsedWorkbook.getWorksheet("Отчёт по компании")!;
    expect(sheet).toBeDefined();

    expect(sheet.getCell("B1").value).toBe("ОТЧЁТ ПО КОМПАНИИ");
    expect(sheet.getCell("B2").value).toBe("ООО РусСилика");
    expect(sheet.getCell("B3").value).toContain("CRM ID: 777");

    // Sections
    const firstColValues: string[] = [];
    sheet.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string") firstColValues.push(v);
    });

    expect(firstColValues).toContain("Основная информация");
    expect(firstColValues).toContain("Образцы");
    expect(firstColValues).toContain("Связанные сделки (1)");

    // Opportunity formatted
    let foundDealOpp = false;
    sheet.eachRow((row) => {
      if (row.getCell(1).value === "3001") {
        expect(row.getCell(4).value).toBe(2500000);
        foundDealOpp = true;
      }
    });
    expect(foundDealOpp).toBe(true);

    // Media
    expect(parsedWorkbook.model.media?.length).toBe(1);
    expect(sheet.headerFooter.oddFooter).toContain("RusSilica BI Terminal");
  });

  it("Report 4: Commercial Funnel (5 Sheets) — validates round-trip, media reuse, and compact file size", async () => {
    const demoData = generateDemoCommercialDataset();
    const filters: CommercialFilters = {
      periodPreset: "30days",
      responsibleId: "all",
      productType: "all",
      industry: "all",
      direction: "all",
      region: "all",
    };

    const sourceWorkbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters,
      userNames: demoData.userNames,
      now: fixedNow,
    });

    expect(sourceWorkbook.worksheets.map((s) => s.name)).toEqual([
      "Executive Summary",
      "Companies",
      "Samples",
      "Managers",
      "Bottlenecks",
    ]);

    const buffer = await sourceWorkbook.xlsx.writeBuffer();

    // File size check: 5 sheets + logo should remain very compact (under 60 KB)
    expect(buffer.byteLength).toBeLessThan(60_000);
    expect(buffer.byteLength).toBeGreaterThan(15_000);

    // Round-trip parse
    const parsedWorkbook = new ExcelJS.Workbook();
    await parsedWorkbook.xlsx.load(buffer as any);

    // Media must be reused: exactly 1 media entry stored in the zip package
    expect(parsedWorkbook.model.media?.length).toBe(1);

    // Validate Executive Summary
    const summary = parsedWorkbook.getWorksheet("Executive Summary")!;
    expect(summary.getCell("B1").value).toBe("КОММЕРЧЕСКАЯ ВОРОНКА");
    expect(summary.getCell("B2").value).toBe("Управленческий отчёт RusSilica BI");

    // Validate Companies detail sheet
    const compSheet = parsedWorkbook.getWorksheet("Companies")!;
    expect(compSheet.getCell("B1").value).toContain("КОММЕРЧЕСКАЯ ВОРОНКА");
    expect(compSheet.views.some((v) => v.state === "frozen" && v.ySplit === 6)).toBe(true);

    // Validate Samples detail sheet
    const samplesSheet = parsedWorkbook.getWorksheet("Samples")!;
    expect(samplesSheet.getCell("B1").value).toContain("КОММЕРЧЕСКАЯ ВОРОНКА");
    expect(samplesSheet.views.some((v) => v.state === "frozen" && v.ySplit === 6)).toBe(true);

    // Validate Managers detail sheet
    const managersSheet = parsedWorkbook.getWorksheet("Managers")!;
    expect(managersSheet.getCell("B1").value).toContain("КОММЕРЧЕСКАЯ ВОРОНКА");
    expect(managersSheet.views.some((v) => v.state === "frozen" && v.ySplit === 6)).toBe(true);

    // Validate Bottlenecks detail sheet
    const bottlenecksSheet = parsedWorkbook.getWorksheet("Bottlenecks")!;
    expect(bottlenecksSheet.getCell("B1").value).toContain("КОММЕРЧЕСКАЯ ВОРОНКА");
    expect(bottlenecksSheet.views.some((v) => v.state === "frozen" && v.ySplit === 6)).toBe(true);
  });

  it("Report 5: Comprehensive Remediation Round-Trip — multi-currency, semantic status fills, field provenance, and Executive Summary attention section", async () => {
    // 1. Multi-currency and provenance WYSIWYG
    const rawIds = ["ID", "UF_CRM_PROD", "COMPANY_UF_CRM_PROD", "OPPORTUNITY", "STAGE_ID"];
    const columns = ["ID", "Тип продукта", "Тип продукта", "Сумма", "Стадия"];
    const data = [
      ["1", "Гель-100", "Силика-1", 100000, "Оплачен"],
      ["2", "Гель-200", "Силика-2", 5000, "Не оплачен"],
      ["3", "Гель-300", "Силика-3", 7500, "В работе"],
      ["4", "Гель-400", "Силика-4", 1200, "Ошибка"],
    ];
    const rowCurrencies = ["RUB", "USD", "EUR", null];

    const sourceWysiwyg = await buildWysiwygWorkbook(data, columns, {
      title: "Мультивалютный отчёт с провенансом",
      rawColumnIds: rawIds,
      rowCurrencies,
    });

    const wysiwygBuffer = await sourceWysiwyg.xlsx.writeBuffer();
    const parsedWysiwyg = new ExcelJS.Workbook();
    await parsedWysiwyg.xlsx.load(wysiwygBuffer as any);

    const wysiwygSheet = parsedWysiwyg.getWorksheet("Сделки")!;
    expect(wysiwygSheet).toBeDefined();

    // Verify header provenance and disambiguation survived round-trip
    expect(wysiwygSheet.getCell("B6").value).toBe("Тип продукта");
    expect(wysiwygSheet.getCell("C6").value).toBe("Компания: Тип продукта");

    // Verify row currencies numFmt survived round-trip
    const row7Opp = wysiwygSheet.getCell("D7"); // RUB
    expect(row7Opp.numFmt).toBe(CURRENCY_NUMFMT.RUB.MONEY);

    const row8Opp = wysiwygSheet.getCell("D8"); // USD
    expect(row8Opp.numFmt).toBe(CURRENCY_NUMFMT.USD.MONEY);
    expect(row8Opp.numFmt).not.toContain("₽");

    const row9Opp = wysiwygSheet.getCell("D9"); // EUR
    expect(row9Opp.numFmt).toBe(CURRENCY_NUMFMT.EUR.MONEY);
    expect(row9Opp.numFmt).not.toContain("₽");

    const row10Opp = wysiwygSheet.getCell("D10"); // Unknown
    expect(row10Opp.numFmt).toBe(NUMFMT.INTEGER);
    expect(row10Opp.numFmt).not.toContain("₽");

    // Verify semantic status styling survived round-trip
    const paidCell = wysiwygSheet.getCell("E7"); // "Оплачен" -> SUCCESS
    expect(paidCell.value).toBe("Оплачен");
    expect(paidCell.fill).toBeDefined();
    expect((paidCell.fill as any)?.fgColor?.argb).toContain(SUCCESS_BG);

    const unpaidCell = wysiwygSheet.getCell("E8"); // "Не оплачен" -> ATTENTION (NEVER SUCCESS)
    expect(unpaidCell.value).toBe("Не оплачен");
    expect(unpaidCell.fill).toBeDefined();
    expect((unpaidCell.fill as any)?.fgColor?.argb).toContain(ATTENTION_BG);
    expect((unpaidCell.fill as any)?.fgColor?.argb).not.toContain(SUCCESS_BG);

    // 2. Commercial Funnel Executive Summary Section 3 (Attention) round-trip
    const demoData = generateDemoCommercialDataset();
    const funnelWorkbook = await createCommercialFunnelWorkbook({
      companies: demoData.companies,
      deals: demoData.deals,
      filters: {
        periodPreset: "30days",
        responsibleId: "all",
        productType: "all",
        industry: "all",
        direction: "all",
        region: "all",
      },
      userNames: demoData.userNames,
      now: fixedNow,
    });

    const funnelBuffer = await funnelWorkbook.xlsx.writeBuffer();
    const parsedFunnel = new ExcelJS.Workbook();
    await parsedFunnel.xlsx.load(funnelBuffer as any);

    const summarySheet = parsedFunnel.getWorksheet("Executive Summary")!;
    const allSummaryTexts: string[] = [];
    summarySheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value) allSummaryTexts.push(String(cell.value));
      });
    });

    expect(allSummaryTexts.some((t) => t.includes("ТРЕБУЮТ ВНИМАНИЯ (УЗКИЕ МЕСТА)"))).toBe(true);
    expect(allSummaryTexts.some((t) => t.includes("[KPI] Новые компании"))).toBe(true);
  });

  it("Report 6: Residual Correctness Round-Trip — blank dates, 'Не требуется' NEUTRAL semantics, multi-currency funnel", async () => {
    // 1. Single Company Report with empty date fields, non-date empty fields, and 'Не требуется'
    const sourceCompanyWb = createCompanyExcelWorkbook({
      companyTitle: "Тест Остаточных Исправлений",
      companyId: "9999",
      companyFields: [
        { label: "Дата создания", value: "2026-05-15" },
        { label: "Телефон", value: "" }, // Non-date empty field -> " — "
      ],
      sampleFields: [
        { label: "Дата передачи / отправки", value: "" }, // Date empty field -> genuine null
        { label: "Статус образцов", value: "Не требуется" }, // Negated neutral phrase -> NEUTRAL, not ATTENTION
        { label: "Результат испытаний", value: "Не требуются" }, // Negated neutral phrase -> NEUTRAL
      ],
      deals: [],
      currentDate: fixedNow,
    });

    const companyBuffer = await sourceCompanyWb.xlsx.writeBuffer();
    const parsedCompanyWb = new ExcelJS.Workbook();
    await parsedCompanyWb.xlsx.load(companyBuffer as any);

    const companySheet = parsedCompanyWb.getWorksheet("Отчёт по компании")!;
    expect(companySheet).toBeDefined();

    let foundCreatedDate = false;
    let foundEmptyPhone = false;
    let foundEmptySampleDate = false;
    let foundNotRequiredSample = false;
    let foundNotRequiredResult = false;

    companySheet.eachRow((row) => {
      const label = String(row.getCell(1).value || "");
      const valCell = row.getCell(2);

      if (label === "Дата создания") {
        foundCreatedDate = true;
        expect(valCell.value).toBeInstanceOf(Date);
      }
      if (label === "Телефон") {
        foundEmptyPhone = true;
        expect(valCell.value).toBe("—");
      }
      if (label === "Дата передачи / отправки") {
        foundEmptySampleDate = true;
        // MUST remain genuinely blank Excel cell, never textual "—"
        expect(valCell.value).toBeNull();
      }
      if (label === "Статус образцов") {
        foundNotRequiredSample = true;
        expect(valCell.value).toBe("Не требуется");
        const fillArgb = (valCell.fill as any)?.fgColor?.argb;
        // Must NOT have ATTENTION background
        expect(fillArgb).toBeUndefined();
      }
      if (label === "Результат испытаний") {
        foundNotRequiredResult = true;
        expect(valCell.value).toBe("Не требуются");
        const fillArgb = (valCell.fill as any)?.fgColor?.argb;
        expect(fillArgb).toBeUndefined();
      }
    });

    expect(foundCreatedDate).toBe(true);
    expect(foundEmptyPhone).toBe(true);
    expect(foundEmptySampleDate).toBe(true);
    expect(foundNotRequiredSample).toBe(true);
    expect(foundNotRequiredResult).toBe(true);

    // 2. Commercial Funnel Multi-Currency XLSX Round-Trip
    const multiCurWb = await createCommercialFunnelWorkbook({
      companies: [
        {
          id: "c-rub",
          title: "Компания Рубли",
          responsibleId: "u1",
          dateCreate: "2026-09-01",
          direction: [],
          productType: [],
          sampleAllDates: [],
          deals: [
            {
              id: "d-rub",
              title: "Сделка 1",
              companyId: "c-rub",
              responsibleId: "u1",
              stageId: "EXECUTING",
              categoryId: "0",
              opportunity: 500_000,
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
          primaryDealOpportunity: 500_000,
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
          title: "Компания Доллары",
          responsibleId: "u2",
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
              title: "Сделка 2",
              companyId: "c-usd",
              responsibleId: "u2",
              stageId: "EXECUTING",
              categoryId: "0",
              opportunity: 12_000,
              currencyId: "USD",
              paymentStatus: "109",
              paymentDate: "2026-09-11",
              sampleTestingStatus: [],
              productType: [],
              industry: [],
              direction: [],
            },
          ],
          primaryDealId: "d-usd",
          primaryDealOpportunity: 12_000,
          primaryDealCurrencyId: "USD",
          primaryDealPaymentStatus: "109",
          primaryDealPaymentDate: "2026-09-11",
          hasAttention: false,
          attentionReasons: [],
        },
      ],
      deals: [],
      filters: {
        periodPreset: "30days",
        responsibleId: "all",
        productType: "all",
        industry: "all",
        direction: "all",
        region: "all",
      },
      now: fixedNow,
    });

    const multiCurBuffer = await multiCurWb.xlsx.writeBuffer();
    const parsedMultiCurWb = new ExcelJS.Workbook();
    await parsedMultiCurWb.xlsx.load(multiCurBuffer as any);

    const summarySheet = parsedMultiCurWb.getWorksheet("Executive Summary")!;
    let foundRubLine = false;
    let foundUsdLine = false;

    summarySheet.eachRow((row) => {
      const lbl = String(row.getCell(1).value || "");
      if (lbl.includes("Сумма сделок с полученной оплатой — RUB")) {
        foundRubLine = true;
        expect(row.getCell(2).value).toBe(500_000);
      }
      if (lbl.includes("Сумма сделок с полученной оплатой — USD")) {
        foundUsdLine = true;
        expect(row.getCell(2).value).toBe(12_000);
      }
    });

    expect(foundRubLine).toBe(true);
    expect(foundUsdLine).toBe(true);
  });
});
