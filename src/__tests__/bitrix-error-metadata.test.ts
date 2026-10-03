// @vitest-environment node
// src/__tests__/bitrix-error-metadata.test.ts
// ─────────────────────────────────────────────────────────────────────
// Regression evidence for the safe Bitrix error-metadata patch:
// 1. existing retry semantics are UNCHANGED (deterministic 200-envelope
//    errors are never retried; transient 429/5xx remain bounded-retried);
// 2. a Bitrix response `{ error, error_description }` surfaces externally
//    as ONLY `{ method, bitrixCode }` via readBitrixFailureMeta — the
//    secret error_description text and any credential material never
//    appear in the retained metadata, thrown messages, or logs;
// 3. the full diagnostic probe engine, driven by the REAL transport,
//    reports bitrixCode while the secret description never leaks.
// ─────────────────────────────────────────────────────────────────────
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const envelope = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("retry semantics remain unchanged", () => {
  it("Bitrix API-level 200 envelope error (INVALID_CREDENTIALS) is NOT retried", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(
      envelope({ error: "INVALID_CREDENTIALS", error_description: "secret descriptive text" })
    );
    let thrown: unknown = null;
    try {
      await bitrixPost("crm.item.fields", { entityTypeId: 1032 });
    } catch (error) {
      thrown = error;
    }
    // Deterministic — exactly one attempt (unchanged retry semantics).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The external safe sanitizer message carries neither the secret
    // description nor any credential material.
    expect((thrown as Error).message).toBe(
      "Failed to crm.item.fields. Please try again later."
    );
    expect((thrown as Error).message).not.toContain("secret descriptive text");
    expect((thrown as Error).message).not.toContain("SECRET_TOKEN");
    // Server-side logs stay credential-safe too.
    for (const call of (console.warn as ReturnType<typeof vi.fn>).mock.calls.concat(
      (console.error as ReturnType<typeof vi.fn>).mock.calls
    )) {
      expect(JSON.stringify(call)).not.toContain("secret descriptive text");
      expect(JSON.stringify(call)).not.toContain("SECRET_TOKEN");
    }
  });

  it("deterministic HTTP 403 remains NOT retried (exactly one attempt)", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(envelope({}, 403));
    await expect(bitrixPost("crm.item.list", {})).rejects.toThrow("API returned status 403");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("transient 429 remains bounded-retried (1 + 2 attempts, unchanged)", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(envelope({}, 429));
    await expect(bitrixPost("crm.item.list", {})).rejects.toThrow(
      "Failed to crm.item.list. Please try again later."
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("transient 503 then success still succeeds through the shared strategy", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock
      .mockResolvedValueOnce(envelope({}, 503))
      .mockResolvedValueOnce(envelope({ result: [] }));
    const data = await bitrixPost<{ result: unknown[] }>("crm.item.list", {});
    expect(data.result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("safe error metadata extraction", () => {
  it("200 envelope error retains { method, bitrixCode } and never error_description", async () => {
    const { bitrixPost, readBitrixFailureMeta } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(
      envelope({ error: "INVALID_CREDENTIALS", error_description: "secret descriptive text" })
    );
    let thrown: unknown = new Error("sentinel: call did not throw");
    try {
      await bitrixPost("crm.item.list", { start: 0 });
    } catch (error) {
      thrown = error;
    }
    const meta = readBitrixFailureMeta(thrown);
    expect(meta).toEqual({ method: "crm.item.list", bitrixCode: "INVALID_CREDENTIALS" });
    // The secret description is nowhere in the retained metadata.
    expect(JSON.stringify(meta)).not.toContain("secret descriptive text");
    // The thrown message is the sanitized generic one.
    expect((thrown as Error).message).not.toContain("secret descriptive text");
    // Logs stay credential-safe.
    for (const call of (console.warn as ReturnType<typeof vi.fn>).mock.calls.concat(
      (console.error as ReturnType<typeof vi.fn>).mock.calls
    )) {
      expect(JSON.stringify(call)).not.toContain("secret descriptive text");
      expect(JSON.stringify(call)).not.toContain("SECRET_TOKEN");
    }
  });

  it("HTTP 403 retains { method, httpStatus } via BitrixTransientError", async () => {
    const { bitrixPost, readBitrixFailureMeta } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(envelope({}, 403));
    let thrown: unknown = null;
    try {
      await bitrixPost("crm.item.list", {});
    } catch (error) {
      thrown = error;
    }
    expect(readBitrixFailureMeta(thrown)).toEqual({
      method: "crm.item.list",
      httpStatus: 403,
    });
  });

  it("readBitrixFailureMeta returns null for non-Bitrix errors", async () => {
    const { readBitrixFailureMeta } = await import("@/lib/bitrix");
    expect(readBitrixFailureMeta(new Error("unrelated"))).toBeNull();
    expect(readBitrixFailureMeta(null)).toBeNull();
    expect(readBitrixFailureMeta("string error")).toBeNull();
  });

  it("retry-exhaustion sanitized error still carries { method } and no credentials", async () => {
    const { bitrixPost, readBitrixFailureMeta } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(envelope({}, 429));
    let thrown: unknown = null;
    try {
      await bitrixPost("crm.item.fields", {});
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe(
      "Failed to crm.item.fields. Please try again later."
    );
    const meta = readBitrixFailureMeta(thrown);
    expect(meta?.method).toBe("crm.item.fields");
    expect(JSON.stringify(meta ?? {})).not.toContain("SECRET_TOKEN");
  });
});

describe("diagnostic probe engine driven by the REAL transport", () => {
  it("INVALID_CREDENTIALS envelope → FAIL probe with bitrixCode; secret never appears", async () => {
    const { runSmartProcessDiagnostics } = await import("@/lib/bitrix-diagnostics");
    fetchMock.mockResolvedValue(
      envelope({ error: "INVALID_CREDENTIALS", error_description: "secret descriptive text" })
    );

    const report = await runSmartProcessDiagnostics();
    const serialized = JSON.stringify(report);

    expect(report.success).toBe(true);
    expect(report.entityTypeId).toBe(1032);
    expect(report.categoryId).toBe(15);
    expect(report.probes.fields).toEqual({
      status: "FAIL",
      method: "crm.item.fields",
      bitrixCode: "INVALID_CREDENTIALS",
    });
    expect(report.probes.minimalList).toEqual({
      status: "SKIPPED",
      reason: "FIELDS_PROBE_FAILED",
    });
    expect(report.diagnosis).toBe("SMART_PROCESS_METADATA_ACCESS_FAILED");
    // Secret-safety: description text, envelope key, and webhook token never appear.
    expect(serialized).not.toContain("secret descriptive text");
    expect(serialized).not.toContain("error_description");
    expect(serialized).not.toContain("SECRET_TOKEN");
    // Read-only invariant under the real transport.
    const methods = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(methods.length).toBe(1); // first failure short-circuits dependent probes
    expect(methods[0]).toMatch(/\/crm\.item\.fields$/);
  });

  it("minimal-list probe issues the documented request form; P3 failure is reported after P2 passes", async () => {
    const { runSmartProcessDiagnostics } = await import("@/lib/bitrix-diagnostics");
    fetchMock
      .mockResolvedValueOnce(envelope({ result: {} })) // P1 fields OK
      .mockResolvedValueOnce(envelope({ result: [], total: 42 })) // P2 minimal OK
      .mockResolvedValueOnce(envelope({ error: "ACCESS_DENIED" }, 403)); // P3 deterministic failure

    const report = await runSmartProcessDiagnostics();

    expect(report.probes.fields.status).toBe("PASS");
    expect(report.probes.minimalList).toEqual({
      status: "PASS",
      total: 42,
      hasNext: false,
    });
    expect(report.probes.productionSelect).toEqual({
      status: "FAIL",
      method: "crm.item.list",
      httpStatus: 403,
    });
    expect(report.probes.secondPage).toEqual({
      status: "SKIPPED",
      reason: "PRODUCTION_SELECT_FAILED",
    });
    expect(report.diagnosis).toBe("PRODUCTION_SELECT_FAILED");

    // Second call = probe 2: minimal documented request form (exact shape).
    const secondInit = fetchMock.mock.calls[1][1] as { body?: string };
    expect(JSON.parse(secondInit.body ?? "{}")).toEqual({
      entityTypeId: 1032,
      useOriginalUfNames: "Y",
      select: ["id"],
      filter: { categoryId: 15 },
      order: { id: "ASC" },
      start: 0,
    });

    // Deterministic 403 on P3: exactly one attempt, no retry storm.
    expect(fetchMock.mock.calls.length).toBe(3);
  });

  it("production-select probe issues the EXACT imported select through the real transport", async () => {
    const { runSmartProcessDiagnostics } = await import("@/lib/bitrix-diagnostics");
    const { SMART_PROCESS_ITEM_SELECT } = await import("@/lib/samples/bitrix-fetch");
    fetchMock
      .mockResolvedValueOnce(envelope({ result: {} })) // P1
      .mockResolvedValueOnce(envelope({ result: [], total: 1 })) // P2
      .mockResolvedValueOnce(envelope({ result: [{ id: 1 }], total: 1 })); // P3

    const report = await runSmartProcessDiagnostics();

    expect(report.diagnosis).toBe("SMART_PROCESS_TRANSPORT_OK");
    const thirdBody = fetchMock.mock.calls[2][1] as { body?: string };
    const parsed = JSON.parse(thirdBody.body ?? "{}");
    expect(parsed.select).toEqual(SMART_PROCESS_ITEM_SELECT);
    expect(parsed.filter).toEqual({ categoryId: 15 });
    // Response carries no item content even though Bitrix returned a row.
    expect(JSON.stringify(report)).not.toContain('"id":1');
  });
});
