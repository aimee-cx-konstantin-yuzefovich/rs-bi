// src/lib/bitrix-activities.ts
// ─────────────────────────────────────────────────────────────────────
// Shared authoritative server-side activity fetching and domain evaluation.
// Enforces fail-closed pagination, strict date validation, and prevents
// invalid dates from becoming selected last/next activities.
// ─────────────────────────────────────────────────────────────────────

import { bitrixPost } from "@/lib/bitrix";
import { parseStrictDate } from "@/lib/date-safety";
import pLimit from "p-limit";

export interface ActivityData {
  ID: string;
  OWNER_ID: string;
  OWNER_TYPE_ID: string;
  SUBJECT: string;
  COMPLETED: string;
  DESCRIPTION: string;
  DEADLINE: string;
  CREATED: string;
  AUTHOR_ID: string;
  RESPONSIBLE_ID: string;
  TYPE_ID: string;
  PROVIDER_ID: string;
  PROVIDER_TYPE_ID: string;
}

export interface DealActivityEntry {
  last?: ActivityData;
  next?: ActivityData;
  all: ActivityData[];
  dataKnown: boolean;
}

export interface DealsActivitiesResult {
  byDealId: Record<string, DealActivityEntry>;
  fetchedDealIds: string[];
  failedDealIds: string[];
  incompleteDealIds: string[];
  failedBatches: number;
  incompleteBatches: number;
  partial: boolean;
  warning?: string;
}

/**
 * Strictly parses a Bitrix activity datetime string into an epoch timestamp.
 * Returns null if the timestamp is missing, malformed, or calendar-impossible.
 */
export function parseActivityTimestamp(dateStr?: string | null): number | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = parseStrictDate(dateStr, { mode: "DATETIME_BUSINESS_TIMEZONE" });
  return d && !isNaN(d.getTime()) ? d.getTime() : null;
}

/**
 * Authoritatively selects the last completed activity and next planned activity
 * from a list of activities for a single deal.
 * 
 * Strict selection semantics:
 * - Completed candidate MUST have a valid CREATED timestamp.
 * - Planned candidate MUST have a valid DEADLINE timestamp.
 * - Invalid-only dates NEVER become selected last/next activities.
 */
export function selectAuthoritativeActivities(activities: ActivityData[]): {
  last?: ActivityData;
  next?: ActivityData;
} {
  // 1. Authoritative Last Completed:
  // Requires COMPLETED === "Y" and a strictly valid CREATED timestamp.
  const completedCandidates = activities.filter(
    (a) =>
      String(a.COMPLETED ?? "").toUpperCase() === "Y" &&
      parseActivityTimestamp(a.CREATED) !== null
  );

  completedCandidates.sort((a, b) => {
    const timeA = parseActivityTimestamp(a.CREATED)!;
    const timeB = parseActivityTimestamp(b.CREATED)!;
    return timeB - timeA; // Newest first
  });

  const last = completedCandidates[0];

  // 2. Authoritative Next Planned:
  // Requires COMPLETED === "N" and a strictly valid DEADLINE timestamp.
  const plannedCandidates = activities.filter(
    (a) =>
      String(a.COMPLETED ?? "").toUpperCase() === "N" &&
      parseActivityTimestamp(a.DEADLINE) !== null
  );

  plannedCandidates.sort((a, b) => {
    const dateA = parseActivityTimestamp(a.DEADLINE)!;
    const dateB = parseActivityTimestamp(b.DEADLINE)!;
    return dateA - dateB; // Earliest upcoming first
  });

  const next = plannedCandidates[0];

  return { last, next };
}

/**
 * Authoritative batch activity fetcher across Deal IDs.
 * Handles fail-closed pagination, cursor verification, concurrency limiting,
 * and tracks complete vs incomplete/failed deal IDs truthfully.
 */
export async function fetchDealsActivities(
  dealIds: Array<string | number>
): Promise<DealsActivitiesResult> {
  const validIds = dealIds
    .map((id) => String(id).trim())
    .filter((id) => /^\d+$/.test(id));

  if (validIds.length === 0) {
    return {
      byDealId: {},
      fetchedDealIds: [],
      failedDealIds: [],
      incompleteDealIds: [],
      failedBatches: 0,
      incompleteBatches: 0,
      partial: false,
    };
  }

  const byDealId: Record<string, DealActivityEntry> = {};
  const fetchedDealIds: string[] = [];
  const failedDealIds: string[] = [];
  const incompleteDealIds: string[] = [];
  let failedBatches = 0;
  let incompleteBatches = 0;

  const batchSize = 50;
  const limit = pLimit(5);
  const batchPromises = [];

  for (let i = 0; i < validIds.length; i += batchSize) {
    const batchIds = validIds.slice(i, i + batchSize);

    batchPromises.push(
      limit(async () => {
        let start = 0;
        let pageCount = 0;
        const MAX_PAGES_PER_BATCH = 20; // Up to 1000 activities per 50-deal batch
        const seenStarts = new Set<number>();
        const batchActivities: ActivityData[] = [];
        let batchFailed = false;
        let batchIncomplete = false;

        while (true) {
          if (seenStarts.has(start)) {
            console.warn(`[Activities Helper] Repeated pagination cursor start=${start}`);
            batchIncomplete = true;
            break;
          }
          seenStarts.add(start);
          pageCount++;

          try {
            const data = await bitrixPost<{
              result: ActivityData[];
              next?: number;
              total?: number;
            }>("crm.activity.list", {
              FILTER: { OWNER_TYPE_ID: 2, "@OWNER_ID": batchIds },
              SELECT: [
                "ID",
                "OWNER_ID",
                "SUBJECT",
                "COMPLETED",
                "DESCRIPTION",
                "DEADLINE",
                "CREATED",
                "AUTHOR_ID",
                "RESPONSIBLE_ID",
                "TYPE_ID",
                "PROVIDER_ID",
                "PROVIDER_TYPE_ID",
              ],
              ORDER: { CREATED: "DESC" },
              start,
            });

            if (Array.isArray(data.result)) {
              batchActivities.push(...data.result);
            }

            let nextOffset: number | null = null;
            const rawNext = (data as { next?: unknown }).next;
            if (rawNext !== undefined && rawNext !== null) {
              if (typeof rawNext === "number" && Number.isInteger(rawNext) && rawNext >= 0) {
                nextOffset = rawNext;
              } else if (typeof rawNext === "string" && /^\d+$/.test(rawNext.trim())) {
                nextOffset = Number(rawNext.trim());
              } else {
                console.warn(`[Activities Helper] Invalid pagination cursor next=${JSON.stringify(rawNext)}`);
                batchIncomplete = true;
                break;
              }
            }

            if (nextOffset !== null) {
              if (nextOffset <= start) {
                console.warn(`[Activities Helper] Non-advancing pagination cursor next=${nextOffset} <= start=${start}`);
                batchIncomplete = true;
                break;
              }
              if (pageCount >= MAX_PAGES_PER_BATCH) {
                console.warn(`[Activities Helper] Batch reached safety limit of ${MAX_PAGES_PER_BATCH} pages`);
                batchIncomplete = true;
                break;
              }
              start = nextOffset;
            } else {
              break; // Complete pagination finished
            }
          } catch (error) {
            console.error(`[Activities Helper] Failed fetching activities batch page (start=${start}):`, error);
            batchFailed = true;
            break;
          }
        }

        if (batchFailed) {
          failedBatches++;
          failedDealIds.push(...batchIds);
          for (const id of batchIds) {
            byDealId[id] = { all: [], dataKnown: false };
          }
          return;
        }

        if (batchIncomplete) {
          incompleteBatches++;
          incompleteDealIds.push(...batchIds);
          for (const id of batchIds) {
            byDealId[id] = { all: [], dataKnown: false };
          }
          return;
        }

        // Batch succeeded completely
        const activitiesByOwner: Record<string, ActivityData[]> = {};
        for (const id of batchIds) {
          activitiesByOwner[id] = [];
          fetchedDealIds.push(id);
        }

        for (const activity of batchActivities) {
          const ownerId = String(activity.OWNER_ID ?? "").trim();
          if (activitiesByOwner[ownerId]) {
            activitiesByOwner[ownerId].push(activity);
          }
        }

        for (const dealId of batchIds) {
          const dealActivities = activitiesByOwner[dealId] || [];
          const { last, next } = selectAuthoritativeActivities(dealActivities);

          byDealId[dealId] = {
            all: dealActivities,
            last,
            next,
            dataKnown: true,
          };
        }
      })
    );
  }

  await Promise.all(batchPromises);

  const totalBatches = Math.ceil(validIds.length / batchSize);
  const isPartial = failedBatches > 0 || incompleteBatches > 0;
  const unreachedCount = failedDealIds.length + incompleteDealIds.length;

  const warning = isPartial
    ? `Не удалось загрузить данные по активностям полностью для части сделок (${unreachedCount} из ${validIds.length}).`
    : undefined;

  return {
    byDealId,
    fetchedDealIds,
    failedDealIds,
    incompleteDealIds,
    failedBatches,
    incompleteBatches,
    partial: isPartial,
    warning,
  };
}
