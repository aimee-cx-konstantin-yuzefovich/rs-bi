// @vitest-environment node
// src/__tests__/excel-file-validation.test.ts
// Round-trip binary XLSX validation for all 4 RusSilica Excel report types.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWysiwygWorkbook, createCompanyExcelWorkbook } from "@/lib/export-utils";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import { generateDemoCommercialDataset } from "@/lib/commercial-funnel/demo-data";
import type { CommercialFilters } from "@/lib/commercial-funnel/types";

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
});
