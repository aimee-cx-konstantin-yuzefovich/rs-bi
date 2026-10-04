// @vitest-environment node
// src/__tests__/n-mode-field-contract-diagnostic.test.ts
// ─────────────────────────────────────────────────────────────────────
// Focused tests for the N-mode field-contract diagnostic section
// (nModeFieldContract in src/lib/samples-pipeline-diagnostics.ts) and the
// pure N-mode metadata correlator in
// src/lib/samples/smart-process-contract.ts. Required matrix (task §11,
// Phase A subset):
//
//  1. N-mode metadata resolves all six roles uniquely
//  2. missing N mapping for one role → fail closed (AMBIGUOUS verdict)
//  3. duplicate/ambiguous mapping → fail closed
//  4. mapping never uses display-title similarity alone
//  5. single-role probe structure facts (id + N-mode alias)
//  6. full-select probe PASS/FAIL structure
//  7. no business values / no field names / no credentials in the report
//  8. read-only method invariant (crm.item.fields + crm.item.list only)
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Transport mock: bitrixPost intercepted at the transport seam ───
const bitrixPostMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bitrix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bitrix")>();
  return { ...actual, bitrixPost: bitrixPostMock };
});

import {
  correlateSmartProcessNModeFieldNames,
  assertSmartProcessNModeContractComplete,
  SMART_PROCESS_N_MODE_CUSTOM_ROLES,
} from "@/lib/samples/smart-process-contract";
import { SMART_PROCESS_ROLE_FIELD_IDS } from "@/lib/samples/bitrix-fetch";
import { runNModeFieldContractDiagnostics } from "@/lib/samples-pipeline-diagnostics";

// ─── Fixtures ───

/** Y-mode metadata: the committed original UF names under their own keys. */
function yModeMetadata(): Record<string, { type: string }> {
  const meta: Record<string, { type: string }> = {};
  for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
    meta[SMART_PROCESS_ROLE_FIELD_IDS[role]] = { type: "string" };
  }
  return meta;
}

/**
 * N-mode metadata derived from the documented camelCase conversion
 * (regular rule: UF_CRM_7_<digits> → ufCrm7_<digits>), each carrying the
 * documented `upperName` attribute equal to the original name.
 */
function nModeMetadata(transform: (original: string) => string): Record<string, { upperName: string; title: string }> {
  const meta: Record<string, { upperName: string; title: string }> = {};
  for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
    const original = SMART_PROCESS_ROLE_FIELD_IDS[role];
    meta[transform(original)] = {
      upperName: original,
      // Deliberately MISLEADING display titles: correlation must never
      // depend on them (case 4).
      title: "Обманчивое название поля",
    };
  }
  // Standard fields under N (unchanged documented names).
  meta["id"] = { upperName: "ID", title: "ID" };
  meta["parentId2"] = { upperName: "PARENT_ID_2", title: "Сделка" };
  return meta;
}

const REGULAR_CONVERT = (original: string) =>
  original.replace(/^UF_CRM_/, "ufCrm").toLowerCase().replace(/_7_/, "7_");

function mockMetadataEnvelope(y: unknown, n: unknown) {
  bitrixPostMock.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
    if (method !== "crm.item.fields" && method !== "crm.item.list") {
      throw new Error(`Unexpected method ${method}`);
    }
    if (method === "crm.item.fields") {
      return params?.useOriginalUfNames === "N" ? { result: { fields: n } } : { result: { fields: y } };
    }
    // crm.item.list: N-mode structural probe. The response row carries the
    // documented `id` plus every REQUESTED key (official select contract:
    // selected fields are populated), so single-role probes see
    // id + alias, and the full select sees all role keys.
    const select = (params?.select as string[]) ?? [];
    const row: Record<string, unknown> = { id: 1 };
    for (const key of select) {
      if (key !== "id" && key !== "*") row[key] = null; // null = legitimate empty value
    }
    return {
      result: {
        items: [row, { ...row, id: 2 }],
      },
      total: 2,
    };
  });
}

beforeEach(() => {
  bitrixPostMock.mockReset();
});

// ─── Pure correlator (cases 1–4) ───
describe("correlateSmartProcessNModeFieldNames (pure)", () => {
  it("case 1: resolves all six roles uniquely via upperName", () => {
    const correlation = correlateSmartProcessNModeFieldNames(
      {
        SENT_DATE: "UF_CRM_7_1766059943",
        GRADE_GEL: "UF_CRM_7_1766135695",
        GRADE_SOL: "UF_CRM_7_1766136511",
        QTY_GEL: "UF_CRM_7_1766136470",
        QTY_SOL: "UF_CRM_7_1766136546",
        TEST_RESULT: "UF_CRM_7_1763036405",
      },
      nModeMetadata(REGULAR_CONVERT)
    );
    expect(correlation.complete).toBe(true);
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      expect(correlation.candidates[role]).toBe(1);
      expect(correlation.resolved[role]).toBe(REGULAR_CONVERT(SMART_PROCESS_ROLE_FIELD_IDS[role]));
    }
    expect(Object.keys(correlation.resolved)).toHaveLength(6);
  });

  it("case 2: missing N mapping for one role → incomplete, gate throws", () => {
    const meta = nModeMetadata(REGULAR_CONVERT);
    delete meta[REGULAR_CONVERT("UF_CRM_7_1766136470")]; // QTY_GEL missing
    const correlation = correlateSmartProcessNModeFieldNames(
      {
        SENT_DATE: "UF_CRM_7_1766059943",
        GRADE_GEL: "UF_CRM_7_1766135695",
        GRADE_SOL: "UF_CRM_7_1766136511",
        QTY_GEL: "UF_CRM_7_1766136470",
        QTY_SOL: "UF_CRM_7_1766136546",
        TEST_RESULT: "UF_CRM_7_1763036405",
      },
      meta
    );
    expect(correlation.complete).toBe(false);
    expect(correlation.candidates.QTY_GEL).toBe(0);
    expect(() => assertSmartProcessNModeContractComplete(correlation)).toThrow(
      /N_MODE_FIELD_MAPPING_AMBIGUOUS: .*QTY_GEL: MISSING/
    );
  });

  it("case 3: duplicate candidate for a role → incomplete, gate throws", () => {
    const meta = nModeMetadata(REGULAR_CONVERT);
    // A second field whose upperName collides (documented collision edge).
    meta["ufCrm7_999"] = { upperName: "UF_CRM_7_1766136546", title: "дубликат" };
    const correlation = correlateSmartProcessNModeFieldNames(
      {
        SENT_DATE: "UF_CRM_7_1766059943",
        GRADE_GEL: "UF_CRM_7_1766135695",
        GRADE_SOL: "UF_CRM_7_1766136511",
        QTY_GEL: "UF_CRM_7_1766136470",
        QTY_SOL: "UF_CRM_7_1766136546",
        TEST_RESULT: "UF_CRM_7_1763036405",
      },
      meta
    );
    expect(correlation.complete).toBe(false);
    expect(correlation.candidates.QTY_SOL).toBe(2);
    expect(() => assertSmartProcessNModeContractComplete(correlation)).toThrow(
      /QTY_SOL: AMBIGUOUS\(2\)/
    );
  });

  it("case 4: mapping uses ONLY upperName — display-title similarity is ignored", () => {
    // Every N-mode field carries the SAME misleading title; only upperName
    // distinguishes fields. If titles influenced the mapping, results
    // would be ambiguous, not uniquely resolved.
    const correlation = correlateSmartProcessNModeFieldNames(
      {
        SENT_DATE: "UF_CRM_7_1766059943",
        GRADE_GEL: "UF_CRM_7_1766135695",
        GRADE_SOL: "UF_CRM_7_1766136511",
        QTY_GEL: "UF_CRM_7_1766136470",
        QTY_SOL: "UF_CRM_7_1766136546",
        TEST_RESULT: "UF_CRM_7_1763036405",
      },
      nModeMetadata(REGULAR_CONVERT)
    );
    expect(correlation.complete).toBe(true);
    // No positional dependence either: shuffling key insertion order must
    // not change the resolved names.
    const shuffled: Record<string, { upperName: string; title: string }> = {};
    const entries = Object.entries(nModeMetadata(REGULAR_CONVERT)).reverse();
    for (const [k, v] of entries) shuffled[k] = v;
    const correlation2 = correlateSmartProcessNModeFieldNames(
      {
        SENT_DATE: "UF_CRM_7_1766059943",
        GRADE_GEL: "UF_CRM_7_1766135695",
        GRADE_SOL: "UF_CRM_7_1766136511",
        QTY_GEL: "UF_CRM_7_1766136470",
        QTY_SOL: "UF_CRM_7_1766136546",
        TEST_RESULT: "UF_CRM_7_1763036405",
      },
      shuffled
    );
    expect(correlation2.resolved).toEqual(correlation.resolved);
  });

  it("gate passes silently when complete", () => {
    const correlation = correlateSmartProcessNModeFieldNames(
      {
        SENT_DATE: "UF_CRM_7_1766059943",
        GRADE_GEL: "UF_CRM_7_1766135695",
        GRADE_SOL: "UF_CRM_7_1766136511",
        QTY_GEL: "UF_CRM_7_1766136470",
        QTY_SOL: "UF_CRM_7_1766136546",
        TEST_RESULT: "UF_CRM_7_1763036405",
      },
      nModeMetadata(REGULAR_CONVERT)
    );
    expect(() => assertSmartProcessNModeContractComplete(correlation)).not.toThrow();
  });
});

// ─── Runner (cases 5–8) ───
describe("runNModeFieldContractDiagnostics", () => {
  it("case 5/6: PASS verdict with per-role facts and full-select structure", async () => {
    mockMetadataEnvelope(yModeMetadata(), nModeMetadata(REGULAR_CONVERT));
    const report = await runNModeFieldContractDiagnostics();
    expect(report.verdict).toBe("N_MODE_FIELD_CONTRACT_OK");
    expect(report.status).toBe("PASS");
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      expect(report.roles[role]).toEqual({
        resolved: true,
        unique: true,
        selectable: true,
        returned: true,
        candidateCount: 1,
      });
    }
    expect(report.fullSelect).toMatchObject({
      status: "PASS",
      itemCount: 2,
      rowsWithUsableId: 2,
      duplicateIdCount: 0,
      allRoleKeysCompatible: true,
    });
  });

  it("case 2 (runner): missing role mapping → N_MODE_FIELD_MAPPING_AMBIGUOUS, no list probes run", async () => {
    const nMeta = nModeMetadata(REGULAR_CONVERT);
    delete nMeta[REGULAR_CONVERT("UF_CRM_7_1763036405")]; // TEST_RESULT missing
    mockMetadataEnvelope(yModeMetadata(), nMeta);
    const report = await runNModeFieldContractDiagnostics();
    expect(report.verdict).toBe("N_MODE_FIELD_MAPPING_AMBIGUOUS");
    expect(report.roles.TEST_RESULT.candidateCount).toBe(0);
    // Fail-closed: no crm.item.list probes were attempted.
    const listCalls = bitrixPostMock.mock.calls.filter(([m]) => m === "crm.item.list");
    expect(listCalls).toHaveLength(0);
  });

  it("case 5 (failure): single-role probe losing id → N_MODE_FULL_SELECT_FAILED", async () => {
    bitrixPostMock.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      if (method === "crm.item.fields") {
        return params?.useOriginalUfNames === "N"
          ? { result: { fields: nModeMetadata(REGULAR_CONVERT) } }
          : { result: { fields: yModeMetadata() } };
      }
      if (method === "crm.item.list") {
        const select = params?.select as string[];
        if (select && select.length === 2 && select[0] === "id") {
          // The Y-mode id-drop defect reproduced under the role probe.
          return { result: { items: [{ [select[1]]: "x" }, { [select[1]]: "y" }] }, total: 2 };
        }
        return { result: { items: [{ id: 1 }] }, total: 1 };
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const report = await runNModeFieldContractDiagnostics();
    expect(report.verdict).toBe("N_MODE_FULL_SELECT_FAILED");
  });

  it("unusable metadata envelope → BITRIX_FIELD_NAMING_CONTRACT_CONFLICT", async () => {
    bitrixPostMock.mockImplementation(async (method: string) => {
      if (method === "crm.item.fields") return { result: { unexpected: true } };
      throw new Error(`Unexpected method ${method}`);
    });
    const report = await runNModeFieldContractDiagnostics();
    expect(report.verdict).toBe("BITRIX_FIELD_NAMING_CONTRACT_CONFLICT");
  });

  it("case 7: report carries NO field names, business values, IDs or credentials", async () => {
    mockMetadataEnvelope(yModeMetadata(), nModeMetadata(REGULAR_CONVERT));
    const report = await runNModeFieldContractDiagnostics();
    const serialized = JSON.stringify(report);
    // Raw field names (original and N-mode) never leak.
    for (const role of SMART_PROCESS_N_MODE_CUSTOM_ROLES) {
      const original = SMART_PROCESS_ROLE_FIELD_IDS[role];
      expect(serialized).not.toContain(original);
      expect(serialized).not.toContain(REGULAR_CONVERT(original));
    }
    // Mock row ids never leak as values.
    expect(serialized).not.toContain('"id":1');
    // No credentials / webhook material / error_description.
    expect(serialized).not.toMatch(/webhook/i);
    expect(serialized).not.toContain("error_description");
  });

  it("case 8: read-only invariant — crm.item.fields and crm.item.list only", async () => {
    mockMetadataEnvelope(yModeMetadata(), nModeMetadata(REGULAR_CONVERT));
    await runNModeFieldContractDiagnostics();
    const methods = bitrixPostMock.mock.calls.map((c: unknown[]) => c[0]);
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(["crm.item.fields", "crm.item.list"]).toContain(method);
    }
    // Exactly one N-mode list probe per role + full select + key-compat re-read.
    const listCalls = methods.filter((m: unknown) => m === "crm.item.list");
    expect(listCalls).toHaveLength(SMART_PROCESS_N_MODE_CUSTOM_ROLES.length + 2);
    // No N+1: 8 list calls total for the full population (not per item).
    expect(listCalls.length).toBeLessThan(10);
  });

  it("N-mode list probes carry useOriginalUfNames=N, categoryId filter, id in select", async () => {
    mockMetadataEnvelope(yModeMetadata(), nModeMetadata(REGULAR_CONVERT));
    await runNModeFieldContractDiagnostics();
    const listCalls = bitrixPostMock.mock.calls.filter(
      ([m]) => m === "crm.item.list"
    ) as Array<[string, Record<string, unknown>]>;
    for (const [, params] of listCalls) {
      expect(params.entityTypeId).toBe(1032);
      expect(params.useOriginalUfNames).toBe("N");
      expect(params.filter).toEqual({ categoryId: 15 });
      expect(params.order).toEqual({ id: "ASC" });
      expect(params.select).toContain("id");
    }
  });
});
