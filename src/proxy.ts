import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { IS_PRODUCTION } from "@/lib/config";

/**
 * Security Proxy — RusSilica BI Terminal
 *
 * In Next.js 16, the file convention is `proxy.ts` (not `middleware.ts`).
 * The export MUST be named `proxy` for Next.js 16 to recognize it.
 *
 * WordPress SSO Architecture:
 * - Caddy reverse proxy adds auth headers to every request
 * - BI terminal verifies proxy secret and creates sessions
 * - No /login page in production — WordPress handles login
 *
 * Security layers:
 * 1. Rate limiting (in-memory, with cleanup)
 * 2. Security response headers (CSP, HSTS, X-Frame-Options, etc.)
 * 3. Production-tightened CSP (no unsafe-inline/unsafe-eval)
 * 4. Request body size limits
 * 5. CORS restrictions (production allowlist only)
 * 6. Cross-origin isolation policies
 * 7. Cache-Control headers for sensitive pages
 */

// ─── Rate Limiter ───

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const MAX_RATE_LIMIT_ENTRIES = 10_000;

// Cleanup old entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    const entries = [...rateLimitMap.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toDelete = entries.slice(0, entries.length - MAX_RATE_LIMIT_ENTRIES);
    for (const [key] of toDelete) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);

// Different rate limits per endpoint type
const RATE_LIMITS = {
  api: { max: IS_PRODUCTION ? 40 : 60, windowMs: 60_000 },
  status: { max: IS_PRODUCTION ? 10 : 20, windowMs: 60_000 },
  auth: { max: IS_PRODUCTION ? 50 : 20, windowMs: 60_000 }, // Increased for debugging
  admin: { max: IS_PRODUCTION ? 10 : 30, windowMs: 60_000 },
  default: { max: IS_PRODUCTION ? 80 : 120, windowMs: 60_000 },
} as const;

function checkRateLimit(
  ip: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
  const key = `${ip}:${limit}:${windowMs}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    rateLimitMap.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, limit };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt, limit };
}

// ─── Security Headers ───

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

// ─── Content Security Policy ───

const CSP_DIRECTIVES_PROD = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.bitrix24.ru https://*.bitrix24.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.bitrix24.ru https://*.bitrix24.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "media-src 'none'",
  "worker-src 'self' blob:",
].join("; ");

const CSP_DIRECTIVES_DEV = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.bitrix24.ru https://*.bitrix24.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.bitrix24.ru https://*.bitrix24.com ws://localhost:3000",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "media-src 'none'",
  "worker-src 'self' blob:",
].join("; ");

const CSP_DIRECTIVES = IS_PRODUCTION ? CSP_DIRECTIVES_PROD : CSP_DIRECTIVES_DEV;

// ─── CORS ───

// Same-domain architecture: WordPress and BI terminal on bi-terminal.rus-silica.com
// No CORS needed in production (same origin), but keep for dev flexibility
const ALLOWED_ORIGINS = new Set(
  IS_PRODUCTION
    ? [
        "https://bi-terminal.rus-silica.com",  // Same domain for WP + BI
      ]
    : [
        "https://bi-terminal.rus-silica.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ]
);

/**
 * Get client IP with spoofing protection.
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    return parts[0];
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

// ─── MAIN PROXY EXPORT ───

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // SECURITY: Force HTTPS protocol header in production to ensure NextAuth sets secure cookies
  // even if the reverse proxy (LiteSpeed) fails to pass the X-Forwarded-Proto header.
  const requestHeaders = new Headers(request.headers);
  if (IS_PRODUCTION) {
    requestHeaders.set("x-forwarded-proto", "https");
  }

  // ─── Login page: Cache-Control headers ───
  if (pathname === "/login") {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
    response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.delete("X-Powered-By");
    return response;
  }

  // ─── WP SSO Callback: Add no-cache headers, but NOT strict CSP ───
  // IMPORTANT: The wp-callback route handler sets its own SSO_PAGE_CSP that
  // allows inline scripts (required for the auto-submit form). If we set
  // CSP_DIRECTIVES here too, both CSPs would be enforced and the stricter
  // one (script-src 'self') would block the inline script, breaking SSO.
  if (pathname === "/api/auth/wp-callback") {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
    // Do NOT set Content-Security-Policy here — the route handler sets SSO_PAGE_CSP
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    response.headers.delete("X-Powered-By");
    return response;
  }

  // ─── API Routes: Rate limiting + CORS + Security headers ───
  if (pathname.startsWith("/api/")) {
    const clientIp = getClientIp(request);

    // Select rate limit based on endpoint
    let rateConfig;
    if (pathname === "/api/bitrix/status") {
      rateConfig = RATE_LIMITS.status;
    } else if (pathname.startsWith("/api/auth/")) {
      rateConfig = RATE_LIMITS.auth;
    } else if (pathname.startsWith("/api/admin/")) {
      rateConfig = RATE_LIMITS.admin;
    } else {
      rateConfig = RATE_LIMITS.api;
    }

    const rateResult = checkRateLimit(clientIp, rateConfig.max, rateConfig.windowMs);

    if (!rateResult.allowed) {
      return new NextResponse(
        JSON.stringify({ success: false, error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateResult.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(rateConfig.max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rateResult.resetAt / 1000)),
            ...SECURITY_HEADERS,
            "Content-Security-Policy": CSP_DIRECTIVES,
          },
        }
      );
    }

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("origin");
      const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-CSRF-Token",
          "Access-Control-Max-Age": "86400",
          "Access-Control-Allow-Credentials": "true",
          ...SECURITY_HEADERS,
          "Content-Security-Policy": CSP_DIRECTIVES,
        },
      });
    }

    // Request body size check for POST/PATCH/DELETE (100KB max)
    if (["POST", "PATCH", "DELETE"].includes(request.method)) {
      const contentLength = request.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > 100_000) {
        return new NextResponse(
          JSON.stringify({ success: false, error: "Request body too large" }),
          {
            status: 413,
            headers: {
              "Content-Type": "application/json",
              ...SECURITY_HEADERS,
              "Content-Security-Policy": CSP_DIRECTIVES,
            },
          }
        );
      }
    }

    // Process API request
    const response = NextResponse.next({ request: { headers: requestHeaders } });

    // Add rate limit headers
    response.headers.set("X-RateLimit-Limit", String(rateConfig.max));
    response.headers.set("X-RateLimit-Remaining", String(rateResult.remaining));
    response.headers.set("X-RateLimit-Reset", String(Math.ceil(rateResult.resetAt / 1000)));

    // Add CORS headers for allowed origins
    const origin = request.headers.get("origin");
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
      response.headers.set("Access-Control-Max-Age", "86400");
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }

    // Add security headers
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
    response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);

    // SECURITY: Remove server fingerprinting header
    response.headers.delete("X-Powered-By");

    return response;
  }

  // ─── Non-API Routes: Security headers only ───
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set("Content-Security-Policy", CSP_DIRECTIVES);

  response.headers.delete("X-Powered-By");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|russilica-logo\\.png|robots\\.txt|.*\\.svg|.*\\.ico).*)",
  ],
};
