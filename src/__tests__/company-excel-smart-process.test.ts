// @vitest-environment node
// src/__tests__/company-excel-smart-process.test.ts
// ─────────────────────────────────────────────────────────────────────
// Company Excel — Smart Process section (binary verification):
// E23 canonical field order = UI order; E24 empty field represented;
// E25 active/completed summary; E26 N items → N rows; E27 exactly 12
// columns; E28 human-readable values; E29 no raw ID leakage.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import ExcelJS from "exceljs";
import { createCompanyExcelWorkbook } from "@/lib/export-utils";
import { buildCompanyPreviewModel, partitionCompanyPreviewFields } from "@/lib/company-preview";
import {
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
} from "@/lib/crm-constants";

vi.spyOn(console, "error").mockImplementation(() => {});

const COMPANY = {
  ID: "42",
  TITLE: "Паритетная компания",
  ASSIGNED_BY_ID: "7",
  PHONE: "+7 900 111-22-33",
  [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: "1739",
  // Регион отсутствует → empty-field row representation (E24)
  DATE_CREATE: "2025-12-15T14:00:00Z",
  DATE_MODIFY: "2026-07-01T11:59:00Z",
};

const FIELDS_META = [
  { id: COMPANY_INDUSTRY_CURRENT_FIELD_ID, title: "Отрасль (согл. список)", type: "enumeration", listValues: [{ ID: "1739", VALUE: "Химия" }] },
];

const SP_ITEMS = [
  {
    processItemId: "9001",
    title: "Цикл активный",
    stageLabel: "Образцы на испытании",
    linkedDealId: "501",
    sentDates: ["2026-03-10"],
    grades: [{ productFamily: "Гель", value: "КСМГ-9" }],
    quantities: [{ productFamily: "Гель", value: 5, unit: "кг" }, { productFamily: "Золь", value: 2.5, unit: "л" }],
    grades2: undefined as never,
    rawTestResult: "Соответствует",
    normalizedResult: "positive",
    responsibleId: "7",
    dataIssues: [],
  },
  {
    processItemId: "9002",
    title: "Цикл завершённый",
    stageLabel: "Образец подошел",
    sentDates: ["2026-02-01"],
    grades: [{ productFamily: "Золь", value: "СКСГ-4" }],
    quantities: [],
    rawTestResult: undefined,
    normalizedResult: "positive",
    responsibleId: "999",
    dataIssues: ["RESPONSIBLE_UNKNOWN"],
  },
] as any;

describe("Company Excel — Smart Process section + parity (binary reload)", () => {
  let ws: ExcelJS.Worksheet;
  let rows: string[][];

  beforeAll(async () => {
    const model = buildCompanyPreviewModel(COMPANY, {
      fields: FIELDS_META as any,
      userNames: { "7": "Анна Иванова" },
    });

    const wb = createCompanyExcelWorkbook({
      companyTitle: model.title,
      companyId: model.companyId,
      companyFields: model.fields.map((f) => ({ id: f.id, label: f.label, value: f.value, type: f.type })),
      deals: [{ id: "501", title: "Сделка 501", stage: "В работе", opportunity: 100000, currency: "RUB" }],
      currentDate: new Date("2026-09-26T12:00:00Z"),
      companyModel: {
        fields: model.fields.map((f) => ({ id: f.id, label: f.label, value: f.value, type: f.type })),
        createdAt: model.createdAt,
        modifiedAt: model.modifiedAt,
        comments: model.comments,
      },
      testingMarkerField: {
        label: "Тестирование образцов",
        value: "Да",
        rawValue: "Y",
      },
      smartProcess: {
        activeCount: 1,
        completedCount: 1,
        items: SP_ITEMS,
        stale: false,
      },
      dealTitleById: new Map([["501", "Сделка 501"]]),
      userNames: { "7": "Анна Иванова" },
    });

    const buffer = await wb.xlsx.writeBuffer();
    const fresh = new ExcelJS.Workbook();
    await fresh.xlsx.load(buffer as ArrayBuffer);
    ws = fresh.getWorksheet("Отчёт по компании")!;
    rows = [];
    ws.eachRow((row) => {
      const cells: string[] = [];
      for (let c = 1; c <= 13; c++) {
        const v = row.getCell(c).value;
        cells.push(v === null || v === undefined ? "" : String(v));
      }
      rows.push(cells);
    });
  });

  beforeEach(() => {});
  afterEach(() => {});

  it("case E23: Company Excel Section 1 contains EXACTLY the canonical UI business fields (no extra ID компании row)", () => {
    // Expected labels derive from the PRODUCTION canonical definition (the
    // same partition helper the UI drawer uses) — never a manually typed
    // second list and never a slice(1) offset for a technical ID row.
    const model = buildCompanyPreviewModel(COMPANY, {
      fields: FIELDS_META as any,
      userNames: { "7": "Анна Иванова" },
    });
    const EXPECTED_LABELS = partitionCompanyPreviewFields(model).business.map((f) => f.label);

    const section1Labels: string[] = [];
    let inSection1 = false;
    for (const cells of rows) {
      const first = cells[0];
      if (first === "Информация о компании") { inSection1 = true; continue; }
      if (first === "Информация об образцах") { inSection1 = false; }
      if (inSection1 && first && !first.startsWith("Информация")) {
        section1Labels.push(first);
      }
    }
    // Strict parity: Section 1 = exactly the canonical business-field
    // sequence rendered by CompanyPreview. The Company ID lives in the
    // workbook account header, not as an extra leading row here.
    expect(section1Labels).toEqual(EXPECTED_LABELS);
    expect(section1Labels[0]).toBe("Ответственный");
    expect(section1Labels).not.toContain("ID компании");
  });

  it("case E24: an empty approved Company field is represented, not omitted (Регион → —)", () => {
    const regionRow = rows.find((cells) => cells[0] === "Регион");
    expect(regionRow).toBeTruthy();
    expect(regionRow![1]).toBe("—");
  });

  it("case E25: Smart Process summary contains active/completed counts", () => {
    expect(rows.some((cells) => cells[0] === "Активных процессов" && cells[1] === "1")).toBe(true);
    expect(rows.some((cells) => cells[0] === "Завершённых процессов" && cells[1] === "1")).toBe(true);
  });

  it("case E26: N physical cycles → N Smart Process Excel rows (no collapsing)", () => {
    const itemRows = rows.filter((cells) => cells[0] === "9001" || cells[0] === "9002");
    expect(itemRows).toHaveLength(2);
  });

  it("case E27: cycle table contains exactly the 12 requested columns", () => {
    const headerIdx = rows.findIndex((cells) => cells[0] === "ID процесса");
    expect(headerIdx).toBeGreaterThan(0);
    const headers = rows[headerIdx].slice(0, 12);
    expect(headers).toEqual([
      "ID процесса",
      "Название",
      "Стадия",
      "Связанная сделка",
      "Дата отправки",
      "Марка ГЕЛЬ",
      "Количество ГЕЛЬ, кг",
      "Марка ЗОЛЬ",
      "Количество ЗОЛЬ, л",
      "Результат испытаний",
      "Ответственный",
      "Качество данных / предупреждение",
    ]);
    // Column 13 must be empty in header and data rows of this table.
    expect(rows[headerIdx][12]).toBe("");
  });

  it("case E28: relation/result/responsible/quality values are human-readable and safe", () => {
    const row1 = rows.find((cells) => cells[0] === "9001")!;
    // Relation: readable title + retained ID.
    expect(row1[3]).toBe("Сделка 501 (ID 501)");
    // Sent date authoritative manual date.
    expect(row1[4]).toBe("2026-03-10");
    // Grades / quantities from canonical item data (numeric quantity stays numeric).
    expect(row1[5]).toBe("КСМГ-9");
    // Result: factual free text.
    expect(row1[9]).toBe("Соответствует");
    // Responsible: human name via resolver.
    expect(row1[10]).toBe("Анна Иванова");
    // No issues → dash.
    expect(row1[11]).toBe("—");

    const row2 = rows.find((cells) => cells[0] === "9002")!;
    // No linked deal → explicit truthful label.
    expect(row2[3]).toBe("Без связанной сделки");
    // Result falls back to the canonical classification label.
    expect(row2[9]).toBe("Положительный");
    // Unknown responsible → neutral coverage-aware label, never raw ID 999.
    expect(row2[10]).toBe("Неизвестный сотрудник (справочник неполный)");
    // Quality issue uses a readable label (unknown code → neutral label).
    expect(row2[11]).not.toBe("RESPONSIBLE_UNKNOWN");
    expect(row2[11]).toBe("Не классифицировано");
  });

  it("case E29: raw stage IDs / raw user IDs / raw enum numeric IDs do not leak anywhere in the workbook", () => {
    const joined = rows.flat().join("\n");
    expect(joined).not.toMatch(/DT1032_/);
    expect(joined).not.toContain("999");
    expect(joined).not.toContain("ASSIGNED_BY_ID");
    expect(joined).not.toMatch(/UF_CRM_\d+/);
    expect(joined).not.toContain("1739"); // raw enum id of industry
  });
});
