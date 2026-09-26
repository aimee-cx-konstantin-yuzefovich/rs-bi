import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { fetchDealsActivities, type ActivityData } from "@/lib/bitrix-activities";

export { type ActivityData } from "@/lib/bitrix-activities";

export const dynamic = "force-dynamic";

/**
 * POST /api/bitrix/activities
 * Fetches activities for a list of deal IDs using shared authoritative activity logic.
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

    const result = await fetchDealsActivities(validIds);

    const totalBatches = Math.ceil(validIds.length / 50);
    const isTotalFailure = result.failedBatches > 0 && result.failedBatches === totalBatches;

    if (isTotalFailure) {
      return NextResponse.json(
        {
          success: false,
          partial: true,
          failedBatches: result.failedBatches,
          incompleteBatches: result.incompleteBatches,
          failedDealIds: result.failedDealIds,
          incompleteDealIds: result.incompleteDealIds,
          fetchedDealIds: [],
          error: "Failed to fetch activities from CRM.",
          activities: {},
        },
        { status: 500 }
      );
    }

    const activitiesMap: Record<string, { last?: ActivityData; next?: ActivityData; all: ActivityData[] }> = {};
    for (const id of result.fetchedDealIds) {
      const entry = result.byDealId[id];
      if (entry) {
        activitiesMap[id] = {
          last: entry.last,
          next: entry.next,
          all: entry.all,
        };
      }
    }

    return NextResponse.json({
      success: true,
      partial: result.partial,
      failedBatches: result.failedBatches,
      incompleteBatches: result.incompleteBatches,
      failedDealIds: result.failedDealIds,
      incompleteDealIds: result.incompleteDealIds,
      fetchedDealIds: result.fetchedDealIds,
      warning: result.warning,
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
