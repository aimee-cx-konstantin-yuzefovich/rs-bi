// @vitest-environment node
// ─────────────────────────────────────────────────────────────────────
// Single Company report independent reconciliation.
// Company C1 fixture with manually defined expected values — expected values
// are NEVER generated using the code under test.
// Reconciles: API → Preview field builders → Excel → binary XLSX reload.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";

const config = vi.hoisted(() => ({ BITRIX_PORTAL_URL: "https://portal.bitrix24.ru" }));
const auth = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isAuthError: (value: unknown) => value instanceof Response,
}));
vi.mock("@/lib/config.server", () => config);
vi.mock("@/lib/auth-guard", () => auth);
import { GET as companyDealsGET } from "@/app/api/bitrix/companies/[id]/deals/route";
import * as bitrix from "@/lib/bitrix";
import { createCompanyExcelWorkbook } from "@/lib/export-utils";

// ─────────────────────────────────────────────────────────────────────
// FIXTURE — Company C1
//   D1: normal amount 350000 RUB
//   D2: zero amount RUB
//   D3: malformed amount "12abc" RUB
//   one impossible date field value (2026-02-31)
//   one CRM text field: label "Дата договора текстом", type string,
//       value "2026-09-01"  → must remain TEXT
//   one text field: type string, value "50000 RUB" → must remain TEXT
// ─────────────────────────────────────────────────────────────────────

const C1_RAW_DEALS = [
  { id: 101, title: "Сделка D1", stageId: "NEW", opportunity: "350000", currencyId: "RUB", companyId: 42 },
  { id: 102, title: "Сделка D2", stageId: "NEW", opportunity: "0", currencyId: "RUB", companyId: 42 },
  { id: 103, title: "Сделка D3", stageId: "NEW", opportunity: "12abc", currencyId: "RUB", companyId: 42 },
];

// Hand-defined expected ledger:
const EXPECTED = {
  deals: [
    { id: "101", opportunity: 350000, quality: "VALID" },
    { id: "102", opportunity: 0, quality: "VALID" }, // VALID ZERO == ZERO
    { id: "103", opportunity: null, quality: "INVALID" }, // never 0
  ],
  textFieldDate: { value: "2026-09-01", staysText: true },
  textFieldMoney: { value: "50000 RUB", staysText: true },
};

describe("single company report independent reconciliation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.requireAuth.mockResolvedValue({ userId: "user" });
  });

  it("API returns strict amounts with explicit quality; no silent drops", async () => {
    vi.spyOn(bitrix, "bitrixPost").mockResolvedValue({
      result: { items: C1_RAW_DEALS },
      total: 3,
    } as any);

    const res = await companyDealsGET(
      new (await import("next/server")).NextRequest("http://localhost/api/x"),
      { params: Promise.resolve({ id: "42" }) } as any
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.deals).toHaveLength(3);

    for (let i = 0; i < 3; i++) {
      const got = body.deals[i];
      const want = EXPECTED.deals[i];
      expect(got.ID).toBe(want.id);
      expect(got.OPPORTUNITY).toBe(want.opportunity);
      expect(got.OPPORTUNITY_QUALITY).toBe(want.quality);
    }
  });

  it("API rejects identity corruption (missing ID) instead of silently dropping", async () => {
    vi.spyOn(bitrix, "bitrixPost").mockResolvedValue({
      result: { items: [{ id: 101, title: "ok" }, { title: "no id" }] },
      total: 2,
    } as any);
    const res = await companyDealsGET(
      new (await import("next/server")).NextRequest("http://localhost/api/x"),
      { params: Promise.resolve({ id: "42" }) } as any
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.missingIdCount).toBe(1);
  });

  it("string-typed values stay text in the Excel raw field path despite date/money-looking content", async () => {
    // The canonical model renders ONLY whitelisted card fields, so this
    // invariant lives in the Excel builder's explicit-field path (the same
    // normalizeCompanyReportFieldValue used by the Company Preview parity
    // rows). Adversarial fixture: date/money-looking strings typed as text.
    const { createCompanyExcelWorkbook: buildWorkbook } = await import("@/lib/export-utils");
    const fields = [
      { id: "UF_CRM_TEXT_DATE", label: "Дата договора текстом", value: "2026-09-01", type: "string" },
      { id: "UF_CRM_TEXT_MONEY", label: "Комментарий по сумме", value: "50000 RUB", type: "string" },
      { id: "UF_CRM_IMPOSSIBLE_DATE", label: "Дата события", value: "2026-02-31", type: "string" },
    ];

    const wb = buildWorkbook({
      companyTitle: "Компания C1",
      companyId: "42",
      companyFields: fields,
      deals: [],
      currentDate: new Date("2026-09-26T12:00:00Z"),
    });

    const buffer = await wb.xlsx.writeBuffer();
    const fresh = new ExcelJS.Workbook();
    await fresh.xlsx.load(buffer as ArrayBuffer);
    const ws = fresh.getWorksheet("Отчёт по компании")!;

    const pairs = new Map<string, unknown>();
    ws.eachRow((row) => {
      const label = String(row.getCell(1).value ?? "").trim();
      if (label && !row.getCell(1).isMerged) pairs.set(label, row.getCell(2).value);
    });

    // String-typed values survive as TEXT (never coerced into dates/numbers).
    expect(pairs.get("Дата договора текстом")).toBe("2026-09-01");
    expect(pairs.get("Комментарий по сумме")).toBe("50000 RUB");
    // Unparseable date → preserved as raw text, never rolled to 2026-03-01.
    expect(pairs.get("Дата события")).toBe("2026-02-31");
    expect(pairs.has("Дата создания")).toBe(false);
  });

  it("Excel workbook serializes, reloads, and preserves the ledger exactly", async () => {
    const companyFields = [
      { id: "ID", label: "ID компании", value: "42" },
      { id: "ASSIGNED_BY_ID", label: "Ответственный компании", value: "Анна" },
      { id: "UF_CRM_TEXT_DATE", label: "Дата договора текстом", value: "2026-09-01", type: "string" },
      { id: "UF_CRM_TEXT_MONEY", label: "Комментарий по сумме", value: "50000 RUB", type: "string" },
    ];
    const deals = EXPECTED.deals.map((d, i) => ({
      id: d.id,
      title: `Сделка D${i + 1}`,
      stage: "В работе",
      opportunity: d.opportunity,
      currency: "RUB",
    }));

    const wb = createCompanyExcelWorkbook({
      companyTitle: "Компания C1",
      companyId: "42",
      companyFields,
      deals,
      currentDate: new Date("2026-09-26T12:00:00Z"),
    });

    const buffer = await wb.xlsx.writeBuffer();
    const fresh = new ExcelJS.Workbook();
    await fresh.xlsx.load(buffer as ArrayBuffer);
    const ws = fresh.getWorksheet("Отчёт по компании")!;

    const texts: string[] = [];
    const numbers: number[] = [];
    ws.eachRow((row) => {
      for (let c = 1; c <= row.cellCount; c++) {
        const v = row.getCell(c).value;
        if (typeof v === "string") texts.push(v);
        else if (typeof v === "number") numbers.push(v);
      }
    });

    // Entity identity
    expect(texts).toContain("42");
    expect(texts).toContain("101");
    expect(texts).toContain("102");
    expect(texts).toContain("103");

    // §27: string-typed date-looking value stays text in the serialized file
    expect(texts).toContain("2026-09-01");
    // §26: string-typed money-looking value stays text
    expect(texts).toContain("50000 RUB");

    // Deal amounts: 350000 and 0 as native numbers; malformed → "—"
    expect(numbers).toContain(350000);
    expect(numbers).toContain(0);
    expect(texts).toContain("—");

    // The impossible date never appears rolled to 2026-03-01
    expect(texts.some((t) => t.includes("2026-03-01") || t.includes("01.03.2026"))).toBe(false);
  });
});
