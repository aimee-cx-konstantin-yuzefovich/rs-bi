import { headers } from "next/headers";
import { extractClientIp } from "@/lib/client-ip";
import {
  evaluateAuthBypass,
  normalizeHost,
  parseAllowlist,
} from "@/lib/auth-bypass-policy";

/**
 * Server-only request-scoped helper to evaluate if authentication bypass
 * is permitted for the current incoming HTTP request.
 *
 * Invariants:
 * - On Vercel: strictly checks request host against DEV_BYPASS_HOSTS and
 *   client IP against DEV_BYPASS_ALLOWED_IPS.
 * - Outside Vercel (local dev): allows bypass if AUTH_MODE=bypass and NODE_ENV=development.
 * - Fails closed on any error or missing requirement.
 */
export async function isRequestAuthBypassEnabled(
  overrideHeaders?: Headers | null
): Promise<boolean> {
  let host: string | null = null;
  let clientIp = "unknown";

  try {
    const reqHeaders = overrideHeaders ?? (await headers());
    if (reqHeaders) {
      host = reqHeaders.get("host");
      clientIp = extractClientIp(
        reqHeaders,
        process.env.NODE_ENV === "production"
      );
    }
  } catch {
    // Graceful fallback when invoked outside active Next.js request context (e.g. tests or build scripts)
    host = null;
    clientIp = "unknown";
  }

  return evaluateAuthBypass({
    authMode: process.env.AUTH_MODE,
    isVercel: process.env.VERCEL === "1",
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    host,
    clientIp,
    allowedHosts: parseAllowlist(process.env.DEV_BYPASS_HOSTS),
    allowedIps: parseAllowlist(process.env.DEV_BYPASS_ALLOWED_IPS),
  });
}
