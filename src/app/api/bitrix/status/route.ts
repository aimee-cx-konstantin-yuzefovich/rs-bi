import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  // ─── SECURITY: Require authentication ───
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const webhookConfigured = !!process.env.BITRIX_WEBHOOK_URL;

  // Security: Return minimal information — just boolean status.
  // Do NOT expose the webhook URL, domain, or any configuration details.
  // The message is intentionally generic to prevent information leakage.
  return NextResponse.json({
    configured: webhookConfigured,
    // No additional details — prevents reconnaissance of CRM infrastructure
  });
}
