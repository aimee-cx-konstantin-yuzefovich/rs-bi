/**
 * Server-side authentication guard for API routes.
 *
 * WordPress SSO Architecture:
 * - WordPress is the source of truth for users and roles
 * - NextAuth JWT contains: email, role (from WP proxy headers)
 * - No local user database — we trust the JWT claims
 * - JWT is refreshed from WordPress proxy headers on every sign-in
 *
 * Guards:
 * - requireAuth() — Any authenticated user (reads from JWT)
 * - requireAdmin() — Admin role required (reads from JWT)
 * - persistAuditLog() — Persistent audit logging to database
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { shouldLog } from "@/lib/config";

interface AuthSession {
  userId: string;  // Email (used as ID since no local user DB)
  email: string;
  name: string | null;
  role: string;
}

/**
 * Require any authenticated user.
 * Reads user info from NextAuth JWT session.
 * WordPress is the source of truth — we trust the JWT claims.
 */
export async function requireAuth(): Promise<AuthSession | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Требуется авторизация" },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const role = session.user.role;

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Некорректная сессия" },
      { status: 401 }
    );
  }

  return {
    userId,
    email: session.user.email || userId,
    name: session.user.name || null,
    role: role || "user",
  };
}

/**
 * Require admin role.
 * Reads role from NextAuth JWT session (populated from WordPress proxy headers).
 * WordPress is the source of truth — role is set at sign-in from WP.
 */
export async function requireAdmin(): Promise<AuthSession | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Требуется авторизация" },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const role = session.user.role;

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "Некорректная сессия" },
      { status: 401 }
    );
  }

  if (role !== "admin") {
    const clientIp = "unknown"; // Will be set by caller if needed
    await persistAuditLog("UNAUTHORIZED_ADMIN_ACCESS", userId, undefined, clientIp, {
      attemptedByEmail: session.user.email,
      actualRole: role,
    });
    return NextResponse.json(
      { success: false, error: "Доступ запрещён" },
      { status: 403 }
    );
  }

  return {
    userId,
    email: session.user.email || userId,
    name: session.user.name || null,
    role,
  };
}

/**
 * Persist audit log to database.
 * Survives server restarts and enables forensic analysis.
 */
export async function persistAuditLog(
  event: string,
  email?: string | null,
  targetId?: string | null,
  ip?: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        event,
        email: email || null,
        role: typeof details?.role === "string" ? details.role : (typeof details?.actualRole === "string" ? details.actualRole : "unknown"),
        targetId: targetId || null,
        ip: ip || null,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (error) {
    // Never let audit log failure break the main flow
    console.error("[AUDIT DB] Failed to persist audit log:", error);
  }

  // Also log to console for real-time monitoring (development only)
  if (shouldLog) {
    const timestamp = new Date().toISOString();
    console.log(`[AUDIT] ${JSON.stringify({ timestamp, event, email, targetId, ip, ...details })}`);
  }
}

/**
 * Type guard: check if the result is an error response.
 */
export function isAuthError(result: AuthSession | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
