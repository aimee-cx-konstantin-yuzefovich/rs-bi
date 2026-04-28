import { NextRequest, NextResponse } from "next/server";
import { bitrixGet, bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

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
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  try {
    const userMap: Record<string, string> = {};
    let start = 0;

    while (true) {
      try {
        const data = await bitrixPost<{
          result: Array<{ ID: string; NAME: string; LAST_NAME: string; SECOND_NAME: string }>;
          next?: number;
        }>("user.get", {
          start,
          // We don't strictly filter by ACTIVE because deals might be assigned to fired users
        });

        console.log(`[Users API] Fetched batch at start ${start}, got ${data.result?.length || 0} users`);

        if (Array.isArray(data.result)) {
          for (const user of data.result) {
            const fullName = [user.NAME, user.LAST_NAME]
              .filter(Boolean)
              .join(" ");
            userMap[user.ID] = fullName || `ID ${user.ID}`;
          }
        }

        if (!data.next || !Array.isArray(data.result) || data.result.length < 50) {
          break;
        }
        start = data.next;
      } catch (e) {
        console.error(`[Users API] Failed to fetch users batch at start ${start}:`, e);
        break;
      }
    }

    console.log(`[Users API] Total users fetched: ${Object.keys(userMap).length}`);
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
