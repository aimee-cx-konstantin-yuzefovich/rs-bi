import { NextRequest, NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
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

/**
 * POST /api/bitrix/activities
 * Fetches activities for a list of deal IDs.
 * Returns the last completed activity and the next planned activity for each deal.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const { dealIds } = body;

    if (!Array.isArray(dealIds) || dealIds.length === 0) {
      return NextResponse.json({ success: true, activities: {} });
    }

    const validIds = dealIds.filter((id) => /^\d+$/.test(String(id).trim()));
    if (validIds.length === 0) {
      return NextResponse.json({ success: true, activities: {} });
    }

    const activitiesMap: Record<string, { last?: ActivityData; next?: ActivityData; all: ActivityData[] }> = {};
    
    // Initialize all requested IDs with empty arrays to prevent re-fetching empty deals
    for (const id of validIds) {
      activitiesMap[id] = { all: [] };
    }

    const batchSize = 50;
    const limit = pLimit(5);
    const batchPromises = [];

    for (let i = 0; i < validIds.length; i += batchSize) {
      const batchIds = validIds.slice(i, i + batchSize);
      
      batchPromises.push(
        limit(async () => {
          try {
            const data = await bitrixPost<{ result: ActivityData[] }>(
              "crm.activity.list",
              {
                FILTER: { OWNER_TYPE_ID: 2, "@OWNER_ID": batchIds },
                SELECT: ["ID", "OWNER_ID", "SUBJECT", "COMPLETED", "DESCRIPTION", "DEADLINE", "CREATED", "AUTHOR_ID", "RESPONSIBLE_ID", "TYPE_ID", "PROVIDER_ID", "PROVIDER_TYPE_ID"],
                ORDER: { CREATED: "DESC" },
              }
            );

            if (Array.isArray(data.result)) {
              for (const activity of data.result) {
                if (activitiesMap[activity.OWNER_ID]) {
                  activitiesMap[activity.OWNER_ID].all.push(activity);
                }
              }
            }
          } catch (error) {
            console.error(`[Activities API] Failed to fetch activities batch:`, error);
          }
        })
      );
    }

    // Wait for all batches to finish concurrently
    await Promise.all(batchPromises);

    // Process activities to find last completed and next planned
    for (const dealId in activitiesMap) {
      const dealActivities = activitiesMap[dealId].all;
      
      // Sort by CREATED DESC (newest first)
      dealActivities.sort((a, b) => new Date(b.CREATED).getTime() - new Date(a.CREATED).getTime());
      
      // Find last completed
      const lastCompleted = dealActivities.find(a => a.COMPLETED === "Y");
      if (lastCompleted) {
        activitiesMap[dealId].last = lastCompleted;
      }

      // Find next planned (sort by DEADLINE ASC - earliest first)
      const plannedActivities = dealActivities.filter(a => a.COMPLETED === "N");
      if (plannedActivities.length > 0) {
        plannedActivities.sort((a, b) => {
          const dateA = a.DEADLINE ? new Date(a.DEADLINE).getTime() : Infinity;
          const dateB = b.DEADLINE ? new Date(b.DEADLINE).getTime() : Infinity;
          return dateA - dateB;
        });
        activitiesMap[dealId].next = plannedActivities[0];
      }
    }

    return NextResponse.json({ success: true, activities: activitiesMap });
  } catch (error) {
    console.error("[Activities API Error]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch activities", activities: {} },
      { status: 500 }
    );
  }
}
