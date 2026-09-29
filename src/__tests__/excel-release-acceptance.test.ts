// @vitest-environment node
// ─────────────────────────────────────────────────────────────────────
// Excel release acceptance — all supported report families.
// For each family: generate → serialize .xlsx → reload into a NEW
// ExcelJS.Workbook → inspect the serialized file.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildWysiwygWorkbook,
  createCompanyExcelWorkbook,
} from "@/lib/export-utils";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import type { CommercialCompany, CommercialDeal, CommercialFilters } from "@/lib/commercial-funnel/types";
import { DEFAULT_COMMERCIAL_FILTERS } from "@/lib/commercial-funnel/constants";

async function reload(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buffer = await wb.xlsx.writeBuffer();
  const fresh = new ExcelJS.Workbook();
  await fresh.xlsx.load(buffer as ArrayBuffer);
  return fresh;
}

const CELL_TEXT = (ws: ExcelJS.Worksheet): string[] =>
  ws.getSheetValues().flat().filter((v): v is string => typeof v === "string");

// ─────────────────────────────────────────────────────────────────────
// 1. Deals WYSIWYG
// ─────────────────────────────────────────────────────────────────────
describe("Excel release acceptance — Deals WYSIWYG", () => {
  it("serializes, reloads, and preserves structure, values, typing and coverage", async () => {
    const wb = await buildWysiwygWorkbook(
      [
        ["101", "Сделка А", new Date("2026-09-01T09:00:00Z"), 150000, "В работе"],
        ["102", "Сделка Б", null, null, "WON"],
        ["103", "Сделка В", new Date("2026-09-15T12:30:00Z"), 250.5, "LOSE"],
      ],
      ["ID", "TITLE", "DATE_CREATE", "OPPORTUNITY", "STAGE_ID"],
      {
        title: "Отчёт по сделкам",
        sheetName: "Сделки",
        period: "2026-09-01 — 2026-09-30",
        filtersText: 'Ответственный: Иванов | Воронка: В работе | Поиск (только таблица): "Силика" | Столбец "Регион": "Москва"',
        rawColumnIds: ["ID", "TITLE", "DATE_CREATE", "OPPORTUNITY", "STAGE_ID"],
        rawColumnTypes: [undefined, "string", "datetime", "double", "string"],
        coverage: {
          status: "CAPPED",
          fetched: 1000,
          total: 1274,
          cap: 1000,
          warning: "Данные усечены",
        },
      }
    );

    const reloaded = await reload(wb);
    const ws = reloaded.getWorksheet("Сделки");
    expect(ws).toBeDefined();
    if (!ws) return;

    // Entity IDs present as text
    const texts = CELL_TEXT(ws);
    expect(texts).toContain("101");
    expect(texts).toContain("102");
    expect(texts).toContain("103");

    // Native numeric values survive the binary round trip
    const oppCells: number[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(4).value;
      if (typeof v === "number") oppCells.push(v);
    });
    expect(oppCells).toContain(150000);
    expect(oppCells).toContain(250.5);

    // Native dates survive
    const dateCells: Date[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(3).value;
      if (v instanceof Date) dateCells.push(v);
    });
    expect(dateCells.length).toBe(2);

    // Blank cells stay blank (null), not "—" fabricated strings, for missing values
    const row2 = ws.getRow(8); // header at 6, first data row 7, second 8
    expect(row2.getCell(3).value ?? null).toBeNull();
    expect(row2.getCell(4).value ?? null).toBeNull();

    // Coverage disclosure present and prominent
    expect(texts.some((t) => t.includes("НЕПОЛНЫЙ НАБОР"))).toBe(true);
    expect(texts.some((t) => t.includes("1000 из 1274"))).toBe(true);
    expect(texts.some((t) => t.includes("лимит загрузки"))).toBe(true);

    // Filter disclosure refers to the exact same scope
    expect(texts.some((t) => t.includes('Поиск (только таблица): "Силика"'))).toBe(true);
    expect(texts.some((t) => t.includes('Столбец "Регион": "Москва"'))).toBe(true);

    // Freeze panes + AutoFilter + print config
    expect(ws.views?.[0]?.state).toBe("frozen");
    expect(ws.autoFilter).toBeDefined();
    expect(ws.pageSetup).toBeDefined();
  });

  it("formula injection is neutralized in serialized output", async () => {
    const wb = await buildWysiwygWorkbook(
      [["=HYPERLINK(\"http://evil\")", "=cmd|' /C calc'!A0", "+SUM(A1:A2)"]],
      ["TITLE"],
      { sheetName: "Сделки" }
    );
    const reloaded = await reload(wb);
    const ws = reloaded.getWorksheet("Сделки")!;
    const texts = CELL_TEXT(ws);
    for (const t of texts) {
      if (t.includes("HYPERLINK") || t.includes("cmd") || t.includes("SUM")) {
        expect(t.startsWith("'")).toBe(true);
      }
    }
    // No cell holds a raw formula
    ws.eachRow((row) => {
      for (let c = 1; c <= row.cellCount; c++) {
        const v = row.getCell(c).value;
        if (v && typeof v === "object" && "formula" in (v as object)) {
          expect.unreachable("formula object leaked into serialized output");
        }
      }
    });
  });

  it("PARTIAL coverage carries failure disclosure", async () => {
    const wb = await buildWysiwygWorkbook(
      [["1", "X"]],
      ["ID", "TITLE"],
      {
        coverage: {
          status: "PARTIAL",
          fetched: 800,
          total: 1200,
          warning: "err",
          failedPages: [50, 100],
        },
      }
    );
    const reloaded = await reload(wb);
    const texts = CELL_TEXT(reloaded.getWorksheet("Сделки")!);
    expect(texts.some((t) => t.includes("ЧАСТИЧНЫЕ ДАННЫЕ"))).toBe(true);
    expect(texts.some((t) => t.includes("800 из 1200"))).toBe(true);
    expect(texts.some((t) => t.includes("ошибка получения части страниц"))).toBe(true);
  });

  it("COMPLETE coverage states Полный набор", async () => {
    const wb = await buildWysiwygWorkbook(
      [["1", "X"]],
      ["ID", "TITLE"],
      { coverage: { status: "COMPLETE", fetched: 5, total: 5 } }
    );
    const reloaded = await reload(wb);
    const texts = CELL_TEXT(reloaded.getWorksheet("Сделки")!);
    expect(texts.some((t) => t.includes("Полный набор"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Companies WYSIWYG
// ─────────────────────────────────────────────────────────────────────
describe("Excel release acceptance — Companies WYSIWYG", () => {
  it("serializes and reloads with company entity IDs and coverage", async () => {
    const wb = await buildWysiwygWorkbook(
      [
        ["501", "ООО Силика", "7", 1200000],
        ["502", "АО Кварц", "8", null],
      ],
      ["ID", "TITLE", "ASSIGNED_BY_ID", "COMPANY_REVENUE"],
      {
        title: "Отчёт по компаниям",
        sheetName: "Компании",
        rawColumnIds: ["ID", "TITLE", "ASSIGNED_BY_ID", "COMPANY_REVENUE"],
        rawColumnTypes: [undefined, "string", "user", "double"],
        coverage: {
          status: "CAPPED",
          fetched: 5000,
          total: 6320,
          cap: 5000,
          warning: "Данные усечены",
        },
      }
    );

    const reloaded = await reload(wb);
    const ws = reloaded.getWorksheet("Компании")!;
    const texts = CELL_TEXT(ws);
    expect(texts).toContain("501");
    expect(texts).toContain("502");
    expect(texts).toContain("ООО Силика");
    expect(texts.some((t) => t.includes("5000 из 6320"))).toBe(true);
    expect(ws.views?.[0]?.state).toBe("frozen");
    expect(ws.autoFilter).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Single Company
// ─────────────────────────────────────────────────────────────────────
describe("Excel release acceptance — Single Company", () => {
  it("serializes and reloads: card fields, typed values, related deals", async () => {
    const wb = createCompanyExcelWorkbook({
      companyTitle: "ООО Силика",
      companyId: "42",
      companyFields: [
        { id: "ASSIGNED_BY_ID", label: "Ответственный компании", value: "Анна Смирнова" },
        // §27/§38: explicit string type wins — date-looking value stays text
        { id: "UF_CRM_TEXT_DATE", label: "Дата договора текстом", value: "2026-09-01", type: "string" },
        // §26: explicit string type wins — money-looking value stays text
        { id: "UF_CRM_TEXT_MONEY", label: "Комментарий по сумме", value: "50000 RUB", type: "string" },
      ],
      sampleFields: [
        { id: "UF_CRM_1764156593", label: "Результат испытаний", value: "Успешно" },
      ],
      deals: [
        { id: "101", title: "Сделка нормальная", stage: "В работе", opportunity: 350000, currency: "RUB" },
        { id: "102", title: "Сделка нулевая", stage: "В работе", opportunity: 0, currency: "RUB" },
        // malformed amount → null (blank cell), never a fabricated number
        { id: "103", title: "Сделка с ошибкой", stage: "Проиграны", opportunity: null, currency: "RUB" },
      ],
      currentDate: new Date("2026-09-26T12:00:00Z"),
    });

    const reloaded = await reload(wb);
    const ws = reloaded.getWorksheet("Отчёт по компании")!;
    const texts = CELL_TEXT(ws);

    // Entity identity
    expect(texts).toContain("42");
    expect(texts).toContain("101");
    expect(texts).toContain("102");
    expect(texts).toContain("103");

    // §27: string-typed date-looking value stays text
    expect(texts).toContain("2026-09-01");
    // §26: string-typed money-looking value stays text
    expect(texts).toContain("50000 RUB");

    // Deal amounts: 350000 and 0 native, malformed → blank ("—")
    const amounts: Array<number | string> = [];
    ws.eachRow((row) => {
      const v = row.getCell(4).value;
      if (typeof v === "number") amounts.push(v);
      else if (typeof v === "string") amounts.push(v);
    });
    expect(amounts).toContain(350000);
    expect(amounts).toContain(0);
    expect(amounts).toContain("—");

    // Header + footer structure
    expect(texts.some((t) => t.includes("ОТЧЁТ ПО КОМПАНИИ"))).toBe(true);
    expect(ws.pageSetup).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Commercial Funnel
// ─────────────────────────────────────────────────────────────────────
function makeFunnelData() {
  const deals: CommercialDeal[] = [
    {
      id: "301",
      title: "Сделка Ф1",
      companyId: "901",
      responsibleId: "7",
      responsibleName: "Анна",
      stageId: "C1:WON",
      categoryId: "1",
      opportunity: 100000,
      opportunityQuality: "VALID",
      currencyId: "RUB",
      dateCreate: "2026-09-05",
    },
  ] as unknown as CommercialDeal[];
  const companies: CommercialCompany[] = [
    {
      id: "901",
      title: "Компания Ф1",
      responsibleId: "7",
      responsibleName: "Анна",
      dateCreate: "2026-09-01",
      industry: "Строительство",
      deals,
    },
  ] as unknown as CommercialCompany[];
  return { companies, deals };
}

describe("Excel release acceptance — Commercial Funnel", () => {
  const filters: CommercialFilters = {
    ...DEFAULT_COMMERCIAL_FILTERS,
    periodPreset: "custom",
    customFrom: "2026-09-01",
    customTo: "2026-09-30",
  };

  it("produces the 6 management sheets with reconciled entity IDs", async () => {
    const { companies, deals } = makeFunnelData();
    const wb = await createCommercialFunnelWorkbook({
      companies,
      deals,
      filters,
      userNames: { "7": "Анна" },
      now: new Date("2026-09-26T12:00:00Z"),
    });

    const reloaded = await reload(wb);
    const sheetNames = reloaded.worksheets.map((s) => s.name);
    expect(sheetNames).toEqual([
      "Executive Summary",
      "Funnel",
      "Segments",
      "Sample Testing",
      "Managers",
      "Action Plan",
    ]);

    const sampleTestingSheet = reloaded.getWorksheet("Sample Testing")!;
    const texts = CELL_TEXT(sampleTestingSheet);
    expect(texts).toContain("Компания Ф1");

    // Filters disclosed on the summary sheet
    const summaryTexts = CELL_TEXT(reloaded.getWorksheet("Executive Summary")!);
    expect(summaryTexts.some((t) => t.includes("Ответственный"))).toBe(true);
  });

  it("stamps activity-partial warning on Managers and Action Plan sheets", async () => {
    const { companies, deals } = makeFunnelData();
    const wb = await createCommercialFunnelWorkbook({
      companies,
      deals,
      filters,
      userNames: { "7": "Анна" },
      now: new Date("2026-09-26T12:00:00Z"),
      extraWarnings: ["Данные активностей загружены частично"],
    });

    const reloaded = await reload(wb);
    const managersTexts = CELL_TEXT(reloaded.getWorksheet("Managers")!);
    const actionPlanTexts = CELL_TEXT(reloaded.getWorksheet("Action Plan")!);
    expect(managersTexts.some((t) => t.includes("Данные активностей загружены частично"))).toBe(true);
    expect(actionPlanTexts.some((t) => t.includes("Данные активностей загружены частично"))).toBe(true);
  });

  it("demo-mode dataset can never be exported (hard guard throws)", async () => {
    const { companies, deals } = makeFunnelData();
    await expect(
      createCommercialFunnelWorkbook({
        companies,
        deals,
        filters,
        userNames: {},
        isDemoMode: true,
      })
    ).rejects.toThrow(/демо-режиме/i);
  });

  it("freeze panes, AutoFilter and print configuration present on data sheets", async () => {
    const { companies, deals } = makeFunnelData();
    const wb = await createCommercialFunnelWorkbook({
      companies,
      deals,
      filters,
      userNames: { "7": "Анна" },
      now: new Date("2026-09-26T12:00:00Z"),
    });
    const reloaded = await reload(wb);
    for (const name of ["Funnel", "Segments", "Sample Testing", "Managers", "Action Plan"]) {
      const ws = reloaded.getWorksheet(name)!;
      expect(ws.views?.[0]?.state).toBe("frozen");
      expect(ws.autoFilter).toBeDefined();
      expect(ws.pageSetup).toBeDefined();
    }
  });
});
