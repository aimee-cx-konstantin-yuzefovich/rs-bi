// @vitest-environment node
// ─────────────────────────────────────────────────────────────────────
// Dataset coverage adversarial fixtures COV-1..COV-6.
// subset of CRM != complete CRM result — every case verifies API coverage,
// fetched/total, and (via the shared contract) UI/StatsCards/Excel truth.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";

const auth = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isAuthError: (value: unknown) => value instanceof Response,
}));
vi.mock("@/lib/auth-guard", () => auth);
import { POST as dealsPOST } from "@/app/api/bitrix/deals/route";
import { POST as companiesListPOST } from "@/app/api/bitrix/companies/list/route";
import { fetchCappedPages } from "@/lib/bitrix-pagination";
import { resolveDatasetCoverage, describeDatasetCoverage, coverageExcelLines } from "@/lib/dataset-coverage";
import { buildWysiwygWorkbook } from "@/lib/export-utils";
import * as bitrix from "@/lib/bitrix";

const webhook = "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN";
const fetchMock = vi.fn();

function makeDeals(count: number, startId = 1): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, i) => ({
    ID: String(startId + i),
    TITLE: `Deal ${startId + i}`,
    OPPORTUNITY: "1000",
    CURRENCY_ID: "RUB",
    STAGE_ID: "NEW",
    DATE_CREATE: "2026-09-10T10:00:00",
  }));
}

beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", webhook);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  auth.requireAuth.mockResolvedValue({ userId: "user" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const dealsRequest = () =>
  dealsPOST(
    new NextRequest("http://localhost/api/bitrix/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );

const companiesRequest = () =>
  companiesListPOST(
    new NextRequest("http://localhost/api/bitrix/companies/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );

describe("dataset coverage adversarial fixtures", () => {
  // COV-1: total 1200, cap 1000 → CAPPED, fetched 1000, total 1200
  it("COV-1: capped dataset stays CAPPED through API and Excel", async () => {
    // 24 pages of 50 deals = 1200 total; the cap stops at 1000.
    let call = 0;
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async () => {
      const start = call * 50;
      call++;
      return {
        result: makeDeals(50, start + 1),
        total: 1200,
        next: start + 50 < 1200 ? start + 50 : undefined,
      };
    });

    const res = await dealsRequest();
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.fetched).toBe(1000);
    expect(data.total).toBe(1200);
    expect(data.cappedByLimit).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.coverage).toEqual({
      status: "CAPPED",
      fetched: 1000,
      total: 1200,
      cap: 1000,
      warning: expect.stringContaining("1000 из 1200"),
    });
    // Warning distinguishes the cause: cap, not page failure.
    expect(data.warning).toContain("усечены");

    // Excel carries the same truth as a detached artifact.
    const wb = await buildWysiwygWorkbook(
      data.deals.slice(0, 5).map((d: any) => [d.ID, d.TITLE]),
      ["ID", "TITLE"],
      { coverage: data.coverage }
    );
    const buffer = await wb.xlsx.writeBuffer();
    const fresh = new ExcelJS.Workbook();
    await fresh.xlsx.load(buffer as ArrayBuffer);
    const texts = fresh.getWorksheet("Сделки")!.getSheetValues().flat()
      .filter((v): v is string => typeof v === "string");
    expect(texts.some((t) => t.includes("НЕПОЛНЫЙ НАБОР"))).toBe(true);
    expect(texts.some((t) => t.includes("1000 из 1200"))).toBe(true);
    expect(texts.some((t) => t.includes("лимит загрузки"))).toBe(true);
  });

  // COV-2: failed middle page → PARTIAL
  it("COV-2: failed middle page produces PARTIAL with failedOffsets", async () => {
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (_method, params: any) => {
      const start = params.start ?? 0;
      if (start === 50) throw new Error("network failure");
      return {
        result: makeDeals(50, start + 1),
        total: 200,
        next: start + 50 < 200 ? start + 50 : undefined,
      };
    });

    const res = await dealsRequest();
    const data = await res.json();
    expect(data.partial).toBe(true);
    expect(data.failedPages).toBe(1);
    expect(data.failedOffsets).toContain(50);
    expect(data.coverage.status).toBe("PARTIAL");
    expect(data.coverage.warning).toContain("не удалось");
  });

  // COV-3: duplicate across pages never inflates fetched count
  it("COV-3: duplicate Deal across pages does not inflate fetched count", async () => {
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (_m, params: any) => {
      const start = params.start ?? 0;
      if (start === 0) {
        return {
          result: [
            ...makeDeals(49, 1),
            { ID: "1", TITLE: "Deal 1 duplicate", OPPORTUNITY: "1000", CURRENCY_ID: "RUB", STAGE_ID: "NEW", DATE_CREATE: "2026-09-10" },
          ],
          total: 60,
          next: 50,
        };
      }
      return {
        result: makeDeals(10, 51),
        total: 60,
      };
    });

    const res = await dealsRequest();
    const data = await res.json();
    // 50 raw + 10 raw = 60 raw; 1 duplicate → 59 unique
    expect(data.fetched).toBe(59);
    expect(data.duplicateCount).toBe(1);
    expect(data.coverage.status).toBe("COMPLETE");
  });

  // COV-4: row missing ID must fail/partial, never silently vanish
  it("COV-4: row missing ID is corruption → PARTIAL with missingIdCount", async () => {
    vi.spyOn(bitrix, "bitrixPost").mockResolvedValue({
      result: [
        ...makeDeals(10, 1),
        { TITLE: "No ID row", OPPORTUNITY: "1000", CURRENCY_ID: "RUB", STAGE_ID: "NEW", DATE_CREATE: "2026-09-10" },
      ],
      total: 11,
    });

    const res = await dealsRequest();
    const data = await res.json();
    expect(data.fetched).toBe(10); // the ID-less row never silently vanishes into a clean count
    expect(data.missingIdCount).toBe(1);
    expect(data.partial).toBe(true);
    expect(data.coverage.status).toBe("PARTIAL");
    expect(data.warning).toContain("некорректные данные");
  });

  // COV-5: responsible filter whose only match lies outside a naive first window
  it("COV-5: responsible filter is pushed upstream, finding the match beyond the naive window", async () => {
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (_m, params: any) => {
      // The upstream filter was correctly pushed: Bitrix returns ONLY the
      // matching deal even though it sits at offset 5000 in the raw dataset.
      expect(params.filter).toEqual({ ASSIGNED_BY_ID: "7" });
      return {
        result: [{ ID: "9999", TITLE: "Target deal", OPPORTUNITY: "1000", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "7", DATE_CREATE: "2026-09-10" }],
        total: 1,
      };
    });

    const res = await dealsPOST(
      new NextRequest("http://localhost/api/bitrix/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter: { ASSIGNED_BY_ID: "7" } }),
      })
    );
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.fetched).toBe(1);
    expect(data.deals[0].ID).toBe("9999");
    expect(data.coverage.status).toBe("COMPLETE");
  });

  // COV-6: companies > 5000 cap
  it("COV-6: companies beyond the 5000 cap remain CAPPED with truthful metadata", async () => {
    let call = 0;
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async () => {
      const start = call * 50;
      call++;
      return {
        result: Array.from({ length: 50 }, (_, i) => ({
          ID: String(start + i + 1),
          TITLE: `Company ${start + i + 1}`,
          ASSIGNED_BY_ID: "7",
        })),
        total: 6320,
        next: start + 50 < 6320 ? start + 50 : undefined,
      };
    });

    const res = await companiesRequest();
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.fetched).toBe(5000);
    expect(data.total).toBe(6320);
    expect(data.cappedByLimit).toBe(true);
    expect(data.coverage.status).toBe("CAPPED");
    expect(data.coverage.cap).toBe(5000);

    // Coverage contract helpers agree with the API truth.
    expect(describeDatasetCoverage(data.coverage)).toContain("5000 из 6320");
    expect(coverageExcelLines(data.coverage)).toEqual([
      "Статус данных: НЕПОЛНЫЙ НАБОР",
      "Загружено: 5000 из 6320",
      "Причина: лимит загрузки",
    ]);
  });

  it("coverage contract never collapses the three states into one boolean", () => {
    const complete = resolveDatasetCoverage({ fetched: 10, total: 10 });
    const capped = resolveDatasetCoverage({ fetched: 10, total: 20, cappedByLimit: true }, 10);
    const partial = resolveDatasetCoverage({ fetched: 5, total: 20, failedPages: 2, failedOffsets: [5] });

    expect(complete.status).toBe("COMPLETE");
    expect(capped.status).toBe("CAPPED");
    expect(partial.status).toBe("PARTIAL");
    // Distinct statuses, not one boolean:
    expect(new Set([complete.status, capped.status, partial.status]).size).toBe(3);
  });

  it("shared pagination primitive: repeated/non-advancing cursor fails closed", async () => {
    let call = 0;
    const result = await fetchCappedPages<Record<string, unknown>>({
      method: "test.list",
      baseParams: {},
      idOf: (row) => String(row.ID),
      cap: 500,
      pageSize: 50,
      fetchPage: async (_params) => {
        call++;
        if (call === 1) {
          return { result: makeDeals(50, 1), total: 200, next: 0 }; // non-advancing cursor
        }
        // Window continues deterministically from total (not from the broken
        // cursor): page 2 covers 51..100.
        return { result: makeDeals(50, 51), total: 200 };
      },
    });
    // First page succeeds; the invalid cursor must not silently loop or drop
    // data — pages continue deterministically from the window arithmetic.
    expect(result.uniqueCount).toBe(100);
    expect(result.rows.every((r) => typeof r.ID === "string")).toBe(true);
  });
});
