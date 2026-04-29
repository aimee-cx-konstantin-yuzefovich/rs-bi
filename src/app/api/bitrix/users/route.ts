import { NextRequest, NextResponse } from "next/server";
import { bitrixGet, bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";
import pLimit from "p-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/bitrix/users
 * Fetches all responsible person names from Bitrix24 with pagination.
 *
 * SECURITY: Requires authentication. Does NOT expose the webhook URL.
 * It only returns user ID + Name pairs for display purposes.
 */
export async function GET(request: NextRequest) {
  // ─── SECURITY: Require authentication ───
  // Using requireAuth (not requireAuthOnly) because this endpoint exposes
  // personal data (employee names) and must be fully auditable.
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  try {
    const userMap: Record<string, string> = {};
    const MAX_ITERATIONS = 50; // 50 * 50 = 2500 users max
    
    // First request to get total count
    const initialData = await bitrixPost<{
      result: Array<{ ID: string; NAME: string; LAST_NAME: string; SECOND_NAME: string }>;
      total?: number;
      next?: number;
    }>("user.get", { start: 0 });
    
    if (Array.isArray(initialData.result)) {
      for (const user of initialData.result) {
        const fullName = [user.NAME, user.LAST_NAME, user.SECOND_NAME]
          .filter(Boolean)
          .join(" ")
          .trim();
        userMap[user.ID] = fullName || `ID ${user.ID}`;
      }
    }
    
    const total = initialData.total || 0;
    const promises = [];
    const limit = pLimit(5);
    
    // Fetch remaining pages in parallel
    if (total > 50) {
      const remainingPages = Math.min(Math.ceil(total / 50) - 1, MAX_ITERATIONS - 1);
      for (let i = 1; i <= remainingPages; i++) {
        promises.push(
          limit(() => bitrixPost<{
            result: Array<{ ID: string; NAME: string; LAST_NAME: string; SECOND_NAME: string }>;
          }>("user.get", { start: i * 50 }).catch(e => {
            console.error(`[Users API] Failed to fetch users batch at start ${i * 50}:`, e);
            return null;
          }))
        );
      }
      
      const results = await Promise.all(promises);
      for (const data of results) {
        if (data && Array.isArray(data.result)) {
          for (const user of data.result) {
            const fullName = [user.NAME, user.LAST_NAME, user.SECOND_NAME]
              .filter(Boolean)
              .join(" ")
              .trim();
            userMap[user.ID] = fullName || `ID ${user.ID}`;
          }
        }
      }
    }

    // SECURITY: Only log user count in development to avoid leaking
    // infrastructure details (headcount) to production log systems.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Users API] Total users fetched: ${Object.keys(userMap).length}`);
    }
    return NextResponse.json({ success: true, users: userMap });
  } catch (error) {
    console.error("[Users API Error]", error);

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Failed to fetch users.";

    return NextResponse.json(
      { success: false, error: message, users: {} },
      { status: 500 }
    );
  }
}
