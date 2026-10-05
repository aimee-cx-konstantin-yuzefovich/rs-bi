// src/lib/activities-request-chunks.ts
// ─────────────────────────────────────────────────────────────────────
// Client-side chunking for POST /api/bitrix/activities.
//
// The route enforces <= 1000 Deal IDs and a request body <= 10,000
// characters. The client must never violate its own server contract, so a
// large Deal set is split into bounded, size-aware chunks. The server
// safety limits are intentionally NOT raised.
// ─────────────────────────────────────────────────────────────────────

/** Conservative client chunk cap (server hard limit is 1000). */
export const ACTIVITIES_CHUNK_MAX_IDS = 500;
/** Conservative serialized-body budget (server hard limit is 10,000). */
export const ACTIVITIES_CHUNK_MAX_BODY_BYTES = 8_000;

export interface ActivitiesChunkOptions {
  maxIds?: number;
  maxBodyBytes?: number;
}

/**
 * Deterministic local contract error thrown when a single Deal ID alone
 * exceeds the entire request body budget, meaning it cannot fit in ANY chunk.
 */
export class OversizedDealIdError extends Error {
  readonly dealId: string;
  readonly singleItemBytes: number;
  readonly maxBodyBytes: number;

  constructor(dealId: string, singleItemBytes: number, maxBodyBytes: number) {
    const preview = dealId.length > 30 ? `${dealId.slice(0, 30)}...` : dealId;
    super(
      `Deal ID "${preview}" alone produces ${singleItemBytes} bytes, exceeding the chunk body budget of ${maxBodyBytes} bytes.`
    );
    this.name = "OversizedDealIdError";
    this.dealId = dealId;
    this.singleItemBytes = singleItemBytes;
    this.maxBodyBytes = maxBodyBytes;
  }
}

/**
 * Splits Deal IDs into request chunks. Non-numeric IDs are dropped, duplicates
 * removed, order preserved. Every chunk satisfies:
 *   JSON.stringify({ dealIds: chunk }).length <= maxBodyBytes
 * and
 *   chunk.length <= maxIds
 *
 * If any valid numeric ID cannot fit in a single chunk on its own, throws
 * OversizedDealIdError (fail-closed).
 */
export function chunkDealIdsForActivities(
  ids: string[],
  options: ActivitiesChunkOptions = {}
): string[][] {
  const maxIds = Math.max(1, options.maxIds ?? ACTIVITIES_CHUNK_MAX_IDS);
  const maxBodyBytes = options.maxBodyBytes ?? ACTIVITIES_CHUNK_MAX_BODY_BYTES;
  // `{"dealIds":[]}` envelope overhead.
  const envelope = JSON.stringify({ dealIds: [] }).length;

  if (envelope > maxBodyBytes) {
    throw new Error(
      `Activities chunk maxBodyBytes (${maxBodyBytes}) cannot even hold the empty envelope (${envelope} bytes)`
    );
  }

  const unique = [
    ...new Set(ids.map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id))),
  ];

  // Pre-validate that every single valid numeric ID can fit in a single-item chunk
  for (const id of unique) {
    const singleItemBytes = JSON.stringify({ dealIds: [id] }).length;
    if (singleItemBytes > maxBodyBytes) {
      throw new OversizedDealIdError(id, singleItemBytes, maxBodyBytes);
    }
  }

  const chunks: string[][] = [];
  let current: string[] = [];
  let size = envelope;

  for (const id of unique) {
    // quoted id + comma separator
    const cost = id.length + 3;
    if (current.length > 0 && (current.length >= maxIds || size + cost > maxBodyBytes)) {
      chunks.push(current);
      current = [];
      size = envelope;
    }
    current.push(id);
    size += cost;
  }
  if (current.length > 0) chunks.push(current);

  // Invariant verification: every chunk emitted must strictly satisfy both bounds
  for (const chunk of chunks) {
    const serializedLength = JSON.stringify({ dealIds: chunk }).length;
    if (serializedLength > maxBodyBytes || chunk.length > maxIds) {
      throw new Error(
        `Invariant violation: activity chunk size ${serializedLength} bytes (${chunk.length} IDs) exceeds limits (${maxBodyBytes} bytes, ${maxIds} IDs)`
      );
    }
  }

  return chunks;
}
