// @vitest-environment node
// src/__tests__/samples-sp-partition-merge.test.ts
// ─────────────────────────────────────────────────────────────────────
// Focused regressions for the partitioned Smart Process read helper
// (fetchAndMergeSmartProcessPartitions in src/lib/samples/bitrix-fetch.ts).
// The helper is GATED by a live-measurement switch
// (SMART_PROCESS_PARTITIONED_READ_ENABLED): the production measurement
// (verdict USE_ORIGINAL_UF_NAMES_Y_BREAKS_ID) proved the portal drops `id`
// for every useOriginalUfNames="Y" select, so the gate is OFF and
// production runs the single full-select pagination. These tests pin the
// helper's own contract so it is correct the moment the gate is enabled:
//
//  6. two healthy partitions merge correctly by exact ID;
//  7. the merged row contract is identical to the current production
//     Smart Process adapter input (exact SMART_PROCESS_ITEM_SELECT keys);
//  8. partition A/B returned in different order still merge correctly;
//  9. missing ID in either partition fails closed;
// 10. differing ID sets trigger exactly ONE complete retry;
// 11. differing ID sets again after the retry fail with
//     SMART_PROCESS_PARTITION_SET_MISMATCH;
// 12. no positional merge exists (source scan);
// 13. no per-item crm.item.get exists (source scan);
// 14. no select:["*"] production path exists (source scan);
// gate: production read runs ONE full-select pagination while disabled.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  fetchSmartProcessSampleItems,
  fetchAndMergeSmartProcessPartitions,
  SMART_PROCESS_ITEM_SELECT,
  SMART_PROCESS_ITEM_SELECT_N,
  SMART_PROCESS_SYSTEM_SELECT,
  SMART_PROCESS_ROLE_FIELD_IDS,
} from "@/lib/samples/bitrix-fetch";
import { bitrixPost, BitrixTransientError } from "@/lib/bitrix";

vi.mock("@/lib/bitrix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bitrix")>();
  return {
    ...actual,
    bitrixPost: vi.fn(),
  };
});

vi.mock("@/lib/samples/smart-process-contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/samples/smart-process-contract")>();
  return {
    ...actual,
    SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
    assertSmartProcessContractReady: () => {},
  };
});

const R = SMART_PROCESS_ROLE_FIELD_IDS;

/** Full row in the exact key order of the production select. */
function fullRow(id: number): Record<string, unknown> {
  return {
    id,
    title: `Sample ${id}`,
    stageId: "DT1032_15:NEW",
    assignedById: 7,
    createdTime: "2026-09-09T10:00:00+03:00",
    companyId: "10",
    [R.DEAL_RELATION]: String(100 + id),
    [R.SENT_DATE]: "2026-09-11",
    [R.GRADE_GEL]: "1",
    [R.GRADE_SOL]: null,
    [R.QTY_GEL]: 5,
    [R.QTY_SOL]: null,
    [R.TEST_RESULT]: "2",
  };
}

const page = (rows: unknown[], total = rows.length) => ({
  result: { items: rows },
  total,
});

/**
 * Builds a partition-aware transport mock. `rowsFor(select)` decides the
 * page contents per request (select-aware, total-consistent).
 */
function mockTransport(rowsFor: (select: string[]) => unknown[]) {
  vi.mocked(bitrixPost).mockImplementation(async (_method: string, params?: Record<string, unknown>) => {
    const select = ((params?.select as string[] | undefined) ?? []) as string[];
    const rows = rowsFor(select);
    return page(rows);
  });
}

/** True when the requested select is the first committed partition (system+3). */
const isPartitionA = (select: string[]) =>
  select.includes("title") && select.includes(R.SENT_DATE);
const isPartitionB = (select: string[]) =>
  !select.includes("title") && select.includes(R.GRADE_GEL);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 6/7/8: healthy merges ───
describe("healthy partition merge", () => {
  it("merges two healthy partitions strictly by exact ID (contract 6)", async () => {
    mockTransport((select) => {
      if (isPartitionA(select)) {
        return [1, 2].map((id) => {
          const row = fullRow(id);
          // Partition A physically returns only its own select fields.
          return Object.fromEntries(
            Object.entries(row).filter(([k]) => [...SMART_PROCESS_SYSTEM_SELECT, R.DEAL_RELATION, R.SENT_DATE, R.TEST_RESULT].includes(k))
          );
        });
      }
      if (isPartitionB(select)) {
        return [2, 1].map((id) =>
          Object.fromEntries(
            Object.entries(fullRow(id)).filter(([k]) => ["id", R.GRADE_GEL, R.GRADE_SOL, R.QTY_GEL, R.QTY_SOL].includes(k))
          )
        );
      }
      throw new Error(`unexpected select ${select.join(",")}`);
    });

    const rows = await fetchAndMergeSmartProcessPartitions({});
    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    expect([...byId.keys()].sort()).toEqual(["1", "2"]);
    // Field facts from BOTH partitions are present on every merged row.
    expect(byId.get("1")![R.SENT_DATE]).toBe("2026-09-11");
    expect(byId.get("1")![R.GRADE_GEL]).toBe("1");
    expect(byId.get("2")![R.DEAL_RELATION]).toBe("102");
    expect(byId.get("2")![R.QTY_GEL]).toBe(5);
  });

  it("merged row carries EXACTLY the production adapter input keys (contract 7)", async () => {
    mockTransport((select) => {
      const full = [fullRow(1), fullRow(2)];
      if (isPartitionA(select)) {
        return full.map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(([k]) => [...SMART_PROCESS_SYSTEM_SELECT, R.DEAL_RELATION, R.SENT_DATE, R.TEST_RESULT].includes(k))
          )
        );
      }
      return full.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([k]) => ["id", R.GRADE_GEL, R.GRADE_SOL, R.QTY_GEL, R.QTY_SOL].includes(k))
        )
      );
    });

    const rows = await fetchAndMergeSmartProcessPartitions({});
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([...SMART_PROCESS_ITEM_SELECT].sort());
    }
  });

  it("partition order does not affect the merge (contract 8)", async () => {
    // Partition reads return rows in REVERSE ID order (different `order`
    // observation across partitions would be the positional-merge trap).
    mockTransport((select) => {
      const full = [fullRow(1), fullRow(2), fullRow(3)];
      const reversed = [...full].reverse();
      if (isPartitionA(select)) {
        return reversed.map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(([k]) => [...SMART_PROCESS_SYSTEM_SELECT, R.DEAL_RELATION, R.SENT_DATE, R.TEST_RESULT].includes(k))
          )
        );
      }
      return full.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([k]) => ["id", R.GRADE_GEL, R.GRADE_SOL, R.QTY_GEL, R.QTY_SOL].includes(k))
        )
      );
    });

    const rows = await fetchAndMergeSmartProcessPartitions({});
    expect(rows.map((r) => String(r.id)).sort()).toEqual(["1", "2", "3"]);
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    expect(byId.get("2")![R.SENT_DATE]).toBe("2026-09-11");
    expect(byId.get("2")![R.QTY_GEL]).toBe(5);
  });

  it("company scope applies to EVERY partition (contract 16)", async () => {
    mockTransport((select) => {
      const full = [fullRow(1), fullRow(2)];
      if (isPartitionA(select)) {
        return full.map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(([k]) => [...SMART_PROCESS_SYSTEM_SELECT, R.DEAL_RELATION, R.SENT_DATE, R.TEST_RESULT].includes(k))
          )
        );
      }
      return full.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(([k]) => ["id", R.GRADE_GEL, R.GRADE_SOL, R.QTY_GEL, R.QTY_SOL].includes(k))
        )
      );
    });

    await fetchAndMergeSmartProcessPartitions({ companyId: "10" });
    for (const [, params] of vi.mocked(bitrixPost).mock.calls as unknown as Array<
      [string, Record<string, unknown>]
    >) {
      expect(params.filter).toEqual({ categoryId: 15, companyId: "10" });
    }
  });
});

// ─── 9/10/11: fail-closed reconciliation ───
describe("partition reconciliation fail-closed contract", () => {
  it("missing ID in either partition fails closed (contract 9)", async () => {
    // fetchAllPages itself rejects id-less rows inside any partition.
    mockTransport((select) => {
      if (isPartitionA(select)) {
        const row = fullRow(1) as Record<string, unknown>;
        const { id, ...idless } = row;
        return [idless];
      }
      return [fullRow(1)];
    });

    await expect(fetchAndMergeSmartProcessPartitions({})).rejects.toThrow(/missing required 'id'/);
  });

  it("differing ID sets trigger exactly ONE complete retry (contract 10)", async () => {
    let partitionBAttempt = 0;
    vi.mocked(bitrixPost).mockImplementation(async (_method: string, params?: Record<string, unknown>) => {
      const select = ((params?.select as string[] | undefined) ?? []) as string[];
      if (isPartitionA(select)) {
        // Stable: rows 1 and 2.
        return page([stripA(fullRow(1)), stripA(fullRow(2))]);
      }
      if (isPartitionB(select)) {
        partitionBAttempt++;
        if (partitionBAttempt === 1) {
          // Mutable-data divergence: item 3 appears only in B (attempt 1).
          return page([stripB(fullRow(1)), stripB(fullRow(2)), stripB(fullRow(3))]);
        }
        // Retry observes the converged population.
        return page([stripB(fullRow(1)), stripB(fullRow(2))]);
      }
      throw new Error(`unexpected select ${select.join(",")}`);
    });

    const rows = await fetchAndMergeSmartProcessPartitions({});
    expect(rows).toHaveLength(2);
    expect(partitionBAttempt).toBe(2); // initial + exactly ONE complete retry
  });

  it("differing ID sets again after the retry → SMART_PROCESS_PARTITION_SET_MISMATCH (contract 11)", async () => {
    let partitionBAttempt = 0;
    vi.mocked(bitrixPost).mockImplementation(async (_method: string, params?: Record<string, unknown>) => {
      const select = ((params?.select as string[] | undefined) ?? []) as string[];
      if (isPartitionA(select)) {
        return page([stripA(fullRow(1))]);
      }
      if (isPartitionB(select)) {
        partitionBAttempt++;
        // Persistent divergence: B ALWAYS carries an extra item — attempt 1
        // mismatches (A={1}, B={1,2}), the single complete retry observes
        // the SAME divergence again → fail closed.
        void partitionBAttempt;
        return page([stripB(fullRow(1)), stripB(fullRow(2))]);
      }
      throw new Error(`unexpected select ${select.join(",")}`);
    });

    await expect(fetchAndMergeSmartProcessPartitions({})).rejects.toThrow(
      /SMART_PROCESS_PARTITION_SET_MISMATCH/
    );
    expect(partitionBAttempt).toBe(2); // initial + one retry, then fail closed
  });

  it("a partition transport failure propagates — no silent partial dataset", async () => {
    vi.mocked(bitrixPost).mockImplementation(async (_method: string, params?: Record<string, unknown>) => {
      const select = ((params?.select as string[] | undefined) ?? []) as string[];
      if (isPartitionA(select)) {
        return page([stripA(fullRow(1))]);
      }
      throw new BitrixTransientError("API returned status 500", 500, undefined, "crm.item.list");
    });

    await expect(fetchAndMergeSmartProcessPartitions({})).rejects.toThrow(/500/);
  });
});

// ─── helpers ───
function stripA(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([k]) => [...SMART_PROCESS_SYSTEM_SELECT, R.DEAL_RELATION, R.SENT_DATE, R.TEST_RESULT].includes(k))
  );
}
function stripB(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([k]) => ["id", R.GRADE_GEL, R.GRADE_SOL, R.QTY_GEL, R.QTY_SOL].includes(k))
  );
}

// ─── 12/13/14: source-scan invariants ───
describe("partition merge source invariants", () => {
  const fetchSource = readFileSync(
    new URL("../lib/samples/bitrix-fetch.ts", import.meta.url),
    "utf8"
  );

  it("gate OFF: production read runs ONE full-select pagination (no wasted partition reads)", async () => {
    vi.mocked(bitrixPost).mockResolvedValue(page([fullRow(1)]));
    const rows = await fetchSmartProcessSampleItems({ companyId: "42" });
    expect(rows).toHaveLength(1);
    expect(bitrixPost).toHaveBeenCalledTimes(1);
    const [, params] = vi.mocked(bitrixPost).mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    // The single read carries the EXACT full production select (N-mode
    // production transport — the rows arrive under N-mode aliases and are
    // normalized to the canonical contract at the ONE transport seam).
    expect(params.select).toEqual(SMART_PROCESS_ITEM_SELECT_N);
    expect(params.useOriginalUfNames).toBe("N");
    expect(params.filter).toEqual({ categoryId: 15, companyId: "42" });
    // The row returned to the caller carries the CANONICAL original keys
    // (normalization happened inside the helper).
    expect(rows[0][SMART_PROCESS_ROLE_FIELD_IDS.SENT_DATE]).toBeDefined();
  });

  it("partition helper is exported and gated (not dead code, not silently active)", () => {
    expect(fetchSource).toContain("SMART_PROCESS_PARTITIONED_READ_ENABLED = false");
    expect(fetchSource).toContain("export async function fetchAndMergeSmartProcessPartitions");
    expect(fetchSource).toMatch(/if \(SMART_PROCESS_PARTITIONED_READ_ENABLED\)/);
  });

  it("no positional merge exists (contract 12)", () => {
    // The merge is a Map keyed by exact string ID; there is no index-based
    // zip/join of partition row arrays.
    expect(fetchSource).not.toMatch(/rowsA\s*\[\s*\w+\s*\]/);
    expect(fetchSource).not.toMatch(/partitionA\s*\[\s*\w+\s*\]/);
    expect(fetchSource).toContain("merged.set(id,");
    // Every merge decision references the exact string item ID.
    expect(fetchSource).toContain("partitionRowId(row)");
  });

  it("no per-item crm.item.get in any production SP path (contract 13)", () => {
    expect(fetchSource).not.toContain("crm.item.get");
  });

  it("no select:['*'] in any production path (contract 14)", () => {
    expect(fetchSource).not.toContain('["*"]');
    expect(fetchSource).not.toMatch(/select:\s*\[\s*"\*"/);
  });

  it("partition reads use the shared fail-closed pagination (invariant preservation)", () => {
    // runPartitionedReadOnce must go through fetchAllPages — never a raw
    // bitrixPost loop of its own.
    expect(fetchSource).toContain("runPartitionedReadOnce");
    expect(fetchSource).toMatch(/await fetchAllPages\(\s*"crm\.item\.list"/);
  });
});
