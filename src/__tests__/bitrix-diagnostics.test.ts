// @vitest-environment node
// src/__tests__/bitrix-diagnostics.test.ts
// ─────────────────────────────────────────────────────────────────────
// Focused tests for the Smart Process 1032 diagnostic endpoint
// (GET /api/bitrix/diagnostics/smart-process) and its probe engine
// (src/lib/bitrix-diagnostics.ts).
//
// Contract under test:
// - four sequential READ-ONLY probes (crm.item.fields / crm.item.list);
// - probe 4 runs only when probe 3 reports a next page;
// - exact production SMART_PROCESS_ITEM_SELECT is imported (never retyped);
// - responses carry only statuses/total/hasNext + safe failure metadata —
//   never item data, error_description, URLs, tokens, or credentials;
// - diagnosis maps probe states to exactly one measured outcome.
// (Transport-level retry/regression evidence lives in
//  src/__tests__/bitrix-error-metadata.test.ts.)
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";

// ─── Mocks (route-level) ───
const auth = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  isAuthError: (value: unknown) => value instanceof Response,
}));
vi.mock("@/lib/auth-guard", () => auth);

// ─── Transport mock: bitrixPost intercepted; safe metadata helpers stay
// real so FAIL envelopes exercise readBitrixFailureMeta identity. ───
const bitrixPostMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/bitrix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bitrix")>();
  return {
    ...actual,
    bitrixPost: bitrixPostMock,
  };
});

// ─── Contract gate mock: the real assertSmartProcessContractReady closes
// over the module-internal constant, so the gate itself is replaced here. ───
const contractGate = vi.hoisted(() => ({ assertReady: vi.fn() }));
vi.mock("@/lib/samples/smart-process-contract", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/samples/smart-process-contract")
  >();
  return {
    ...actual,
    assertSmartProcessContractReady: contractGate.assertReady,
  };
});

import { GET } from "@/app/api/bitrix/diagnostics/smart-process/route";
import { runSmartProcessDiagnostics, diagnose } from "@/lib/bitrix-diagnostics";
import { SMART_PROCESS_ITEM_SELECT } from "@/lib/samples/bitrix-fetch";
import {
  SMART_PROCESS_ENTITY_TYPE_ID,
  SMART_PROCESS_CATEGORY_ID,
} from "@/lib/samples/smart-process-contract";

const page = (opts: { result?: unknown[]; total?: number; next?: number } = {}) => ({
  result: opts.result ?? [],
  ...(opts.total !== undefined ? { total: opts.total } : {}),
  ...(opts.next !== undefined ? { next: opts.next } : {}),
});

beforeEach(() => {
  auth.requireAdmin.mockResolvedValue({
    userId: "admin@test",
    email: "admin@test",
    name: "Admin",
    role: "admin",
  });
  contractGate.assertReady.mockReset();
  contractGate.assertReady.mockImplementation(() => {});
  bitrixPostMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const GET_REQUEST = () => GET();

// ─── Auth ───
describe("GET /api/bitrix/diagnostics/smart-process — auth", () => {
  it("requires admin before any Bitrix work", async () => {
    auth.requireAdmin.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );
    const response = await GET_REQUEST();
    expect(response.status).toBe(401);
    expect(bitrixPostMock).not.toHaveBeenCalled();
  });

  it("non-admin role is rejected with 403 before probes", async () => {
    auth.requireAdmin.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 403 })
    );
    const response = await GET_REQUEST();
    expect(response.status).toBe(403);
    expect(bitrixPostMock).not.toHaveBeenCalled();
  });
});

// ─── Case 1: all four probes pass ───
describe("case 1: all four probes pass", () => {
  beforeEach(() => {
    bitrixPostMock
      .mockResolvedValueOnce(page({ result: [] })) // P1 fields
      .mockResolvedValueOnce(page({ total: 17 })) // P2 minimal (no next)
      .mockResolvedValueOnce(page({ total: 17 })) // P3 production select
      .mockResolvedValueOnce(page({ result: [] })); // P4 second page
  });

  it("full PASS matrix with SMART_PROCESS_TRANSPORT_OK", async () => {
    const response = await GET_REQUEST();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.entityTypeId).toBe(SMART_PROCESS_ENTITY_TYPE_ID);
    expect(body.categoryId).toBe(SMART_PROCESS_CATEGORY_ID);
    expect(body.probes.fields).toEqual({ status: "PASS" });
    expect(body.probes.minimalList).toEqual({
      status: "PASS",
      total: 17,
      hasNext: false,
    });
    expect(body.probes.productionSelect).toEqual({
      status: "PASS",
      total: 17,
      hasNext: false,
    });
    // P4 is SKIPPED (no next page reported by Bitrix) — no synthetic pages.
    expect(body.probes.secondPage).toEqual({
      status: "SKIPPED",
      reason: "NO_NEXT_PAGE",
    });
    expect(body.diagnosis).toBe("SMART_PROCESS_TRANSPORT_OK");
  });

  it("P4 runs with the real cursor when P3 reports hasNext", async () => {
    bitrixPostMock.mockReset();
    bitrixPostMock
      .mockResolvedValueOnce(page()) // P1
      .mockResolvedValueOnce(page({ total: 100, next: 50 })) // P2 has next
      .mockResolvedValueOnce(page({ total: 100, next: 50 })) // P3 has next
      .mockResolvedValueOnce(page({ result: [] })); // P4
    await runSmartProcessDiagnostics();

    expect(bitrixPostMock).toHaveBeenCalledTimes(4);
    const p4Body = bitrixPostMock.mock.calls[3][1] as Record<string, unknown>;
    expect(p4Body.start).toBe(50); // real returned cursor, not a synthesized page
  });
});

// ─── Case 2: Probe 1 failure → safe metadata only ───
describe("case 2: probe 1 failure", () => {
  it("returns safe method/bitrixCode and nothing else", async () => {
    const { BitrixApiError } = await import("@/lib/bitrix");
    bitrixPostMock.mockRejectedValue(
      new BitrixApiError("API request failed", "crm.item.fields", "INVALID_CREDENTIALS")
    );

    const response = await GET_REQUEST();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.probes.fields).toEqual({
      status: "FAIL",
      method: "crm.item.fields",
      bitrixCode: "INVALID_CREDENTIALS",
    });
    expect(body.diagnosis).toBe("SMART_PROCESS_METADATA_ACCESS_FAILED");
    // Later probes never ran and are explicitly skipped.
    expect(body.probes.minimalList).toEqual({
      status: "SKIPPED",
      reason: "FIELDS_PROBE_FAILED",
    });
    expect(bitrixPostMock).toHaveBeenCalledTimes(1);
  });

  it("HTTP-status failure carries httpStatus and no bitrixCode", async () => {
    const { BitrixTransientError } = await import("@/lib/bitrix");
    bitrixPostMock.mockRejectedValue(
      new BitrixTransientError("API returned status 403", 403, undefined, "crm.item.fields")
    );

    const body = await (await GET_REQUEST()).json();
    expect(body.probes.fields).toEqual({
      status: "FAIL",
      method: "crm.item.fields",
      httpStatus: 403,
    });
    expect(body.diagnosis).toBe("SMART_PROCESS_METADATA_ACCESS_FAILED");
  });
});

// ─── Case 3: Probe 2 failure → READ_ACCESS_FAILED ───
describe("case 3: probe 2 failure", () => {
  it("diagnosis SMART_PROCESS_READ_ACCESS_FAILED; P3/P4 skipped", async () => {
    const { BitrixTransientError } = await import("@/lib/bitrix");
    bitrixPostMock
      .mockResolvedValueOnce(page()) // P1 passes
      .mockRejectedValueOnce(
        new BitrixTransientError("API returned status 403", 403, undefined, "crm.item.list")
      );

    const body = await (await GET_REQUEST()).json();
    expect(body.probes.fields.status).toBe("PASS");
    expect(body.probes.minimalList).toEqual({
      status: "FAIL",
      method: "crm.item.list",
      httpStatus: 403,
    });
    expect(body.probes.productionSelect).toEqual({
      status: "SKIPPED",
      reason: "MINIMAL_LIST_FAILED",
    });
    expect(body.probes.secondPage).toEqual({
      status: "SKIPPED",
      reason: "MINIMAL_LIST_FAILED",
    });
    expect(body.diagnosis).toBe("SMART_PROCESS_READ_ACCESS_FAILED");
    expect(bitrixPostMock).toHaveBeenCalledTimes(2);
  });
});

// ─── Case 4: Probe 3 failure → PRODUCTION_SELECT_FAILED ───
describe("case 4: probe 3 failure (production select)", () => {
  it("diagnosis PRODUCTION_SELECT_FAILED; P4 skipped with the same reason", async () => {
    const { BitrixApiError } = await import("@/lib/bitrix");
    bitrixPostMock
      .mockResolvedValueOnce(page()) // P1
      .mockResolvedValueOnce(page({ total: 5 })) // P2
      .mockRejectedValueOnce(
        new BitrixApiError("API request failed", "crm.item.list", "ACCESS_DENIED")
      );

    const body = await (await GET_REQUEST()).json();
    expect(body.probes.productionSelect).toEqual({
      status: "FAIL",
      method: "crm.item.list",
      bitrixCode: "ACCESS_DENIED",
    });
    expect(body.probes.secondPage).toEqual({
      status: "SKIPPED",
      reason: "PRODUCTION_SELECT_FAILED",
    });
    expect(body.diagnosis).toBe("PRODUCTION_SELECT_FAILED");
    expect(bitrixPostMock).toHaveBeenCalledTimes(3);
  });
});

// ─── Cases 5–6: Probe 4 gating ───
describe("cases 5-6: probe 4 runs only when P3 reports a next page", () => {
  it("case 6: no next page → SKIPPED NO_NEXT_PAGE, only 3 calls", async () => {
    bitrixPostMock
      .mockResolvedValueOnce(page()) // P1
      .mockResolvedValueOnce(page({ total: 2 })) // P2
      .mockResolvedValueOnce(page({ total: 2 })); // P3 (no next)
    const body = await (await GET_REQUEST()).json();

    expect(bitrixPostMock).toHaveBeenCalledTimes(3);
    expect(body.probes.secondPage).toEqual({
      status: "SKIPPED",
      reason: "NO_NEXT_PAGE",
    });
    expect(body.diagnosis).toBe("SMART_PROCESS_TRANSPORT_OK");
  });

  it("case 5: hasNext → P4 executed; P4 failure → PAGINATION_FAILED", async () => {
    const { BitrixTransientError } = await import("@/lib/bitrix");
    bitrixPostMock
      .mockResolvedValueOnce(page()) // P1
      .mockResolvedValueOnce(page({ total: 90, next: 50 })) // P2
      .mockResolvedValueOnce(page({ total: 90, next: 50 })) // P3
      .mockRejectedValueOnce(
        new BitrixTransientError("API returned status 500", 500, undefined, "crm.item.list")
      );

    const body = await (await GET_REQUEST()).json();
    expect(bitrixPostMock).toHaveBeenCalledTimes(4);
    expect(body.probes.secondPage).toEqual({
      status: "FAIL",
      method: "crm.item.list",
      httpStatus: 500,
    });
    expect(body.diagnosis).toBe("PAGINATION_FAILED");
  });
});

// ─── Case 7: production select imported, never duplicated ───
describe("case 7: exact production select reuse", () => {
  it("probe 3 receives the imported SMART_PROCESS_ITEM_SELECT array", async () => {
    bitrixPostMock
      .mockResolvedValueOnce(page()) // P1
      .mockResolvedValueOnce(page()) // P2
      .mockResolvedValueOnce(page({ total: 1 })); // P3
    await runSmartProcessDiagnostics();

    const p3Call = bitrixPostMock.mock.calls[2];
    expect(p3Call[0]).toBe("crm.item.list");
    expect(p3Call[1].select).toBe(SMART_PROCESS_ITEM_SELECT); // identity — imported, not retyped
    expect(p3Call[1].select).toEqual(SMART_PROCESS_ITEM_SELECT);
    expect(p3Call[1].entityTypeId).toBe(SMART_PROCESS_ENTITY_TYPE_ID);
    expect(p3Call[1].filter).toEqual({ categoryId: SMART_PROCESS_CATEGORY_ID });
  });

  it("diagnostics source contains no duplicated field array", () => {
    const diagSource = readFileSync(
      new URL("../lib/bitrix-diagnostics.ts", import.meta.url),
      "utf8"
    );
    const routeSource = readFileSync(
      new URL("../app/api/bitrix/diagnostics/smart-process/route.ts", import.meta.url),
      "utf8"
    );
    // The only select arrays allowed are the minimal probe's ["id"].
    for (const [name, source] of [
      ["bitrix-diagnostics", diagSource],
      ["route", routeSource],
    ] as const) {
      const selectArrays = source.match(/select:\s*\[[^\]]*\]/g) ?? [];
      for (const arr of selectArrays) {
        const isMinimal = /^select:\s*\[\s*"id"\s*\]$/.test(arr.replace(/\s+/g, " "));
        expect({ file: name, arr, isMinimal }).toEqual({ file: name, arr, isMinimal: true });
      }
      // UF field IDs from the contract are never retyped into diagnostics.
      expect(source).not.toMatch(/UF_CRM_[0-9A-Za-z_]+/);
      if (name === "bitrix-diagnostics") {
        expect(source).toContain("SMART_PROCESS_ITEM_SELECT");
      }
    }
    // The route never touches the transport directly.
    expect(routeSource).not.toContain("bitrixPost");
  });
});

// ─── Case 8: no raw item data ───
describe("case 8: response contains no raw item data", () => {
  it("item-bearing responses expose only total/hasNext — never rows", async () => {
    bitrixPostMock
      .mockResolvedValueOnce(page()) // P1
      .mockResolvedValueOnce({
        // Adversarial envelope: real item rows with business content.
        result: [
          { id: 101, title: "ООО Ромашка", UF_CRM_7_1763036405: "подошло" },
          { id: 102, title: "ООО Лютик", UF_CRM_7_1763036405: "не подошло" },
        ],
        total: 2,
      }) // P2
      .mockResolvedValueOnce({ result: [{ id: 201, title: "Секретный образец" }], total: 1 }); // P3
    const body = await (await GET_REQUEST()).json();
    const serialized = JSON.stringify(body);

    expect(body.probes.minimalList).toEqual({ status: "PASS", total: 2, hasNext: false });
    expect(serialized).not.toContain("Ромашка");
    expect(serialized).not.toContain("Лютик");
    expect(serialized).not.toContain("Секретный образец");
    expect(serialized).not.toContain("подошло");
    expect(serialized).not.toContain("101");
    expect(serialized).not.toContain("201");
    expect(body).not.toHaveProperty("items");
    expect(body).not.toHaveProperty("result");
  });
});

// ─── Cases 9–10: no error_description / no credentials ───
describe("cases 9-10: secret-safe response contract", () => {
  it("case 9: no error_description key anywhere in the response", async () => {
    const { BitrixApiError } = await import("@/lib/bitrix");
    bitrixPostMock.mockRejectedValue(
      new BitrixApiError("API request failed", "crm.item.fields", "INVALID_CREDENTIALS")
    );

    const response = await GET_REQUEST();
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain("error_description");
    expect(serialized).not.toContain("secret descriptive text");
    // bitrixCode itself IS exposed — it is the one safe, actionable fact.
    expect(serialized).toContain("INVALID_CREDENTIALS");
  });

  it("case 10: no webhook URL/token/credential substrings", async () => {
    const { BitrixTransientError } = await import("@/lib/bitrix");
    bitrixPostMock
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(
        new BitrixTransientError("API returned status 403", 403, undefined, "crm.item.list")
      );

    const response = await GET_REQUEST();
    const serialized = JSON.stringify({
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.json(),
    });
    expect(serialized).not.toMatch(/\/rest\/\d+\//);
    expect(serialized).not.toMatch(/webhook/i);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toContain("BITRIX_WEBHOOK_URL");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

// ─── Case 12: read-only methods only ───
describe("case 12: read-only Bitrix invariant", () => {
  it("diagnostic routine only calls read-only methods", async () => {
    bitrixPostMock
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page({ next: 50 }))
      .mockResolvedValueOnce(page({ next: 50 }))
      .mockResolvedValueOnce(page());
    await runSmartProcessDiagnostics();

    const methods = bitrixPostMock.mock.calls.map((c) => c[0]);
    expect(methods.length).toBe(4);
    for (const method of methods) {
      expect(["crm.item.fields", "crm.item.list"]).toContain(method);
    }
  });

  it("route and engine source contain no mutation capability", () => {
    const routeSource = readFileSync(
      new URL("../app/api/bitrix/diagnostics/smart-process/route.ts", import.meta.url),
      "utf8"
    );
    for (const forbidden of ["PUT", "DELETE", "crm.item.add", "crm.item.update", "crm.item.delete", "fetch("]) {
      expect(routeSource).not.toContain(forbidden);
    }
    const diagSource = readFileSync(
      new URL("../lib/bitrix-diagnostics.ts", import.meta.url),
      "utf8"
    );
    for (const forbidden of [
      "crm.item.add",
      "crm.item.update",
      "crm.item.delete",
      "crm.deal.add",
      "crm.company.add",
    ]) {
      expect(diagSource).not.toContain(forbidden);
    }
  });
});

// ─── Unexpected internal failure → endpoint-level 500 ───
describe("endpoint-level failures", () => {
  it("contract-gate failure before probes → 500 DIAGNOSTIC_INCOMPLETE", async () => {
    contractGate.assertReady.mockImplementation(() => {
      throw new Error("Smart Process contract not verified");
    });
    const response = await GET_REQUEST();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(bitrixPostMock).not.toHaveBeenCalled();
    expect(body).toEqual({ success: false, diagnosis: "DIAGNOSTIC_INCOMPLETE" });
  });
});

// ─── diagnose() mapping truth table (pure function) ───
describe("diagnosis mapping", () => {
  const p = {
    fields: { status: "PASS" } as const,
    minimalList: { status: "PASS", total: 1, hasNext: false } as const,
    productionSelect: { status: "PASS", total: 1, hasNext: false } as const,
    secondPage: { status: "SKIPPED", reason: "NO_NEXT_PAGE" } as const,
  };

  it("maps every probe state to exactly one diagnosis", () => {
    expect(diagnose({ ...p, fields: { status: "FAIL", method: "m" } })).toBe(
      "SMART_PROCESS_METADATA_ACCESS_FAILED"
    );
    expect(diagnose({ ...p, minimalList: { status: "FAIL", method: "m" } })).toBe(
      "SMART_PROCESS_READ_ACCESS_FAILED"
    );
    expect(diagnose({ ...p, productionSelect: { status: "FAIL", method: "m" } })).toBe(
      "PRODUCTION_SELECT_FAILED"
    );
    expect(diagnose({ ...p, secondPage: { status: "FAIL", method: "m" } })).toBe(
      "PAGINATION_FAILED"
    );
    expect(diagnose(p)).toBe("SMART_PROCESS_TRANSPORT_OK");
    expect(diagnose({ ...p, secondPage: { status: "PASS" } })).toBe(
      "SMART_PROCESS_TRANSPORT_OK"
    );
    expect(
      diagnose({
        fields: { status: "SKIPPED", reason: "NOT_RUN" },
        minimalList: { status: "SKIPPED", reason: "NOT_RUN" },
        productionSelect: { status: "SKIPPED", reason: "NOT_RUN" },
        secondPage: { status: "SKIPPED", reason: "NOT_RUN" },
      })
    ).toBe("DIAGNOSTIC_INCOMPLETE");
  });
});
