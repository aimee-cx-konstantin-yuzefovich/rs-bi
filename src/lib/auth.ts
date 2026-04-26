/**
 * NextAuth.js v4 Configuration — RusSilica BI Terminal
 *
 * WordPress SSO Integration (HMAC-based):
 * - WordPress generates HMAC-SHA256 signed tokens
 * - BI terminal verifies tokens using shared PROXY_SECRET
 * - No Caddy forward_auth required (simpler setup)
 * - Also supports Caddy proxy headers as alternative
 *
 * Three auth methods in production:
 * 1. HMAC SSO token (from wp-callback auto-submit form)
 * 2. Caddy proxy headers (alternative, for advanced setups)
 * 3. Dev password (development mode only)
 *
 * Security:
 * - NEXTAUTH_SECRET MANDATORY in production
 * - PROXY_SECRET shared between WordPress and BI terminal
 * - Timing-safe HMAC verification prevents timing attacks
 * - 5-minute token expiry prevents replay attacks
 * - Corporate email domain check as defense-in-depth
 * - JWT sessions (8h expiry)
 * - Secure cookie flags in production
 */

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { verifySsoToken, isProxySecretConfigured, timingSafeEqualString } from "@/lib/sso-hmac";
import { IS_PRODUCTION, shouldLog } from "@/lib/config";

// ─── Typed Session Interface ───
// NextAuth's default User/Session types don't include our custom fields.
// We extend them here for type safety across the application.

declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      id?: string;
      email?: string;
      name?: string;
      role?: string;
    };
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
  }
}

// ─── NEXTAUTH_SECRET — MANDATORY in production ───

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || (
  process.env.NODE_ENV === "production"
    ? undefined // Will cause a hard error below
    : "rus-silica-bi-dev-secret-change-in-production"
);

if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_SECRET) {
  throw new Error(
    "[AUTH] FATAL: NEXTAUTH_SECRET environment variable is REQUIRED in production! " +
    "Generate one with: openssl rand -base64 32"
  );
}

// ─── WordPress SSO Configuration ───

const PROXY_SECRET = process.env.PROXY_SECRET || "";

// ─── PROXY_SECRET — MANDATORY in production ───

if (IS_PRODUCTION && !PROXY_SECRET) {
  console.error(
    "[AUTH] FATAL: PROXY_SECRET environment variable is REQUIRED in production! " +
    "This must match the secret in your WordPress configuration. " +
    "Generate one with: openssl rand -hex 32 " +
    "ALL LOGIN ATTEMPTS WILL BE REJECTED until this is fixed."
  );
}

// ─── Corporate Email Domain Restriction (defense-in-depth) ───

const ALLOWED_EMAIL_DOMAINS = ["russilica.ru"];

export function isCorporateEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

// ─── Audit Logging (persisted to DB) ───

async function auditLog(event: string, details: Record<string, unknown>, ip?: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, event, ...details };
  if (shouldLog) console.log(`[AUDIT] ${JSON.stringify(logEntry)}`);

  try {
    await db.auditLog.create({
      data: {
        event,
        email: typeof details.email === "string" ? details.email : null,
        role: typeof details.role === "string" ? details.role : null,
        targetId: typeof details.targetId === "string" ? details.targetId : null,
        ip: ip || null,
        details: JSON.stringify(details),
      },
    });
  } catch {
    // Never let audit log failure break authentication
  }
}

// ─── NextAuth Configuration ───

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "имя@russilica.ru",
        },
        password: {
          label: "Пароль",
          type: "password",
        },
      },
      async authorize(credentials, req) {
        // Get client IP for audit
        const ip = req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim()
          || req?.headers?.get("x-real-ip")?.trim()
          || "unknown";

        // ═══════════════════════════════════════════════════════════
        // METHOD 1: HMAC SSO Token (from wp-callback auto-submit)
        // The password field contains: wp-sso-hmac:{email}:{role}:{ts}:{sig}
        // ═══════════════════════════════════════════════════════════

        if (credentials?.password?.startsWith("wp-sso-hmac:")) {
          if (!isProxySecretConfigured()) {
            await auditLog("LOGIN_BLOCKED_NO_SECRET", { reason: "proxy_secret_not_configured" }, ip);
            return null;
          }

          const payload = verifySsoToken(credentials.password);

          if (!payload) {
            await auditLog("LOGIN_BLOCKED_INVALID_HMAC", { reason: "invalid_or_expired_hmac_token", email: credentials.email }, ip);
            return null;
          }

          const email = payload.email.toLowerCase().trim();

          // Verify email matches the one in the form
          if (credentials.email?.toLowerCase().trim() !== email) {
            await auditLog("LOGIN_BLOCKED_EMAIL_MISMATCH", { reason: "email_mismatch", formEmail: credentials.email, tokenEmail: email }, ip);
            return null;
          }

          // Corporate email check (defense-in-depth)
          if (!isCorporateEmail(email)) {
            await auditLog("LOGIN_DOMAIN_BLOCKED", { email, reason: "non_corporate_domain" }, ip);
            return null;
          }

          const biRole = payload.role === "administrator" || payload.role === "admin" ? "admin" : "user";

          await auditLog("LOGIN_SUCCESS_WP_SSO", { email, role: biRole, ip, source: "wordpress_sso_hmac" }, ip);

          return {
            id: email,
            email,
            name: email.split("@")[0],
            role: biRole,
          };
        }

        // ═══════════════════════════════════════════════════════════
        // METHOD 2: Caddy Proxy Headers (alternative)
        // ═══════════════════════════════════════════════════════════

        if (IS_PRODUCTION) {
          const proxySecret = req?.headers?.get("x-proxy-secret");
          const headerEmail = req?.headers?.get("x-auth-user-email");
          const headerRole = req?.headers?.get("x-auth-user-role");

          if (proxySecret && PROXY_SECRET && timingSafeEqualString(proxySecret, PROXY_SECRET) && headerEmail) {
            const email = headerEmail.toLowerCase().trim();
            const role = headerRole?.toLowerCase().trim() || "user";

            if (!isCorporateEmail(email)) {
              await auditLog("LOGIN_DOMAIN_BLOCKED", { email, reason: "non_corporate_domain_proxy" }, ip);
              return null;
            }

            const biRole = role === "administrator" || role === "admin" ? "admin" : "user";

            await auditLog("LOGIN_SUCCESS_WP_SSO", { email, role: biRole, ip, source: "wordpress_sso_proxy" }, ip);

            return {
              id: email,
              email,
              name: email.split("@")[0],
              role: biRole,
            };
          }

          // In production: no valid auth method found
          await auditLog("LOGIN_BLOCKED_NO_AUTH", { reason: "no_valid_auth_method_in_production" }, ip);
          return null;
        }

        // ═══════════════════════════════════════════════════════════
        // METHOD 3: Dev password (development mode only)
        // ═══════════════════════════════════════════════════════════

        if (!credentials?.email || !credentials?.password) {
          throw new Error("Введите email и пароль");
        }

        const email = credentials.email.toLowerCase().trim();
        const password = credentials.password;

        // Corporate email check
        if (!isCorporateEmail(email)) {
          await auditLog("LOGIN_DOMAIN_BLOCKED", { email, reason: "non_corporate_domain" }, ip);
          throw new Error("Допускаются только корпоративные email @russilica.ru");
        }

        // Dev password check
        const DEV_PASSWORD = process.env.DEV_PASSWORD || "dev1234";
        if (password !== DEV_PASSWORD) {
          await auditLog("LOGIN_FAILED", { email, reason: "wrong_password", ip }, ip);
          throw new Error("Неверный email или пароль");
        }

        // Dev mode: all authenticated users get admin role
        const biRole = "admin";

        await auditLog("LOGIN_SUCCESS_DEV", { email, role: biRole, ip, source: "dev_mode" }, ip);

        return {
          id: email,
          email,
          name: email.split("@")[0],
          role: biRole,
        };
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 1 * 60 * 60, // Update JWT every 1 hour
  },

  jwt: {
    secret: NEXTAUTH_SECRET,
    maxAge: 8 * 60 * 60,
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        return token;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },

  cookies: {
    sessionToken: {
      name: `${IS_PRODUCTION ? "__Host-" : ""}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: IS_PRODUCTION,
      },
    },
    callbackUrl: {
      name: `${IS_PRODUCTION ? "__Host-" : ""}next-auth.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: IS_PRODUCTION,
        httpOnly: true,
      },
    },
    csrfToken: {
      name: `${IS_PRODUCTION ? "__Host-" : ""}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: IS_PRODUCTION,
      },
    },
  },

  debug: !IS_PRODUCTION,
  theme: undefined,
};
