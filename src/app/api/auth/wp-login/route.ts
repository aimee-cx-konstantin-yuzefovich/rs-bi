import { NextResponse } from "next/server";
import { WP_LOGIN_URL } from "@/lib/config.server";
import { auditLog } from "@/lib/auth-audit";
import { LOGIN_ERRORS, type LoginErrorCode } from "@/lib/login-errors";

export async function POST(request: Request) {
  let email: string | undefined;
  async function fail(code: LoginErrorCode, status: number) {
    await auditLog("LOGIN_FAILED_WP", { email, reason: code });
    return NextResponse.json({ success: false, error: LOGIN_ERRORS[code], code }, {
      status, headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    let body;
    try { body = await request.json(); } catch { return await fail("INVALID_INPUT", 400); }
    email = typeof body?.email === "string" ? body.email.trim().slice(0, 254) : undefined;
    const password = body?.password;
    if (!email || typeof password !== "string" || !password || password.length > 128) {
      return await fail("INVALID_INPUT", 400);
    }
    const wpBaseUrl = WP_LOGIN_URL.replace(/\/wp-login\.php.*$/, "");
    const response = await fetch(`${wpBaseUrl}/wp-login.php?action=headless_auth`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }), cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 429) return await fail("RATE_LIMITED", 429);
    if (response.status === 401) return await fail("INVALID_CREDENTIALS", 401);
    // A proxy/WAF 403 does not prove that a verified user lacks BI access.
    if (!response.ok) return await fail("SERVICE_UNAVAILABLE", 502);
    let data;
    try { data = await response.json(); } catch { return await fail("SERVICE_UNAVAILABLE", 502); }
    if (data?.success === false) return await fail("INVALID_CREDENTIALS", 401);
    if (data?.success !== true || typeof data.token !== "string" || !data.token.startsWith("wp-sso-hmac|")) {
      return await fail("SERVICE_UNAVAILABLE", 502);
    }
    return NextResponse.json({ success: true, token: data.token }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return await fail("SERVICE_UNAVAILABLE", 502);
  }
}
