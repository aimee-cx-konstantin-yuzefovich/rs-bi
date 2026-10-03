// @vitest-environment node
// src/__tests__/company-excel-lookup-disclosure-workbook.test.ts
// ─────────────────────────────────────────────────────────────────────
// Company Excel lookup disclosure — binary workbook verification:
//  B.8 partial field metadata → workbook contains the field disclosure;
//  B.9 partial user directory → workbook contains the user disclosure;
//  B.11 all assertions via serialize (writeBuffer) → reload with ExcelJS,
//      proving the disclosure survives detached use near the report header.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { createCompanyExcelWorkbook } from "@/lib/export-utils";
import { buildCompanyPreviewModel, buildCompanyLookupWarnings } from "@/lib/company-preview";

vi.spyOn(console, "error").mockImplementation(() => {});

const COMPANY = {
  ID: "42",
  TITLE: "Компания раскрытий",
  ASSIGNED_BY_ID: "7",
  DATE_CREATE: "2025-12-15T14:00:00Z",
  DATE_MODIFY: "2026-07-01T11:59:00Z",
};

const MODEL = buildCompanyPreviewModel(COMPANY, {
  userNames: { "7": "Анна Иванова" },
});

const baseOptions = {
  companyTitle: MODEL.title,
  companyId: MODEL.companyId,
  companyFields: MODEL.fields.map((f) => ({ id: f.id, label: f.label, value: f.value, type: f.type })),
  deals: [],
  currentDate: new Date("2026-09-26T12:00:00Z"),
  companyModel: {
    fields: MODEL.fields.map((f) => ({ id: f.id, label: f.label, value: f.value, type: f.type, rawValue: f.rawValue })),
    createdAt: MODEL.createdAt,
    modifiedAt: MODEL.modifiedAt,
    comments: MODEL.comments,
  },
  smartProcess: { activeCount: 0, completedCount: 0, items: [], stale: false },
  userNames: { "7": "Анна Иванова" },
};

const FIELD_WARNING = "Справочник полей загружен не полностью; часть значений не классифицирована.";
const USER_WARNING = "Справочник сотрудников загружен не полностью; часть ответственных не удалось определить.";

async function buildAndReload(lookupWarnings: string[]): Promise<{ rows: string[][] }> {
  const wb = createCompanyExcelWorkbook({ ...baseOptions, lookupWarnings });
  const buffer = await wb.xlsx.writeBuffer();
  const fresh = new ExcelJS.Workbook();
  await fresh.xlsx.load(buffer as ArrayBuffer);
  const ws = fresh.getWorksheet("Отчёт по компании")!;
  const rows: string[][] = [];
  ws.eachRow((row) => {
    const cells: string[] = [];
    for (let c = 1; c <= 12; c++) {
      const v = row.getCell(c).value;
      cells.push(v === null || v === undefined ? "" : String(v));
    }
    rows.push(cells);
  });
  return { rows };
}

describe("Company Excel — lookup disclosure rows near the report header (binary reload)", () => {
  let rowsPartialBoth: string[][];
  let rowsFieldOnly: string[][];
  let rowsUserOnly: string[][];

  beforeAll(async () => {
    rowsPartialBoth = (await buildAndReload(buildCompanyLookupWarnings("partial", "partial"))).rows;
    rowsFieldOnly = (await buildAndReload(buildCompanyLookupWarnings("partial", "ready"))).rows;
    rowsUserOnly = (await buildAndReload(buildCompanyLookupWarnings("ready", "failed"))).rows;
  });

  it("B.8: partial field metadata → the field disclosure is present in the reloaded workbook", () => {
    const flat = rowsPartialBoth.map((r) => r.join("\u0001"));
    expect(flat.some((r) => r.includes(FIELD_WARNING))).toBe(true);
  });

  it("B.9: partial/failed user directory → the user disclosure is present in the reloaded workbook", () => {
    const flat = rowsPartialBoth.map((r) => r.join("\u0001"));
    expect(flat.some((r) => r.includes(USER_WARNING))).toBe(true);
    const flatUserOnly = rowsUserOnly.map((r) => r.join("\u0001"));
    expect(flatUserOnly.some((r) => r.includes(USER_WARNING))).toBe(true);
    expect(flatUserOnly.some((r) => r.includes(FIELD_WARNING))).toBe(false);
  });

  it("disclosures sit near the report header — before the first business section (detached use)", () => {
    const allRows = rowsFieldOnly.map((r) => r.join("\u0001"));
    const warningIdx = allRows.findIndex((r) => r.includes(FIELD_WARNING));
    const sectionIdx = allRows.findIndex((r) => r.includes("Информация о компании"));
    expect(warningIdx).toBeGreaterThan(-1);
    expect(sectionIdx).toBeGreaterThan(-1);
    expect(warningIdx).toBeLessThan(sectionIdx);
    // Field-only: the user warning is absent.
    expect(allRows.some((r) => r.includes(USER_WARNING))).toBe(false);
  });

  it("no lookup warnings → no disclosure rows (complete metadata exports cleanly)", async () => {
    const { rows } = await buildAndReload([]);
    const flat = rows.map((r) => r.join("\u0001"));
    expect(flat.some((r) => r.includes(FIELD_WARNING))).toBe(false);
    expect(flat.some((r) => r.includes(USER_WARNING))).toBe(false);
  });

  it("B.10: the interim loading placeholder is never serialized into a final workbook", async () => {
    const { rows } = await buildAndReload(buildCompanyLookupWarnings("partial", "partial"));
    const all = JSON.stringify(rows);
    expect(all).not.toContain("Загрузка справочника…");
    // Disclosure rows carry no raw error/ID/webhook material — the shared
    // contract emits only the two fixed Russian sentences.
    expect(all).not.toContain("SECRET_TOKEN");
    expect(all).not.toContain("UF_CRM_");
  });
});
