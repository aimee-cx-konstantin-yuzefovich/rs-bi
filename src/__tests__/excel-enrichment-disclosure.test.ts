// src/__tests__/excel-enrichment-disclosure.test.ts
// ─────────────────────────────────────────────────────────────────────
// Cross-layer: Deals dataset COMPLETE + enrichment sources PARTIAL →
// the serialized WYSIWYG workbook carries BOTH applicable warnings in its
// report-level disclosure, and unresolved enrichment cells are never
// represented as proven authoritative values.
// Negative scope: unrelated sources emit nothing.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildWysiwygWorkbook } from "@/lib/export-utils";
import { buildEnrichmentExtraWarnings } from "@/lib/enrichment-disclosure";
import type { DatasetCoverage } from "@/lib/dataset-coverage";

const DEALS_COMPLETE: DatasetCoverage = { status: "COMPLETE", fetched: 5, total: 5 };
const USERS_PARTIAL: DatasetCoverage = {
  status: "PARTIAL",
  fetched: 50,
  total: 100,
  warning: "Справочник сотрудников загружен частично (50 из 100).",
};
const ACTIVITIES_PARTIAL: DatasetCoverage = {
  status: "PARTIAL",
  fetched: 3,
  total: 5,
  warning: "Данные активностей загружены частично.",
};

/** Reads every non-empty cell string from the worksheet (disclosure block included). */
async function serializeAndRead(workbook: ExcelJS.Workbook): Promise<string[]> {
  const buffer = await workbook.xlsx.writeBuffer();
  // Fresh workbook — reload from the serialized artifact, not memory.
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer as ArrayBuffer);
  const sheet = reloaded.worksheets[0];
  const cells: string[] = [];
  sheet.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) return;
      if (typeof v === "string") {
        cells.push(v);
        return;
      }
      if (v instanceof Date) {
        cells.push(v.toISOString());
        return;
      }
      const obj = v as unknown as Record<string, unknown>;
      if (typeof v === "number") {
        cells.push(String(v));
      } else if ("richText" in obj && Array.isArray(obj.richText)) {
        for (const r of obj.richText) cells.push(String((r as any).text ?? ""));
      } else if ("result" in obj) {
        cells.push(String(obj.result ?? ""));
      } else if ("text" in obj) {
        cells.push(String(obj.text ?? ""));
      } else if ("formula" in obj) {
        cells.push("");
      } else {
        cells.push(String(v));
      }
    });
  });
  return cells;
}

describe("Cross-layer Excel enrichment disclosure", () => {
  it("Deals COMPLETE + users PARTIAL + activities PARTIAL, columns [ASSIGNED_BY_ID, ACTIVITY_NEXT] → BOTH warnings present", async () => {
    const columns = ["ASSIGNED_BY_ID", "ACTIVITY_NEXT"];
    const warnings = buildEnrichmentExtraWarnings({
      selectedColumns: columns,
      fields: [{ id: "ASSIGNED_BY_ID", type: "string" }],
      usersCoverage: USERS_PARTIAL,
      activitiesCoverage: ACTIVITIES_PARTIAL,
      companiesDataCoverage: null,
      fieldsCoverage: null,
    });

    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes("справочник сотрудников"))).toBe(true);
    expect(warnings.some((w) => w.includes("данные активностей"))).toBe(true);

    const workbook = await buildWysiwygWorkbook(
      [
        // ASSIGNED_BY_ID unresolved (directory partial) → placeholder, not a
        // fabricated authoritative name; ACTIVITY_NEXT unresolved → "—"/null.
        [null, null],
        ["Анна", "Звонок клиенту 01.02: обсудить ТКП"],
      ],
      ["Ответственный", "Следующий шаг"],
      {
        sheetName: "Сделки",
        rawColumnIds: columns,
        coverage: DEALS_COMPLETE,
        extraWarnings: warnings,
      }
    );

    const cells = await serializeAndRead(workbook);
    const joined = cells.join("\n");

    // Dataset coverage stays COMPLETE and distinct from enrichment warnings.
    expect(joined).toContain("Полный набор");
    expect(joined).toContain("справочник сотрудников загружен частично");
    expect(joined).toContain("данные активностей загружены частично");
  });

  it("only OPPORTUNITY/CURRENCY_ID selected → NO activity/user warnings even when those sources are PARTIAL", async () => {
    const columns = ["OPPORTUNITY", "CURRENCY_ID"];
    const warnings = buildEnrichmentExtraWarnings({
      selectedColumns: columns,
      fields: [{ id: "OPPORTUNITY", type: "double" }],
      usersCoverage: USERS_PARTIAL,
      activitiesCoverage: ACTIVITIES_PARTIAL,
      companiesDataCoverage: {
        status: "PARTIAL",
        fetched: 0,
        total: 3,
        warning: "Не удалось загрузить данные для 3 компаний.",
      },
      fieldsCoverage: null,
    });

    // The exported semantic scope depends on none of the partial sources.
    expect(warnings).toEqual([]);

    const workbook = await buildWysiwygWorkbook(
      [[120000, "₽"]],
      ["Сумма", "Валюта"],
      {
        sheetName: "Сделки",
        rawColumnIds: columns,
        coverage: DEALS_COMPLETE,
        extraWarnings: warnings,
      }
    );

    const cells = await serializeAndRead(workbook);
    const joined = cells.join("\n");
    expect(joined).not.toContain("справочник сотрудников");
    expect(joined).not.toContain("данные активностей");
    expect(joined).not.toContain("данные компаний");
    expect(joined).toContain("Полный набор");
  });

  it("ENR-3 — activity column selected + activities PARTIAL → unresolved activity cell is not an authoritative value", async () => {
    const columns = ["ACTIVITY_LAST"];
    const warnings = buildEnrichmentExtraWarnings({
      selectedColumns: columns,
      usersCoverage: null,
      activitiesCoverage: ACTIVITIES_PARTIAL,
      companiesDataCoverage: null,
      fieldsCoverage: null,
    });
    expect(warnings).toHaveLength(1);

    // The unresolved activity renders as an empty cell (null), never as a
    // fabricated "no activity" value — the workbook-level warning carries
    // the provenance instead.
    const workbook = await buildWysiwygWorkbook([[null]], ["Последнее дело"], {
      sheetName: "Сделки",
      rawColumnIds: columns,
      coverage: DEALS_COMPLETE,
      extraWarnings: warnings,
    });

    const cells = await serializeAndRead(workbook);
    const joined = cells.join("\n");
    expect(joined).toContain("данные активностей загружены частично");
    // No fabricated activity text for the unresolved row.
    expect(joined).not.toContain("Нет активностей");
  });

  it("ENR-4 excel — COMPANY_* selected + companies PARTIAL → company warning present", async () => {
    const columns = ["COMPANY_TITLE", "COMPANY_INDUSTRY"];
    const warnings = buildEnrichmentExtraWarnings({
      selectedColumns: columns,
      fields: [{ id: "COMPANY_INDUSTRY", type: "crm_status" }],
      usersCoverage: null,
      activitiesCoverage: null,
      companiesDataCoverage: {
        status: "PARTIAL",
        fetched: 1,
        total: 2,
        warning: "Не удалось загрузить данные для 1 компаний.",
      },
      fieldsCoverage: {
        status: "PARTIAL",
        fetched: 0,
        warning: "Метаданные CRM загружены частично: crm.company.fields",
      },
    });

    expect(warnings.some((w) => w.includes("данные компаний"))).toBe(true);
    expect(warnings.some((w) => w.includes("метаданные CRM"))).toBe(true);

    const workbook = await buildWysiwygWorkbook(
      [["Компания 42", "IT"]],
      ["Наименование компании", "Отрасль"],
      {
        sheetName: "Сделки",
        rawColumnIds: columns,
        coverage: DEALS_COMPLETE,
        extraWarnings: warnings,
      }
    );

    const cells = await serializeAndRead(workbook);
    const joined = cells.join("\n");
    expect(joined).toContain("данные компаний загружены частично");
    expect(joined).toContain("метаданные CRM загружены частично");
  });

  it("ENR-6 — all sources COMPLETE → no enrichment warnings emitted", () => {
    const warnings = buildEnrichmentExtraWarnings({
      selectedColumns: ["ASSIGNED_BY_ID", "ACTIVITY_NEXT", "COMPANY_TITLE", "UF_CRM_6915D8C2C31D0"],
      fields: [
        { id: "ASSIGNED_BY_ID", type: "string" },
        { id: "UF_CRM_6915D8C2C31D0", type: "enumeration" },
      ],
      usersCoverage: { status: "COMPLETE", fetched: 100, total: 100 },
      activitiesCoverage: { status: "COMPLETE", fetched: 5, total: 5 },
      companiesDataCoverage: { status: "COMPLETE", fetched: 3, total: 3 },
      fieldsCoverage: { status: "COMPLETE", fetched: 0, total: 0 },
    });
    expect(warnings).toEqual([]);
  });
});
