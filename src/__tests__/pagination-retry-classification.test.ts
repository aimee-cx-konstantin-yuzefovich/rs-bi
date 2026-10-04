// @vitest-environment node
// src/__tests__/pagination-retry-classification.test.ts
// ─────────────────────────────────────────────────────────────────────
// Focused tests for task §6: deterministic LOCAL pagination invariant
// failures must NOT trigger a redundant second full pagination attempt,
// while transient Bitrix transport failures keep the EXISTING retry
// policy (bounded full-pagination restart × transport retries) unchanged.
//
// Baseline topology (unchanged): MAX_PAGINATION_ATTEMPTS = 2 restarts;
// transport-level retries live inside bitrixPost (3 attempts for 429/500/
// 503/timeouts) and are NOT modified here.
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

import { fetchAllPages, MAX_PAGINATION_ATTEMPTS } from "@/lib/samples/bitrix-fetch";
import { BitrixTransientError } from "@/lib/bitrix";

beforeEach(() => {
  bitrixPostMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deterministic local invariant failures: no redundant restart (task §6)", () => {
  it("stable total mismatch on a one-page response → exactly 1 fetch attempt", async () => {
    bitrixPostMock.mockResolvedValue({
      result: [{ ID: "1" }, { ID: "2" }],
      total: 5,
    });
    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow(
      /Pagination count mismatch/
    );
    expect(bitrixPostMock).toHaveBeenCalledTimes(1);
  });

  it("missing required ID → exactly 1 fetch attempt", async () => {
    bitrixPostMock.mockResolvedValue({ result: [{ TITLE: "x" }], total: 1 });
    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow(
      /missing required 'ID'/
    );
    expect(bitrixPostMock).toHaveBeenCalledTimes(1);
  });

  it("malformed envelope → exactly 1 fetch attempt", async () => {
    bitrixPostMock.mockResolvedValue({ result: null, total: 0 });
    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow(
      /result envelope/
    );
    expect(bitrixPostMock).toHaveBeenCalledTimes(1);
  });

  it("invalid next token → exactly 1 fetch attempt", async () => {
    bitrixPostMock.mockResolvedValue({ result: [{ ID: "1" }], total: 5, next: "abc" });
    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow(
      /Invalid pagination next token/
    );
    expect(bitrixPostMock).toHaveBeenCalledTimes(1);
  });

  it("repeated (non-advancing) next → exactly 1 fetch attempt", async () => {
    bitrixPostMock
      .mockResolvedValueOnce({ result: [{ ID: "1" }], total: 5, next: 1 })
      .mockResolvedValueOnce({ result: [{ ID: "2" }], total: 5, next: 1 });
    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow(
      /Invalid pagination next token/
    );
    expect(bitrixPostMock).toHaveBeenCalledTimes(2); // page 1 + page 2, no restart
  });

  it("MAX_PAGINATION_ATTEMPTS constant unchanged", () => {
    expect(MAX_PAGINATION_ATTEMPTS).toBe(2);
  });
});

describe("mutable-dataset invariant categories keep restart semantics", () => {
  it("multi-page TOTAL_COUNT_MISMATCH restarts; the restart's own one-page mismatch stops deterministically", async () => {
    // Attempt 1: page 1 (50 rows, next=50) + page 2 (2 rows, no next)
    // → mismatch at start=50 (multi-page → restart kept). Attempt 2:
    // page 1 default (2 rows, no next) → mismatch at start=0 one-page
    // → deterministic → no further restart. Final: 3 fetch calls.
    bitrixPostMock
      .mockResolvedValueOnce({
        result: Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) })),
        total: 120,
        next: 50,
      })
      .mockResolvedValue({ result: [{ ID: "51" }, { ID: "52" }], total: 120 });
    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow(
      /Pagination count mismatch: expected 120 total rows, received 2/
    );
    expect(bitrixPostMock).toHaveBeenCalledTimes(3);
  });

  it("TOTAL_WITH_EMPTY_LAST_PAGE restarts (empty page may be a transient dataset shift)", async () => {
    bitrixPostMock.mockResolvedValue({ result: [], total: 100 });
    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow(
      /Total reconciliation failed/
    );
    expect(bitrixPostMock).toHaveBeenCalledTimes(MAX_PAGINATION_ATTEMPTS);
  });

  it("INCONSISTENT_TOTAL restarts; the exhausted restart ends with the empty-last-page verdict", async () => {
    // Attempt 1: page 1 (total=120, next=50) + page 2 (total=50)
    // → INCONSISTENT_TOTAL (retryable by design — dataset may have shifted
    // between pages) → restart. Attempt 2: default page (total=50, 0 rows,
    // no next) → TOTAL_WITH_EMPTY_LAST_PAGE → retries exhausted → throw.
    bitrixPostMock
      .mockResolvedValueOnce({
        result: Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) })),
        total: 120,
        next: 50,
      })
      .mockResolvedValue({ result: [], total: 50 });
    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow(
      /Total reconciliation failed: Bitrix reported total 50 but returned 0 rows/
    );
    // Attempt 1: 2 page calls; attempt 2: 1 page call.
    expect(bitrixPostMock).toHaveBeenCalledTimes(3);
  });
});

describe("transient transport failures keep the existing retry policy", () => {
  it("single-page 500 mid-pagination restarts the full pagination (existing behavior)", async () => {
    bitrixPostMock
      .mockRejectedValueOnce(new BitrixTransientError("API returned status 500", 500, undefined, "crm.company.list"))
      .mockResolvedValue({ result: [{ ID: "10" }, { ID: "20" }], total: 2 });
    const rows = await fetchAllPages("crm.company.list", {}, "ID");
    expect(rows.map((r) => r.ID)).toEqual(["10", "20"]);
    // Attempt 1: page 1 fails (1 call). Attempt 2: page 1 succeeds.
    expect(bitrixPostMock).toHaveBeenCalledTimes(2);
  });

  it("persistent transport failure exhausts the bounded restart budget", async () => {
    bitrixPostMock.mockRejectedValue(
      new BitrixTransientError("API returned status 500", 500, undefined, "crm.company.list")
    );
    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow();
    expect(bitrixPostMock).toHaveBeenCalledTimes(MAX_PAGINATION_ATTEMPTS);
  });
});
