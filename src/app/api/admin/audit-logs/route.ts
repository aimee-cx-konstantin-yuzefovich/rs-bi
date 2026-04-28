import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

// Define a strict allowlist of known event types.
// This prevents log pollution and makes log analysis reliable.
const VALID_AUDIT_EVENTS = new Set([
  "LOGIN_SUCCESS_WP_SSO",
  "LOGIN_SUCCESS_DEV",
  "LOGIN_FAILED",
  "LOGIN_BLOCKED_NO_SECRET",
  "LOGIN_BLOCKED_INVALID_HMAC",
  "LOGIN_BLOCKED_EMAIL_MISMATCH",
  "LOGIN_BLOCKED_NO_AUTH",
  "LOGIN_DOMAIN_BLOCKED",
  "UNAUTHORIZED_ADMIN_ACCESS",
  "DATA_EXPORT",
]);

// A simple email shape check — not RFC 5322 compliant,
// but sufficient to reject garbage input like HTML or scripts.
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

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
    const eventParam = searchParams.get("event");
    const emailParam = searchParams.get("email");

    // Validate event against known values — reject unknown event types
    // rather than silently ignoring them, to surface misconfigured clients.
    if (eventParam && !VALID_AUDIT_EVENTS.has(eventParam)) {
      return NextResponse.json(
        { success: false, error: "Invalid event filter value" },
        { status: 400 }
      );
    }

    // Validate email format if provided
    if (emailParam && !EMAIL_PATTERN.test(emailParam)) {
      return NextResponse.json(
        { success: false, error: "Invalid email filter format" },
        { status: 400 }
      );
    }

    // Validate limit and offset
    const parsedLimit = Number(searchParams.get("limit"));
    const parsedOffset = Number(searchParams.get("offset"));

    const limit = Number.isFinite(parsedLimit) && searchParams.has("limit")
      ? Math.max(0, Math.min(parsedLimit, 500))
      : 100;

    const offset = Number.isFinite(parsedOffset) && searchParams.has("offset")
      ? Math.max(0, parsedOffset)
      : 0;

    const where: Record<string, unknown> = {};
    if (eventParam) where.event = eventParam;
    if (emailParam) where.email = emailParam;

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
