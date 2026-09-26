import { NextRequest, NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { parseStrictDate } from "@/lib/date-safety";
import pLimit from "p-limit";

export const dynamic = "force-dynamic";

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

function parseTimestamp(dateStr?: string | null): number | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = parseStrictDate(dateStr, { mode: "DATETIME_BUSINESS_TIMEZONE" });
  return d ? d.getTime() : null;
}

/**
 * POST /api/bitrix/activities
 * Fetches activities for a list of deal IDs.
 * Returns the last completed activity and the next planned activity for each deal.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    // SECURITY: Limit request body size to prevent DoS via oversized payloads
    const rawBody = await request.text();
    if (rawBody.length > 10_000) {
      return NextResponse.json(
        { success: false, error: "Request body too large", activities: {} },
        { status: 413 }
      );
    }

    let body: { dealIds?: unknown };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body", activities: {} },
        { status: 400 }
      );
    }

    const { dealIds } = body;

    if (!Array.isArray(dealIds) || dealIds.length === 0) {
      return NextResponse.json({ success: true, activities: {} });
    }

    const validIds = dealIds.filter((id) => /^\d+$/.test(String(id).trim()));
    if (validIds.length === 0) {
      return NextResponse.json({ success: true, activities: {} });
    }

    // SECURITY: Limit number of IDs to prevent DoS via mass batch requests
    const MAX_DEAL_IDS = 1000;
    if (validIds.length > MAX_DEAL_IDS) {
      return NextResponse.json(
        { success: false, error: `Too many deal IDs: maximum is ${MAX_DEAL_IDS}`, activities: {} },
        { status: 400 }
      );
    }

    const activitiesMap: Record<string, { last?: ActivityData; next?: ActivityData; all: ActivityData[] }> = {};
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
              console.warn(`[Activities API] Repeated pagination cursor start=${start}`);
              batchIncomplete = true;
              break;
            }
            seenStarts.add(start);
            pageCount++;

            try {
              const data = await bitrixPost<{ result: ActivityData[]; next?: number; total?: number }>(
                "crm.activity.list",
                {
                  FILTER: { OWNER_TYPE_ID: 2, "@OWNER_ID": batchIds },
                  SELECT: ["ID", "OWNER_ID", "SUBJECT", "COMPLETED", "DESCRIPTION", "DEADLINE", "CREATED", "AUTHOR_ID", "RESPONSIBLE_ID", "TYPE_ID", "PROVIDER_ID", "PROVIDER_TYPE_ID"],
                  ORDER: { CREATED: "DESC" },
                  start,
                }
              );

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
                  console.warn(`[Activities API] Invalid pagination cursor next=${JSON.stringify(rawNext)}`);
                  batchIncomplete = true;
                  break;
                }
              }

              if (nextOffset !== null) {
                if (nextOffset <= start) {
                  console.warn(`[Activities API] Non-advancing pagination cursor next=${nextOffset} <= start=${start}`);
                  batchIncomplete = true;
                  break;
                }
                if (pageCount >= MAX_PAGES_PER_BATCH) {
                  console.warn(`[Activities API] Batch reached safety limit of ${MAX_PAGES_PER_BATCH} pages`);
                  batchIncomplete = true;
                  break;
                }
                start = nextOffset;
              } else {
                break; // Complete pagination finished
              }
            } catch (error) {
              console.error(`[Activities API] Failed fetching activities batch page (start=${start}):`, error);
              batchFailed = true;
              break;
            }
          }

          if (batchFailed) {
            failedBatches++;
            failedDealIds.push(...batchIds);
            // CRITICAL: Failed batch deals are left UNKNOWN (not in activitiesMap, not in fetchedDealIds)
            return;
          }

          if (batchIncomplete) {
            incompleteBatches++;
            incompleteDealIds.push(...batchIds);
            // CRITICAL: Incomplete batch deals are left UNKNOWN (not in activitiesMap, not in fetchedDealIds)
            return;
          }

          // Batch succeeded completely: initialize only these deals and populate their activities
          for (const id of batchIds) {
            activitiesMap[id] = { all: [] };
            fetchedDealIds.push(id);
          }

          for (const activity of batchActivities) {
            const ownerId = String(activity.OWNER_ID ?? "").trim();
            if (activitiesMap[ownerId]) {
              activitiesMap[ownerId].all.push(activity);
            }
          }

          // Compute last completed and next planned for each deal in this batch
          for (const dealId of batchIds) {
            const dealActivities = activitiesMap[dealId].all;

            // Sort by CREATED DESC (newest first, defensive against invalid dates)
            dealActivities.sort((a, b) => {
              const timeA = parseTimestamp(a.CREATED) ?? 0;
              const timeB = parseTimestamp(b.CREATED) ?? 0;
              return timeB - timeA;
            });

            // Find last completed
            const lastCompleted = dealActivities.find(
              (a) => String(a.COMPLETED ?? "").toUpperCase() === "Y"
            );
            if (lastCompleted) {
              activitiesMap[dealId].last = lastCompleted;
            }

            // Find next planned (sort by DEADLINE ASC - earliest first, defensive against invalid dates)
            const plannedActivities = dealActivities.filter(
              (a) => String(a.COMPLETED ?? "").toUpperCase() === "N"
            );
            if (plannedActivities.length > 0) {
              plannedActivities.sort((a, b) => {
                const dateA = parseTimestamp(a.DEADLINE) ?? Infinity;
                const dateB = parseTimestamp(b.DEADLINE) ?? Infinity;
                return dateA - dateB;
              });
              activitiesMap[dealId].next = plannedActivities[0];
            }
          }
        })
      );
    }

    // Wait for all batches to finish
    await Promise.all(batchPromises);

    const totalBatches = Math.ceil(validIds.length / batchSize);
    const isTotalFailure = failedBatches > 0 && failedBatches === totalBatches;
    const isPartial = failedBatches > 0 || incompleteBatches > 0;

    if (isTotalFailure) {
      return NextResponse.json(
        {
          success: false,
          partial: true,
          failedBatches,
          incompleteBatches,
          failedDealIds,
          incompleteDealIds,
          fetchedDealIds: [],
          error: "Failed to fetch activities from CRM.",
          activities: {},
        },
        { status: 500 }
      );
    }

    const unreachedCount = failedDealIds.length + incompleteDealIds.length;

    return NextResponse.json({
      success: true,
      partial: isPartial,
      failedBatches,
      incompleteBatches,
      failedDealIds,
      incompleteDealIds,
      fetchedDealIds,
      warning: isPartial
        ? `Не удалось загрузить данные по активностям полностью для части сделок (${unreachedCount} из ${validIds.length}).`
        : undefined,
      activities: activitiesMap,
    });
  } catch (error) {
    console.error("[Activities API Error]", error);
    return NextResponse.json(
      {
        success: false,
        partial: true,
        failedBatches: 1,
        failedDealIds: [],
        fetchedDealIds: [],
        error: "Failed to fetch activities",
        activities: {},
      },
      { status: 500 }
    );
  }
}
