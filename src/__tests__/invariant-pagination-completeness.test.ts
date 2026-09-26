// src/__tests__/invariant-pagination-completeness.test.ts
// ─────────────────────────────────────────────────────────────────────
// Invariant Test Suite: Ingress Pagination Completeness & Identity (Finding E)
// Enforces P1 through P6 adversarial fixtures against silent data loss.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllPages } from "@/lib/samples/bitrix-fetch";
import { bitrixPost } from "@/lib/bitrix";

vi.mock("@/lib/bitrix", () => ({
  bitrixPost: vi.fn(),
}));

describe("Invariant Pagination Completeness (Finding E: P1-P6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("P1: fails closed when any row is missing authoritative ID", async () => {
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      total: 2,
      result: [
        { ID: "1", TITLE: "Entity 1" },
        { TITLE: "Entity without ID" },
      ],
      next: undefined,
    });

    await expect(fetchAllPages("crm.deal.list", {}, "ID")).rejects.toThrow(
      /Authoritative entity row missing required 'ID'/
    );
  });

  it("P2: fails closed when repeated IDs across pages hide incompleteness (total=3, unique=2)", async () => {
    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        total: 3,
        result: [{ ID: "1" }, { ID: "2" }],
        next: 2,
      })
      .mockResolvedValueOnce({
        total: 3,
        result: [{ ID: "2" }], // Duplicate ID "2", missing entity 3!
        next: undefined,
      });

    await expect(fetchAllPages("crm.deal.list", {}, "ID")).rejects.toThrow(
      /Pagination count mismatch: expected 3 total rows, received 2/
    );
  });

  it("P3: fails closed when pagination ends prematurely (total=120, received=100)", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) }));
    const page2 = Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 51) }));

    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        total: 120,
        result: page1,
        next: 50,
      })
      .mockResolvedValueOnce({
        total: 120,
        result: page2,
        next: undefined, // Premature termination without remaining 20 rows!
      });

    await expect(fetchAllPages("crm.deal.list", {}, "ID")).rejects.toThrow(
      /Pagination count mismatch: expected 120 total rows, received 100/
    );
  });

  it("P4: succeeds when 120 unique entities over 3 pages reconcile completely", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 1) }));
    const page2 = Array.from({ length: 50 }, (_, i) => ({ ID: String(i + 51) }));
    const page3 = Array.from({ length: 20 }, (_, i) => ({ ID: String(i + 101) }));

    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        total: 120,
        result: page1,
        next: 50,
      })
      .mockResolvedValueOnce({
        total: 120,
        result: page2,
        next: 100,
      })
      .mockResolvedValueOnce({
        total: 120,
        result: page3,
        next: undefined,
      });

    const rows = await fetchAllPages("crm.deal.list", {}, "ID");
    expect(rows).toHaveLength(120);
    expect(rows[0].ID).toBe("1");
    expect(rows[119].ID).toBe("120");
  });

  it("P5: succeeds with clean terminal page when total is omitted by Bitrix", async () => {
    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        result: [{ ID: "A" }, { ID: "B" }],
        next: 2,
      })
      .mockResolvedValueOnce({
        result: [{ ID: "C" }],
        next: undefined,
      });

    const rows = await fetchAllPages("crm.deal.list", {}, "ID");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.ID)).toEqual(["A", "B", "C"]);
  });

  it("P6: fails closed on malformed, repeated, or decreasing cursor", async () => {
    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        result: [{ ID: "1" }],
        next: 50,
      })
      .mockResolvedValueOnce({
        result: [{ ID: "2" }],
        next: 20, // Decreasing cursor!
      });

    await expect(fetchAllPages("crm.deal.list", {}, "ID")).rejects.toThrow(
      /Invalid pagination next token/
    );
  });

  it("fails closed when Bitrix reports materially inconsistent totals across pages", async () => {
    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        total: 120,
        result: [{ ID: "1" }],
        next: 1,
      })
      .mockResolvedValueOnce({
        total: 50, // Inconsistent total!
        result: [{ ID: "2" }],
        next: undefined,
      });

    await expect(fetchAllPages("crm.deal.list", {}, "ID")).rejects.toThrow(
      /Inconsistent total reported during pagination: initial 120 vs new 50/
    );
  });
});
