import { NextRequest, NextResponse } from "next/server";
import { bitrixGet } from "@/lib/bitrix";
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
 *
 * OPTIMIZATION: Fetches users in parallel using Promise.allSettled
 * instead of sequential await calls (was N * 15s worst case, now max 15s).
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

      // Fetch all users in PARALLEL (was sequential — could take 50*15s=750s worst case)
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const data = await bitrixGet<{ result: { ID: string; NAME: string; LAST_NAME: string } }>(
            "user.get",
            { ID: id }
          );
          return { id, data };
        })
      );

      const userMap: Record<string, string> = {};
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.data.result) {
          const { id, data } = result.value;
          const fullName = [data.result.NAME, data.result.LAST_NAME].filter(Boolean).join(" ");
          userMap[id] = fullName || `Пользователь ${id}`;
        } else {
          // For failed requests, extract the id from the fulfilled value or use index
          const failedId = result.status === "fulfilled" ? result.value.id : null;
          if (failedId) {
            userMap[failedId] = `ID ${failedId}`;
          }
        }
      }

      // Fill in any missing IDs (from rejected promises)
      for (const id of ids) {
        if (!userMap[id]) {
          userMap[id] = `ID ${id}`;
        }
      }

      return NextResponse.json({ success: true, users: userMap });
    }

    // No specific IDs — fetch all users (limited)
    const data = await bitrixGet<{
      result: Array<{ ID: string; NAME: string; LAST_NAME: string }>;
    }>("user.search", { ACTIVE: "true" });

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
