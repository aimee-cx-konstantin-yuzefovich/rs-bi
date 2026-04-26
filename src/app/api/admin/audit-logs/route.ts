import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit-logs — View audit logs (admin only)
 *
 * Query params:
 * - event: Filter by event type
 * - email: Filter by user email
 * - limit: Number of entries (default 100, max 500)
 * - offset: Pagination offset
 *
 * SECURITY:
 * - Admin-only access (role verified from JWT)
 * - Rate limited by proxy
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdmin();
    if (isAuthError(authResult)) return authResult;

    const { searchParams } = new URL(request.url);
    const event = searchParams.get("event");
    const email = searchParams.get("email");

    // Validate limit and offset — parseInt returns NaN for non-numeric strings
    const rawLimit = parseInt(searchParams.get("limit") || "100", 10);
    const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(Number.isNaN(rawLimit) ? 100 : rawLimit, 500);
    const offset = Number.isNaN(rawOffset) ? 0 : rawOffset;

    const where: Record<string, unknown> = {};
    if (event) where.event = event;
    if (email) where.email = email;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      logs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Audit Logs API Error]", error);
    return NextResponse.json(
      { success: false, error: "Не удалось загрузить аудит-логи" },
      { status: 500 }
    );
  }
}
