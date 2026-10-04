// @vitest-environment node
// src/__tests__/samples-client-contract.test.ts
// ─────────────────────────────────────────────────────────────────────
// Tests for the ONE shared Samples client response contract
// (src/lib/samples/client-contract.ts), hardened pre-production:
//
// - accepts the exact production response shape (route contract incl.
//   meta / issueLabels / smartProcess.qualityCounts) and valid
//   samples: [] datasets;
// - rejects falsy/non-true success → INVALID_SUCCESS_FLAG;
// - rejects non-array samples → SAMPLES_NOT_ARRAY;
// - ATOMIC per-sample structural validation: one malformed SampleSummary
//   rejects the ENTIRE payload → INVALID_SAMPLE_SUMMARY_SHAPE;
// - malformed meta → INVALID_META_SHAPE; non-numeric orphanDealCount →
//   INVALID_ORPHAN_DEAL_COUNT; non-boolean metadataPartial →
//   INVALID_METADATA_PARTIAL;
// - legitimate optional null/undefined values remain accepted;
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

describe("validateSamplesClientPayload — numeric/boolean contract", () => {
  it("accepts a finite numeric orphanDealCount as-is", () => {
    const payload = { ...productionShapedResponse(), orphanDealCount: 3 };
    const result = validateSamplesClientPayload(payload);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.orphanDealCount).toBe(3);
  });

  it("defaults missing orphanDealCount to 0", () => {
    const { orphanDealCount: _omit, ...payload } = productionShapedResponse();
    const result = validateSamplesClientPayload(payload);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.orphanDealCount).toBe(0);
  });

  it("accepts null orphanDealCount as 0", () => {
    const payload = { ...productionShapedResponse(), orphanDealCount: null };
    const result = validateSamplesClientPayload(payload);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.orphanDealCount).toBe(0);
  });

  it("rejects a string orphanDealCount (no arbitrary coercion of values) with INVALID_ORPHAN_DEAL_COUNT", () => {
    const payload = { ...productionShapedResponse(), orphanDealCount: "3" };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_ORPHAN_DEAL_COUNT" });
  });

  it("rejects a non-finite orphanDealCount with INVALID_ORPHAN_DEAL_COUNT", () => {
    const result = validateSamplesClientPayload({
      ...productionShapedResponse(),
      orphanDealCount: Number.NaN,
    });
    expect(result).toEqual({ ok: false, reason: "INVALID_ORPHAN_DEAL_COUNT" });
  });

  it("accepts boolean metadataPartial as-is", () => {
    const payload = { ...productionShapedResponse(), metadataPartial: true };
    const result = validateSamplesClientPayload(payload);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.metadataPartial).toBe(true);
  });

  it("rejects a truthy non-boolean metadataPartial with INVALID_METADATA_PARTIAL", () => {
    const payload = { ...productionShapedResponse(), metadataPartial: "yes" };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_METADATA_PARTIAL" });
  });

  it("normalizes missing meta to null", () => {
    const { meta: _omit, ...payload } = productionShapedResponse();
    const result = validateSamplesClientPayload(payload);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.meta).toBeNull();
  });
});

describe("validateSamplesClientPayload — atomic per-sample validation", () => {
  it("rejects a malformed summary item with INVALID_SAMPLE_SUMMARY_SHAPE (atomic, no partial acceptance)", () => {
    const payload = {
      ...productionShapedResponse(),
      samples: [mkSummary("1"), { companyId: 42 }, "not-an-object", null],
    };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_SAMPLE_SUMMARY_SHAPE" });
  });

  it("rejects a summary with missing required string fields", () => {
    const payload = {
      ...productionShapedResponse(),
      samples: [{ companyTitle: "Нет ID компании" }],
    };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_SAMPLE_SUMMARY_SHAPE" });
  });

  it("rejects a summary with an out-of-enum normalizedResult", () => {
    const bad = { ...mkSummary("1"), normalizedResult: "победа" };
    const payload = { ...productionShapedResponse(), samples: [bad] };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_SAMPLE_SUMMARY_SHAPE" });
  });

  it("rejects a summary with an out-of-enum sourceQuality", () => {
    const bad = { ...mkSummary("1"), sourceQuality: "магия" };
    const payload = { ...productionShapedResponse(), samples: [bad] };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_SAMPLE_SUMMARY_SHAPE" });
  });

  it("rejects a summary whose productFamilies contains a non-string", () => {
    const bad = { ...mkSummary("1"), productFamilies: ["Гель", 7] };
    const payload = { ...productionShapedResponse(), samples: [bad] };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_SAMPLE_SUMMARY_SHAPE" });
  });

  it("rejects a summary with malformed relatedDeals entries", () => {
    const bad = { ...mkSummary("1"), relatedDeals: [{ id: "1" }] }; // missing title
    const payload = { ...productionShapedResponse(), samples: [bad] };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_SAMPLE_SUMMARY_SHAPE" });
  });

  it("rejects a summary with malformed smartProcessItems enrichment", () => {
    const bad = { ...mkSummary("1"), smartProcessItems: [{ processItemId: 1 }] };
    const payload = { ...productionShapedResponse(), samples: [bad] };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_SAMPLE_SUMMARY_SHAPE" });
  });

  it("legitimate optional values remain accepted: absent, null, and valid present values", () => {
    const rich = {
      ...mkSummary("1"),
      responsibleId: null,
      responsibleName: null,
      companyResponsibleId: "7",
      companyResponsibleName: "Менеджер 7",
      rawTestResult: null,
      industry: "Химия",
      application: null,
      latestRelevantDate: "2026-10-02",
      smartProcessItems: [
        {
          processItemId: "9001",
          title: "Цикл 1",
          companyId: "1",
          linkedDealId: "505",
          stageId: "DT1032_15:CLIENT",
          stageLabel: "Образцы на испытании",
          isActive: true,
          isTerminal: false,
          sentDates: ["2026-03-10"],
          grades: [{ productFamily: "Гель", value: "КРТ-2" }],
          quantities: [{ productFamily: "Гель", value: 5, unit: "кг" }],
          rawTestResult: "Соответствует",
          normalizedResult: "positive",
          createdTime: "2026-03-01T10:00:00+03:00",
          dataIssues: [],
        },
      ],
      activeSmartProcessCount: 1,
      currentActiveStageLabels: ["Образцы на испытании"],
    };
    const payload = { ...productionShapedResponse(), samples: [rich] };
    const result = validateSamplesClientPayload(payload);
    expect(isOk(result)).toBe(true);
  });

  it("rejects malformed meta with INVALID_META_SHAPE", () => {
    const payload = { ...productionShapedResponse(), meta: { statusLabels: "нет" } };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_META_SHAPE" });
  });

  it("rejects meta whose inner label maps contain non-strings", () => {
    const payload = {
      ...productionShapedResponse(),
      meta: { statusLabels: { UF_CRM_TEST_FIELD: { "5": 42 } } },
    };
    const result = validateSamplesClientPayload(payload);
    expect(result).toEqual({ ok: false, reason: "INVALID_META_SHAPE" });
  });

  it("accepts meta: null and meta with empty statusLabels", () => {
    const a = validateSamplesClientPayload({ ...productionShapedResponse(), meta: null });
    expect(isOk(a)).toBe(true);
    const b = validateSamplesClientPayload({
      ...productionShapedResponse(),
      meta: { statusLabels: {} },
    });
    expect(isOk(b)).toBe(true);
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
