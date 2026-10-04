// @vitest-environment node
// src/__tests__/smart-process-n-mode-transport.test.ts
// ─────────────────────────────────────────────────────────────────────
// Focused tests for the N-mode Smart Process production transport
// remediation (ONE canonical normalization seam). Required matrix:
//
//  1. N-mode metadata resolves all six roles uniquely (pure correlator)
//  2. missing N mapping for one role → fail closed
//  3. duplicate/ambiguous mapping → fail closed
//  4. mapping never uses display-title similarity alone
//  5. id + SENT_DATE alias → canonical SENT_DATE key
//  6. same for all six roles
//  7. full N-mode payload → SAME canonical row contract as the adapter
//  8. lowercase documented `id` passes
//  9. missing ID still fails closed
// 10. malformed ID still fails closed
// 11. no positional field mapping (source scan)
// 12. no business-value-based field mapping (source scan)
// 13. no per-item crm.item.get in the SP read path (source scan)
// 14. no mutation methods (source scan)
// 15. no N+1 (single crm.item.list for a full-scope read)
// 16–24. existing adapter/scope/aggregation/preview suites remain green
//         (exercised by their own files; full run in QA).
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const bitrixPostMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bitrix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bitrix")>();
  return { ...actual, bitrixPost: bitrixPostMock };
});
vi.mock("@/lib/samples/smart-process-contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/samples/smart-process-contract")>();
  return {
    ...actual,
    SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
    assertSmartProcessContractReady: () => {},
  };
});

import {
  correlateSmartProcessNModeFieldNames,
  assertSmartProcessNModeContractComplete,
  assertSmartProcessNModeMappingComplete,
  SMART_PROCESS_N_MODE_CUSTOM_ROLES,
  SMART_PROCESS_N_MODE_FIELD_NAMES,
  SMART_PROCESS_SENT_DATE_FIELD_ID,
  SMART_PROCESS_GRADE_GEL_FIELD_ID,
  SMART_PROCESS_GRADE_SOL_FIELD_ID,
  SMART_PROCESS_QTY_GEL_FIELD_ID,
  SMART_PROCESS_QTY_SOL_FIELD_ID,
  SMART_PROCESS_TEST_RESULT_FIELD_ID,
} from "@/lib/samples/smart-process-contract";
import {
  fetchSmartProcessSampleItems,
  normalizeSmartProcessNModeRow,
  SMART_PROCESS_ITEM_SELECT_N,
  SMART_PROCESS_ITEM_SELECT,
  SMART_PROCESS_ROLE_FIELD_IDS,
  SMART_PROCESS_SYSTEM_SELECT,
} from "@/lib/samples/bitrix-fetch";
import { adaptSmartProcessSampleEvidence } from "@/lib/samples/adapters/smart-process";

const ROLE_ORIGINALS: Record<string, string> = {
  SENT_DATE: SMART_PROCESS_SENT_DATE_FIELD_ID,
  GRADE_GEL: SMART_PROCESS_GRADE_GEL_FIELD_ID,
  GRADE_SOL: SMART_PROCESS_GRADE_SOL_FIELD_ID,
  QTY_GEL: SMART_PROCESS_QTY_GEL_FIELD_ID,
  QTY_SOL: SMART_PROCESS_QTY_SOL_FIELD_ID,
  TEST_RESULT: SMART_PROCESS_TEST_RESULT_FIELD_ID,
};

beforeEach(() => {
  bitrixPostMock.mockReset();
});

// ─── Cases 1–4: mapping derivation ───
describe("N-mode mapping derivation (cases 1-4)", () => {
  it("case 1: committed static mapping covers all six roles exactly once", () => {
    expect(() => assertSmartProcessNModeMappingComplete()).not.toThrow();
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      expect(typeof SMART_PROCESS_N_MODE_FIELD_NAMES[role]).toBe("string");
      expect(SMART_PROCESS_N_MODE_FIELD_NAMES[role].length).toBeGreaterThan(0);
    }
    const values = SMART_PROCESS_N_MODE_CUSTOM_ROLES.map((r) => SMART_PROCESS_N_MODE_FIELD_NAMES[r]);
    expect(new Set(values).size).toBe(6);
  });

  it("case 2: metadata missing one role → incomplete + gate throws", () => {
    const fields: Record<string, { upperName: string }> = {};
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES.slice(1)) {
      fields[`alias_${role}`] = { upperName: ROLE_ORIGINALS[role] };
    }
    const correlation = correlateSmartProcessNModeFieldNames(ROLE_ORIGINALS, fields);
    expect(correlation.complete).toBe(false);
    expect(() => assertSmartProcessNModeContractComplete(correlation)).toThrow(/SENT_DATE: MISSING/);
  });

  it("case 3: two N-mode fields claim the same role → ambiguous + gate throws", () => {
    const fields: Record<string, { upperName: string }> = {};
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      fields[`alias_${role}`] = { upperName: ROLE_ORIGINALS[role] };
    }
    fields["alias_duplicate"] = { upperName: ROLE_ORIGINALS.SENT_DATE };
    const correlation = correlateSmartProcessNModeFieldNames(ROLE_ORIGINALS, fields);
    expect(correlation.complete).toBe(false);
    expect(() => assertSmartProcessNModeContractComplete(correlation)).toThrow(/SENT_DATE: AMBIGUOUS\(2\)/);
  });

  it("case 4: identical misleading titles never affect the correlation", () => {
    const fields: Record<string, { upperName: string; title: string }> = {};
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      fields[SMART_PROCESS_N_MODE_FIELD_NAMES[role]] = {
        upperName: ROLE_ORIGINALS[role],
        title: "Одинаковое обманчивое название",
      };
    }
    const correlation = correlateSmartProcessNModeFieldNames(ROLE_ORIGINALS, fields);
    expect(correlation.complete).toBe(true);
    expect(correlation.resolved).toEqual(SMART_PROCESS_N_MODE_FIELD_NAMES);
  });
});

// ─── Cases 5–8: transport normalization ───
describe("normalizeSmartProcessNModeRow (cases 5-8)", () => {
  it("case 5: id + SENT_DATE alias normalizes to the canonical SENT_DATE key", () => {
    const row = { id: 1, [SMART_PROCESS_N_MODE_FIELD_NAMES.SENT_DATE]: "2026-09-11" };
    const out = normalizeSmartProcessNModeRow(row);
    expect(out.id).toBe(1);
    expect(out[SMART_PROCESS_SENT_DATE_FIELD_ID]).toBe("2026-09-11");
    expect(out[SMART_PROCESS_N_MODE_FIELD_NAMES.SENT_DATE]).toBeUndefined();
  });

  it("case 6: all six roles normalize to their canonical keys", () => {
    const row: Record<string, unknown> = { id: 7 };
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      row[SMART_PROCESS_N_MODE_FIELD_NAMES[role]] = `value-${role}`;
    }
    const out = normalizeSmartProcessNModeRow(row as never);
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      expect(out[SMART_PROCESS_ROLE_FIELD_IDS[role]]).toBe(`value-${role}`);
      expect(out[SMART_PROCESS_N_MODE_FIELD_NAMES[role]]).toBeUndefined();
    }
  });

  it("case 7: full N-mode payload normalizes to the EXACT canonical adapter contract", () => {
    const row: Record<string, unknown> = {
      id: 42,
      title: "Sample cycle",
      stageId: "DT1032_15:CLIENT",
      assignedById: 7,
      createdTime: "2026-09-09T10:00:00+03:00",
      companyId: "10",
      parentId2: "20",
    };
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      row[SMART_PROCESS_N_MODE_FIELD_NAMES[role]] = `v-${role}`;
    }
    const out = normalizeSmartProcessNModeRow(row as never);
    // The normalized row carries EXACTLY the canonical select keys.
    expect(Object.keys(out).sort()).toEqual([...SMART_PROCESS_ITEM_SELECT].sort());
    // The existing adapter consumes it without any N-mode awareness.
    const adapter = adaptSmartProcessSampleEvidence(out as never, (_f: string, v: string) => v, {
      dealCompanyById: new Map([["20", "10"]]),
    });
    // The cycle evidence reached the adapter with canonical provenance.
    expect(adapter).not.toBeNull();
    expect(adapter!.companyId).toBe("10");
    expect(adapter!.linkedDealId).toBe("20");
  });

  it("case 8: lowercase documented `id` passes through the pagination invariant", async () => {
    bitrixPostMock.mockResolvedValue({
      result: { items: [{ id: 1, title: "x" }] },
      total: 1,
    });
    const rows = await fetchSmartProcessSampleItems();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });

  it("case 9: missing ID still fails closed (MISSING_REQUIRED_ID)", async () => {
    bitrixPostMock.mockResolvedValue({
      result: { items: [{ title: "no id" }] },
      total: 1,
    });
    await expect(fetchSmartProcessSampleItems()).rejects.toThrow(/id/i);
  });

  it("case 10: malformed (empty-string) ID still fails closed", async () => {
    bitrixPostMock.mockResolvedValue({
      result: { items: [{ id: "   ", title: "blank id" }] },
      total: 1,
    });
    await expect(fetchSmartProcessSampleItems()).rejects.toThrow();
  });
});

// ─── Cases 11–15: production-path invariants ───
describe("production transport invariants (cases 11-15)", () => {
  it("case 15: full-scope read = ONE crm.item.list request (no N+1)", async () => {
    bitrixPostMock.mockResolvedValue({
      result: {
        items: Array.from({ length: 8 }, (_, i) => ({
          id: i + 1,
          ...Object.fromEntries(
            SMART_PROCESS_N_MODE_CUSTOM_ROLES.map((role) => [
              SMART_PROCESS_N_MODE_FIELD_NAMES[role],
              null,
            ])
          ),
        })),
      },
      total: 8,
    });
    const rows = await fetchSmartProcessSampleItems();
    expect(rows).toHaveLength(8);
    const listCalls = bitrixPostMock.mock.calls.filter(([m]) => m === "crm.item.list");
    expect(listCalls).toHaveLength(1);
  });

  it("N-mode select has the same slot structure as the canonical select (system + relation shared, custom slots aliased)", () => {
    expect(SMART_PROCESS_ITEM_SELECT_N.length).toBe(SMART_PROCESS_ITEM_SELECT.length);
    for (const system of SMART_PROCESS_SYSTEM_SELECT) {
      expect(SMART_PROCESS_ITEM_SELECT_N).toContain(system);
    }
    expect(SMART_PROCESS_ITEM_SELECT_N).toContain("parentId2");
    // Every N-mode custom slot corresponds to the canonical original slot.
    const nCustom = SMART_PROCESS_ITEM_SELECT_N.filter((k) => !SMART_PROCESS_SYSTEM_SELECT.includes(k as never) && k !== "parentId2");
    expect(nCustom.sort()).toEqual(
      SMART_PROCESS_N_MODE_CUSTOM_ROLES.map((r) => SMART_PROCESS_N_MODE_FIELD_NAMES[r]).sort()
    );
    // The canonical select's custom slots are the ORIGINAL field names.
    const canonicalCustom = SMART_PROCESS_ITEM_SELECT.filter(
      (k) => !SMART_PROCESS_SYSTEM_SELECT.includes(k as never) && k !== "parentId2"
    );
    expect(canonicalCustom.sort()).toEqual(
      SMART_PROCESS_N_MODE_CUSTOM_ROLES.map((r) => SMART_PROCESS_ROLE_FIELD_IDS[r]).sort()
    );
  });

  it("cases 11/12: mapping is key-metadata-based — no positional or value-based logic in the seam", () => {
    const source = readFileSync(
      new URL("../lib/samples/bitrix-fetch.ts", import.meta.url),
      "utf8"
    );
    const contractSource = readFileSync(
      new URL("../lib/samples/smart-process-contract.ts", import.meta.url),
      "utf8"
    );
    // No index/position-based translation in the normalizer seam.
    expect(source).not.toMatch(/Object\.values\([^)]*\)\[/);
    expect(normalizeSmartProcessNModeRow({ id: 1 })).toEqual({ id: 1 });
    // An unknown N-mode key passes through untouched (never guessed).
    expect(normalizeSmartProcessNModeRow({ id: 1, unknownKey: "v" })).toEqual({
      id: 1,
      unknownKey: "v",
    });
    // Value semantics are irrelevant: identical keys map identically
    // regardless of the value (no value-based branch exists).
    const a = normalizeSmartProcessNModeRow({
      [SMART_PROCESS_N_MODE_FIELD_NAMES.SENT_DATE]: "2020-01-01",
    });
    const b = normalizeSmartProcessNModeRow({
      [SMART_PROCESS_N_MODE_FIELD_NAMES.SENT_DATE]: "совершенно другое значение",
    });
    expect(Object.keys(a)).toEqual(Object.keys(b));
    // The static mapping is committed DATA in the contract module (never
    // derived from titles at runtime).
    expect(contractSource).toContain("SMART_PROCESS_N_MODE_FIELD_NAMES");
  });

  it("cases 13/14: SP read path has no per-item crm.item.get and no mutation methods", () => {
    const source = readFileSync(
      new URL("../lib/samples/bitrix-fetch.ts", import.meta.url),
      "utf8"
    );
    for (const forbidden of [
      "crm.item.add",
      "crm.item.update",
      "crm.item.delete",
      "crm.deal.add",
      "crm.deal.update",
      "crm.deal.delete",
      "crm.company.add",
      "crm.company.update",
      "crm.company.delete",
      '"batch"',
      "'batch'",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // crm.item.get never appears in the SP list read path (the transport
    // allowlist retains it for unrelated per-entity preview reads only).
    const spReadRegion = source.slice(
      source.indexOf("export async function fetchSmartProcessSampleItems"),
      source.indexOf("export interface FieldLabelMaps")
    );
    expect(spReadRegion).not.toContain("crm.item.get");
    expect(spReadRegion).toContain("crm.item.list");
  });

  it("no global Y→N drift: non-SP Bitrix methods keep their own contracts", () => {
    const source = readFileSync(
      new URL("../lib/samples/bitrix-fetch.ts", import.meta.url),
      "utf8"
    );
    // crm.company.list / crm.deal.list requests never carry
    // useOriginalUfNames (only the Smart Process builder sets it).
    expect(source).not.toMatch(/crm\.company\.list[\s\S]{0,200}useOriginalUfNames/);
    expect(source).not.toMatch(/crm\.deal\.list[\s\S]{0,200}useOriginalUfNames/);
  });
});
