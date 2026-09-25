import { isValidIp, normalizeClientIp } from "@/lib/client-ip";

/**
 * Context input for the pure authentication bypass evaluator.
 */
export interface AuthBypassContext {
  authMode: string | undefined;
  isVercel: boolean;
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
  host: string | null;
  clientIp: string;
  allowedHosts: string[];
  allowedIps: string[];
}

/**
 * Normalizes a hostname for strict equality comparison:
 * - Trims whitespace
 * - Converts to lowercase
 * - Strips trailing port (:443, :3000, etc.)
 * - Handles bracketed IPv6 hosts ([::1]:3000 -> ::1)
 *
 * Strict invariant: Substring or wildcard matching is forbidden.
 */
export function normalizeHost(rawHost: string | null | undefined): string | null {
  if (!rawHost || typeof rawHost !== "string") {
    return null;
  }

  const trimmed = rawHost.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }

  // Handle bracketed IPv6 literal hosts: e.g. [::1]:3000 or [::1]
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    const closingBracket = trimmed.indexOf("]");
    return trimmed.slice(1, closingBracket);
  }

  // Handle host:port — only when there is exactly one colon (DNS host or IPv4 with port).
  // Unbracketed IPv6 literals contain 2 or more colons and must not be truncated.
  const firstColon = trimmed.indexOf(":");
  const lastColon = trimmed.lastIndexOf(":");
  if (firstColon !== -1 && firstColon === lastColon) {
    return trimmed.slice(0, firstColon);
  }

  return trimmed;
}

/**
 * Parses comma-separated allowlist strings into an array of trimmed non-empty tokens.
 */
export function parseAllowlist(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== "string") {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Pure evaluator for development authentication bypass authorization.
 *
 * INVARIANTS:
 * 1. Default is ALWAYS false (fail-closed).
 * 2. AUTH_MODE must be explicitly "bypass".
 * 3. Local development:
 *    - Allowed when !isVercel AND nodeEnv === "development".
 * 4. Vercel runtime:
 *    - Allowed ONLY when isVercel is true AND
 *      normalized host strictly matches an entry in allowedHosts AND
 *      normalized clientIp strictly matches an entry in allowedIps.
 *    - VERCEL_ENV=preview is NOT required if host and IP match.
 *    - Production custom domain or any unapproved host ALWAYS returns false.
 *    - Missing, invalid, or "unknown" client IP ALWAYS returns false.
 */
export function evaluateAuthBypass(context: AuthBypassContext): boolean {
  if (context.authMode !== "bypass") {
    return false;
  }

  // Local development: non-Vercel environment
  if (!context.isVercel) {
    return context.nodeEnv === "development";
  }

  // Vercel deployment: host validation
  const normalizedHost = normalizeHost(context.host);
  if (!normalizedHost) {
    return false;
  }

  const normalizedAllowedHosts = context.allowedHosts
    .map(normalizeHost)
    .filter((h): h is string => Boolean(h));

  const hostMatched = normalizedAllowedHosts.includes(normalizedHost);
  if (!hostMatched) {
    return false;
  }

  // Vercel deployment: client IP validation
  const clientIp = context.clientIp ? context.clientIp.trim() : "";
  if (!clientIp || clientIp === "unknown" || !isValidIp(clientIp)) {
    return false;
  }

  const normalizedClientIp = normalizeClientIp(clientIp);

  const normalizedAllowedIps = context.allowedIps
    .map((ip) => ip.trim())
    .filter((ip) => isValidIp(ip) && ip !== "unknown")
    .map(normalizeClientIp);

  const ipMatched = normalizedAllowedIps.includes(normalizedClientIp);
  return ipMatched;
}
