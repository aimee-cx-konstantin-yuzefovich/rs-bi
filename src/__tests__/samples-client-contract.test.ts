// @vitest-environment node
// src/__tests__/samples-client-contract.test.ts
// ─────────────────────────────────────────────────────────────────────
// Tests for the ONE shared Samples client response contract
// (src/lib/samples/client-contract.ts):
//
// - accepts the exact production response shape (route contract incl.
//   meta / issueLabels / smartProcess.qualityCounts);
// - rejects falsy success → INVALID_SUCCESS_FLAG;
// - rejects non-array samples → SAMPLES_NOT_ARRAY;
// - applies the identical coercions as the previous inline predicate;
// - NO stricter validation was introduced (diagnostic patch is
//   semantics-preserving);
// - source scan: samples-cache.ts consumes the shared validator and no
//   second inline Samples response parser exists (single-parser rule).
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateSamplesClientPayload,
  type SamplesClientContractResult,
} from "@/lib/samples/client-contract";
import type { SamplesResponseMeta, SampleSummary } from "@/lib/samples/types";

// Minimal well-formed summary mirroring the route's SampleSummary shape.
const mkSummary = (companyId: string): SampleSummary => ({
  companyId,
  companyTitle: `Компания ${companyId}`,
  productFamilies: ["Гель"],
  grades: [],
  quantities: [],
  sentDates: ["2026-10-01"],
  sampleIndicators: [],
  processStatuses: [],
  normalizedResult: "pending",
  relatedDeals: [],
  sourceQuality: "structured",
  dataIssues: [],
});

const PRODUCTION_META: SamplesResponseMeta = {
  statusLabels: { UF_CRM_TEST_FIELD: { "5": "Подошли" } },
};

/** Exact shape POST /api/bitrix/samples returns on success. */
function productionShapedResponse() {
  return {
    success: true,
    samples: [mkSummary("101"), mkSummary("102")],
    total: 2,
    orphanDealCount: 1,
    metadataPartial: false,
    smartProcess: {
      qualityCounts: {
        orphanSmartProcessItemCount: 0,
        relationConflictCount: 0,
        sentStageWithoutDateCount: 2,
        multipleActiveCount: 0,
        stageResultConflictCount: 0,
      },
    },
    meta: PRODUCTION_META,
    issueLabels: { missing_title: "Без названия" },
  };
}

const isOk = (r: SamplesClientContractResult): r is Extract<SamplesClientContractResult, { ok: true }> =>
  r.ok;

describe("validateSamplesClientPayload — acceptance", () => {
  it("accepts the exact production response shape", () => {
    const result = validateSamplesClientPayload(productionShapedResponse());
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.samples).toHaveLength(2);
    expect(result.samples[0].companyId).toBe("101");
    expect(result.meta).toEqual(PRODUCTION_META);
    expect(result.orphanDealCount).toBe(1);
    expect(result.metadataPartial).toBe(false);
  });

  it("accepts the empty-dataset success shape (samples: [])", () => {
    const payload = { ...productionShapedResponse(), samples: [], total: 0 };
    const result = validateSamplesClientPayload(payload);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.samples).toEqual([]);
  });
});

describe("validateSamplesClientPayload — rejection", () => {
  it("rejects success:false with INVALID_SUCCESS_FLAG", () => {
    const result = validateSamplesClientPayload({
      ...productionShapedResponse(),
      success: false,
      error: "x",
    });
    expect(result).toEqual({ ok: false, reason: "INVALID_SUCCESS_FLAG" });
  });

  it("rejects a success response whose samples is not an array with SAMPLES_NOT_ARRAY", () => {
    const result = validateSamplesClientPayload({
      ...productionShapedResponse(),
      samples: { 0: mkSummary("1") },
    });
    expect(result).toEqual({ ok: false, reason: "SAMPLES_NOT_ARRAY" });
  });

  it("rejections never echo offending payload data", () => {
    const secretTitle = "ООО Совершенно Секретное Название";
    const result = validateSamplesClientPayload({
      success: true,
      samples: { broken: secretTitle },
    });
    expect(result).toEqual({ ok: false, reason: "SAMPLES_NOT_ARRAY" });
    expect(JSON.stringify(result)).not.toContain(secretTitle);
  });
});

describe("validateSamplesClientPayload — coercion parity with the previous inline predicate", () => {
  it("coerces string orphanDealCount to Number (parity: Number(value ?? 0))", () => {
    const payload = { ...productionShapedResponse(), orphanDealCount: "3" };
    const result = validateSamplesClientPayload(payload);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.orphanDealCount).toBe(3);
  });

  it("defaults missing orphanDealCount to 0 (parity: Number(value ?? 0))", () => {
    const { orphanDealCount: _omit, ...payload } = productionShapedResponse();
    const result = validateSamplesClientPayload(payload);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.orphanDealCount).toBe(0);
  });

  it("coerces truthy metadataPartial to true (parity: Boolean(value))", () => {
    const payload = { ...productionShapedResponse(), metadataPartial: "yes" };
    const result = validateSamplesClientPayload(payload);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.metadataPartial).toBe(true);
  });

  it("normalizes missing meta to null (parity: ?? null)", () => {
    const { meta: _omit, ...payload } = productionShapedResponse();
    const result = validateSamplesClientPayload(payload);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.meta).toBeNull();
  });

  it("does NOT reject malformed per-item summaries — acceptance semantics unchanged (no stricter validation added)", () => {
    // The previous inline predicate accepted any array items; this
    // patch must not silently tighten that contract.
    const payload = {
      ...productionShapedResponse(),
      samples: [{ companyId: 42 }, "not-an-object", null],
    };
    const result = validateSamplesClientPayload(payload);
    expect(isOk(result)).toBe(true);
  });

  it("does NOT reject missing success flag as SAMPLES_NOT_ARRAY — same reject class as before", () => {
    // Old code: (!data.success || !Array.isArray(...)) → one rejection path.
    const result = validateSamplesClientPayload({ samples: [] });
    expect(result).toEqual({ ok: false, reason: "INVALID_SUCCESS_FLAG" });
  });
});

describe("single-parser invariant (source scan)", () => {
  const cacheSource = readFileSync(
    new URL("../lib/samples/samples-cache.ts", import.meta.url),
    "utf8"
  );
  const hookSource = readFileSync(
    new URL("../components/dashboard/samples/use-samples-data.ts", import.meta.url),
    "utf8"
  );

  it("samples-cache.ts consumes the shared validator", () => {
    expect(cacheSource).toContain("validateSamplesClientPayload");
  });

  it("no second inline Samples response predicate exists in samples-cache.ts", () => {
    // The exact old predicate must not reappear inline.
    expect(cacheSource).not.toMatch(/!data\.success\s*\|\|\s*!Array\.isArray\(data\.samples\)/);
    expect(cacheSource).not.toMatch(/Array\.isArray\(data\.samples\)/);
  });

  it("use-samples-data.ts performs no response parsing (state machine only)", () => {
    expect(hookSource).not.toContain("Array.isArray");
    expect(hookSource).not.toContain("response.json");
  });
});
