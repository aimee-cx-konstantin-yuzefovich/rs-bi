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
 * Splits Deal IDs into request chunks. Non-numeric IDs are dropped, duplicates
 * removed, order preserved. Every chunk satisfies
 * `JSON.stringify({ dealIds: chunk }).length <= maxBodyBytes` and
 * `chunk.length <= maxIds`.
 */
export function chunkDealIdsForActivities(
  ids: string[],
  options: ActivitiesChunkOptions = {}
): string[][] {
  const maxIds = Math.max(1, options.maxIds ?? ACTIVITIES_CHUNK_MAX_IDS);
  const maxBodyBytes = options.maxBodyBytes ?? ACTIVITIES_CHUNK_MAX_BODY_BYTES;
  // `{"dealIds":[]}` envelope overhead.
  const envelope = JSON.stringify({ dealIds: [] }).length;

  const unique = [
    ...new Set(ids.map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id))),
  ];

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
  return chunks;
}
