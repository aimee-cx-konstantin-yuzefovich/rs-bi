import { NextRequest, NextResponse } from "next/server";
import { bitrixGet, bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/bitrix/users
 * Fetches responsible person names from Bitrix24.
 * Accepts optional ?ids=1,2,3 query parameter to fetch specific users.
 * If no ids provided, fetches all users (limited to 50).
 *
 * SECURITY: Requires authentication. Does NOT expose the webhook URL.
 * It only returns user ID + Name pairs for display purposes.
 */
export async function GET(request: NextRequest) {
  // ─── SECURITY: Require authentication ───
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");

    // Validate ids parameter — only allow comma-separated positive integers
    if (idsParam) {
      const ids = idsParam.split(",").filter((id) => /^\d+$/.test(id.trim()));
      if (ids.length === 0 || ids.length > 50) {
        return NextResponse.json(
          { success: false, error: "Invalid or too many user IDs", users: {} },
          { status: 400 }
        );
      }

      const userMap: Record<string, string> = {};
      
      try {
        // Use POST to send a proper JSON body for the filter
        const data = await bitrixPost<{ result: Array<{ ID: string; NAME: string; LAST_NAME: string }> }>(
          "user.get",
          { FILTER: { ID: ids } }
        );
        
        if (Array.isArray(data.result)) {
          for (const user of data.result) {
            const fullName = [user.NAME, user.LAST_NAME].filter(Boolean).join(" ");
            userMap[user.ID] = fullName || `Пользователь ${user.ID}`;
          }
        }
      } catch (error) {
        console.error(`[Users API] Failed to fetch users batch:`, error);
      }

      // Fill in any missing IDs (if API failed or user not found)
      for (const id of ids) {
        if (!userMap[id]) {
          userMap[id] = `ID ${id}`;
        }
      }

      return NextResponse.json({ success: true, users: userMap });
    }

    // No specific IDs — fetch all users
    const data = await bitrixPost<{
      result: Array<{ ID: string; NAME: string; LAST_NAME: string }>;
    }>("user.get", { FILTER: { ACTIVE: true } });

    const userMap: Record<string, string> = {};
    if (Array.isArray(data.result)) {
      for (const user of data.result) {
        const fullName = [user.NAME, user.LAST_NAME].filter(Boolean).join(" ");
        userMap[user.ID] = fullName || `Пользователь ${user.ID}`;
      }
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
