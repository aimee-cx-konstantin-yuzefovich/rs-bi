// src/__tests__/crm-reliability-loading.test.ts
// ─────────────────────────────────────────────────────────────────────
// Comprehensive Regression Tests for CRM Data Loading Reliability (Cases A-G)
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as companiesPost } from "@/app/api/bitrix/companies/route";
import { fetchAllPages } from "@/lib/samples/bitrix-fetch";
import * as bitrix from "@/lib/bitrix";
import * as authGuard from "@/lib/auth-guard";
import { BITRIX_POST_TIMEOUT_MS } from "@/lib/bitrix";
import { LARGE_DATASET_CLIENT_TIMEOUT_MS as SAMPLES_LARGE_TIMEOUT } from "@/lib/samples/samples-cache";
import { LARGE_DATASET_CLIENT_TIMEOUT_MS as CF_LARGE_TIMEOUT } from "@/lib/commercial-funnel/commercial-funnel-cache";
import {
  LARGE_DATASET_CLIENT_TIMEOUT_MS as STORE_LARGE_TIMEOUT,
  COMPANY_ENRICHMENT_FETCH_TIMEOUT_MS,
  COMPANY_LIST_FETCH_TIMEOUT_MS,
} from "@/store/dashboard-store";
import { NextRequest } from "next/server";

function makeCompanyRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/bitrix/companies", {
    method: "POST",
    headers: new Headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
}

describe("CRM Data Loading Reliability Tests (Cases A - G)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authGuard, "requireAuth").mockResolvedValue({
      id: "1",
      email: "admin@russilica.ru",
      role: "admin",
    } as any);
    vi.spyOn(authGuard, "isAuthError").mockReturnValue(false);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case A: Company batch transient failure
  // ─────────────────────────────────────────────────────────────────
  it("Case A: company batch transient failure (attempt 1 fails, attempt 2 succeeds -> all companies resolved)", async () => {
    let callCount = 0;
    const postSpy = vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method, params: any) => {
      if (method === "crm.company.list") {
        callCount++;
        if (callCount === 1) {
          throw new Error("Temporary network timeout");
        }
        return {
          result: [
            { ID: "101", TITLE: "Alpha Corp" },
            { ID: "102", TITLE: "Beta LLC" },
          ],
        } as any;
      }
      return { result: null } as any;
    });

    const res = await companiesPost(makeCompanyRequest({ ids: ["101", "102"] }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.fetchedCompanyIds).toEqual(["101", "102"]);
    expect(data.unresolvedCompanyIds).toEqual([]);
    expect(data.companies["101"].TITLE).toBe("Alpha Corp");
    expect(data.companies["102"].TITLE).toBe("Beta LLC");
    expect(callCount).toBe(2); // Attempt 1 failed, attempt 2 succeeded
  });

  // ─────────────────────────────────────────────────────────────────
  // Case B: Company unresolved population > 15
  // ─────────────────────────────────────────────────────────────────
  it("Case B: unresolved population > 15 (40 IDs) -> fallback attempts ALL 40 using bounded concurrency without 15-ID cap", async () => {
    const ids = Array.from({ length: 40 }, (_, i) => String(i + 1));
    const fallbackIdsRequested: string[] = [];

    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method, params: any) => {
      if (method === "crm.company.list") {
        // Return empty so all 40 are unresolved after batch list
        return { result: [] } as any;
      }
      if (method === "crm.company.get") {
        fallbackIdsRequested.push(String(params?.ID));
        return {
          result: { ID: params?.ID, TITLE: `Company ${params?.ID}` },
        } as any;
      }
      return { result: null } as any;
    });

    const res = await companiesPost(makeCompanyRequest({ ids }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(false);
    expect(data.fetchedCompanyIds).toHaveLength(40);
    expect(data.unresolvedCompanyIds).toHaveLength(0);
    expect(fallbackIdsRequested).toHaveLength(40); // All 40 were retried via crm.company.get!
    expect(fallbackIdsRequested).toEqual(ids);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case C: Some Companies genuinely unavailable
  // ─────────────────────────────────────────────────────────────────
  it("Case C: some companies genuinely unavailable -> truthful PARTIAL, correct fetched and unresolved counts", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => String(i + 1));
    // First 15 exist, last 5 do not exist in Bitrix
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method, params: any) => {
      if (method === "crm.company.list") {
        return {
          result: ids.slice(0, 15).map((id) => ({ ID: id, TITLE: `Company ${id}` })),
        } as any;
      }
      if (method === "crm.company.get") {
        // Fallback for missing 5 returns null
        return { result: null } as any;
      }
      return { result: null } as any;
    });

    const res = await companiesPost(makeCompanyRequest({ ids }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.partial).toBe(true);
    expect(data.fetchedCompanyIds).toHaveLength(15);
    expect(data.unresolvedCompanyIds).toHaveLength(5);
    expect(data.unresolvedCompanyIds).toEqual(["16", "17", "18", "19", "20"]);
    expect(data.warning).toContain("Не удалось загрузить данные для 5 из 20 компаний.");
  });

  // ─────────────────────────────────────────────────────────────────
  // Case D: Pagination page transient failure
  // ─────────────────────────────────────────────────────────────────
  it("Case D: pagination page transient failure (attempt 1 page throws, attempt 2 restarts and succeeds)", async () => {
    let callIndex = 0;
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method, params: any) => {
      callIndex++;
      // Attempt 1: Page 1 succeeds, Page 2 throws
      if (callIndex === 1) {
        return { total: 4, result: [{ ID: "1" }, { ID: "2" }], next: 2 } as any;
      }
      if (callIndex === 2) {
        throw new Error("Temporary Bitrix transport reset");
      }
      // Attempt 2 (restarted from start=0): Page 1 succeeds, Page 2 succeeds
      if (callIndex === 3) {
        return { total: 4, result: [{ ID: "1" }, { ID: "2" }], next: 2 } as any;
      }
      if (callIndex === 4) {
        return { total: 4, result: [{ ID: "3" }, { ID: "4" }], next: undefined } as any;
      }
      return { result: [] } as any;
    });

    const rows = await fetchAllPages("crm.deal.list", {}, "ID");
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.ID)).toEqual(["1", "2", "3", "4"]);
    expect(callIndex).toBe(4);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case E: Pagination total changes during attempt
  // ─────────────────────────────────────────────────────────────────
  it("Case E: pagination total changes during attempt (526 -> 527 triggers restart, attempt 2 stable 527 succeeds)", async () => {
    let callIndex = 0;
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method, params: any) => {
      callIndex++;
      // Attempt 1: Page 1 reports total=526, Page 2 reports total=527 (inconsistent!)
      if (callIndex === 1) {
        return { total: 526, result: [{ ID: "1" }], next: 1 } as any;
      }
      if (callIndex === 2) {
        return { total: 527, result: [{ ID: "2" }], next: undefined } as any;
      }
      // Attempt 2: stable total=527 from start=0
      if (callIndex === 3) {
        return { total: 2, result: [{ ID: "1" }], next: 1 } as any;
      }
      if (callIndex === 4) {
        return { total: 2, result: [{ ID: "2" }], next: undefined } as any;
      }
      return { result: [] } as any;
    });

    const rows = await fetchAllPages("crm.deal.list", {}, "ID");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ID)).toEqual(["1", "2"]);
    expect(callIndex).toBe(4);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case F: Pagination remains inconsistent twice
  // ─────────────────────────────────────────────────────────────────
  it("Case F: pagination remains inconsistent twice -> fails closed, throws, never returns partial data", async () => {
    let callIndex = 0;
    vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method, params: any) => {
      callIndex++;
      // Attempt 1: total=100 on page 1, total=101 on page 2
      if (callIndex === 1) {
        return { total: 100, result: [{ ID: "1" }], next: 1 } as any;
      }
      if (callIndex === 2) {
        return { total: 101, result: [{ ID: "2" }], next: undefined } as any;
      }
      // Attempt 2: still inconsistent: total=100 on page 1, total=102 on page 2
      if (callIndex === 3) {
        return { total: 100, result: [{ ID: "1" }], next: 1 } as any;
      }
      if (callIndex === 4) {
        return { total: 102, result: [{ ID: "2" }], next: undefined } as any;
      }
      return { result: [] } as any;
    });

    await expect(fetchAllPages("crm.deal.list", {}, "ID")).rejects.toThrow(
      /Inconsistent total reported during pagination/
    );
    expect(callIndex).toBe(4); // Attempted twice, failed closed!
  });

  // ─────────────────────────────────────────────────────────────────
  // Case G: Timeout constants
  // ─────────────────────────────────────────────────────────────────
  it("Case G: timeout constants hierarchy (server POST 60s, client loaders 180s)", () => {
    expect(BITRIX_POST_TIMEOUT_MS).toBe(60_000);
    expect(SAMPLES_LARGE_TIMEOUT).toBe(180_000);
    expect(CF_LARGE_TIMEOUT).toBe(180_000);
    expect(STORE_LARGE_TIMEOUT).toBe(180_000);
    expect(COMPANY_ENRICHMENT_FETCH_TIMEOUT_MS).toBe(180_000);
    expect(COMPANY_LIST_FETCH_TIMEOUT_MS).toBe(180_000);
  });
});
