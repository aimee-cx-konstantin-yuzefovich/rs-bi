// src/__tests__/samples-export.test.ts
// ─────────────────────────────────────────────────────────────────────
// SMP-EXP-1 .. SMP-EXP-4: Samples Excel Export verification suite.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import ExcelJS from "exceljs";
import { buildSamplesWorkbook, exportSamplesToExcel } from "@/lib/export-utils";
import type { SampleSummary } from "@/lib/samples/types";

const MOCK_EXPORT_SAMPLES: SampleSummary[] = [
  {
    companyId: "101",
    companyTitle: "ООО ХимПром",
    responsibleId: "1",
    companyResponsibleId: "1",
    productFamilies: ["Гель"],
    grades: [{ productFamily: "Гель", value: "КСМГ-5" }],
    quantities: [{ productFamily: "Гель", value: 10, unit: "кг" }],
    sentDates: ["2026-02-15"],
    sampleIndicators: ["Переданы"],
    processStatuses: ["В работе"],
    currentStatusSource: "COMPANY_LEGACY",
    currentStatusValues: ["В работе"],
    rawTestResult: "Образцы соответствуют ТУ 123",
    normalizedResult: "positive",
    industry: "Химия",
    application: "Катализаторы",
    relatedDeals: [{ id: "501", title: "Сделка №501", sampleTestingStatus: [] }],
    sourceQuality: "structured",
    dataIssues: [],
  },
  {
    companyId: "102",
    companyTitle: "=MALICIOUS_CMD()", // Formula injection test candidate
    responsibleId: "2",
    companyResponsibleId: "2",
    productFamilies: ["Золь", "Гель"],
    grades: [
      { productFamily: "Золь", value: "СКСГ-2" },
      { productFamily: "Гель", value: "ШСМГ-1" },
    ],
    quantities: [
      { productFamily: "Золь", value: 25, unit: "л" },
      { productFamily: "Гель", value: 5, unit: "кг" },
    ],
    sentDates: ["2026-03-01", "2026-03-10"],
    sampleIndicators: ["Тестируются"],
    processStatuses: [],
    currentStatusSource: "NONE",
    currentStatusValues: [],
    rawTestResult: "Требуется доработка рецептуры",
    normalizedResult: "rework",
    industry: "Нефтегаз",
    application: "Осушка",
    relatedDeals: [
      { id: "502", title: "Сделка А", sampleTestingStatus: [] },
      { id: "503", title: "Сделка Б", sampleTestingStatus: [] },
    ],
    sourceQuality: "partial",
    dataIssues: [],
  },
  {
    companyId: "103",
    companyTitle: "АО Кварц",
    responsibleId: "999", // Unmapped ID
    companyResponsibleId: "999", // Unmapped company responsible (never raw in export)
    productFamilies: [],
    grades: [],
    quantities: [],
    sentDates: [],
    sampleIndicators: [],
    processStatuses: [],
    currentStatusSource: "NONE",
    currentStatusValues: [],
    rawTestResult: undefined,
    normalizedResult: "unknown",
    industry: undefined,
    application: undefined,
    relatedDeals: [],
    sourceQuality: "ambiguous",
    dataIssues: [],
  },
];

const MOCK_USER_NAMES = {
  "1": "Иван Иванов",
  "2": "Петр Петров",
};

describe("Samples Excel Export (SMP-EXP-1 .. SMP-EXP-4)", () => {
  it("SMP-EXP-1: filtered 3 rows → Excel contains exactly 3 data rows", async () => {
    const workbook = await buildSamplesWorkbook({
      summaries: MOCK_EXPORT_SAMPLES, // 3 items
      userNames: MOCK_USER_NAMES,
    });

    const worksheet = workbook.getWorksheet("Образцы");
    expect(worksheet).toBeDefined();

    // Row 6 is table header, data rows are 7, 8, 9 (exactly 3 data rows)
    const row1 = worksheet!.getRow(7);
    const row2 = worksheet!.getRow(8);
    const row3 = worksheet!.getRow(9);

    expect(row1.getCell(2).value).toBe("ООО ХимПром");
    expect(row2.getCell(2).value).toBe("'=MALICIOUS_CMD()");
    expect(row3.getCell(2).value).toBe("АО Кварц");

    // Row 10 must not contain any data row
    const row4 = worksheet!.getRow(10);
    expect(row4.getCell(1).value).toBeNull();
    expect(row4.getCell(2).value).toBeNull();
  });

  it("SMP-EXP-2: first Excel column is '№' and contains 1, 2, 3", async () => {
    const workbook = await buildSamplesWorkbook({
      summaries: MOCK_EXPORT_SAMPLES,
      userNames: MOCK_USER_NAMES,
    });

    const worksheet = workbook.getWorksheet("Образцы");
    expect(worksheet).toBeDefined();

    // Table header first column is №
    const headerRow = worksheet!.getRow(6);
    expect(headerRow.getCell(1).value).toBe("№");

    // Rows 7, 8, 9 contain sequential integers 1, 2, 3
    expect(worksheet!.getRow(7).getCell(1).value).toBe(1);
    expect(worksheet!.getRow(8).getCell(1).value).toBe(2);
    expect(worksheet!.getRow(9).getCell(1).value).toBe(3);
  });

  it("SMP-EXP-3: Excel contains no Quality column", async () => {
    const workbook = await buildSamplesWorkbook({
      summaries: MOCK_EXPORT_SAMPLES,
      userNames: MOCK_USER_NAMES,
    });

    const worksheet = workbook.getWorksheet("Образцы");
    const headerRow = worksheet!.getRow(6);
    const headers: string[] = [];
    headerRow.eachCell((cell) => {
      headers.push(String(cell.value || ""));
    });

    expect(headers).not.toContain("Качество данных");
    expect(headers).not.toContain("Качество");
    expect(headers).not.toContain("sourceQuality");
    expect(headers).not.toContain("dataIssues");
  });

  it("SMP-EXP-4: binary Excel reload succeeds", async () => {
    const workbook = await buildSamplesWorkbook({
      summaries: MOCK_EXPORT_SAMPLES,
      userNames: MOCK_USER_NAMES,
      usersCoverage: { status: "COMPLETE", fetched: 2, total: 2 },
    });

    // Write to binary buffer
    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);

    // Re-read with a completely new ExcelJS.Workbook instance
    const loadedWorkbook = new ExcelJS.Workbook();
    await loadedWorkbook.xlsx.load(buffer);

    const ws = loadedWorkbook.getWorksheet("Образцы");
    expect(ws).toBeDefined();

    // Table header row is row 6
    const headerRow = ws!.getRow(6);
    const headers: string[] = [];
    headerRow.eachCell((cell) => {
      headers.push(String(cell.value || ""));
    });

    const EXPECTED_HEADERS = [
      "№",
      "Компания",
      "Ответственный компании",
      "Отрасль / применение",
      "Продукт",
      "Марка",
      "Количество",
      "Дата передачи",
      "Статус",
      "Текущий этап тестирования",
      "Активных процессов",
      "Результат",
      "Сделки",
    ];

    expect(headers).toEqual(EXPECTED_HEADERS);

    // Verify NO quality column or technical quality badges
    expect(headers).not.toContain("Качество данных");
    expect(headers).not.toContain("sourceQuality");

    // Scan all cells in worksheet: no 'false' or 'undefined' string values
    const allCellValues: string[] = [];
    ws!.eachRow((row) => {
      row.eachCell((cell) => {
        const val = cell.value;
        if (typeof val === "string") {
          allCellValues.push(val);
        } else if (val && typeof val === "object" && "richText" in val) {
          for (const rt of (val as any).richText) {
            allCellValues.push(rt.text);
          }
        }
      });
    });

    for (const text of allCellValues) {
      expect(text.toLowerCase()).not.toBe("false");
      expect(text.toLowerCase()).not.toBe("undefined");
      expect(text.toLowerCase()).not.toBe("null");
    }

    // Verify Row 7 (first company)
    const row7 = ws!.getRow(7);
    expect(row7.getCell(1).value).toBe(1);
    expect(row7.getCell(2).value).toBe("ООО ХимПром");
    // COMPANY grain after binary round-trip: company owner (user 1), never
    // the current process responsible.
    expect(row7.getCell(3).value).toBe("Иван Иванов");
    expect(row7.getCell(4).value).toBe("Химия / Катализаторы");
    expect(row7.getCell(5).value).toBe("Гель");
    expect(row7.getCell(6).value).toBe("КСМГ-5");
    expect(row7.getCell(7).value).toBe("10 кг");
    const dateVal = row7.getCell(8).value;
    if (dateVal instanceof Date) {
      expect(dateVal.toISOString()).toContain("2026-02-15");
    } else {
      expect(dateVal).toBe("15.02.2026");
    }
    expect(row7.getCell(9).value).toBe("Переданы, В работе");
    // No active Smart Process stages in fixture 1 → empty stage cell + count 0
    expect(row7.getCell(10).value).toBeNull();
    expect(row7.getCell(11).value).toBe(0);
    expect(row7.getCell(12).value).toBe("Успешно");
    expect(row7.getCell(13).value).toBe("Сделка №501");

    // Verify Row 8 formula escaping
    const row8 = ws!.getRow(8);
    expect(row8.getCell(2).value).toBe("'=MALICIOUS_CMD()");
    expect(row8.getCell(3).value).toBe("Петр Петров");
    expect(row8.getCell(12).value).toBe("На доработке");

    // Verify Row 9 unmapped responsible displays properly (never raw ID 999)
    const row9 = ws!.getRow(9);
    expect(row9.getCell(3).value).toBe("Сотрудник не найден");
    expect(row9.getCell(12).value).toBe("Неизвестно");
  });

  it("SMP-EXP-5: active Smart Process stages export without winner selection", async () => {
    const summaries: SampleSummary[] = [
      {
        ...MOCK_EXPORT_SAMPLES[0],
        companyId: "110",
        companyTitle: "ООО МультиАктив",
        currentActiveStageLabels: ["Испытания", "Ожидание ответа"],
        activeSmartProcessCount: 2,
      },
      {
        ...MOCK_EXPORT_SAMPLES[0],
        companyId: "111",
        companyTitle: "ООО ОдинАктив",
        currentActiveStageLabels: ["Отправка образцов"],
        activeSmartProcessCount: 1,
      },
    ];
    const workbook = await buildSamplesWorkbook({
      summaries,
      userNames: MOCK_USER_NAMES,
    });
    const ws = workbook.getWorksheet("Образцы")!;

    // >1 active: ALL unique stage labels disclosed, no winner chosen.
    const multiRow = ws.getRow(7);
    expect(multiRow.getCell(2).value).toBe("ООО МультиАктив");
    expect(multiRow.getCell(10).value).toBe("Испытания, Ожидание ответа");
    expect(multiRow.getCell(11).value).toBe(2);

    // Exactly 1 active: its stage label.
    const singleRow = ws.getRow(8);
    expect(singleRow.getCell(2).value).toBe("ООО ОдинАктив");
    expect(singleRow.getCell(10).value).toBe("Отправка образцов");
    expect(singleRow.getCell(11).value).toBe(1);

    // Binary round-trip keeps the count numeric.
    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as ArrayBuffer);
    const reWs = reloaded.getWorksheet("Образцы")!;
    expect(reWs.getRow(7).getCell(11).value).toBe(2);
    expect(reWs.getRow(8).getCell(11).value).toBe(1);
  });

  it("SMP-EXP-6: stage labels are deduplicated AFTER sanitization (two raw reps sanitizing to «Не классифицировано» render once)", async () => {
    const summaries: SampleSummary[] = [
      {
        ...MOCK_EXPORT_SAMPLES[0],
        companyId: "120",
        companyTitle: "ООО Дедуп",
        // Two DIFFERENT unsafe/raw representations that both sanitize to the
        // neutral label: a raw numeric enum ID and a raw DT1032_* stage ID.
        currentActiveStageLabels: ["2695", "DT1032_15:CLIENT"],
        activeSmartProcessCount: 2,
      },
    ];
    const workbook = await buildSamplesWorkbook({
      summaries,
      userNames: MOCK_USER_NAMES,
    });
    const ws = workbook.getWorksheet("Образцы")!;
    const row = ws.getRow(7);
    expect(row.getCell(2).value).toBe("ООО Дедуп");
    // ONE «Не классифицировано» — not «Не классифицировано, Не классифицировано».
    expect(row.getCell(10).value).toBe("Не классифицировано");
    // The active-process count stays the numeric 2 (count is independent of
    // label deduplication).
    expect(row.getCell(11).value).toBe(2);
  });

  it("SMP-EXP-DOWNLOAD: exportSamplesToExcel triggers browser download when summaries exist", async () => {
    const originalDocument = global.document;
    const originalWindow = global.window;
    const clickedLinks: string[] = [];

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(() => {
        clickedLinks.push(mockAnchor.download);
      }),
    };

    (global as any).document = {
      createElement: vi.fn((tag: string) => {
        if (tag === "a") return mockAnchor;
        return originalDocument?.createElement(tag);
      }),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };

    (global as any).window = {
      URL: {
        createObjectURL: vi.fn(() => "blob:mock-url"),
        revokeObjectURL: vi.fn(),
      },
    };

    try {
      await exportSamplesToExcel({
        summaries: MOCK_EXPORT_SAMPLES,
        userNames: MOCK_USER_NAMES,
        usersCoverage: { status: "COMPLETE", fetched: 2, total: 2 },
      });

      expect(mockAnchor.click).toHaveBeenCalledTimes(1);
      expect(clickedLinks.length).toBe(1);
      expect(clickedLinks[0]).toMatch(/^РусСилика_Образцы_\d{4}-\d{2}-\d{2}\.xlsx$/);
    } finally {
      global.document = originalDocument;
      global.window = originalWindow;
    }
  });

  // ─── Phase C §31: Smart-Process-source reconciliation ───

  it("SMP-EXP-SP: SP-source summary reconciles exactly — human-readable status/responsible, no raw enum IDs", async () => {
    const spSummary: SampleSummary = {
      companyId: "900",
      companyTitle: "ООО СП-Компани",
      responsibleId: "7",
      responsibleName: "Сергей Процессный",
      companyResponsibleId: "7",
      companyResponsibleName: "Сергей Процессный",
      productFamilies: [],
      grades: [
        { productFamily: "Гель", value: "КСМГ-9" },
        { productFamily: "Золь", value: "СКСГ-4" },
      ],
      quantities: [],
      sentDates: ["2026-09-05"],
      sampleIndicators: [],
      processStatuses: ["На испытании"],
      currentStatusSource: "COMPANY_LEGACY",
      currentStatusValues: ["На испытании"],
      rawTestResult: "Образцы соответствуют",
      normalizedResult: "positive",
      industry: "Химия",
      application: undefined,
      relatedDeals: [],
      latestRelevantDate: "2026-09-05",
      sourceQuality: "structured",
      dataIssues: [],
    };

    const workbook = await buildSamplesWorkbook({
      summaries: [spSummary],
      userNames: { "7": "Сергей Процессный" },
    });
    const ws = workbook.getWorksheet("Образцы")!;
    // Single data row = row 7.
    const row = ws.getRow(7);
    expect(row.getCell(2).value).toBe("ООО СП-Компани");
    // Responsible resolved to the human name from the SAME summary the UI uses.
    expect(row.getCell(3).value).toBe("Сергей Процессный");
    // Current status is the SP stage label (human-readable), never a stage ID.
    const rowValues: string[] = [];
    row.eachCell((cell) => rowValues.push(String(cell.value ?? "")));
    expect(rowValues.join(" | ")).toContain("На испытании");
    expect(rowValues.join(" | ")).not.toContain("DT1032_15");
    // Grades carried through.
    expect(rowValues.join(" | ")).toContain("КСМГ-9");
    expect(rowValues.join(" | ")).toContain("СКСГ-4");
    // Sent date preserved as a native Date cell (label heuristic «Дата
    // передачи» converts the ISO string to an Excel date — §27 contract).
    const dateCell = row.getCell(8).value; // column 8 = «Дата передачи»
    expect(dateCell).toBeInstanceOf(Date);
    expect((dateCell as Date).getUTCMonth()).toBe(8); // September (0-based)
    expect((dateCell as Date).getUTCDate()).toBe(5);
  });
});
