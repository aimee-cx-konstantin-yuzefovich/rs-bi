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
  applyStatusCell,
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
  NUMFMT,
  CURRENCY_NUMFMT,
  getMoneyNumFmt,
  formatReportDateTime,
  formatReportDate,
  formatReportDateForFilename,
  isCurrencyHeader,
  formatHeaderToRussian,
  disambiguateHeaders,
  formatStageToRussian,
  formatCurrencyToRussian,
} from "@/lib/excel-brand";
import { normalizeCompanyReportFieldValue } from "@/lib/export-utils";

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

  it("strictly respects precedence rule: 'Не требуется' must be NEUTRAL, not ATTENTION", () => {
    // Negated neutral phrases must never trigger ATTENTION merely because of substring 'требует'
    expect(mapBusinessStatusToSemantic("Не требуется")).toBe("NEUTRAL");
    expect(mapBusinessStatusToSemantic("Не требуются образцы")).toBe("NEUTRAL");
    expect(mapBusinessStatusToSemantic("Не требует действий")).toBe("NEUTRAL");

    // Positive attention phrases must remain ATTENTION
    expect(mapBusinessStatusToSemantic("Требует внимания")).toBe("ATTENTION");
    expect(mapBusinessStatusToSemantic("Требует доработки")).toBe("ATTENTION");
    expect(mapBusinessStatusToSemantic("Требуется доработка")).toBe("ATTENTION");

    // Payment and sample outcomes
    expect(mapBusinessStatusToSemantic("Не оплачен")).toBe("ATTENTION");
    expect(mapBusinessStatusToSemantic("Оплачен")).toBe("SUCCESS");
    expect(mapBusinessStatusToSemantic("Не подошли")).toBe("NEGATIVE");
    expect(mapBusinessStatusToSemantic("Подошли")).toBe("SUCCESS");
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

  it("auto-detects currency columns and formats numbers with NUMFMT.MONEY", async () => {
    const { buildWysiwygWorkbook } = await import("@/lib/export-utils");

    const columns = ["ID", "Компания", "Сумма сделки", "Количество", "Дата создания", "Дата встречи"];
    const nowWithTime = new Date("2026-05-15T14:30:00Z");
    const dateOnly = new Date("2026-05-15T00:00:00Z");

    const data = [
      ["1", "ООО Силика", 1250000, 42, nowWithTime, dateOnly],
      ["2", "АО Пром", "250 000 ₽", 10, "2026-06-01 10:15", "01.06.2026"],
    ];

    const workbook = await buildWysiwygWorkbook(data, columns, {
      title: "Отчёт с автоопределением валюты",
      sheetName: "Сделки",
    });

    const sheet = workbook.getWorksheet("Сделки")!;

    // Row 7 (first data row)
    const row7 = sheet.getRow(7);
    expect(row7.getCell(3).value).toBe(1250000);
    expect(row7.getCell(3).numFmt).toBe(NUMFMT.MONEY); // Auto-detected from "Сумма сделки"
    expect(row7.getCell(4).value).toBe(42);
    expect(row7.getCell(4).numFmt).toBe(NUMFMT.INTEGER); // Quantity is integer

    // Datetime with time component
    expect(row7.getCell(5).value).toBeInstanceOf(Date);
    expect(row7.getCell(5).numFmt).toBe(NUMFMT.DATETIME);

    // Date-only without time component
    expect(row7.getCell(6).value).toBeInstanceOf(Date);
    expect(row7.getCell(6).numFmt).toBe(NUMFMT.DATE);

    // Row 8 (second data row - parsed from string with ₽ and datetime string)
    const row8 = sheet.getRow(8);
    expect(row8.getCell(3).value).toBe(250000); // Parsed from "250 000 ₽"
    expect(row8.getCell(3).numFmt).toBe(NUMFMT.MONEY);
    expect(row8.getCell(5).value).toBeInstanceOf(Date);
    expect(row8.getCell(5).numFmt).toBe(NUMFMT.DATETIME); // "2026-06-01 10:15"
    expect(row8.getCell(6).value).toBeInstanceOf(Date);
    expect(row8.getCell(6).numFmt).toBe(NUMFMT.DATE); // "01.06.2026"
  });
});

describe("Excel Brand System — Currency Header Detection", () => {
  it("accurately identifies currency header variations", () => {
    expect(isCurrencyHeader("Сумма")).toBe(true);
    expect(isCurrencyHeader("Сумма сделки")).toBe(true);
    expect(isCurrencyHeader("Сумма (₽)")).toBe(true);
    expect(isCurrencyHeader("Оборот компании")).toBe(true);
    expect(isCurrencyHeader("Бюджет проекта")).toBe(true);
    expect(isCurrencyHeader("Opportunity")).toBe(true);
    expect(isCurrencyHeader("OPPORTUNITY_AMOUNT")).toBe(true);
    expect(isCurrencyHeader("Выручка")).toBe(true);
    expect(isCurrencyHeader("Цена за тонну")).toBe(true);

    expect(isCurrencyHeader("ID сделки")).toBe(false);
    expect(isCurrencyHeader("Название компании")).toBe(false);
    expect(isCurrencyHeader("Дата создания")).toBe(false);
    expect(isCurrencyHeader("Статус")).toBe(false);
    expect(isCurrencyHeader("Количество")).toBe(false);
  });
});

describe("Excel Brand System — Pure Russian Reports (No English CRM Terms)", () => {
  it("translates raw Bitrix field IDs and English titles (Opportunity, Title, Stage, etc.) to Russian", () => {
    expect(formatHeaderToRussian("Opportunity")).toBe("Сумма");
    expect(formatHeaderToRussian("OPPORTUNITY")).toBe("Сумма");
    expect(formatHeaderToRussian("TITLE")).toBe("Название");
    expect(formatHeaderToRussian("STAGE_ID")).toBe("Стадия");
    expect(formatHeaderToRussian("COMPANY_TITLE")).toBe("Компания");
    expect(formatHeaderToRussian("DATE_CREATE")).toBe("Дата создания");
    expect(formatHeaderToRussian("DATE_MODIFY")).toBe("Дата изменения");
    expect(formatHeaderToRussian("ASSIGNED_BY_ID")).toBe("Ответственный");
    expect(formatHeaderToRussian("CURRENCY_ID")).toBe("Валюта");
    expect(formatHeaderToRussian("COMMENTS")).toBe("Комментарий");
    expect(formatHeaderToRussian("PHONE")).toBe("Телефон");
    expect(formatHeaderToRussian("EMAIL")).toBe("Эл. почта");
    expect(formatHeaderToRussian("BEGINDATE")).toBe("Дата начала");
    expect(formatHeaderToRussian("CLOSEDATE")).toBe("Дата завершения");
    expect(formatHeaderToRussian("PROBABILITY")).toBe("Вероятность");
    expect(formatHeaderToRussian("TYPE_ID")).toBe("Тип");
    expect(formatHeaderToRussian("Компания: TITLE")).toBe("Компания: Название");
    expect(formatHeaderToRussian("Компания: OPPORTUNITY")).toBe("Компания: Сумма");
    expect(formatHeaderToRussian("COMPANY_TITLE", { fieldId: "COMPANY_TITLE" })).toBe("Компания");
    expect(formatHeaderToRussian("COMPANY_ASSIGNED_BY_ID", { fieldId: "COMPANY_ASSIGNED_BY_ID" })).toBe("Ответственный компании");
  });

  it("translates raw Bitrix stages and payment statuses to Russian", () => {
    expect(formatStageToRussian("WON")).toBe("Успешно завершена");
    expect(formatStageToRussian("LOSE")).toBe("Провалена");
    expect(formatStageToRussian("NEW")).toBe("Новая сделка");
    expect(formatStageToRussian("EXECUTING")).toBe("В работе");
    expect(formatStageToRussian("PREPARATION")).toBe("Подготовка");
    expect(formatStageToRussian("PREPAYMENT_INVOICE")).toBe("Счёт на предоплату");
  });

  it("translates currency codes to Russian symbols", () => {
    expect(formatCurrencyToRussian("RUB")).toBe("₽");
    expect(formatCurrencyToRussian("RUR")).toBe("₽");
    expect(formatCurrencyToRussian("USD")).toBe("$");
    expect(formatCurrencyToRussian("EUR")).toBe("€");
    expect(formatCurrencyToRussian(null)).toBe("—");
    expect(formatCurrencyToRussian(undefined)).toBe("—");
  });

  it("guarantees buildWysiwygWorkbook cleanses raw English column names like Opportunity", async () => {
    const { buildWysiwygWorkbook } = await import("@/lib/export-utils");

    const rawColumns = ["ID", "OPPORTUNITY", "TITLE", "STAGE_ID", "CURRENCY_ID"];
    const rawData = [
      ["501", 1500000, "Сделка 501", "WON", "RUB"],
      ["502", 250000, "Сделка 502", "LOSE", "RUB"],
    ];

    const workbook = await buildWysiwygWorkbook(rawData, rawColumns, {
      title: "Отчёт по сделкам",
    });

    const sheet = workbook.getWorksheet("Сделки")!;

    // Header row 6 must be pure Russian, NO 'OPPORTUNITY' or 'Opportunity'
    const headerValues = sheet.getRow(6).values as string[];
    expect(headerValues).not.toContain("OPPORTUNITY");
    expect(headerValues).not.toContain("Opportunity");
    expect(headerValues).toContain("Сумма");
    expect(headerValues).toContain("Название");
    expect(headerValues).toContain("Стадия");
    expect(headerValues).toContain("Валюта");

    // Data rows must translate WON / LOSE / RUB to Russian
    const row7 = sheet.getRow(7);
    expect(row7.getCell(4).value).toBe("Успешно завершена"); // WON translated
    expect(row7.getCell(5).value).toBe("₽"); // RUB translated

    const row8 = sheet.getRow(8);
    expect(row8.getCell(4).value).toBe("Провалена"); // LOSE translated
    expect(row8.getCell(5).value).toBe("₽");
  });

  it("guarantees createCompanyExcelWorkbook translates deal stages, currencies, and headers to Russian", async () => {
    const { createCompanyExcelWorkbook } = await import("@/lib/export-utils");

    const workbook = createCompanyExcelWorkbook({
      companyTitle: "ООО Квант",
      fields: [
        { label: "TITLE", value: "ООО Квант" },
        { label: "OPPORTUNITY", value: "1000000" },
      ],
      sampleFields: [
        { label: "Результат", value: "WON" },
      ],
      deals: [
        { id: "10", title: "Тестовая поставка", stage: "WON", opportunity: 500000, currency: "RUB" },
      ],
    });

    const sheet = workbook.getWorksheet("Отчёт по компании")!;
    expect(sheet).toBeDefined();

    // Check that company field labels are translated
    let foundSumma = false;
    let foundRubSymbol = false;
    let foundWonTranslated = false;

    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value === "Сумма") foundSumma = true;
        if (cell.value === "₽") foundRubSymbol = true;
        if (cell.value === "Успешно завершена") foundWonTranslated = true;
        // Verify no raw English words
        expect(cell.value).not.toBe("OPPORTUNITY");
        expect(cell.value).not.toBe("RUB");
        expect(cell.value).not.toBe("WON");
      });
    });

    expect(foundSumma).toBe(true);
    expect(foundRubSymbol).toBe(true);
    expect(foundWonTranslated).toBe(true);
  });
});

describe("Excel Brand System — Multi-Currency Formatting (P1-2)", () => {
  it("resolves exact numFmt for canonical currencies and neutral fallback for unknown", () => {
    // RUB
    expect(getMoneyNumFmt("RUB", false)).toBe(CURRENCY_NUMFMT.RUB.MONEY);
    expect(getMoneyNumFmt("RUB", true)).toBe(CURRENCY_NUMFMT.RUB.MONEY_PRECISE);
    expect(getMoneyNumFmt("₽", false)).toBe(CURRENCY_NUMFMT.RUB.MONEY);

    // USD
    expect(getMoneyNumFmt("USD", false)).toBe(CURRENCY_NUMFMT.USD.MONEY);
    expect(getMoneyNumFmt("USD", true)).toBe(CURRENCY_NUMFMT.USD.MONEY_PRECISE);
    expect(getMoneyNumFmt("$", false)).toBe(CURRENCY_NUMFMT.USD.MONEY);

    // EUR
    expect(getMoneyNumFmt("EUR", false)).toBe(CURRENCY_NUMFMT.EUR.MONEY);
    expect(getMoneyNumFmt("EUR", true)).toBe(CURRENCY_NUMFMT.EUR.MONEY_PRECISE);
    expect(getMoneyNumFmt("€", false)).toBe(CURRENCY_NUMFMT.EUR.MONEY);

    // Unknown or null: neutral numeric format, NEVER falsely defaults to RUB
    expect(getMoneyNumFmt(null, false)).toBe(NUMFMT.INTEGER);
    expect(getMoneyNumFmt(null, true)).toBe(NUMFMT.DECIMAL_2);
    expect(getMoneyNumFmt(undefined, false)).toBe(NUMFMT.INTEGER);
    expect(getMoneyNumFmt("GBP", false)).toBe(NUMFMT.INTEGER);
    expect(getMoneyNumFmt("XYZ", true)).toBe(NUMFMT.DECIMAL_2);
  });

  it("applies row-specific currencies in Deals WYSIWYG export without converting or cross-contaminating", async () => {
    const { buildWysiwygWorkbook } = await import("@/lib/export-utils");

    const columns = ["ID", "Название", "Сумма", "Валюта"];
    const data = [
      ["101", "Сделка в рублях", 100000, "₽"],
      ["102", "Сделка в долларах", 5000, "$"],
      ["103", "Сделка в евро", 7500, "€"],
      ["104", "Сделка без валюты", 2000, "—"],
    ];

    const workbook = await buildWysiwygWorkbook(data, columns, {
      title: "Мультивалютный отчёт",
      rowCurrencies: ["RUB", "USD", "EUR", null],
    });

    const sheet = workbook.getWorksheet("Сделки")!;
    // Row 7 (RUB): #,##0 "₽"
    expect(sheet.getRow(7).getCell(3).numFmt).toBe(CURRENCY_NUMFMT.RUB.MONEY);
    // Row 8 (USD): $#,##0 - NEVER ₽
    expect(sheet.getRow(8).getCell(3).numFmt).toBe(CURRENCY_NUMFMT.USD.MONEY);
    expect(sheet.getRow(8).getCell(3).numFmt).not.toContain("₽");
    // Row 9 (EUR): #,##0 "€" - NEVER ₽
    expect(sheet.getRow(9).getCell(3).numFmt).toBe(CURRENCY_NUMFMT.EUR.MONEY);
    expect(sheet.getRow(9).getCell(3).numFmt).not.toContain("₽");
    // Row 10 (Neutral): #,##0 - NEVER ₽
    expect(sheet.getRow(10).getCell(3).numFmt).toBe(NUMFMT.INTEGER);
    expect(sheet.getRow(10).getCell(3).numFmt).not.toContain("₽");
  });
});

describe("Excel Brand System — Semantic Status Taxonomy & Truthfulness (P1-3)", () => {
  it("never classifies negative or unpaid phrases as SUCCESS", () => {
    // Explicit negative phrases must NOT match "оплачен" or other positive substrings
    expect(mapBusinessStatusToSemantic("Не оплачен")).toBe("ATTENTION");
    expect(mapBusinessStatusToSemantic("Не оплачено")).toBe("ATTENTION");
    expect(mapBusinessStatusToSemantic("не оплачен")).toBe("ATTENTION");
    expect(mapBusinessStatusToSemantic("неоплачен")).toBe("ATTENTION");
    expect(mapBusinessStatusToSemantic("unpaid")).toBe("ATTENTION");

    expect(mapBusinessStatusToSemantic("Не подошёл")).toBe("NEGATIVE");
    expect(mapBusinessStatusToSemantic("Не подошел")).toBe("NEGATIVE");
    expect(mapBusinessStatusToSemantic("Не подошли")).toBe("NEGATIVE");
    expect(mapBusinessStatusToSemantic("Возвращен")).toBe("NEGATIVE");
    expect(mapBusinessStatusToSemantic("Ошибка")).toBe("NEGATIVE");

    // Positive phrases
    expect(mapBusinessStatusToSemantic("Оплачен")).toBe("SUCCESS");
    expect(mapBusinessStatusToSemantic("Оплачено")).toBe("SUCCESS");
    expect(mapBusinessStatusToSemantic("Платеж проведен")).toBe("SUCCESS");
    expect(mapBusinessStatusToSemantic("Платёж проведен")).toBe("SUCCESS");
    expect(mapBusinessStatusToSemantic("Подошли")).toBe("SUCCESS");
    expect(mapBusinessStatusToSemantic("Подошёл")).toBe("SUCCESS");

    // In-progress phrases
    expect(mapBusinessStatusToSemantic("Выставлен счет")).toBe("IN_PROGRESS");
    expect(mapBusinessStatusToSemantic("Выставлен счёт")).toBe("IN_PROGRESS");
    expect(mapBusinessStatusToSemantic("Ожидает подтверждения")).toBe("IN_PROGRESS");
    expect(mapBusinessStatusToSemantic("В работе")).toBe("IN_PROGRESS");
  });
});

describe("Excel Brand System — Header Provenance & Disambiguation (P1-4)", () => {
  it("preserves company provenance and disambiguates duplicate titles in mixed exports", () => {
    // Single header translation with provenance
    expect(formatHeaderToRussian("Тип продукта", { fieldId: "UF_CRM_DEAL_PROD" })).toBe("Тип продукта");
    expect(
      formatHeaderToRussian("Тип продукта", {
        fieldId: "COMPANY_UF_CRM_PROD",
        entity: "COMPANY",
        preserveProvenance: true,
      })
    ).toBe("Компания: Тип продукта");

    // Disambiguation of identical header strings
    const rawHeaders = ["Тип продукта", "Тип продукта"];
    const rawIds = ["UF_CRM_DEAL_PROD", "COMPANY_UF_CRM_PROD"];
    const disambiguated = disambiguateHeaders(rawHeaders, rawIds);
    expect(disambiguated).toEqual(["Тип продукта", "Компания: Тип продукта"]);
    expect(new Set(disambiguated).size).toBe(2);
  });
});

describe("Excel Brand System — Europe/Moscow Timezone Handling (P2-1)", () => {
  it("formats dates and datetimes strictly in Europe/Moscow timezone across midnight boundaries", () => {
    // 2026-09-24 22:30:00 UTC is 2026-09-25 01:30:00 MSK (UTC+3)
    const utcMidnightBoundary = new Date("2026-09-24T22:30:00.000Z");

    const formattedDate = formatReportDate(utcMidnightBoundary);
    expect(formattedDate).toBe("25.09.2026"); // In MSK it is already the 25th!

    const formattedFilename = formatReportDateForFilename(utcMidnightBoundary);
    expect(formattedFilename).toBe("2026-09-25"); // In MSK it is the 25th!

    const formattedDateTime = formatReportDateTime(utcMidnightBoundary);
    expect(formattedDateTime).toContain("25.09.2026");
    expect(formattedDateTime).toContain("01:30");
  });
});

describe("Excel Brand System — Single Company Native Dates & Currency (P2-3)", () => {
  it("converts company date strings to native Excel Date values while preserving text and nulls", () => {
    const dateField = normalizeCompanyReportFieldValue({
      id: "DATE_CREATE",
      label: "Дата создания",
      value: "2026-05-15T10:00:00Z",
      type: "datetime",
    });
    expect(dateField.value).toBeInstanceOf(Date);
    expect(dateField.numFmt).toBe(NUMFMT.DATETIME);

    const ruDateField = normalizeCompanyReportFieldValue({
      id: "UF_CRM_DATE",
      label: "Дата отправки образца",
      value: "15.05.2026",
    });
    expect(ruDateField.value).toBeInstanceOf(Date);
    expect(ruDateField.numFmt).toBe(NUMFMT.DATE);

    const textField = normalizeCompanyReportFieldValue({
      id: "TITLE",
      label: "Название компании",
      value: "ООО РусСилика",
    });
    expect(textField.value).toBe("ООО РусСилика");
    expect(textField.numFmt).toBeUndefined();

    const nullField = normalizeCompanyReportFieldValue({
      id: "DATE_MODIFY",
      label: "Дата изменения",
      value: null,
      type: "date",
    });
    expect(nullField.value).toBeNull();
    expect(nullField.isDateField).toBe(true);

    const emptyDateField = normalizeCompanyReportFieldValue({
      id: "UF_CRM_DATE",
      label: "Дата отправки образца",
      value: "",
    });
    expect(emptyDateField.value).toBeNull();
    expect(emptyDateField.isDateField).toBe(true);

    const emptyTextField = normalizeCompanyReportFieldValue({
      id: "COMMENTS",
      label: "Комментарий",
      value: "",
    });
    expect(emptyTextField.value).toBeNull();
    expect(emptyTextField.isDateField).toBe(false);
  });

  it("OpenXML Round-Trip: preserves semantic status fill and font colors after XLSX serialization and reload", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("StatusTest");

    const row = ws.addRow(["Не требуется", "Требует внимания", "Оплачен", "Не подошли"]);
    applyStatusCell(row.getCell(1), "Не требуется");
    applyStatusCell(row.getCell(2), "Требует внимания");
    applyStatusCell(row.getCell(3), "Оплачен");
    applyStatusCell(row.getCell(4), "Не подошли");

    // Write binary buffer and reload via ExcelJS
    const buffer = await wb.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as any);
    const reloadedWs = reloaded.getWorksheet("StatusTest")!;
    const reloadedRow = reloadedWs.getRow(1);

    // "Не требуется" -> NEUTRAL (no bright warning fill, subdued text)
    const neutralFill = reloadedRow.getCell(1).fill as any;
    expect(neutralFill?.fgColor?.argb).not.toBe(`FF${ATTENTION_BG}`);

    // "Требует внимания" -> ATTENTION (amber/yellow warning fill)
    const attentionFill = reloadedRow.getCell(2).fill as any;
    expect(attentionFill?.fgColor?.argb).toBe(`FF${ATTENTION_BG}`);

    // "Оплачен" -> SUCCESS (green fill)
    const successFill = reloadedRow.getCell(3).fill as any;
    expect(successFill?.fgColor?.argb).toBe(`FF${SUCCESS_BG}`);

    // "Не подошли" -> NEGATIVE (red fill)
    const negativeFill = reloadedRow.getCell(4).fill as any;
    expect(negativeFill?.fgColor?.argb).toBe("FFFDECEC");
  });
});
