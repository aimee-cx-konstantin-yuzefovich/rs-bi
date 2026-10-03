// src/lib/samples/client-contract.ts
// ─────────────────────────────────────────────────────────────────────
// ONE shared, pure client-side response-shape contract for the Samples
// pipeline (Phase D diagnostic extraction).
//
// The acceptance predicate below is a semantics-preserving extraction of
// the exact production logic previously embedded in
// `fetchSamplesWithDeduplication` (src/lib/samples/samples-cache.ts).
// It defines what the real Samples client accepts as a valid dataset:
//
//   if (!data.success || !Array.isArray(data.samples)) → reject
//
// - everything else is accepted with the same coercions as before:
//     orphanDealCount → Number(value ?? 0)
//     metadataPartial → Boolean(value)
//     meta            → value as SamplesResponseMeta ?? null
//
// Hard rules:
// - there is exactly ONE Samples response parser on the client — both
//   `useSamplesData` (via samples-cache) and the Samples pipeline
//   diagnostic (PROBE H) call this same pure function;
// - no second parser may appear anywhere else;
// - accepted/rejected response semantics are unchanged by this
//   diagnostic patch (no stricter validation was added);
// - property access intentionally mirrors the original (no null/type
//   guards added) so malformed payloads behave byte-for-byte as before.
// ─────────────────────────────────────────────────────────────────────

import type { SampleSummary, SamplesResponseMeta } from "./types";

/** Fixed safe rejection reason enums — no offending data is ever echoed. */
export type SamplesClientContractRejection =
  | "INVALID_SUCCESS_FLAG"
  | "SAMPLES_NOT_ARRAY"
  | "INVALID_SAMPLE_SUMMARY_SHAPE"
  | "INVALID_META_SHAPE"
  | "UNEXPECTED_CLIENT_CONTRACT";

export type SamplesClientContractResult =
  | {
      ok: true;
      samples: SampleSummary[];
      meta: SamplesResponseMeta | null;
      orphanDealCount: number;
      metadataPartial: boolean;
    }
  | { ok: false; reason: SamplesClientContractRejection };

/** Shape the validator reads from the raw response payload. */
interface SamplesClientPayloadShape {
  success?: unknown;
  samples?: unknown;
  meta?: unknown;
  orphanDealCount?: unknown;
  metadataPartial?: unknown;
}

/**
 * Validates/normalizes the /api/bitrix/samples response payload EXACTLY
 * as the production Samples client has always done.
 */
export function validateSamplesClientPayload(
  data: unknown
): SamplesClientContractResult {
  const payload = data as SamplesClientPayloadShape;

  if (!payload.success) {
    return { ok: false, reason: "INVALID_SUCCESS_FLAG" };
  }
  if (!Array.isArray(payload.samples)) {
    return { ok: false, reason: "SAMPLES_NOT_ARRAY" };
  }

  // Identical coercions to the previous inline implementation — no
  // per-item SampleSummary shape validation existed before and none is
  // added here (acceptance semantics preserved byte-for-byte).
  return {
    ok: true,
    samples: payload.samples as SampleSummary[],
    meta: (payload.meta as SamplesResponseMeta) ?? null,
    orphanDealCount: Number(payload.orphanDealCount ?? 0),
    metadataPartial: Boolean(payload.metadataPartial),
  };
}
