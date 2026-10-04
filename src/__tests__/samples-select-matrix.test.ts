// @vitest-environment node
// src/__tests__/samples-select-matrix.test.ts
// ─────────────────────────────────────────────────────────────────────
// Focused regressions for the Smart Process SELECT-interaction matrix
// (src/lib/samples-pipeline-diagnostics.ts runSmartProcessSelectMatrix +
// deriveSelectMatrixVerdict), attached to the Samples pipeline diagnostic
// under the local MISSING_REQUIRED_ID invariant only.
//
// Contract under test:
// 1. SYSTEM_SELECT returns ids normally (baseline A2 PASS).
// 2. The one-field matrix identifies an offending semantic role WITHOUT
//    exposing raw UF field ids in the serialized report.
// 3. The cumulative matrix identifies the interaction boundary.
// 4. The Y/N useOriginalUfNames comparison contains NO business data.
// 5. The live metadata role-presence report exposes booleans only.
// 6. READ-ONLY invariant: every Bitrix method reachable from the matrix
//    belongs to the project read-only allowlist (crm.item.list /
//    crm.item.fields) — verified at runtime call capture AND source scan.
// 17. No IDs / names / UF values / titles / credentials / raw bodies in
//     the serialized matrix report.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

const bitrixPostMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bitrix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bitrix")>();
  return {
    ...actual,
    bitrixPost: bitrixPostMock,
  };
});

import {
  runSmartProcessSelectMatrix,
  deriveSelectMatrixVerdict,
  type SmartProcessSelectMatrixReport,
  type SelectProbeResult,
} from "@/lib/samples-pipeline-diagnostics";
import {
  SMART_PROCESS_ITEM_SELECT,
  SMART_PROCESS_SYSTEM_SELECT,
  SMART_PROCESS_REQUIRED_ROLES,
  SMART_PROCESS_CANDIDATE_PARTITION_ROLES,
  SMART_PROCESS_ROLE_FIELD_IDS,
} from "@/lib/samples/bitrix-fetch";
import {
  SMART_PROCESS_ENTITY_TYPE_ID,
  SMART_PROCESS_CATEGORY_ID,
} from "@/lib/samples/smart-process-contract";

/** Envelope helper: official crm.item.list result shape. */
const page = (rows: unknown[], total?: number, next?: number) => ({
  result: { items: rows },
  ...(total !== undefined ? { total } : {}),
  ...(next !== undefined ? { next } : {}),
});

/** Full healthy row carrying every production select field. */
const fullRow = (id: number) => ({
  id,
  title: `Образец ${id}`,
  stageId: "DT1032_15:NEW",
  assignedById: 7,
  createdTime: "2026-09-09T10:00:00+03:00",
  companyId: "10",
  parentId2: String(id),
  SENT_DATE: "2026-09-11",
  GRADE_GEL: "1",
  GRADE_SOL: null,
  QTY_GEL: 5,
  QTY_SOL: null,
  TEST_RESULT: "1",
});

beforeEach(() => {
  bitrixPostMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Programmes a portal where rows DROP the documented `id` exactly when
 * `select` includes the given field id (default: the TEST_RESULT field).
 * Every other select behaves normally. Encodes the measured live anomaly.
 */
function mockPortalWithIdDropOn(offendingFieldId: string) {
  bitrixPostMock.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
    if (method === "crm.item.fields") {
      // Live metadata: every required role field present.
      const fields: Record<string, unknown> = {};
      for (const role of SMART_PROCESS_REQUIRED_ROLES) {
        fields[SMART_PROCESS_ROLE_FIELD_IDS[role]] = { type: "string" };
      }
      return { result: { fields } };
    }
    if (method === "crm.item.list") {
      const select = (params?.select as string[] | undefined) ?? [];
      const rows = Array.from({ length: 8 }, (_, i) => {
        const base = fullRow(i + 1) as Record<string, unknown>;
        // Anomalous portal: requested-but-dropped fields vanish, and the
        // offending field's presence additionally strips the documented id.
        if (select.includes(offendingFieldId)) {
          const { id, ...rest } = base;
          return rest;
        }
        return base;
      });
      return page(rows, 8);
    }
    throw new Error(`Unexpected method ${method}`);
  });
}

// ─── 1. Baseline: SYSTEM_SELECT returns ids normally ───
describe("baseline: healthy portal", () => {
  it("A1/A2/A3 and every one-field probe PASS with rowsWithId === itemCount", async () => {
    mockPortalWithIdDropOn("__never_selected__");
    const report = await runSmartProcessSelectMatrix();

    expect(report.baseline.A1).toMatchObject({ status: "PASS", itemCount: 8, rowsWithId: 8 });
    expect(report.baseline.A2).toMatchObject({ status: "PASS", itemCount: 8, rowsWithId: 8 });
    expect(report.baseline.A3).toMatchObject({ status: "PASS", itemCount: 8, rowsWithId: 8 });
    expect(report.singleField).toHaveLength(SMART_PROCESS_REQUIRED_ROLES.length);
    for (const probe of report.singleField) {
      expect(probe.result).toMatchObject({ status: "PASS", rowsWithId: probe.result.itemCount });
    }
    expect(report.metadataRoles.status).toBe("PASS");
    expect(report.verdict).toBe("SELECT_MATRIX_OK");
  });

  it("every probe reuses the EXACT production parameter shape (select is the only variable)", async () => {
    mockPortalWithIdDropOn("__never_selected__");
    await runSmartProcessSelectMatrix();

    for (const [method, params] of bitrixPostMock.mock.calls as Array<
      [string, Record<string, unknown>]
    >) {
      expect(["crm.item.list", "crm.item.fields"]).toContain(method);
      if (method !== "crm.item.list") continue;
      expect(params.entityTypeId).toBe(SMART_PROCESS_ENTITY_TYPE_ID);
      expect(params.filter).toEqual({ categoryId: SMART_PROCESS_CATEGORY_ID });
      expect(params.order).toEqual({ id: "ASC" });
      expect(params.start).toBe(0);
      expect(params.useOriginalUfNames).toMatch(/^[YN]$/);
      const select = params.select as string[];
      expect(select.includes("id") || select[0] === "*").toBe(true);
      // No uppercase aliases ever reach the transport.
      expect(Object.keys(params)).not.toContain("SELECT");
      expect(Object.keys(params)).not.toContain("FILTER");
    }
  });
});

// ─── 2. One-field matrix identifies the offender by ROLE, never UF id ───
describe("one-field matrix", () => {
  it("identifies the offending semantic role without exposing raw UF ids", async () => {
    const offenderFieldId = SMART_PROCESS_ROLE_FIELD_IDS.TEST_RESULT;
    mockPortalWithIdDropOn(offenderFieldId);
    const report = await runSmartProcessSelectMatrix();

    const offender = report.singleField.find((p) => p.role === "TEST_RESULT");
    expect(offender).toBeDefined();
    expect(offender!.result).toMatchObject({ status: "FAIL", itemCount: 8, rowsWithId: 0 });
    // Non-offending roles stay healthy.
    for (const probe of report.singleField) {
      if (probe.role === "TEST_RESULT") continue;
      expect(probe.result.status).toBe("PASS");
    }
    expect(report.verdict).toBe("OFFENDING_ROLE:TEST_RESULT");

    // Raw UF field ids never leak into the serialized report.
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(offenderFieldId);
    expect(serialized).not.toMatch(/UF_CRM_[0-9A-Za-z_]+/);
  });

  it("identifies the Deal relation offender (standard-field role)", async () => {
    mockPortalWithIdDropOn("parentId2");
    const report = await runSmartProcessSelectMatrix();
    expect(report.verdict).toBe("OFFENDING_ROLE:DEAL_RELATION");
  });
});

// ─── 3. Cumulative matrix identifies the interaction boundary ───
describe("cumulative matrix", () => {
  it("identifies the first cumulative prefix where ids disappear", async () => {
    // Genuine pairwise interaction portal: GRADE_GEL and SENT_DATE are
    // individually safe (one-field probes PASS), but ids drop once BOTH
    // appear in the select — exactly the interaction-only anomaly the
    // cumulative stage exists to isolate.
    const gradeGel = SMART_PROCESS_ROLE_FIELD_IDS.GRADE_GEL;
    const sentDate = SMART_PROCESS_ROLE_FIELD_IDS.SENT_DATE;
    bitrixPostMock.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      if (method === "crm.item.fields") {
        const fields: Record<string, unknown> = {};
        for (const role of SMART_PROCESS_REQUIRED_ROLES) {
          fields[SMART_PROCESS_ROLE_FIELD_IDS[role]] = { type: "string" };
        }
        return { result: { fields } };
      }
      if (method === "crm.item.list") {
        const select = (params?.select as string[] | undefined) ?? [];
        const rows = Array.from({ length: 8 }, (_, i) => {
          const base = fullRow(i + 1) as Record<string, unknown>;
          if (select.includes(gradeGel) && select.includes(sentDate)) {
            const { id, ...rest } = base;
            return rest;
          }
          return base;
        });
        return page(rows, 8);
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const report = await runSmartProcessSelectMatrix();

    // Every one-field probe stays healthy (no single offender).
    for (const probe of report.singleField) {
      expect(probe.result.status).toBe("PASS");
    }
    // The first cumulative prefix carrying both interacting fields fails.
    const boundary = report.cumulative.find((p) => p.result.status === "FAIL");
    expect(boundary).toBeDefined();
    expect(boundary!.roles).toContain("GRADE_GEL");
    expect(boundary!.roles).toContain("SENT_DATE");
    // Interaction-only anomaly: the combined boundary is recorded, but the
    // partition reads (each select carries only ONE of the interacting
    // fields) still preserve ids — the workaround is viable.
    expect(report.verdict).toBe("SELECT_MATRIX_OK");
    expect(report.partitions!.status).toBe("PASS");
  });

  it("SYSTEM_ONLY id drop → NO_SAFE_LIST_PARTITION with later stages not run", async () => {
    bitrixPostMock.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      if (method === "crm.item.fields") {
        const fields: Record<string, unknown> = {};
        for (const role of SMART_PROCESS_REQUIRED_ROLES) {
          fields[SMART_PROCESS_ROLE_FIELD_IDS[role]] = { type: "string" };
        }
        return { result: { fields } };
      }
      if (method === "crm.item.list") {
        const select = (params?.select as string[] | undefined) ?? [];
        const rows = Array.from({ length: 8 }, (_, i) => {
          const base = fullRow(i + 1) as Record<string, unknown>;
          // Ids drop whenever MORE than the bare id is requested.
          if (select.length > 1 && select[0] !== "*") {
            const { id, ...rest } = base;
            return rest;
          }
          return base;
        });
        return page(rows, 8);
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const report = await runSmartProcessSelectMatrix();
    expect(report.baseline.A1.status).toBe("PASS");
    expect(report.baseline.A2.status).toBe("FAIL");
    expect(report.verdict).toBe("NO_SAFE_LIST_PARTITION");
    // One-field and cumulative stages are skipped (not reached) — never
    // fabricated as passing.
    expect(report.singleField).toHaveLength(0);
    expect(report.cumulative).toHaveLength(0);
  });
});

// ─── 4. Y/N comparison: no business data ───
describe("useOriginalUfNames Y/N comparison", () => {
  it("runs standard-only selects for N and Y and exposes counts only", async () => {
    mockPortalWithIdDropOn("__never_selected__");
    const report = await runSmartProcessSelectMatrix();

    expect(report.ufNames.N1.result.status).toBe("PASS");
    expect(report.ufNames.N2.result.status).toBe("PASS");
    expect(report.ufNames.Y1.result.status).toBe("PASS");
    expect(report.ufNames.Y2.result.status).toBe("PASS");

    // The N-mode requests carried ONLY standard fields (never UF ids).
    const nCalls = (bitrixPostMock.mock.calls as Array<[string, Record<string, unknown>]>).filter(
      ([m, p]) => m === "crm.item.list" && p.useOriginalUfNames === "N"
    );
    expect(nCalls.length).toBeGreaterThanOrEqual(2);
    for (const [, params] of nCalls) {
      for (const field of params.select as string[]) {
        expect(field).not.toMatch(/^UF_CRM_/i);
      }
    }

    // No business data anywhere in the serialized report.
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("Образец");
    expect(serialized).not.toMatch(/"id":\d/);
    expect(serialized).not.toMatch(/webhook|token|error_description/i);
  });
});

// ─── 5. Metadata role presence: booleans only ───
describe("metadata role presence", () => {
  it("exposes one boolean per required role and drift on missing fields", async () => {
    const missingField = SMART_PROCESS_ROLE_FIELD_IDS.QTY_SOL;
    bitrixPostMock.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      if (method === "crm.item.fields") {
        const fields: Record<string, unknown> = {};
        for (const role of SMART_PROCESS_REQUIRED_ROLES) {
          const fieldId = SMART_PROCESS_ROLE_FIELD_IDS[role];
          if (fieldId !== missingField) fields[fieldId] = { type: "string" };
        }
        return { result: { fields } };
      }
      if (method === "crm.item.list") {
        return page(Array.from({ length: 8 }, (_, i) => fullRow(i + 1)), 8);
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const report = await runSmartProcessSelectMatrix();

    expect(Object.keys(report.metadataRoles.roles).sort()).toEqual(
      [...SMART_PROCESS_REQUIRED_ROLES].sort()
    );
    for (const value of Object.values(report.metadataRoles.roles)) {
      expect(typeof value).toBe("boolean");
    }
    expect(report.metadataRoles.roles.QTY_SOL).toBe(false);
    expect(report.metadataRoles.contractDrift).toBe(true);
    expect(report.verdict).toBe("SMART_PROCESS_CONTRACT_DRIFT");

    // The absent field's raw id never leaks.
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(missingField);
    expect(serialized).not.toMatch(/UF_CRM_[0-9A-Za-z_]+/);
  });

  it("metadata transport failure reports safe failure metadata only", async () => {
    const { BitrixTransientError } = await import("@/lib/bitrix");
    bitrixPostMock.mockImplementation(async (method: string) => {
      if (method === "crm.item.fields") {
        throw new BitrixTransientError("API returned status 403", 403, undefined, "crm.item.fields");
      }
      if (method === "crm.item.list") {
        return page(Array.from({ length: 8 }, (_, i) => fullRow(i + 1)), 8);
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const report = await runSmartProcessSelectMatrix();
    expect(report.metadataRoles.status).toBe("FAIL");
    expect(report.metadataRoles.method).toBe("crm.item.fields");
    expect(report.metadataRoles.httpStatus).toBe(403);
    expect(report.metadataRoles.contractDrift).toBe(false);
  });
});

// ─── 6. Read-only invariant ───
describe("read-only Bitrix invariant", () => {
  it("matrix transport calls are limited to crm.item.list / crm.item.fields", async () => {
    mockPortalWithIdDropOn("__never_selected__");
    await runSmartProcessSelectMatrix();

    const methods = bitrixPostMock.mock.calls.map(([m]) => m);
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(["crm.item.list", "crm.item.fields"]).toContain(method);
    }
  });

  it("engine source contains no mutation capability and no retyped selects/UF ids", () => {
    const engineSource = readFileSync(
      new URL("../lib/samples-pipeline-diagnostics.ts", import.meta.url),
      "utf8"
    );
    for (const forbidden of [
      "crm.item.add",
      "crm.item.update",
      "crm.item.delete",
      "crm.deal.add",
      "crm.company.add",
      "crm.item.get",
      "fetch(",
    ]) {
      expect(engineSource).not.toContain(forbidden);
    }
    // Selects and UF ids are imported from the canonical module — never
    // retyped into the diagnostics engine.
    expect(engineSource).not.toMatch(/select:\s*\[\s*"/);
    expect(engineSource).not.toMatch(/UF_CRM_[0-9A-Za-z_]+/);
    // The production select (13 fields) is never used as a matrix probe
    // (the matrix builds selects from semantic roles; only the star
    // diagnostic and the imported constants appear).
    expect(engineSource).toContain("SMART_PROCESS_SYSTEM_SELECT");
    expect(engineSource).toContain("runSmartProcessSelectMatrix");
  });

  it("bitrix-fetch source carries no star select in any production path", () => {
    const fetchSource = readFileSync(
      new URL("../lib/samples/bitrix-fetch.ts", import.meta.url),
      "utf8"
    );
    expect(fetchSource).not.toContain('["*"]');
    expect(fetchSource).not.toMatch(/select:\s*\[\s*"\*"/);
    expect(fetchSource).not.toContain("crm.item.get");
  });
});

// ─── Pure verdict mapping ───
describe("deriveSelectMatrixVerdict (pure)", () => {
  const okResult = (): SelectProbeResult => ({
    status: "PASS",
    itemCount: 8,
    reportedTotal: 8,
    rowsWithId: 8,
    nextPresent: false,
  });
  const healthy = (): Omit<SmartProcessSelectMatrixReport, "verdict"> => ({
    baseline: { A1: okResult(), A2: okResult(), A3: okResult() },
    singleField: SMART_PROCESS_REQUIRED_ROLES.map((role) => ({
      role,
      result: okResult(),
    })),
    cumulative: [],
    ufNames: {
      N1: { result: okResult() },
      N2: { result: okResult() },
      Y1: { result: okResult() },
      Y2: { result: okResult() },
    },
    metadataRoles: { roles: {}, contractDrift: false, status: "PASS" },
  });

  it("healthy partitions → SELECT_MATRIX_OK", () => {
    expect(
      deriveSelectMatrixVerdict({
        ...healthy(),
        partitions: { partitions: [], sameIdSets: true, coversRequiredRoles: true, status: "PASS" },
      })
    ).toBe("SELECT_MATRIX_OK");
  });

  it("contract drift wins over everything", () => {
    expect(
      deriveSelectMatrixVerdict({
        ...healthy(),
        metadataRoles: { roles: {}, contractDrift: true, status: "FAIL" },
      })
    ).toBe("SMART_PROCESS_CONTRACT_DRIFT");
  });

  it("transport-only failure (itemCount 0) is INCONCLUSIVE, never an offender", () => {
    const report = healthy();
    report.singleField[0].result = {
      status: "FAIL",
      itemCount: 0,
      reportedTotal: null,
      rowsWithId: 0,
      nextPresent: false,
      httpStatus: 500,
    };
    expect(deriveSelectMatrixVerdict(report)).toBe("SELECT_MATRIX_INCONCLUSIVE");
  });

  it("full production select id-drop does NOT block a safe partition verdict", () => {
    // The measured live production anomaly: the FULL select drops ids, but
    // every matrix probe (subsets) passes and the partitions measure clean.
    const report = healthy();
    report.cumulative.push({
      roles: [...SMART_PROCESS_REQUIRED_ROLES],
      result: {
        status: "FAIL",
        itemCount: 8,
        reportedTotal: 8,
        rowsWithId: 0,
        nextPresent: false,
      },
    });
    report.partitions = {
      partitions: [
        {
          roles: ["DEAL_RELATION", "SENT_DATE", "TEST_RESULT"],
          status: "PASS",
          itemCount: 8,
          reportedTotal: 8,
          rowsWithId: 8,
          nextPresent: false,
          duplicateIdCount: 0,
          uniqueIdCount: 8,
        },
        {
          roles: ["GRADE_GEL", "GRADE_SOL", "QTY_GEL", "QTY_SOL"],
          status: "PASS",
          itemCount: 8,
          reportedTotal: 8,
          rowsWithId: 8,
          nextPresent: false,
          duplicateIdCount: 0,
          uniqueIdCount: 8,
        },
      ],
      sameIdSets: true,
      coversRequiredRoles: true,
      status: "PASS",
    };
    expect(deriveSelectMatrixVerdict(report)).toBe("SELECT_MATRIX_OK");
  });

  it("partition set mismatch → NO_SAFE_LIST_PARTITION", () => {
    expect(
      deriveSelectMatrixVerdict({
        ...healthy(),
        partitions: { partitions: [], sameIdSets: false, coversRequiredRoles: true, status: "FAIL" },
      })
    ).toBe("NO_SAFE_LIST_PARTITION");
  });

  it("Y-mode breaking standard selects while N passes → USE_ORIGINAL_UF_NAMES_Y_BREAKS_ID (measured live)", () => {
    const report = healthy();
    report.baseline.A1 = {
      status: "FAIL",
      itemCount: 8,
      reportedTotal: 8,
      rowsWithId: 0,
      nextPresent: false,
    };
    report.baseline.A2 = { ...report.baseline.A1 };
    report.baseline.A3 = { ...report.baseline.A1 };
    // Identical standard selects pass under "N" — the Y mode itself kills id.
    report.ufNames.N1 = { result: okResult() };
    report.ufNames.N2 = { result: okResult() };
    report.ufNames.Y1 = { result: { ...report.baseline.A1 } };
    report.ufNames.Y2 = { result: { ...report.baseline.A1 } };
    expect(deriveSelectMatrixVerdict(report)).toBe("USE_ORIGINAL_UF_NAMES_Y_BREAKS_ID");
  });
});

// ─── §7 partition probes ───
describe("partition feasibility probes", () => {
  it("healthy portal: partitions PASS with equal ID sets and full coverage", async () => {
    mockPortalWithIdDropOn("__never_selected__");
    const report = await runSmartProcessSelectMatrix();

    expect(report.partitions).toBeDefined();
    expect(report.partitions!.partitions).toHaveLength(SMART_PROCESS_CANDIDATE_PARTITION_ROLES.length);
    for (const partition of report.partitions!.partitions) {
      expect(partition).toMatchObject({ status: "PASS", itemCount: 8, rowsWithId: 8 });
      expect(partition.uniqueIdCount).toBe(8);
      expect(partition.duplicateIdCount).toBe(0);
      // Partition selects always include the documented id first.
      expect(partition.roles).not.toContain("id"); // roles never name system fields
    }
    expect(report.partitions!.sameIdSets).toBe(true);
    expect(report.partitions!.coversRequiredRoles).toBe(true);
    expect(report.partitions!.status).toBe("PASS");
  });

  it("full production select fails but partitions preserve ids → verdict SELECT_MATRIX_OK with measured partitions", async () => {
    // Portal anomaly ONLY on the full production select (13 fields).
    const productionSelect = SMART_PROCESS_ITEM_SELECT;
    bitrixPostMock.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      if (method === "crm.item.fields") {
        const fields: Record<string, unknown> = {};
        for (const role of SMART_PROCESS_REQUIRED_ROLES) {
          fields[SMART_PROCESS_ROLE_FIELD_IDS[role]] = { type: "string" };
        }
        return { result: { fields } };
      }
      if (method === "crm.item.list") {
        const select = (params?.select as string[] | undefined) ?? [];
        const rows = Array.from({ length: 8 }, (_, i) => {
          const base = fullRow(i + 1) as Record<string, unknown>;
          if (select.length >= productionSelect.length) {
            const { id, ...rest } = base;
            return rest;
          }
          return base;
        });
        return page(rows, 8);
      }
      throw new Error(`Unexpected method ${method}`);
    });
    const report = await runSmartProcessSelectMatrix();

    expect(report.verdict).toBe("SELECT_MATRIX_OK");
    expect(report.partitions!.status).toBe("PASS");
    expect(report.partitions!.sameIdSets).toBe(true);
  });
});
