// @vitest-environment node
// src/__tests__/excel-brand.test.ts
// Unit tests for the RusSilica Excel Brand System.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  RS_BLUE_PRIMARY,
  RS_ORANGE_ACCENT,
  RS_FONT_FAMILY,
  FONT_SIZES,
  SUCCESS_BG,
  SUCCESS_TEXT,
  ATTENTION_BG,
  mapBusinessStatusToSemantic,
  getStatusColors,
  getRusSilicaLogoBuffer,
  registerBrandLogo,
  addBrandLogo,
  styleTableHeader,
  styleDataRows,
  addOperationalHeader,
  addCorporateDivider,
  configureWorksheetPrint,
  addCorporateFooter,
} from "@/lib/excel-brand";

describe("Excel Brand System — Tokens", () => {
  it("defines canonical approved colors", () => {
    expect(RS_BLUE_PRIMARY).toBe("1E509C");
    expect(RS_ORANGE_ACCENT).toBe("FF761C");
    expect(RS_FONT_FAMILY).toBe("Arial");
    expect(FONT_SIZES.TITLE).toBe(18);
    expect(FONT_SIZES.TABLE_HEADER).toBe(10);
  });

  it("maps business statuses to semantic taxonomy", () => {
    expect(mapBusinessStatusToSemantic("Оплачено")).toBe("SUCCESS");
    expect(mapBusinessStatusToSemantic("Образец подошёл")).toBe("SUCCESS");
    expect(mapBusinessStatusToSemantic("WON")).toBe("SUCCESS");
    expect(mapBusinessStatusToSemantic("Успешно пройдены")).toBe("SUCCESS");

    expect(mapBusinessStatusToSemantic("Образцы отправлены")).toBe("IN_PROGRESS");
    expect(mapBusinessStatusToSemantic("На испытании")).toBe("IN_PROGRESS");
    expect(mapBusinessStatusToSemantic("В работе")).toBe("IN_PROGRESS");
    expect(mapBusinessStatusToSemantic("EXECUTING")).toBe("IN_PROGRESS");

    expect(mapBusinessStatusToSemantic("Требуется доработка")).toBe("ATTENTION");
    expect(mapBusinessStatusToSemantic("Требует внимания")).toBe("ATTENTION");
    expect(mapBusinessStatusToSemantic("Зависла")).toBe("ATTENTION");

    expect(mapBusinessStatusToSemantic("Образец не подошёл")).toBe("NEGATIVE");
    expect(mapBusinessStatusToSemantic("LOSE")).toBe("NEGATIVE");
    expect(mapBusinessStatusToSemantic("LOST")).toBe("NEGATIVE");

    expect(mapBusinessStatusToSemantic("Неизвестный статус 123")).toBe("UNKNOWN");
    expect(mapBusinessStatusToSemantic("—")).toBe("NEUTRAL");
  });

  it("retrieves status colors with high contrast", () => {
    const success = getStatusColors("SUCCESS");
    expect(success.bg).toBe(SUCCESS_BG);
    expect(success.text).toBe(SUCCESS_TEXT);

    const attention = getStatusColors("ATTENTION");
    expect(attention.bg).toBe(ATTENTION_BG);
  });
});

describe("Excel Brand System — Logo & Image Registry", () => {
  it("loads the canonical logo buffer successfully in node environment", async () => {
    const buffer = await getRusSilicaLogoBuffer();
    expect(buffer).toBeDefined();
    expect(buffer).not.toBeNull();
    expect(buffer!.byteLength).toBeGreaterThan(1000);
  });

  it("registers logo once per workbook and reuses imageId", async () => {
    const workbook = new ExcelJS.Workbook();
    const id1 = await registerBrandLogo(workbook);
    const id2 = await registerBrandLogo(workbook);

    expect(id1).not.toBeNull();
    expect(id1).toBe(id2); // Exactly same ID returned, cached on workbook

    const sheet1 = workbook.addWorksheet("Sheet1");
    const sheet2 = workbook.addWorksheet("Sheet2");

    addBrandLogo(sheet1, id1!, { height: 56 });
    addBrandLogo(sheet2, id1!, { height: 56 });

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);

    // Verify media in workbook
    expect(workbook.model.media?.length).toBe(1);
  });
});

describe("Excel Brand System — Operational Header & Table Styling", () => {
  it("creates operational header on rows 1-5 and table header on row 6", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Сделки");
    const imageId = await registerBrandLogo(workbook);

    const tableHeaderRow = addOperationalHeader(worksheet, imageId, {
      title: "Отчёт по сделкам",
      period: "01.01.2026 — 31.12.2026",
      recordCount: 15,
      filtersText: "Ответственный: Иванов | Отрасль: Химия",
      colCount: 4,
    });

    expect(tableHeaderRow).toBe(6);

    // Row 1 Title
    const titleCell = worksheet.getCell("B1");
    expect(String(titleCell.value)).toContain("ОТЧЁТ ПО СДЕЛКАМ");
    expect(titleCell.font?.bold).toBe(true);

    // Row 5 Corporate divider
    const dividerCell = worksheet.getCell("A5");
    expect(dividerCell.fill).toBeDefined();

    // Row 6 Table Header
    const headerRow = worksheet.getRow(6);
    headerRow.values = ["ID", "Компания", "Статус", "Сумма"];
    styleTableHeader(headerRow, { colCount: 4 });

    expect(headerRow.getCell(1).fill).toBeDefined();
    expect(headerRow.getCell(1).font?.color?.argb).toBe("FFFFFFFF");

    // Add data row
    const dataRow = worksheet.addRow(["101", "ООО Тест", "В работе", 500000]);
    styleDataRows(worksheet, 7, 7, 4);

    expect(dataRow.getCell(1).border?.top).toBeDefined();

    // Print & Footer
    configureWorksheetPrint(worksheet, { orientation: "landscape", printTitlesRow: "6:6" });
    addCorporateFooter(worksheet);

    expect(worksheet.pageSetup.orientation).toBe("landscape");
    expect(worksheet.pageSetup.printTitlesRow).toBe("6:6");
    expect(worksheet.headerFooter.oddFooter).toContain("RusSilica BI Terminal");
  });
});

describe("Deals & Companies WYSIWYG Export via buildWysiwygWorkbook", () => {
  it("generates a branded Deals workbook with exact columns, rows, freeze panes, and native types", async () => {
    const { buildWysiwygWorkbook } = await import("@/lib/export-utils");

    const columns = ["ID сделки", "Название", "Дата создания", "Сумма (₽)", "Статус"];
    const testDate = new Date("2026-05-15T00:00:00Z");
    const data = [
      ["1001", "Поставка кремния", testDate, 1500000, "В работе"],
      ["1002", "Тестовая партия", "2026-06-20", 350000, "Оплачено"],
      ["1003", "Пустая сделка", null, null, "—"],
    ];

    const workbook = await buildWysiwygWorkbook(data, columns, {
      title: "Отчёт по сделкам",
      sheetName: "Сделки",
      period: "01.01.2026 — 31.12.2026",
      filtersText: "Ответственный: Иванов",
    });

    const sheet = workbook.getWorksheet("Сделки")!;
    expect(sheet).toBeDefined();

    // Verify row 1 Title
    expect(sheet.getCell("B1").value).toBe("ОТЧЁТ ПО СДЕЛКАМ");

    // Verify row 2 Metadata
    expect(sheet.getCell("B2").value).toContain("Период: 01.01.2026 — 31.12.2026");
    expect(sheet.getCell("B2").value).toContain("Записей: 3");

    // Verify row 3 Filters
    expect(sheet.getCell("B3").value).toBe("Фильтры: Ответственный: Иванов");

    // Verify row 6 Table Header
    expect(sheet.getRow(6).values).toEqual([undefined, ...columns]);

    // Verify freeze pane at row 6
    const view = sheet.views.find((v) => v.state === "frozen");
    expect((view as any)?.ySplit).toBe(6);

    // Verify AutoFilter from row 6
    expect(sheet.autoFilter).toEqual({
      from: { row: 6, column: 1 },
      to: { row: 6, column: 5 },
    });

    // Verify Data rows start at row 7
    // Row 7 (first data row)
    expect(sheet.getCell("A7").value).toBe("1001");
    expect(sheet.getCell("B7").value).toBe("Поставка кремния");
    expect(sheet.getCell("C7").value).toBeInstanceOf(Date);
    expect(sheet.getCell("D7").value).toBe(1500000);
    expect(sheet.getCell("E7").value).toBe("В работе");

    // Row 8 (second data row - string date converted to Date)
    expect(sheet.getCell("C8").value).toBeInstanceOf(Date);
    expect(sheet.getCell("D8").value).toBe(350000);

    // Row 9 (third data row - nulls preserved)
    expect(sheet.getCell("C9").value).toBeNull();
    expect(sheet.getCell("D9").value).toBeNull();

    // Verify media contains logo
    expect(workbook.model.media?.length).toBe(1);

    // Verify print & footer
    expect(sheet.pageSetup.orientation).toBe("landscape");
    expect(sheet.pageSetup.printTitlesRow).toBe("6:6");
    expect(sheet.headerFooter.oddFooter).toContain("RusSilica BI Terminal");
  });

  it("preserves row highlighting and custom sheet name for Companies export", async () => {
    const { buildWysiwygWorkbook } = await import("@/lib/export-utils");

    const columns = ["Компания", "Отрасль", "Статус образцов"];
    const data = [
      ["ООО Альфа", "Химия", "Образцы отправлены"],
      ["ООО Бета", "Металлургия", "—"],
    ];

    const workbook = await buildWysiwygWorkbook(data, columns, {
      title: "Отчёт по компаниям",
      sheetName: "Компании",
      highlightRows: [true, false],
    });

    const sheet = workbook.getWorksheet("Компании")!;
    expect(sheet).toBeDefined();

    // Row 7 is highlighted
    const highlightedRow = sheet.getRow(7);
    expect(highlightedRow.getCell(1).fill).toBeDefined();

    // AutoFilter covers row 6
    expect(sheet.autoFilter).toEqual({
      from: { row: 6, column: 1 },
      to: { row: 6, column: 3 },
    });
  });
});

