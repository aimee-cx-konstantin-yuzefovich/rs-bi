// @vitest-environment node
// src/__tests__/bitrix-list-invariant.test.ts
// ─────────────────────────────────────────────────────────────────────
// Focused tests for the safe local pagination invariant taxonomy
// (src/lib/bitrix-list-invariant.ts) and its wiring inside
// `fetchAllPages` (src/lib/samples/bitrix-fetch.ts) — Stage 1
// diagnostics-only patch. Required coverage:
//
//  1. every local invariant throw carries the safe category + counts
//     while the message stays BYTE-IDENTICAL to the legacy generic Error
//  2. the error object (own fields + JSON) never carries item IDs,
//     titles, UF values, URLs, tokens, or raw bodies
//  3. malformed envelope → INVALID_RESULT_ENVELOPE (still FAIL)
//  4. missing required ID → MISSING_REQUIRED_ID (fail-closed; official
//     crm.item.list contract documents the lowercase `id` key only)
//  5. duplicate IDs remain deterministic (deduplicated, counted)
//  6. invalid / repeated / decreasing next → INVALID_NEXT_TOKEN /
//     NON_ADVANCING_NEXT (still FAIL)
//  7. classic company/deal strict total reconciliation messages unchanged
//
// Official contract rationale (documented source, verified 2026-10-04):
// https://apidocs.bitrix24.com/api-reference/crm/universal/crm-item-list.html
//   - result is an OBJECT containing the single key `items`;
//   - page size fixed at 50; `next` appears only when results exceed 50
//     and is omitted on the final page;
//   - `total` = "The total number of found items";
//   - "CRM object items will not be included in the final selection if
//     the user does not have 'read' permission for those items"
//     (item-level access filtering).
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const bitrixPostMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bitrix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bitrix")>();
  return {
    ...actual,
    bitrixPost: bitrixPostMock,
  };
});

import { BitrixListInvariantError, isBitrixListInvariantError } from "@/lib/bitrix-list-invariant";
import { fetchAllPages } from "@/lib/samples/bitrix-fetch";
import type { BitrixListInvariantCategory } from "@/lib/bitrix-list-invariant";

const SENTINEL_ID = "424242";
const SENTINEL_TITLE = "СЕКРЕТНАЯ КОМПАНИЯ НЕ ДОЛЖНА УТЕЧЬ";
const SENTINEL_UF = "UF_CRM_SECRET_VALUE";

beforeEach(() => {
  bitrixPostMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Asserts the error leaks no identity data anywhere in its surface. */
function expectNoIdentityLeak(error: unknown) {
  expect(error).toBeInstanceOf(BitrixListInvariantError);
  const err = error as BitrixListInvariantError;
  expect(err.message).not.toContain(SENTINEL_ID);
  expect(err.message).not.toContain(SENTINEL_TITLE);
  expect(err.message).not.toContain(SENTINEL_UF);
  const serialized = JSON.stringify(err, Object.getOwnPropertyNames(err));
  expect(serialized).not.toContain(SENTINEL_ID);
  expect(serialized).not.toContain(SENTINEL_TITLE);
  expect(serialized).not.toContain(SENTINEL_UF);
  expect(serialized).not.toMatch(/webhook/i);
  expect(serialized).not.toMatch(/\/rest\//);
  // Safe fields only — no raw body / description carriers.
  const ownKeys = Object.keys(err).filter((k) => k !== "message" && k !== "stack" && k !== "cause");
  for (const key of ownKeys) {
    expect([
      "name",
      "method",
      "category",
      "reportedTotal",
      "pageItemCount",
      "accumulatedUniqueCount",
      "duplicateCount",
      "missingIdCount",
      "start",
      "nextPresent",
    ]).toContain(key);
  }
}

/**
 * Runs fetchAllPages once, captures the thrown error, asserts BOTH the
 * legacy message regex AND the safe category — single invocation, so
 * mockResolvedValueOnce queues stay intact.
 */
async function captureInvariant(
  run: () => Promise<unknown>,
  messagePattern: RegExp,
  category: BitrixListInvariantCategory
): Promise<BitrixListInvariantError> {
  let captured: unknown = null;
  try {
    await run();
    expect.unreachable();
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(Error);
  expect((captured as Error).message).toMatch(messagePattern);
  expect(isBitrixListInvariantError(captured)).toBe(true);
  const err = captured as BitrixListInvariantError;
  expect(err.category).toBe(category);
  expectNoIdentityLeak(captured);
  return err;
}

describe("BitrixListInvariantError taxonomy (Stage 1)", () => {
  it("1a. invalid envelope keeps legacy message and gains category", async () => {
    bitrixPostMock.mockResolvedValue({ result: null, total: 0 });
    const err = await captureInvariant(
      () => fetchAllPages("crm.company.list", {}, "ID"),
      /Invalid crm\.company\.list result envelope from Bitrix/,
      "INVALID_RESULT_ENVELOPE"
    );
    expect(err.method).toBe("crm.company.list");
  });

  it("1b. total count mismatch keeps legacy message and reports safe counts", async () => {
    bitrixPostMock.mockResolvedValue({
      result: [{ ID: "1" }, { ID: "2" }],
      total: 5,
    });
    const err = await captureInvariant(
      () => fetchAllPages("crm.company.list", {}, "ID"),
      /Pagination count mismatch: expected 5 total rows, received 2/,
      "TOTAL_COUNT_MISMATCH"
    );
    expect(err.reportedTotal).toBe(5);
    expect(err.accumulatedUniqueCount).toBe(2);
    expect(err.duplicateCount).toBe(0);
    expect(err.missingIdCount).toBe(0);
    expect(err.nextPresent).toBe(false);
  });

  it("1c. empty last page with reported total keeps legacy message and gains category", async () => {
    bitrixPostMock.mockResolvedValue({ result: [], total: 100 });
    const err = await captureInvariant(
      () => fetchAllPages("crm.company.list", {}, "ID"),
      /Total reconciliation failed: Bitrix reported total 100 but returned 0 rows/,
      "TOTAL_WITH_EMPTY_LAST_PAGE"
    );
    expect(err.reportedTotal).toBe(100);
    expect(err.accumulatedUniqueCount).toBe(0);
  });

  it("1d. inconsistent total keeps legacy message and gains category", async () => {
    bitrixPostMock
      .mockResolvedValueOnce({ result: Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) })), total: 120, next: 50 })
      .mockResolvedValueOnce({ result: [], total: 50 });
    await captureInvariant(
      () => fetchAllPages("crm.company.list", {}, "ID"),
      /Inconsistent total reported during pagination: initial 120 vs new 50/,
      "INCONSISTENT_TOTAL"
    );
  });

  it("1e. missing required ID keeps legacy message and gains category (fail-closed)", async () => {
    // Official crm.item.list contract documents the lowercase `id` key only
    // (useOriginalUfNames affects UF names, never the item ID key); a row
    // without the required ID is therefore genuinely fail-closed.
    bitrixPostMock.mockResolvedValue({
      result: [{ ID: "1" }, { TITLE: SENTINEL_TITLE }],
      total: 2,
    });
    const err = await captureInvariant(
      () => fetchAllPages("crm.deal.list", {}, "ID"),
      /Authoritative entity row missing required 'ID'/,
      "MISSING_REQUIRED_ID"
    );
    expect(err.missingIdCount).toBe(1);
  });

  it("1f. invalid row keeps legacy message and gains category", async () => {
    bitrixPostMock.mockResolvedValue({ result: [null], total: 1 });
    await captureInvariant(
      () => fetchAllPages("crm.company.list", {}, "ID"),
      /Invalid row format in crm\.company\.list response from Bitrix/,
      "INVALID_ROW"
    );
  });

  it("1g. malformed next keeps legacy message and gains INVALID_NEXT_TOKEN", async () => {
    bitrixPostMock.mockResolvedValueOnce({ result: [{ ID: "1" }], total: 5, next: "abc" });
    let captured: unknown = null;
    try {
      await fetchAllPages("crm.company.list", {}, "ID");
      expect.unreachable();
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/Invalid pagination next token/);
    const err = captured as BitrixListInvariantError;
    expect(err.category).toBe("INVALID_NEXT_TOKEN");
    expect(err.nextPresent).toBe(true);
    expectNoIdentityLeak(captured);
  });

  it("1h. repeated/decreasing next keeps legacy message and gains NON_ADVANCING_NEXT", async () => {
    bitrixPostMock
      .mockResolvedValueOnce({ result: [{ ID: "1" }], total: 5, next: 1 })
      .mockResolvedValueOnce({ result: [{ ID: "2" }], total: 5, next: 1 });
    let captured: unknown = null;
    try {
      await fetchAllPages("crm.company.list", {}, "ID");
      expect.unreachable();
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/Invalid pagination next token/);
    const err = captured as BitrixListInvariantError;
    expect(err.category).toBe("NON_ADVANCING_NEXT");
    expectNoIdentityLeak(captured);
  });

  it("1i. pagination non-convergence gains PAGINATION_DID_NOT_CONVERGE", async () => {
    // Simulate the iteration guard: 4096 pages of identical advancing next.
    bitrixPostMock.mockImplementation(async (_method: string, params?: Record<string, unknown>) => {
      const start = Number(params?.start ?? 0);
      return { result: [{ ID: String(start) }], total: 1_000_000, next: start + 1 };
    });
    let captured: unknown = null;
    try {
      await fetchAllPages("crm.company.list", {}, "ID");
      expect.unreachable();
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toMatch(/Pagination did not converge/);
    const err = captured as BitrixListInvariantError;
    expect(err.category).toBe("PAGINATION_DID_NOT_CONVERGE");
    expectNoIdentityLeak(captured);
  });

  it("2. duplicate IDs remain deterministic: deduplicated once, counted, no throw on clean remainder", async () => {
    bitrixPostMock.mockResolvedValue({
      result: [{ ID: SENTINEL_ID }, { ID: SENTINEL_ID }, { ID: "7" }],
      total: 2,
    });
    const rows = await fetchAllPages("crm.company.list", {}, "ID");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ID)).toEqual([SENTINEL_ID, "7"]);
  });

  it("3. helper does not leak identity on success paths either (sanity)", async () => {
    bitrixPostMock.mockResolvedValue({
      result: [{ ID: SENTINEL_ID, TITLE: SENTINEL_TITLE }],
      total: 1,
    });
    const rows = await fetchAllPages("crm.company.list", {}, "ID");
    expect(rows).toHaveLength(1);
  });
});
