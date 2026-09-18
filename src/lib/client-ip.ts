import type { NextRequest } from "next/server";
import { IS_PRODUCTION } from "@/lib/config";

/**
 * Pure, side-effect-free Client IP extraction and validation.
 *
 * Security & Deployment Invariant:
 * 1. The Node application port (3000) is bound to loopback or private network,
 *    never directly reachable from the public internet.
 * 2. Trusted reverse proxy (Caddy / LiteSpeed / Nginx) sanitizes/overwrites client identity:
 *    - X-Real-IP: explicitly overwritten with remote_host (authoritative proxy-selected identity).
 *    - X-Forwarded-For: remote_host or proxy-appended chain.
 * 3. Safe Fallback: If trusted client-IP headers are missing, empty, or malformed:
 *    do NOT manufacture "127.0.0.1". Fall back to the safe deterministic bucket "unknown".
 * 4. Localhost development (non-production) continues working for loopback host headers.
 */

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?::(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?$/;
const IPV4_MAPPED_IPV6_REGEX = /^::ffff:(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/i;

export function isValidIp(ip: string | null | undefined): boolean {
  if (!ip || typeof ip !== "string") return false;
  const trimmed = ip.trim();
  if (trimmed.length === 0) return false;
  return IPV4_REGEX.test(trimmed) || IPV6_REGEX.test(trimmed) || IPV4_MAPPED_IPV6_REGEX.test(trimmed);
}

export function normalizeClientIp(ip: string): string {
  const trimmed = ip.trim();
  // Normalize IPv4-mapped IPv6 (::ffff:192.0.2.1 -> 192.0.2.1)
  if (IPV4_MAPPED_IPV6_REGEX.test(trimmed)) {
    return trimmed.slice(7);
  }
  return trimmed;
}

export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | (() => string | null | undefined)
  | null
  | undefined;

export function extractClientIp(
  headersOrGetRealIp: HeaderSource,
  getXffOrIsProd?: (() => string | null | undefined) | boolean,
  getHost?: () => string | null | undefined,
  isProduction: boolean = IS_PRODUCTION
): string {
  let getRealIpFn: () => string | null | undefined;
  let getXffFn: () => string | null | undefined;
  let getHostFn: (() => string | null | undefined) | undefined;
  let prodMode = isProduction;

  if (typeof headersOrGetRealIp === "function") {
    // Called with getter functions: extractClientIp(getRealIp, getXff, getHost, isProduction)
    getRealIpFn = headersOrGetRealIp as () => string | null | undefined;
    getXffFn = (typeof getXffOrIsProd === "function" ? getXffOrIsProd : () => null);
    getHostFn = getHost;
    if (typeof arguments[3] === "boolean") {
      prodMode = arguments[3];
    }
  } else {
    // Called with headers object: extractClientIp(headers, isProduction)
    const headers = headersOrGetRealIp;
    if (typeof getXffOrIsProd === "boolean") {
      prodMode = getXffOrIsProd;
    }

    if (!headers) {
      return prodMode ? "unknown" : "127.0.0.1";
    }

    const getHeader = (name: string): string | null => {
      if (typeof (headers as Headers).get === "function") {
        return (headers as Headers).get(name);
      }
      const record = headers as Record<string, string | string[] | undefined>;
      const val = record[name.toLowerCase()] ?? record[name];
      if (Array.isArray(val)) return val[0] || null;
      return (val as string) || null;
    };

    getRealIpFn = () => getHeader("x-real-ip");
    getXffFn = () => getHeader("x-forwarded-for");
    getHostFn = () => getHeader("host");
  }

  // 1. Check X-Real-IP first (authoritative proxy-selected client IP)
  const realIp = getRealIpFn()?.trim();
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  // 2. Check X-Forwarded-For
  const forwarded = getXffFn();
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // In trusted proxy setups where proxy appends client IP, the rightmost entry is the proxy-added IP.
      // If the proxy overwrites XFF (like Caddy {remote_host}), parts has length 1.
      // In both cases, taking the last valid proxy-selected entry prevents an attacker from
      // injecting a spoofed prefix (e.g. "spoofed, real").
      const candidate = parts[parts.length - 1];
      if (isValidIp(candidate)) {
        return candidate;
      }
    }
  }

  // 3. Development / test convenience: allow loopback when running locally in non-production
  if (!prodMode && getHostFn) {
    const host = getHostFn() || "";
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
      return "127.0.0.1";
    }
  }

  // 4. Safe fallback for missing, invalid, or malformed headers: "unknown"
  return "unknown";
}

export function getClientIp(
  requestOrHeaders: NextRequest | Request | HeaderSource,
  isProduction: boolean = IS_PRODUCTION
): string {
  if (!requestOrHeaders) return isProduction ? "unknown" : "127.0.0.1";
  if (
    typeof requestOrHeaders === "object" &&
    requestOrHeaders !== null &&
    "headers" in requestOrHeaders &&
    requestOrHeaders.headers
  ) {
    const h = requestOrHeaders.headers;
    if (typeof (h as Headers).get === "function") {
      return extractClientIp(h as Headers, isProduction);
    }
    if (typeof h === "object" && h !== null && !Array.isArray(h)) {
      return extractClientIp(h as unknown as Record<string, string | string[] | undefined>, isProduction);
    }
  }
  return extractClientIp(requestOrHeaders as HeaderSource, isProduction);
}
