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
    productFamilies: ["Гель"],
    grades: [{ productFamily: "Гель", value: "КСМГ-5" }],
    quantities: [{ productFamily: "Гель", value: 10, unit: "кг" }],
    sentDates: ["2026-02-15"],
    sampleIndicators: ["Переданы"],
    processStatuses: ["В работе"],
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
    productFamilies: [],
    grades: [],
    quantities: [],
    sentDates: [],
    sampleIndicators: [],
    processStatuses: [],
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
      "Ответственный",
      "Отрасль / применение",
      "Продукт",
      "Марка",
      "Количество",
      "Дата передачи",
      "Статус",
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
    expect(row7.getCell(10).value).toBe("Успешно");
    expect(row7.getCell(11).value).toBe("Сделка №501");

    // Verify Row 8 formula escaping
    const row8 = ws!.getRow(8);
    expect(row8.getCell(2).value).toBe("'=MALICIOUS_CMD()");
    expect(row8.getCell(10).value).toBe("На доработке");

    // Verify Row 9 unmapped responsible displays properly (never raw ID 999)
    const row9 = ws!.getRow(9);
    expect(row9.getCell(3).value).toBe("Сотрудник не найден");
    expect(row9.getCell(10).value).toBe("Неизвестно");
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
});
