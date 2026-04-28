/**
 * SSO HMAC Utilities — RusSilica BI Terminal
 *
 * Provides HMAC-SHA256 based token generation and verification
 * for WordPress SSO integration.
 *
 * Flow:
 * 1. WordPress mu-plugin generates: HMAC-SHA256(email|role|timestamp, PROXY_SECRET)
 * 2. WordPress redirects to: /api/auth/wp-callback?email=...&role=...&ts=...&sig=...
 * 3. BI terminal verifies the signature using the same PROXY_SECRET
 * 4. If valid, creates a NextAuth session
 *
 * Security:
 * - timingSafeEqual prevents timing attacks
 * - 5-minute token expiry prevents replay attacks
 * - PROXY_SECRET is shared between WordPress and BI terminal
 */

import { createHmac, timingSafeEqual, createHash } from "crypto";
import { db } from "@/lib/db";

const PROXY_SECRET = process.env.PROXY_SECRET || "";
const MAX_TOKEN_AGE_SECONDS = 300; // 5 minutes

export interface SsoTokenPayload {
  email: string;
  role: string;
  timestamp: number;
}

/**
 * Generate HMAC signature for SSO token.
 * Signature = HMAC-SHA256(email|role|timestamp, PROXY_SECRET)
 */
export function generateSsoHmac(payload: SsoTokenPayload): string {
  const message = `${payload.email}|${payload.role}|${payload.timestamp}`;
  return createHmac("sha256", PROXY_SECRET).update(message).digest("hex");
}

/**
 * Generate a complete SSO token string for use as password in the auto-submit form.
 * Format: wp-sso-hmac:{email}:{role}:{timestamp}:{signature}
 */
export function generateSsoToken(payload: SsoTokenPayload): string {
  const signature = generateSsoHmac(payload);
  return `wp-sso-hmac:${payload.email}:${payload.role}:${payload.timestamp}:${signature}`;
}

/**
 * Verify an SSO HMAC token (from the auto-submit form password field).
 * Returns the payload if valid, null if invalid.
 *
 * Token format: wp-sso-hmac:{email}:{role}:{timestamp}:{signature}
 */
export async function verifySsoToken(token: string): Promise<SsoTokenPayload | null> {
  if (!PROXY_SECRET) return null;

  // Must start with our prefix
  if (!token.startsWith("wp-sso-hmac:")) return null;

  const parts = token.slice("wp-sso-hmac:".length).split(":");
  // Need at least: email, role, timestamp, signature (4 parts)
  // But email might contain special chars (though unlikely with @russilica.ru)
  if (parts.length < 4) return null;

  // Signature is always last, timestamp second-to-last, role third-to-last
  const signature = parts[parts.length - 1];
  const timestampStr = parts[parts.length - 2];
  const role = parts[parts.length - 3];
  const email = parts.slice(0, parts.length - 3).join(":");

  if (!email || !role || !timestampStr || !signature) return null;

  // Validate timestamp is a number
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return null;

  // Check token age (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_TOKEN_AGE_SECONDS) {
    console.warn(`[SSO-HMAC] Token expired: age=${Math.abs(now - timestamp)}s, max=${MAX_TOKEN_AGE_SECONDS}s`);
    return null;
  }

  // Verify HMAC with timing-safe comparison
  const expectedSignature = generateSsoHmac({ email, role, timestamp });

  if (signature.length !== expectedSignature.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"))) return null;
  } catch {
    return null;
  }

  // Check nonce to prevent replay attacks
  try {
    const existing = await db.usedNonce.findUnique({
      where: { nonce: signature }
    });
    if (existing) {
      console.warn(`[SSO-HMAC] Replay attack detected for nonce: ${signature}`);
      return null;
    }
    await db.usedNonce.create({
      data: { nonce: signature }
    });
  } catch (error) {
    console.error("[SSO-HMAC] Error checking nonce:", error);
    return null;
  }

  return { email, role, timestamp };
}

/**
 * Verify HMAC from URL parameters (used by wp-callback).
 * Parameters: email, role, ts (timestamp in seconds), sig (hex signature)
 */
export async function verifySsoUrlParams(
  email: string,
  role: string,
  timestampStr: string,
  signature: string
): Promise<SsoTokenPayload | null> {
  if (!PROXY_SECRET) return null;
  if (!email || !role || !timestampStr || !signature) return null;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return null;

  // Check token age
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_TOKEN_AGE_SECONDS) {
    console.warn(`[SSO-HMAC] URL token expired: age=${Math.abs(now - timestamp)}s`);
    return null;
  }

  // Verify HMAC
  const expectedSignature = generateSsoHmac({ email, role, timestamp });

  if (signature.length !== expectedSignature.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"))) return null;
  } catch {
    return null;
  }

  // Check nonce to prevent replay attacks
  try {
    const existing = await db.usedNonce.findUnique({
      where: { nonce: signature }
    });
    if (existing) {
      console.warn(`[SSO-HMAC] Replay attack detected for nonce: ${signature}`);
      return null;
    }
    await db.usedNonce.create({
      data: { nonce: signature }
    });
  } catch (error) {
    console.error("[SSO-HMAC] Error checking nonce:", error);
    return null;
  }

  return { email, role, timestamp };
}

/**
 * Check if PROXY_SECRET is configured.
 * Required for SSO to work.
 */
export function isProxySecretConfigured(): boolean {
  return PROXY_SECRET.length > 0;
}

/**
 * Timing-safe string comparison.
 * Prevents timing attacks when comparing secrets (e.g., PROXY_SECRET).
 * Uses crypto.timingSafeEqual under the hood.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  // Hard cap: proxy secrets should never exceed 512 bytes.
  // Reject anything longer immediately. An attacker cannot learn the
  // expected secret's length from this check alone because we don't
  // reveal whether `a` or `b` was too long.
  const MAX_SECRET_LENGTH = 512;
  if (a.length > MAX_SECRET_LENGTH || b.length > MAX_SECRET_LENGTH) {
    return false;
  }

  try {
    // Hash both values with SHA-256. This produces fixed-length 32-byte
    // digests regardless of input length, so timingSafeEqual gets
    // two equally-sized buffers and comparison time is constant.
    const hashA = createHash("sha256").update(a).digest();
    const hashB = createHash("sha256").update(b).digest();
    return timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}
