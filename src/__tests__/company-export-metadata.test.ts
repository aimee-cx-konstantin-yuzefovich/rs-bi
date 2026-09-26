// src/__tests__/company-export-metadata.test.ts
// ─────────────────────────────────────────────────────────────────────
// Integration regression tests for Company Excel metadata-aware typing.
// Proves the entire path:
//   buildCompanyExportPayload -> buildWysiwygWorkbook -> xlsx.writeBuffer -> xlsx.load
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  buildCompanyExportPayload,
  getCompanyColumnType,
} from "@/components/dashboard/company-browser";
import { buildWysiwygWorkbook } from "@/lib/export-utils";

describe("Company Browser Excel Metadata Type Propagation (Integration & Binary Round-Trip)", () => {
  const mockFields = [
    { id: "COMPANY_TITLE", title: "Компания: Наименование", type: "string" },
    { id: "COMPANY_ASSIGNED_BY_ID", title: "Компания: Ответственный", type: "user" },
    { id: "COMPANY_DATE_CREATE", title: "Компания: Дата создания", type: "datetime" },
    { id: "COMPANY_DATE_MODIFY", title: "Компания: Дата изменения", type: "datetime" },
    { id: "COMPANY_UF_CRM_TEST_STRING", title: "Компания: Строковое поле", type: "string" },
    { id: "COMPANY_UF_CRM_TEST_DATE", title: "Компания: Поле даты", type: "date" },
    { id: "COMPANY_UF_CRM_TEST_DATETIME", title: "Компания: Поле даты-времени", type: "datetime" },
    { id: "COMPANY_UF_CRM_TEST_TEXT", title: "Компания: Текстовое поле", type: "string" },
  ];

  const fieldMap = new Map(mockFields.map((f) => [f.id, f]));
  const userNames = { "101": "Константин Юзефович" };
  const columnTitle = (colId: string) => {
    if (colId === "TITLE") return "Наименование компании";
    if (colId === "ASSIGNED_BY_ID") return "Ответственный компании";
    const meta = fieldMap.get(`COMPANY_${colId}`) || fieldMap.get(colId);
    return meta?.title.replace(/^Компания:\s*/, "") || colId;
  };

  it("verifies getCompanyColumnType resolves authoritative metadata for unprefixed columns", () => {
    expect(getCompanyColumnType("TITLE", fieldMap)).toBe("string");
    expect(getCompanyColumnType("ASSIGNED_BY_ID", fieldMap)).toBe("user");
    expect(getCompanyColumnType("UF_CRM_TEST_STRING", fieldMap)).toBe("string");
    expect(getCompanyColumnType("UF_CRM_TEST_DATE", fieldMap)).toBe("date");
    expect(getCompanyColumnType("UF_CRM_TEST_DATETIME", fieldMap)).toBe("datetime");
    expect(getCompanyColumnType("DATE_CREATE", fieldMap)).toBe("datetime");
    expect(getCompanyColumnType("DATE_MODIFY", fieldMap)).toBe("datetime");
    expect(getCompanyColumnType("UNKNOWN_COL", fieldMap)).toBeUndefined();
  });

  it("proves binary round-trip Excel behavior for Cases A through F via real caller payload", async () => {
    const columns = [
      "TITLE",
      "ASSIGNED_BY_ID",
      "UF_CRM_TEST_STRING",    // Case A: string field containing ISO date
      "UF_CRM_TEST_DATE",      // Case B: true date field
      "UF_CRM_TEST_DATETIME",  // Case C: true datetime field with timezone
      "UF_CRM_TEST_TEXT",      // Case D: string field containing Russian-looking date
      "UF_CRM_TEST_DATE_INV",  // Case E: date field containing invalid calendar date 2026-02-31
      "UF_CRM_TEST_DATE_BLANK",// Case F: date field with blank value
    ];

    const extendedFields = [
      ...mockFields,
      { id: "COMPANY_UF_CRM_TEST_DATE_INV", title: "Компания: Невалидная дата", type: "date" },
      { id: "COMPANY_UF_CRM_TEST_DATE_BLANK", title: "Компания: Пустая дата", type: "date" },
    ];
    const extendedFieldMap = new Map(extendedFields.map((f) => [f.id, f]));

    const mockCompany = {
      ID: "501",
      TITLE: "АО «РусСилика Тест»",
      ASSIGNED_BY_ID: "101",
      UF_CRM_TEST_STRING: "2026-09-01",                     // Case A
      UF_CRM_TEST_DATE: "2026-09-01",                       // Case B
      UF_CRM_TEST_DATETIME: "2026-09-01T12:30:00+03:00",    // Case C
      UF_CRM_TEST_TEXT: "01.09.2026",                       // Case D
      UF_CRM_TEST_DATE_INV: "2026-02-31",                   // Case E
      UF_CRM_TEST_DATE_BLANK: "",                           // Case F
    };

    const payload = buildCompanyExportPayload({
      sortedItems: [mockCompany],
      columns,
      fieldMap: extendedFieldMap,
      userNames,
      columnTitle,
      activeName: "Все ответственные",
    });

    // Verify rawColumnTypes derived correctly
    expect(payload.options.rawColumnTypes).toEqual([
      "string",   // TITLE
      "user",     // ASSIGNED_BY_ID
      "string",   // UF_CRM_TEST_STRING
      "date",     // UF_CRM_TEST_DATE
      "datetime", // UF_CRM_TEST_DATETIME
      "string",   // UF_CRM_TEST_TEXT
      "date",     // UF_CRM_TEST_DATE_INV
      "date",     // UF_CRM_TEST_DATE_BLANK
    ]);

    // Build workbook, write to binary buffer, and reload
    const workbook = await buildWysiwygWorkbook(
      payload.exportData,
      payload.exportColumns,
      payload.options
    );

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);

    const reloadedWorkbook = new ExcelJS.Workbook();
    await reloadedWorkbook.xlsx.load(buffer as any);
    const worksheet = reloadedWorkbook.getWorksheet("Компании");
    expect(worksheet).toBeDefined();

    // Data row is Row 7 (Header at Row 6)
    const dataRow = worksheet!.getRow(7);

    // Col 1: TITLE (string)
    expect(dataRow.getCell(1).type).toBe(ExcelJS.ValueType.String);
    expect(dataRow.getCell(1).value).toBe("АО «РусСилика Тест»");

    // Col 2: ASSIGNED_BY_ID (resolved user name string, not a date)
    expect(dataRow.getCell(2).type).toBe(ExcelJS.ValueType.String);
    expect(dataRow.getCell(2).value).toBe("Константин Юзефович");

    // Case A — custom company string field with "2026-09-01":
    // Excel result MUST remain "2026-09-01" as a string. MUST NOT become a Date.
    const cellCaseA = dataRow.getCell(3);
    expect(cellCaseA.type).toBe(ExcelJS.ValueType.String);
    expect(cellCaseA.type).not.toBe(ExcelJS.ValueType.Date);
    expect(cellCaseA.value).toBe("2026-09-01");

    // Case B — custom company date field with "2026-09-01":
    // Excel result MUST be a native Excel Date after binary round-trip.
    const cellCaseB = dataRow.getCell(4);
    expect(cellCaseB.type).toBe(ExcelJS.ValueType.Date);
    expect(cellCaseB.value).toBeInstanceOf(Date);
    const bDate = cellCaseB.value as Date;
    expect(bDate.toISOString().slice(0, 10)).toBe("2026-09-01");

    // Case C — custom company datetime field with "2026-09-01T12:30:00+03:00":
    // Must preserve the correct instant (12:30+03:00 is 09:30:00 UTC).
    const cellCaseC = dataRow.getCell(5);
    expect(cellCaseC.type).toBe(ExcelJS.ValueType.Date);
    expect(cellCaseC.value).toBeInstanceOf(Date);
    const cDate = cellCaseC.value as Date;
    expect(cDate.toISOString()).toBe("2026-09-01T09:30:00.000Z");

    // Case D — text field containing Russian-looking date "01.09.2026":
    // Must remain string.
    const cellCaseD = dataRow.getCell(6);
    expect(cellCaseD.type).toBe(ExcelJS.ValueType.String);
    expect(cellCaseD.type).not.toBe(ExcelJS.ValueType.Date);
    expect(cellCaseD.value).toBe("01.09.2026");

    // Case E — invalid date "2026-02-31" on a true date field:
    // Must never roll over to March. Must remain string "2026-02-31".
    const cellCaseE = dataRow.getCell(7);
    expect(cellCaseE.type).not.toBe(ExcelJS.ValueType.Date);
    expect(cellCaseE.value).toBe("2026-02-31");
    expect(String(cellCaseE.value)).not.toContain("03");

    // Case F — blank typed date:
    // Must remain native blank/null according to the existing Excel contract.
    const cellCaseF = dataRow.getCell(8);
    expect(cellCaseF.type).toBe(ExcelJS.ValueType.Null);
    expect(cellCaseF.value).toBeNull();
  });
});
