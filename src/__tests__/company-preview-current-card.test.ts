// @vitest-environment node
// src/__tests__/company-preview-current-card.test.ts
// ─────────────────────────────────────────────────────────────────────
// Phase D — Company Preview Current-Card Contract tests:
// - exact ordered whitelist (no generic UF dump);
// - human-readable enum resolution (no raw classification IDs);
// - approved-industry regression (UF_CRM_1784195884554 wins);
// - legacy sample fields removed from card UI (kept in raw input);
// - HTML entity decoding in comments;
// - UI ↔ Excel golden parity.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  buildCompanyPreviewModel,
  COMPANY_PREVIEW_CURRENT_FIELDS,
  TOTAL_APPROVED_FIELDS,
  decodeHtmlEntities,
} from "@/lib/company-preview";
import { createCompanyExcelWorkbook } from "@/lib/export-utils";
import {
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_PRODUCT_TYPE_FIELD_ID,
  COMPANY_GEL_GRADE_CURRENT_FIELD_ID,
  COMPANY_GEL_CONSUMPTION_CURRENT_FIELD_ID,
  COMPANY_SOL_GRADE_CURRENT_FIELD_ID,
  COMPANY_SOL_CONSUMPTION_CURRENT_FIELD_ID,
  COMPANY_ACTUAL_PRICES_FIELD_ID,
  COMPANY_MARK_GEL_FIELD_ID,
  COMPANY_MARK_SOL_FIELD_ID,
  COMPANY_COMMENTS_PRODUCT_FIELD_ID,
  COMPANY_INN_FIELD_ID,
  COMPANY_REGION_FIELD_ID,
  COMPANY_TESTING_MARKER_FIELD_ID,
  // Legacy sample fields (§9) — present in raw input, absent from card:
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_MULTI_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  COMPANY_SAMPLES_GRADE_SOL_FIELD_ID,
  COMPANY_SAMPLES_QTY_GEL_FIELD_ID,
  COMPANY_SAMPLES_QTY_SOL_FIELD_ID,
  COMPANY_TEST_RESULT_FIELD_ID,
} from "@/lib/crm-constants";

/** The exact expected current-card field ORDER (approved card mirror, 24 fields). */
const EXPECTED_FIELD_ORDER = [
  "ASSIGNED_BY_ID",
  "CONTACT",
  "WEB",
  "PHONE",
  "EMAIL",
  "REVENUE",
  COMPANY_INN_FIELD_ID,
  "UF_CRM_1782742600447",
  "ADDRESS",
  COMPANY_REGION_FIELD_ID,
  "UF_CRM_691EB8983DE7D",
  "COMPANY_TYPE",
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
  COMPANY_DIRECTION_CURRENT_FIELD_ID,
  COMPANY_GEL_GRADE_CURRENT_FIELD_ID,
  COMPANY_GEL_CONSUMPTION_CURRENT_FIELD_ID,
  COMPANY_SOL_GRADE_CURRENT_FIELD_ID,
  COMPANY_SOL_CONSUMPTION_CURRENT_FIELD_ID,
  COMPANY_ACTUAL_PRICES_FIELD_ID,
  COMPANY_COMMENTS_PRODUCT_FIELD_ID,
  "COMMENTS",
  COMPANY_TESTING_MARKER_FIELD_ID,
  "DATE_CREATE",
  "DATE_MODIFY",
] as const;

/** Adversarial fixture: current fields + ALL legacy sample fields + obsolete fields + one unknown UF. */
function adversarialCompany(): Record<string, unknown> {
  return {
    ID: "42",
    TITLE: "ООО РусСилика Тест",
    ASSIGNED_BY_ID: "7",
    CONTACT_ID: "10",
    WEB: "https://russilica.example",
    PHONE: "+7 900 000-00-00",
    EMAIL: "info@russilica.example",
    REVENUE: "5000000|RUB",
    [COMPANY_INN_FIELD_ID]: "7701234567",
    UF_CRM_1782742600447: ["doc1.pdf"],
    ADDRESS: "г. Москва, ул. Ленина, д. 1",
    [COMPANY_REGION_FIELD_ID]: "Москва",
    UF_CRM_691EB8983DE7D: "card.pdf",
    COMPANY_TYPE: "2",
    [COMPANY_INDUSTRY_CURRENT_FIELD_ID]: "1739",
    [COMPANY_DIRECTION_CURRENT_FIELD_ID]: "42",
    [COMPANY_PRODUCT_TYPE_FIELD_ID]: ["101", "102"],
    [COMPANY_GEL_GRADE_CURRENT_FIELD_ID]: ["КСМГ-9", "КСМГ-12"],
    [COMPANY_MARK_GEL_FIELD_ID]: ["201", "202"],
    [COMPANY_GEL_CONSUMPTION_CURRENT_FIELD_ID]: "100",
    [COMPANY_SOL_GRADE_CURRENT_FIELD_ID]: ["СКСГ-4"],
    [COMPANY_MARK_SOL_FIELD_ID]: ["301"],
    [COMPANY_SOL_CONSUMPTION_CURRENT_FIELD_ID]: "200",
    [COMPANY_ACTUAL_PRICES_FIELD_ID]: "150000|RUB",
    [COMPANY_COMMENTS_PRODUCT_FIELD_ID]: "11.03.2025 Испытания образцов &quot;ComposiTherm&quot; — успешно",
    COMMENTS: "Общий комментарий &quot;по клиенту&quot;",
    [COMPANY_TESTING_MARKER_FIELD_ID]: "Y",
    DATE_CREATE: "2025-12-15T14:00:00Z",
    DATE_MODIFY: "2026-07-01T11:59:00Z",

    // ─── Legacy sample fields (§9) — MUST NOT appear as card rows ───
    [COMPANY_SAMPLES_FIELD_ID]: ["261"],
    [COMPANY_SAMPLES_DATE_MULTI_FIELD_ID]: ["2026-06-20"],
    [COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]: "2026-06-20",
    [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: "Гель-А",
    [COMPANY_SAMPLES_GRADE_SOL_FIELD_ID]: "Золь-Б",
    [COMPANY_SAMPLES_QTY_GEL_FIELD_ID]: "150",
    [COMPANY_SAMPLES_QTY_SOL_FIELD_ID]: "200",
    [COMPANY_TEST_RESULT_FIELD_ID]: "Успешно",

    // ─── Obsolete/unknown fields — MUST NOT appear ───
    "UF_CRM_6915D8C0C6814": "obsolete-industry",
    INDUSTRY: "old-standard-industry",
    "UF_CRM_UNKNOWN123": "Неизвестное поле",
  };
}

const FIELDS_META = [
  { id: "COMPANY_TYPE", title: "Тип компании", type: "crm_status", listValues: [{ ID: "2", VALUE: "Конкурент" }] },
  { id: COMPANY_INDUSTRY_CURRENT_FIELD_ID, title: "Отрасль (согл.список)", type: "enumeration", listValues: [{ ID: "1739", VALUE: "ЛКМ" }] },
  { id: COMPANY_DIRECTION_CURRENT_FIELD_ID, title: "Направление (согл.список)", type: "enumeration", listValues: [{ ID: "42", VALUE: "Строительство" }] },
  { id: COMPANY_PRODUCT_TYPE_FIELD_ID, title: "Тип продукта", type: "enumeration", listValues: [{ ID: "101", VALUE: "Гель" }, { ID: "102", VALUE: "Золь" }] },
  { id: COMPANY_MARK_GEL_FIELD_ID, title: "Марка РусСилика (ГЕЛЬ)", type: "enumeration", listValues: [{ ID: "201", VALUE: "КСМГ-9" }, { ID: "202", VALUE: "КСМГ-12" }] },
  { id: COMPANY_MARK_SOL_FIELD_ID, title: "Марка РусСилика (ЗОЛЬ)", type: "enumeration", listValues: [{ ID: "301", VALUE: "СКСГ-4" }] },
];

describe("Phase D — Company Preview current-card contract", () => {
  it("renders ONLY the explicit current whitelist in the exact approved order", () => {
    const model = buildCompanyPreviewModel(adversarialCompany(), {
      fields: FIELDS_META,
      userNames: { "7": "Анна Иванова" },
      contactNames: { "10": "Иван Смирнов" },
    });

    const ids = model.fields.map((f) => f.id);
    expect(ids).toEqual(EXPECTED_FIELD_ORDER as unknown as string[]);

    // No unknown/obsolete/legacy fields leaked.
    expect(ids).not.toContain("UF_CRM_UNKNOWN123");
    expect(ids).not.toContain("UF_CRM_6915D8C0C6814");
    expect(ids).not.toContain("INDUSTRY");
    expect(ids).not.toContain(COMPANY_SAMPLES_FIELD_ID);
    expect(ids).not.toContain(COMPANY_SAMPLES_GRADE_GEL_FIELD_ID);
    expect(ids).not.toContain(COMPANY_SAMPLES_GRADE_SOL_FIELD_ID);
    expect(ids).not.toContain(COMPANY_SAMPLES_QTY_GEL_FIELD_ID);
    expect(ids).not.toContain(COMPANY_SAMPLES_QTY_SOL_FIELD_ID);
    expect(ids).not.toContain(COMPANY_SAMPLES_DATE_MULTI_FIELD_ID);
    expect(ids).not.toContain(COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID);
    expect(ids).not.toContain(COMPANY_TEST_RESULT_FIELD_ID);
  });

  it("resolves every enum to human labels; unknown IDs stay unclassified; no raw codes", () => {
    const model = buildCompanyPreviewModel(adversarialCompany(), {
      fields: FIELDS_META,
      userNames: { "7": "Анна Иванова" },
      contactNames: { "10": "Иван Смирнов" },
    });

    const byId = new Map(model.fields.map((f) => [f.id, f]));

    // Ответственный resolved to the human name.
    expect(byId.get("ASSIGNED_BY_ID")!.value).toBe("Анна Иванова");
    // Industry raw 1739 → live metadata label «ЛКМ».
    expect(byId.get(COMPANY_INDUSTRY_CURRENT_FIELD_ID)!.value).toBe("ЛКМ");
    // Direction raw 42 → «Строительство».
    expect(byId.get(COMPANY_DIRECTION_CURRENT_FIELD_ID)!.value).toBe("Строительство");
    // Company Type raw 2 → «Конкурент».
    expect(byId.get("COMPANY_TYPE")!.value).toBe("Конкурент");
    // Multi-enum Gel grades resolved element-wise.
    expect(byId.get("UF_CRM_1781806326214")!.value).toBe("КСМГ-9, КСМГ-12");
    // Sol grades.
    expect(byId.get("UF_CRM_1781806285641")!.value).toBe("СКСГ-4");
    // Product type is NOT a card field (CARD FIELD != ANALYTICAL DIMENSION).
    expect(byId.has(COMPANY_PRODUCT_TYPE_FIELD_ID)).toBe(false);

    // No raw numeric classification codes anywhere in the card (ИНН is a
    // legitimate numeric-looking string field — excluded explicitly).
    for (const f of model.fields) {
      if (f.id === COMPANY_INN_FIELD_ID) continue;
      expect(f.value).not.toMatch(/^\d+$/);
    }
  });

  it("unknown enum ID → «Не классифицировано (<id>)»", () => {
    const company = adversarialCompany();
    company[COMPANY_INDUSTRY_CURRENT_FIELD_ID] = "999999";
    const model = buildCompanyPreviewModel(company, {
      fields: FIELDS_META,
      userNames: { "7": "Анна Иванова" },
    });
    const industry = model.fields.find((f) => f.id === COMPANY_INDUSTRY_CURRENT_FIELD_ID)!;
    expect(industry.value).toBe("Не классифицировано (999999)");
  });

  it("approved-industry regression: current field wins over INDUSTRY and the retired field", () => {
    const company = adversarialCompany();
    // INDUSTRY = "old-standard-industry", UF_CRM_6915D8C0C6814 = "obsolete-industry",
    // current field = raw 1739 → «ЛКМ». Neither old field may override.
    const model = buildCompanyPreviewModel(company, {
      fields: FIELDS_META,
      userNames: { "7": "Анна Иванова" },
    });
    const industry = model.fields.find((f) => f.id === COMPANY_INDUSTRY_CURRENT_FIELD_ID)!;
    expect(industry.value).toBe("ЛКМ");
    expect(model.fields.some((f) => f.value === "old-standard-industry")).toBe(false);
    expect(model.fields.some((f) => f.value === "obsolete-industry")).toBe(false);
  });

  it("absent current industry field is truthful absence (no legacy fallback)", () => {
    const company = adversarialCompany();
    delete company[COMPANY_INDUSTRY_CURRENT_FIELD_ID];
    const model = buildCompanyPreviewModel(company, {
      fields: FIELDS_META,
      userNames: { "7": "Анна Иванова" },
    });
    expect(model.fields.some((f) => f.id === COMPANY_INDUSTRY_CURRENT_FIELD_ID)).toBe(false);
    // And the legacy INDUSTRY value never sneaks in under any label.
    expect(model.fields.some((f) => f.value === "old-standard-industry")).toBe(false);
  });

  it("comments decode HTML entities for plain-text display", () => {
    expect(decodeHtmlEntities('11.03.2025 ... &quot;ComposiTherm&quot;')).toBe('11.03.2025 ... "ComposiTherm"');
    expect(decodeHtmlEntities("A &amp; B &lt;tag&gt; &#171;К&#187;")).toBe('A & B <tag> «К»');
    // Unknown entities stay untouched.
    expect(decodeHtmlEntities("&nosuchentity;")).toBe("&nosuchentity;");

    const model = buildCompanyPreviewModel(adversarialCompany(), {
      fields: FIELDS_META,
      userNames: { "7": "Анна Иванова" },
    });
    expect(model.comments).toBe('Общий комментарий "по клиенту"');
    // The product comment field also decodes entities in the card fields.
    const productComment = model.fields.find((f) => f.id === COMPANY_COMMENTS_PRODUCT_FIELD_ID)!;
    expect(productComment.value).toBe('11.03.2025 Испытания образцов "ComposiTherm" — успешно');
  });

  it("Date Created and Date Modified are retained with RU formatting", () => {
    const company = adversarialCompany();
    company.DATE_CREATE = "2025-12-15T14:00:00Z";
    company.DATE_MODIFY = "2026-07-01T11:59:00Z";
    const model = buildCompanyPreviewModel(company, {
      fields: FIELDS_META,
      userNames: { "7": "Анна Иванова" },
    });
    expect(model.createdAt).toMatch(/^\d{2}\.\d{2}\.\d{4}/);
    expect(model.modifiedAt).toMatch(/^\d{2}\.\d{2}\.\d{4}/);
  });

  it("UI ↔ Excel golden parity: same model feeds both; legacy fields absent from both", async () => {
    const company = adversarialCompany();
    company.DATE_CREATE = "2025-12-15T14:00:00Z";
    company.DATE_MODIFY = "2026-07-01T11:59:00Z";
    const model = buildCompanyPreviewModel(company, {
      fields: FIELDS_META,
      userNames: { "7": "Анна Иванова" },
      contactNames: { "10": "Иван Смирнов" },
    });

    // UI values = model field values.
    const uiValues = new Map(model.fields.map((f) => [f.label, f.value]));

    // Excel renders the SAME model.
    const wb = createCompanyExcelWorkbook({
      companyTitle: model.title,
      companyId: model.companyId,
      companyFields: model.fields.map((f) => ({ id: f.id, label: f.label, value: f.value, type: f.type })),
      sampleFields: [],
      deals: [],
      currentDate: new Date("2026-09-26T12:00:00Z"),
      companyModel: {
        fields: model.fields.map((f) => ({ id: f.id, label: f.label, value: f.value, type: f.type })),
        createdAt: model.createdAt,
        modifiedAt: model.modifiedAt,
        comments: model.comments,
      },
    });
    const buffer = await wb.xlsx.writeBuffer();
    const fresh = new ExcelJS.Workbook();
    await fresh.xlsx.load(buffer as ArrayBuffer);
    const ws = fresh.getWorksheet("Отчёт по компании")!;

    const excelPairs = new Map<string, string | Date>();
    ws.eachRow((row) => {
      const label = String(row.getCell(1).value ?? "").trim();
      const value = row.getCell(2).value;
      if (label && value !== null && value !== undefined && String(value).trim() !== "") {
        excelPairs.set(label, value as string | Date);
      }
    });

    // Every UI field label/value appears in Excel with the SAME value.
    // Exceptions (documented artifacts of the Excel writer):
    //  - formula-injection guard prefixes values starting with =,+,-,@ with
    //    an apostrophe (phone numbers);
    //  - Date Created / Date Modified serialize as native Date cells (§27).
    for (const [label, value] of uiValues) {
      if (label === "Дата создания" || label === "Дата изменения") continue;
      const expected = /^[=\-+\@]/.test(value) ? `'${value}` : value;
      expect(excelPairs.get(label), `Excel parity for ${label}`).toBe(expected);
    }

    // Date Created / Date Modified present in Excel as native Date cells.
    expect(excelPairs.get("Дата создания")).toBeInstanceOf(Date);
    expect(excelPairs.get("Дата изменения")).toBeInstanceOf(Date);
    // Comments present in Excel with decoded text.
    expect(excelPairs.get("Комментарий")).toBe(model.comments);

    // Legacy sample fields absent from the Excel current-card section.
    const allExcelText: string[] = [];
    ws.eachRow((row) => {
      for (let c = 1; c <= row.cellCount; c++) {
        const v = row.getCell(c).value;
        if (typeof v === "string") allExcelText.push(v);
      }
    });
    const joined = allExcelText.join("\n");
    expect(joined).not.toContain("Марка предоставленных образцов");
    expect(joined).not.toContain("Кол-во переданного образца");
    expect(joined).not.toContain("Результат испытаний");
    expect(joined).not.toContain("UF_CRM_");
    expect(joined).not.toContain("obsolete-industry");
    expect(joined).not.toContain("old-standard-industry");
    expect(joined).not.toContain("Неизвестное поле");
  });

  it("whitelist definition is deterministic and matches the recorded order", () => {
    expect(COMPANY_PREVIEW_CURRENT_FIELDS.map((f) => f.id)).toEqual(
      EXPECTED_FIELD_ORDER as unknown as string[]
    );
  });

  it("PRIVACY: Contact resolution never leaks naked CRM ID or 'Контакт #1234'", () => {
    // 1. Known contact ID resolves to directory name
    const knownModel = buildCompanyPreviewModel(
      { ID: "1", CONTACT_ID: "50" },
      { contactNames: { "50": "Сергей Петров" } }
    );
    expect(knownModel.fields.find((f) => f.id === "CONTACT")?.value).toBe("Сергей Петров");

    // 2. Unknown numeric contact ID resolves to truthful non-ID placeholder
    const unknownModel = buildCompanyPreviewModel(
      { ID: "2", CONTACT_ID: "9999" },
      { contactNames: {} }
    );
    const contactVal = unknownModel.fields.find((f) => f.id === "CONTACT")?.value;
    expect(contactVal).toBe("Контакт не удалось загрузить");
    expect(contactVal).not.toContain("9999");
    expect(contactVal).not.toContain("#");

    // 3. Stale formatted string with ID pattern (Контакт #999 or #999) is sanitized
    const formattedModel = buildCompanyPreviewModel(
      { ID: "3", CONTACT_ID: "Контакт #999" },
      { contactNames: {} }
    );
    expect(formattedModel.fields.find((f) => f.id === "CONTACT")?.value).toBe("Контакт не удалось загрузить");
  });

  it("PRIVACY: File resolution never leaks raw file ID or 'Файл #1234'", () => {
    // 1. File object with name resolves to name
    const namedModel = buildCompanyPreviewModel({
      ID: "1",
      UF_CRM_1782742600447: [{ name: "Договор_поставки.pdf" }],
    });
    expect(namedModel.fields.find((f) => f.id === "UF_CRM_1782742600447")?.value).toBe(
      "Договор_поставки.pdf"
    );

    // 2. File object with URL/id but no name resolves to 'Файл прикреплен'
    const objModel = buildCompanyPreviewModel({
      ID: "2",
      UF_CRM_1782742600447: [{ id: 456, showUrl: "/download/456" }],
    });
    const objVal = objModel.fields.find((f) => f.id === "UF_CRM_1782742600447")?.value;
    expect(objVal).toBe("Файл прикреплен");
    expect(objVal).not.toContain("456");

    // 3. Raw numeric ID string resolves to 'Файл прикреплен'
    const numModel = buildCompanyPreviewModel({
      ID: "3",
      UF_CRM_1782742600447: "789",
    });
    const numVal = numModel.fields.find((f) => f.id === "UF_CRM_1782742600447")?.value;
    expect(numVal).toBe("Файл прикреплен");
    expect(numVal).not.toContain("789");

    // 4. Object with ONLY id property resolves to 'Файл прикреплен'
    const onlyIdModel = buildCompanyPreviewModel({
      ID: "4",
      UF_CRM_1782742600447: [{ id: 101 }],
    });
    expect(onlyIdModel.fields.find((f) => f.id === "UF_CRM_1782742600447")?.value).toBe("Файл прикреплен");

    // 5. Object with uppercase ID property resolves to 'Файл прикреплен'
    const uppercaseIdModel = buildCompanyPreviewModel({
      ID: "5",
      UF_CRM_1782742600447: [{ ID: 202 }],
    });
    expect(uppercaseIdModel.fields.find((f) => f.id === "UF_CRM_1782742600447")?.value).toBe("Файл прикреплен");

    // 6. Object with downloadUrl but no name resolves to 'Файл прикреплен'
    const dlModel = buildCompanyPreviewModel({
      ID: "6",
      UF_CRM_1782742600447: [{ downloadUrl: "/crm/file/download/303" }],
    });
    expect(dlModel.fields.find((f) => f.id === "UF_CRM_1782742600447")?.value).toBe("Файл прикреплен");
  });

  it("TOTAL_APPROVED_FIELDS constant is strictly 24", () => {
    expect(TOTAL_APPROVED_FIELDS).toBe(24);
    expect(COMPANY_PREVIEW_CURRENT_FIELDS.length).toBe(24);
  });

  it("zero legacy fallback: current field empty never displays legacy equivalent", () => {
    // 1. GEL grade empty, legacy populated
    const gelLegacyOnly = buildCompanyPreviewModel({
      ID: "101",
      UF_CRM_1764079092: "Старый гель 1",
      [COMPANY_MARK_GEL_FIELD_ID]: ["201"],
    });
    expect(gelLegacyOnly.fields.some((f) => f.id === COMPANY_GEL_GRADE_CURRENT_FIELD_ID)).toBe(false);
    expect(gelLegacyOnly.fields.some((f) => String(f.value).includes("Старый гель"))).toBe(false);

    // 2. GEL consumption empty, legacy populated
    const gelConsLegacyOnly = buildCompanyPreviewModel({
      ID: "102",
      UF_CRM_1764076968: "500",
    });
    expect(gelConsLegacyOnly.fields.some((f) => f.id === COMPANY_GEL_CONSUMPTION_CURRENT_FIELD_ID)).toBe(false);
    expect(gelConsLegacyOnly.fields.some((f) => String(f.value).includes("500"))).toBe(false);

    // 3. SOL grade empty, legacy populated
    const solLegacyOnly = buildCompanyPreviewModel({
      ID: "103",
      UF_CRM_1764079114: "Старый золь 1",
      [COMPANY_MARK_SOL_FIELD_ID]: ["301"],
    });
    expect(solLegacyOnly.fields.some((f) => f.id === COMPANY_SOL_GRADE_CURRENT_FIELD_ID)).toBe(false);
    expect(solLegacyOnly.fields.some((f) => String(f.value).includes("Старый золь"))).toBe(false);

    // 4. SOL consumption empty, legacy populated
    const solConsLegacyOnly = buildCompanyPreviewModel({
      ID: "104",
      UF_CRM_1764076998: "600",
    });
    expect(solConsLegacyOnly.fields.some((f) => f.id === COMPANY_SOL_CONSUMPTION_CURRENT_FIELD_ID)).toBe(false);
    expect(solConsLegacyOnly.fields.some((f) => String(f.value).includes("600"))).toBe(false);

    // 5. Actual prices empty, legacy populated
    const priceLegacyOnly = buildCompanyPreviewModel({
      ID: "105",
      UF_CRM_1764156667679: "99000|RUB",
    });
    expect(priceLegacyOnly.fields.some((f) => f.id === COMPANY_ACTUAL_PRICES_FIELD_ID)).toBe(false);
    expect(priceLegacyOnly.fields.some((f) => String(f.value).includes("99000"))).toBe(false);
  });

  it("PRIVACY: fail-closed contact resolution for arbitrary tokens and UUIDs", () => {
    for (const token of ["abc123", "contact_42", "a8bab56b-55dd-4327-90f4-c0a3456deac2"]) {
      const model = buildCompanyPreviewModel({ ID: "1", CONTACT_ID: token }, { contactNames: {} });
      const contactVal = model.fields.find((f) => f.id === "CONTACT")?.value;
      expect(contactVal).toBe("Контакт не удалось загрузить");
      expect(contactVal).not.toContain(token);
    }
  });

  it("PRIVACY: file resolution never leaks storage tokens or opaque identifiers", () => {
    for (const token of ["disk_file_abc123", "storage_789", "attach_999", "deadbeefcafe1234567890abcdef1234"]) {
      const model = buildCompanyPreviewModel({ ID: "1", UF_CRM_1782742600447: token });
      const fileVal = model.fields.find((f) => f.id === "UF_CRM_1782742600447")?.value;
      expect(fileVal).toBe("Файл прикреплен");
      expect(fileVal).not.toContain(token);
    }
  });
});
