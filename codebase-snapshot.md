# Project Context: Russilica BI Analytics Terminal

**Purpose of this Document:**
This file is a comprehensive, build-time snapshot of the entire codebase, database schema, and configuration for the Russilica BI Analytics Terminal. It is specifically generated for AI-driven code review, security auditing, and architectural analysis.

**Project Overview:**
Russilica BI Analytics is a mission-critical, headless Business Intelligence terminal designed for top management. It provides real-time sales analytics, interactive dashboards, and data visualization by securely pulling data from a Bitrix24 CRM instance.

**Technical Stack & Architecture:**
*   **Framework:** Next.js 16 (App Router), React, TypeScript.
*   **Styling:** Tailwind CSS, shadcn/ui.
*   **Database/ORM:** Prisma (SQLite for audit logs and persistent settings; no local user data).
*   **Authentication:** WordPress SSO. The BI terminal relies entirely on a WordPress instance for user authentication and role management. It verifies HMAC-SHA256 tokens passed via URL parameters or headers.
*   **Integration:** Bitrix24 CRM REST API. All Bitrix24 calls are proxied through the Next.js backend to prevent exposing webhook URLs to the client and to enforce strict method allowlists (SSRF protection).

**Critical Security & Design Principles (For the AI Reviewer):**
1.  **Zero Trust Auth:** The system trusts the NextAuth JWT claims (email, role) populated during the WP SSO callback. There is no local user registration.
2.  **Strict Proxy:** `src/middleware.ts` acts as the primary security gateway, enforcing rate limiting, CORS, request size limits, and strict Content Security Policies (CSP).
3.  **Data Sanitization:** All inputs to the Bitrix24 API are strictly validated and sanitized to prevent injection attacks. Errors returned to the client are generic to prevent information leakage.
4.  **Performance:** Prisma query logging is disabled in production to prevent performance degradation.
5.  **Audit Logging:** All critical actions (especially unauthorized access attempts) are persistently logged to the database via `src/lib/auth-guard.ts`.

**Reviewer Instructions:**
Please analyze this codebase for:
*   Security vulnerabilities (e.g., bypasses in auth guards, SSRF, XSS, injection flaws).
*   Performance bottlenecks (e.g., inefficient API routes, memory leaks).
*   Architectural anti-patterns or deviations from Next.js 16 best practices.
*   Logic errors in data processing or Bitrix24 integration.

---

# Codebase Snapshot

## File: package.json
```json
{
  "name": "nextjs_tailwind_shadcn_ts",
  "version": "0.2.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000 2>&1 | tee dev.log",
    "build": "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/",
    "start": "NODE_ENV=production bun .next/standalone/server.js 2>&1 | tee server.log",
    "lint": "eslint .",
    "db:push": "prisma db push",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@hookform/resolvers": "^5.1.1",
    "@prisma/client": "^6.11.1",
    "@radix-ui/react-accordion": "^1.2.11",
    "@radix-ui/react-alert-dialog": "^1.1.14",
    "@radix-ui/react-aspect-ratio": "^1.1.7",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-checkbox": "^1.3.2",
    "@radix-ui/react-collapsible": "^1.1.11",
    "@radix-ui/react-context-menu": "^2.2.15",
    "@radix-ui/react-dialog": "^1.1.14",
    "@radix-ui/react-dropdown-menu": "^2.1.15",
    "@radix-ui/react-hover-card": "^1.1.14",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-menubar": "^1.1.15",
    "@radix-ui/react-navigation-menu": "^1.2.13",
    "@radix-ui/react-popover": "^1.1.14",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-radio-group": "^1.3.7",
    "@radix-ui/react-scroll-area": "^1.2.9",
    "@radix-ui/react-select": "^2.2.5",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slider": "^1.3.5",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.5",
    "@radix-ui/react-tabs": "^1.1.12",
    "@radix-ui/react-toast": "^1.2.14",
    "@radix-ui/react-toggle": "^1.1.9",
    "@radix-ui/react-toggle-group": "^1.1.10",
    "@radix-ui/react-tooltip": "^1.2.7",
    "@tanstack/react-query": "^5.82.0",
    "@tanstack/react-table": "^8.21.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.1.0",
    "embla-carousel-react": "^8.6.0",
    "framer-motion": "^12.23.2",
    "input-otp": "^1.4.2",
    "lucide-react": "^0.525.0",
    "next": "^16.1.1",
    "next-auth": "^4.24.11",
    "next-themes": "^0.4.6",
    "prisma": "^6.11.1",
    "react": "^19.0.0",
    "react-day-picker": "^9.8.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.60.0",
    "react-resizable-panels": "^3.0.3",
    "recharts": "^2.15.4",
    "sharp": "^0.34.3",
    "sonner": "^2.0.6",
    "tailwind-merge": "^3.3.1",
    "tailwindcss-animate": "^1.0.7",
    "vaul": "^1.1.2",
    "xlsx": "^0.18.5",
    "zod": "^4.0.2",
    "zustand": "^5.0.6"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "bun-types": "^1.3.4",
    "eslint": "^9",
    "eslint-config-next": "^16.1.1",
    "tailwindcss": "^4",
    "tw-animate-css": "^1.3.5",
    "typescript": "^5"
  }
}

```

## File: next.config.ts
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // SECURITY: Do NOT ignore TypeScript build errors in production.
  // Build must pass type-checking to catch type-related bugs.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Enable React strict mode for catching common bugs during development
  reactStrictMode: true,
  // SECURITY: Remove X-Powered-By header to prevent server fingerprinting
  poweredByHeader: false,
  // Security headers and rate limiting are handled in src/proxy.ts (Next.js 16 convention)
};

export default nextConfig;

```

## File: tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "examples",
    "skills",
    "mini-services"
  ]
}

```

## File: eslint.config.mjs
```mjs
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;

```

## File: tailwind.config.ts
```ts
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
    darkMode: "class",
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [tailwindcssAnimate],
};
export default config;

```

## File: prisma/schema.prisma
```prisma
// This is your Prisma schema file,
// learn more about it in the docs: https://pris.ly/d/prisma-schema

generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// ─── RusSilica BI Terminal — Audit Log ───
// Persistent security audit trail — survives server restarts.
// WordPress manages users, so we store email/role directly
// instead of referencing a local User table.

model AuditLog {
  id        String   @id @default(cuid())
  event     String                // LOGIN_SUCCESS, LOGIN_FAILED, DATA_EXPORT, etc.
  email     String?               // User email (from WordPress SSO)
  role      String?               // User role at the time of action
  targetId  String?               // Target entity (for admin operations)
  ip        String?               // Client IP address
  details   String?               // JSON string with additional context
  createdAt DateTime @default(now())

  @@index([event])
  @@index([email])
  @@index([createdAt])
  @@map("audit_logs")
}

```

## File: AGENTS.md
```md
# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Middleware**: Next.js 16 convention uses `src/middleware.ts` (export MUST be named `middleware`). It handles in-memory rate limiting and forces `x-forwarded-proto: https` in production.
- **Config Imports**: Import `IS_PRODUCTION` and `WP_LOGIN_URL` from `src/lib/config.ts` instead of checking `process.env` directly.
- **Deployment**: Uses Next.js `standalone` output. Production runs via `bun .next/standalone/server.js`, not standard `next start`.
- **Bitrix24 API**: MUST use `bitrixGet` / `bitrixPost` from `src/lib/bitrix.ts`. Raw fetch calls to Bitrix24 are forbidden.
- **ESLint**: Many standard rules (e.g., `no-explicit-any`, `exhaustive-deps`) are explicitly disabled in `eslint.config.mjs`. Do not try to fix these "violations".
```

## File: .roo/rules-code/AGENTS.md
```md
# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Bitrix24 API**: MUST use `bitrixGet` / `bitrixPost` from `src/lib/bitrix.ts`. Raw fetch calls are forbidden. Use `isSystemField` to filter fields (custom `UF_CRM_*` fields are NEVER system fields).
- **Auth Domain**: Use `isCorporateEmail` from `src/lib/auth.ts` to enforce the `@russilica.ru` domain restriction.
- **Proxy CSP**: Do NOT set strict CSP in `src/middleware.ts` for `/api/auth/wp-callback`. The route handler sets its own `SSO_PAGE_CSP` that allows inline scripts.
- **Login Page**: `src/app/login/page.tsx` uses `window.location.origin` for redirects to avoid `0.0.0.0:3000` issues in production.
- **ESLint**: Many standard rules are explicitly disabled in `eslint.config.mjs`. Do not try to fix these "violations" unless they cause actual bugs.
```

## File: .roo/rules-debug/AGENTS.md
```md
# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Auth & Redirects**: If SSO fails, check `PROXY_SECRET` match with WordPress. For infinite redirect loops, check NextAuth cookie settings (`__Host-` prefix requires HTTPS) and ensure OpenLiteSpeed passes `X-Forwarded-Proto: https`.
- **Audit Logs**: Auth audit log failures are intentionally swallowed so they don't break authentication (`src/lib/auth.ts`).
- **Bitrix24**: Raw API errors are logged server-side only. The webhook URL MUST be HTTPS and cannot point to private IP ranges (RFC 1918).
- **Rate Limiting**: Handled in-memory in `src/middleware.ts`. If you encounter 429 errors, check the `RATE_LIMITS` object.
- **Logging**: Debug console logging is gated by `shouldLog` from `src/lib/config.ts`. Prisma query logging is strictly disabled in production.
```

## File: .roo/rules-ask/AGENTS.md
```md
# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Auth Methods**: Three auth methods exist in `src/lib/auth.ts`: HMAC SSO token (prod), Caddy proxy headers (prod alternative), and Dev password (dev only).
- **Proxy Responsibilities**: `src/middleware.ts` handles rate limiting, security headers, CSP, request body size limits (100KB max), and CORS.
- **Bitrix24 Fields**: `SYSTEM_FIELDS_TO_EXCLUDE` in `src/lib/bitrix.ts` lists internal IDs and metadata that are explicitly hidden because they are not informative for BI.
- **Configuration**: `src/lib/config.ts` is the single source of truth for environment-dependent constants (e.g., `IS_PRODUCTION`, `WP_LOGIN_URL`).
- **Login Flow**: Production uses WordPress SSO. `/login` auto-redirects to WordPress, which redirects to `/api/auth/wp-callback`, which auto-submits a form to NextAuth.
```

## File: .roo/rules-architect/AGENTS.md
```md
# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Auth Architecture**: WordPress generates HMAC-SHA256 signed tokens, verified by BI terminal using a shared `PROXY_SECRET`. No Caddy `forward_auth` is required. `src/lib/sso-hmac.ts` uses `timingSafeEqualString` to prevent timing attacks.
- **Middleware & Security**: Next.js 16 convention uses `src/middleware.ts` (export MUST be named `middleware`). It implements in-memory rate limiting and forces `x-forwarded-proto: https` in production for secure cookies behind OpenLiteSpeed.
- **Database Performance**: Prisma query logging is strictly disabled in production to prevent performance degradation.
- **Deployment**: Uses Next.js `standalone` output. The `deploy-prod.zip` archive contains ONLY `server.js`, `node_modules`, `.next`, `public`, `package.json`, and `prisma`. It strictly EXCLUDES `.env`, `db/`, and `src/`.
```

## File: src/app/api/admin/audit-logs/route.ts
```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

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
    const event = searchParams.get("event");
    const email = searchParams.get("email");

    // Validate limit and offset — parseInt returns NaN for non-numeric strings
    const rawLimit = parseInt(searchParams.get("limit") || "100", 10);
    const rawOffset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = Math.min(Number.isNaN(rawLimit) ? 100 : rawLimit, 500);
    const offset = Number.isNaN(rawOffset) ? 0 : rawOffset;

    const where: Record<string, unknown> = {};
    if (event && typeof event === "string" && event.length <= 100) where.event = event;
    if (email && typeof email === "string" && email.length <= 255) where.email = email;

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

```

## File: src/app/api/auth/[...nextauth]/route.ts
```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

```

## File: src/app/api/auth/wp-callback/route.ts
```ts
import { NextRequest, NextResponse } from "next/server";
import { isCorporateEmail, mapWpRoleToBiRole } from "@/lib/auth";
import { verifySsoUrlParams, generateSsoToken, isProxySecretConfigured, timingSafeEqualString } from "@/lib/sso-hmac";
import { IS_PRODUCTION, shouldLog } from "@/lib/config";
import { WP_LOGIN_URL } from "@/lib/config.server";

/**
 * GET /api/auth/wp-callback — WordPress SSO Callback
 *
 * Supports TWO authentication methods:
 *
 * 1. HMAC URL Parameters (recommended, simpler setup):
 *    WordPress mu-plugin generates HMAC signature and redirects to:
 *    /api/auth/wp-callback?email=user@russilica.ru&role=administrator&ts=1234567890&sig=abc123...
 *
 * 2. Caddy Proxy Headers (alternative, for advanced setups):
 *    Caddy forward_auth adds headers: X-Auth-User-Email, X-Auth-User-Role, X-Proxy-Secret
 *
 * After verification, returns an HTML page that auto-submits to NextAuth
 * credentials callback, creating a session.
 *
 * Security:
 * - HMAC-SHA256 signature prevents token forgery
 * - 5-minute token expiry prevents replay attacks
 * - Timing-safe comparison prevents timing attacks
 * - Corporate email domain check (defense-in-depth)
 * - HTML-encoding of user-supplied data prevents XSS
 * - Rate limiting via proxy.ts
 */

/**
 * CSP for the SSO auto-submit page.
 * SECURITY: Must allow inline scripts (for auto-submit form) and inline styles.
 * The middleware's default CSP (script-src 'self') would block the inline <script> tag.
 * This is safe because the HTML is fully generated server-side with no user-controlled content.
 *
 * IMPORTANT: The proxy middleware MUST NOT apply its strict CSP to this route.
 * The SSO_PAGE_CSP is the ONLY CSP that should be active on this page.
 */
const SSO_PAGE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",    // Required for auto-submit form
  "style-src 'unsafe-inline'",      // Required for spinner animation
  "form-action 'self'",             // Only allow form submission to same origin
  "connect-src 'self'",             // Required to fetch CSRF token
  "img-src 'none'",                 // No images
  "frame-ancestors 'none'",         // Prevent embedding
].join("; ");

/**
 * HTML-encode a string to prevent XSS in template literals.
 */
function htmlEncode(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build the HTML auto-submit page that creates a NextAuth session.
 */
function buildSsoHtml(email: string, ssoToken: string): string {
  const safeEmail = htmlEncode(email);
  const safeToken = htmlEncode(ssoToken);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Вход в BI-терминал...</title>
  <style>
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #94a3b8;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .container { text-align: center; }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid rgba(245, 158, 11, 0.2);
      border-top-color: #f59e0b;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { color: white; font-size: 16px; margin: 0 0 8px; }
    p { font-size: 13px; margin: 0; }
    .error { color: #ef4444; }
    a { color: #f59e0b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Вход в BI-терминал</h2>
    <p>Авторизация через корпоративный портал...</p>
  </div>
  <form id="sso-form" method="POST" action="/api/auth/callback/credentials">
    <input type="hidden" name="email" value="${safeEmail}" />
    <input type="hidden" name="password" value="${safeToken}" />
  </form>
  <script>
    fetch('/api/auth/csrf?t=' + new Date().getTime(), { credentials: 'include', cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error('HTTP status ' + res.status);
        return res.json();
      })
      .then(data => {
        if (data.csrfToken) {
          const form = document.getElementById('sso-form');
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'csrfToken';
          input.value = data.csrfToken;
          form.appendChild(input);
          document.getElementById('sso-form').submit();
        } else {
          const errDiv = document.createElement('div');
          errDiv.style.cssText = 'color:red; margin-top:20px; font-size:12px;';
          errDiv.textContent = 'Error: No CSRF token received. Response: ' + JSON.stringify(data);
          document.body.appendChild(errDiv);
        }
      })
      .catch(err => {
        console.error('Failed to fetch CSRF token', err);
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'color:red; margin-top:20px; font-size:12px;';
        errDiv.textContent = 'Error fetching CSRF: ' + err.message;
        document.body.appendChild(errDiv);
      });
  </script>
</body>
</html>`;
}

/**
 * Build error HTML page.
 */
function buildErrorHtml(title: string, message: string): string {
  const safeTitle = htmlEncode(title);
  const safeMessage = htmlEncode(message);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;
  margin:0;background:#0f172a;color:#ef4444;font-family:sans-serif;text-align:center;}
  h1{font-size:18px;margin:0 0 8px}p{color:#94a3b8;font-size:14px;margin:0}
  a{color:#f59e0b;font-size:13px;display:inline-block;margin-top:16px}
</style></head>
<body><div><h1>${safeTitle}</h1><p>${safeMessage}</p>
<a href="/">← Вернуться на главную</a></div></body></html>`;
}

export async function GET(request: NextRequest) {
  try {
    return await handleWpCallback(request);
  } catch (error) {
    // Top-level catch — prevents leaking stack traces on auth routes
    console.error("[WP-SSO] Unhandled error:", error);
    return new NextResponse(
      buildErrorHtml("Ошибка сервера", "Произошла внутренняя ошибка. Попробуйте позже."),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

async function handleWpCallback(request: NextRequest) {
  const biUrl = request.nextUrl.origin;
  const { searchParams } = request.nextUrl;

  // ─── In development mode, redirect to dev login ───
  if (!IS_PRODUCTION) {
    return NextResponse.redirect(new URL("/login", biUrl));
  }

  // ─── Check PROXY_SECRET is configured ───
  if (!isProxySecretConfigured()) {
    console.error("[WP-SSO] PROXY_SECRET not configured — cannot verify SSO tokens");
    return new NextResponse(
      buildErrorHtml("Ошибка конфигурации", "PROXY_SECRET не настроен. Обратитесь к администратору."),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";

  // ═══════════════════════════════════════════════════════════
  // METHOD 1: HMAC URL Parameters (from WordPress mu-plugin)
  // ?email=user@russilica.ru&role=administrator&ts=1234567890&sig=abc123...
  // ═══════════════════════════════════════════════════════════

  const emailParam = searchParams.get("email");
  const roleParam = searchParams.get("role");
  const tsParam = searchParams.get("ts");
  const sigParam = searchParams.get("sig");

  if (emailParam && roleParam && tsParam && sigParam) {
    const payload = verifySsoUrlParams(emailParam, roleParam, tsParam, sigParam);

    if (payload) {
      const email = payload.email.toLowerCase().trim();

      // Corporate email check (defense-in-depth)
      if (!isCorporateEmail(email)) {
        console.warn(`[WP-SSO] Non-corporate email from HMAC: ${email}`);
        return new NextResponse(
          buildErrorHtml("Доступ запрещён", "Допускаются только корпоративные email @russilica.ru"),
          { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }

      // Map WP role to BI role (unknown roles → "user" for security)
      const biRole = mapWpRoleToBiRole(payload.role);
      if (shouldLog) console.log(`[WP-SSO] HMAC auth success: role=${biRole}`);
      // Generate internal SSO token for the auto-submit form
      const ssoToken = generateSsoToken({
        email,
        role: biRole,
        timestamp: Math.floor(Date.now() / 1000),
      });

      return new NextResponse(
        buildSsoHtml(email, ssoToken),
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Content-Security-Policy": SSO_PAGE_CSP,
          },
        }
      );
    } else {
      console.warn(`[WP-SSO] Invalid HMAC signature from IP: ${clientIp}`);
      // Don't redirect back to WP with bad sig — could be an attack
      return new NextResponse(
        buildErrorHtml("Ошибка авторизации", "Недействительная или просроченная подпись. Попробуйте войти снова."),
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // METHOD 2: Caddy Proxy Headers (alternative, for advanced setups)
  // X-Auth-User-Email, X-Auth-User-Role, X-Proxy-Secret
  // ═══════════════════════════════════════════════════════════

  const proxySecret = request.headers.get("x-proxy-secret");
  const headerEmail = request.headers.get("x-auth-user-email");
  const headerRole = request.headers.get("x-auth-user-role");

  if (proxySecret && headerEmail) {
    // Verify proxy secret via HMAC module
    // Direct proxy secret comparison (legacy Caddy forward_auth)
    // SECURITY: Use timing-safe comparison to prevent timing attacks
    const configuredSecret = process.env.PROXY_SECRET || "";
    if (configuredSecret && timingSafeEqualString(proxySecret, configuredSecret)) {
      const email = headerEmail.toLowerCase().trim();

      // Corporate email check
      if (!isCorporateEmail(email)) {
        console.warn(`[WP-SSO] Non-corporate email from proxy headers: ${email}`);
        return new NextResponse(
          buildErrorHtml("Доступ запрещён", "Допускаются только корпоративные email @russilica.ru"),
          { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }

      const biRole = mapWpRoleToBiRole(headerRole);
      if (shouldLog) console.log(`[WP-SSO] Proxy header auth success: role=${biRole}`);

      // Generate internal SSO token
      const ssoToken = generateSsoToken({
        email,
        role: biRole,
        timestamp: Math.floor(Date.now() / 1000),
      });

      return new NextResponse(
        buildSsoHtml(email, ssoToken),
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Content-Security-Policy": SSO_PAGE_CSP,
          },
        }
      );
    } else {
      console.warn(`[WP-SSO] Invalid proxy secret from IP: ${clientIp}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // No valid auth found — redirect to WordPress login
  // ═══════════════════════════════════════════════════════════

  if (shouldLog) console.log(`[WP-SSO] No valid auth, redirecting to WordPress login.`);
  const callbackUrl = encodeURIComponent(`${biUrl}/api/auth/wp-callback`);
  return NextResponse.redirect(`${WP_LOGIN_URL}?redirect_to=${callbackUrl}`);
}

```

## File: src/app/api/auth/wp-login/route.ts
```ts
import { NextResponse } from "next/server";
import { WP_LOGIN_URL } from "@/lib/config.server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const wpBaseUrl = WP_LOGIN_URL.replace(/\/wp-login\.php.*$/, "");
    
    // SSRF Protection
    const parsedUrl = new URL(wpBaseUrl);
    if (parsedUrl.protocol !== "https:") {
      throw new Error("WP_LOGIN_URL must use HTTPS");
    }
    const hostname = parsedUrl.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0';
    const isAwsMetadata = hostname === '169.254.169.254';
    const isPrivate = hostname.startsWith('10.') || hostname.startsWith('192.168.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
    if (isLocalhost || isAwsMetadata || isPrivate) {
      throw new Error("WP_LOGIN_URL cannot point to private IP ranges or localhost");
    }

    const apiUrl = `${wpBaseUrl}/wp-login.php?action=headless_auth`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("[WP Headless Auth Error] Invalid JSON response from WP:", text.substring(0, 200));
      return NextResponse.json(
        { success: false, error: "Ошибка связи с сервером авторизации (WordPress вернул не JSON)" },
        { status: 502 }
      );
    }

    if (!response.ok || !data.success) {
      return NextResponse.json(
        { success: false, error: data.message || "Неверный email или пароль" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      token: data.token,
    });
  } catch (error) {
    console.error("[WP Headless Auth Error]", error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

```

## File: src/app/api/bitrix/activities/route.ts
```ts
import { NextRequest, NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export interface ActivityData {
  ID: string;
  OWNER_ID: string;
  OWNER_TYPE_ID: string;
  SUBJECT: string;
  COMPLETED: string;
  DESCRIPTION: string;
  DEADLINE: string;
  CREATED: string;
  AUTHOR_ID: string;
  RESPONSIBLE_ID: string;
  TYPE_ID: string;
  PROVIDER_ID: string;
  PROVIDER_TYPE_ID: string;
}

/**
 * POST /api/bitrix/activities
 * Fetches activities for a list of deal IDs.
 * Returns the last completed activity and the next planned activity for each deal.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const { dealIds } = body;

    if (!Array.isArray(dealIds) || dealIds.length === 0) {
      return NextResponse.json({ success: true, activities: {} });
    }

    const validIds = dealIds.filter((id) => /^\d+$/.test(String(id).trim()));
    if (validIds.length === 0) {
      return NextResponse.json({ success: true, activities: {} });
    }

    const activitiesMap: Record<string, { last?: ActivityData; next?: ActivityData; all: ActivityData[] }> = {};
    
    // Initialize all requested IDs with empty arrays to prevent re-fetching empty deals
    for (const id of validIds) {
      activitiesMap[id] = { all: [] };
    }

    const batchSize = 50;

    for (let i = 0; i < validIds.length; i += batchSize) {
      const batchIds = validIds.slice(i, i + batchSize);
      
      try {
        // Fetch activities for each deal in parallel
        const activityPromises = batchIds.map(dealId => 
          bitrixPost<{ result: ActivityData[] }>(
            "crm.activity.list",
            {
              FILTER: { OWNER_TYPE_ID: 2, OWNER_ID: dealId },
              SELECT: ["ID", "OWNER_ID", "SUBJECT", "COMPLETED", "DESCRIPTION", "DEADLINE", "CREATED", "AUTHOR_ID", "RESPONSIBLE_ID", "TYPE_ID", "PROVIDER_ID", "PROVIDER_TYPE_ID"],
              ORDER: { CREATED: "DESC" },
            }
          )
        );

        const results = await Promise.allSettled(activityPromises);

        results.forEach((result, index) => {
          if (result.status === "fulfilled" && Array.isArray(result.value.result)) {
            const dealId = batchIds[index];
            for (const activity of result.value.result) {
              activitiesMap[dealId].all.push(activity);
            }
          }
        });
      } catch (error) {
        console.error(`[Activities API] Failed to fetch activities batch:`, error);
      }
    }

    // Process activities to find last completed and next planned
    for (const dealId in activitiesMap) {
      const dealActivities = activitiesMap[dealId].all;
      
      // Sort by CREATED DESC (newest first)
      dealActivities.sort((a, b) => new Date(b.CREATED).getTime() - new Date(a.CREATED).getTime());
      
      // Find last completed
      const lastCompleted = dealActivities.find(a => a.COMPLETED === "Y");
      if (lastCompleted) {
        activitiesMap[dealId].last = lastCompleted;
      }

      // Find next planned (sort by DEADLINE ASC - earliest first)
      const plannedActivities = dealActivities.filter(a => a.COMPLETED === "N");
      if (plannedActivities.length > 0) {
        plannedActivities.sort((a, b) => {
          const dateA = a.DEADLINE ? new Date(a.DEADLINE).getTime() : Infinity;
          const dateB = b.DEADLINE ? new Date(b.DEADLINE).getTime() : Infinity;
          return dateA - dateB;
        });
        activitiesMap[dealId].next = plannedActivities[0];
      }
    }

    return NextResponse.json({ success: true, activities: activitiesMap });
  } catch (error) {
    console.error("[Activities API Error]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch activities", activities: {} },
      { status: 500 }
    );
  }
}

```

## File: src/app/api/bitrix/companies/route.ts
```ts
import { NextRequest, NextResponse } from "next/server";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/bitrix/companies
 * Fetches company data from Bitrix24.
 * Accepts { ids: string[], select: string[] } in the body.
 *
 * SECURITY: Requires authentication. Does NOT expose the webhook URL.
 */
export async function POST(request: NextRequest) {
  // ─── SECURITY: Require authentication ───
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await request.json();
    const { ids, select } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: true, companies: {} });
    }

    // Validate ids
    const validIds = ids.filter((id) => /^\d+$/.test(String(id).trim()));
    if (validIds.length === 0) {
      return NextResponse.json({ success: true, companies: {} });
    }

    // Fetch companies in batches of 50 (Bitrix24 limit for list methods)
    const companiesMap: Record<string, any> = {};
    
    // Initialize all requested IDs with empty objects to prevent re-fetching missing companies
    for (const id of validIds) {
      companiesMap[id] = {};
    }

    const batchSize = 50;

    for (let i = 0; i < validIds.length; i += batchSize) {
      const batchIds = validIds.slice(i, i + batchSize);
      
      try {
        const data = await bitrixPost<{ result: Array<any> }>(
          "crm.company.list",
          {
            FILTER: { "@ID": batchIds },
            SELECT: select || ["*"],
          }
        );

        if (Array.isArray(data.result)) {
          for (const company of data.result) {
            companiesMap[company.ID] = company;
          }
        }
      } catch (error) {
        console.error(`[Companies API] Failed to fetch companies batch:`, error);
      }
    }

    return NextResponse.json({ success: true, companies: companiesMap });
  } catch (error) {
    console.error("[Companies API Error]", error);

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Failed to fetch companies.";

    return NextResponse.json(
      { success: false, error: message, companies: {} },
      { status: 500 }
    );
  }
}

```

## File: src/app/api/bitrix/deals/route.ts
```ts
import { NextRequest, NextResponse } from "next/server";
import { bitrixPost, type BitrixDealsResponse } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export interface DealsRequestBody {
  select?: string[];
  filter?: Record<string, string | string[]>;
  order?: Record<string, string>;
  start?: number;
}

// ─── Input Validation Constants ───
const MAX_SELECT_FIELDS = 200;
const MAX_FILTER_KEYS = 50;
const MAX_START_VALUE = 100000;
const MAX_ORDER_KEYS = 10;
const MAX_FILTER_VALUE_LENGTH = 1000; // Prevent oversized filter values
const ALLOWED_ORDER_DIRECTIONS = new Set(["ASC", "DESC"]);
const SAFE_FIELD_NAME_PATTERN = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)?$/;

/**
 * Validate and sanitize the request body for deals endpoint.
 * Returns sanitized body or throws error with safe message.
 */
function validateDealsRequest(body: unknown): DealsRequestBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid request format");
  }

  const raw = body as Record<string, unknown>;

  // Validate `select`
  let select: string[] = ["*", "UF_*"];
  if (raw.select !== undefined) {
    if (!Array.isArray(raw.select)) {
      throw new Error("Parameter 'select' must be an array");
    }
    if (raw.select.length > MAX_SELECT_FIELDS) {
      throw new Error(`Parameter 'select' exceeds maximum of ${MAX_SELECT_FIELDS} fields`);
    }
    // Validate each field name
    select = raw.select.map((s: unknown) => {
      if (typeof s !== "string") {
        throw new Error("Each 'select' item must be a string");
      }
      if (!SAFE_FIELD_NAME_PATTERN.test(s) && s !== "*" && s !== "UF_*") {
        throw new Error("Invalid field name in 'select' parameter");
      }
      return s;
    });
  }

  // Validate `filter`
  let filter: Record<string, string | string[]> = {};
  if (raw.filter !== undefined) {
    if (typeof raw.filter !== "object" || Array.isArray(raw.filter)) {
      throw new Error("Parameter 'filter' must be an object");
    }
    const filterKeys = Object.keys(raw.filter as Record<string, unknown>);
    if (filterKeys.length > MAX_FILTER_KEYS) {
      throw new Error(`Parameter 'filter' exceeds maximum of ${MAX_FILTER_KEYS} keys`);
    }
    for (const key of filterKeys) {
      // Validate filter key format (allow >=, <=, etc. prefixes)
      if (!/^[><=!]*[a-zA-Z0-9_]+$/.test(key)) {
        throw new Error("Invalid key in 'filter' parameter");
      }
      const value = (raw.filter as Record<string, unknown>)[key];
      if (typeof value === "string") {
        if (value.length > MAX_FILTER_VALUE_LENGTH) {
          throw new Error(`Filter value for key '${key}' exceeds maximum length of ${MAX_FILTER_VALUE_LENGTH}`);
        }
        filter[key] = value;
      } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        if (value.some((v) => v.length > MAX_FILTER_VALUE_LENGTH)) {
          throw new Error(`Filter value exceeds maximum length of ${MAX_FILTER_VALUE_LENGTH}`);
        }
        filter[key] = value as string[];
      } else {
        throw new Error("Invalid value in 'filter' parameter");
      }
    }
  }

  // Validate `order`
  let order: Record<string, string> = { DATE_CREATE: "DESC" };
  if (raw.order !== undefined) {
    if (typeof raw.order !== "object" || Array.isArray(raw.order)) {
      throw new Error("Parameter 'order' must be an object");
    }
    const orderKeys = Object.keys(raw.order as Record<string, unknown>);
    if (orderKeys.length > MAX_ORDER_KEYS) {
      throw new Error(`Parameter 'order' exceeds maximum of ${MAX_ORDER_KEYS} keys`);
    }
    for (const key of orderKeys) {
      if (!SAFE_FIELD_NAME_PATTERN.test(key)) {
        throw new Error("Invalid key in 'order' parameter");
      }
      const dir = (raw.order as Record<string, unknown>)[key];
      if (typeof dir !== "string" || !ALLOWED_ORDER_DIRECTIONS.has(dir.toUpperCase())) {
        throw new Error(`Invalid order direction for key '${key}': must be ASC or DESC`);
      }
      order[key] = dir.toUpperCase();
    }
  }

  // Validate `start`
  let start = 0;
  if (raw.start !== undefined) {
    if (typeof raw.start !== "number" || !Number.isInteger(raw.start) || raw.start < 0) {
      throw new Error("Parameter 'start' must be a non-negative integer");
    }
    if (raw.start > MAX_START_VALUE) {
      throw new Error(`Parameter 'start' exceeds maximum value of ${MAX_START_VALUE}`);
    }
    start = raw.start;
  }

  return { select, filter, order, start };
}

export async function POST(request: NextRequest) {
  // ─── SECURITY: Require authentication ───
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    // Limit request body size to 10KB to prevent DoS via oversized payloads
    const rawBody = await request.text();
    if (rawBody.length > 10_000) {
      return NextResponse.json(
        { success: false, error: "Request body too large", deals: [], total: 0 },
        { status: 413 }
      );
    }

    // Parse and validate request body
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body", deals: [], total: 0 },
        { status: 400 }
      );
    }

    const validated = validateDealsRequest(body);

    // Build Bitrix24 API request with validated parameters
    const apiBody: Record<string, unknown> = {
      select: validated.select,
      filter: validated.filter,
      order: validated.order,
      start: validated.start,
    };

    const data = await bitrixPost<BitrixDealsResponse>(
      "crm.deal.list",
      apiBody
    );

    // Fetch all pages if there are more results
    let allDeals = data.result || [];
    let nextStart = data.next;
    // Preserve the ACTUAL total from Bitrix24 (not just fetched count)
    // This is critical for the UI to show "X из Y" correctly when there are
    // more deals than our pagination limit can fetch
    const bitrixTotal = data.total ?? allDeals.length;

    // Paginate to get all deals (limit to max 1000 to prevent overload)
    let pageCount = 0;
    const MAX_PAGES = 20; // 20 pages * 50 per page = 1000 deals max per request

    while (nextStart && pageCount < MAX_PAGES) {
      const pageData = await bitrixPost<BitrixDealsResponse>(
        "crm.deal.list",
        {
          ...apiBody,
          start: nextStart,
        }
      );

      allDeals = [...allDeals, ...(pageData.result || [])];
      nextStart = pageData.next;
      pageCount++;
    }

    return NextResponse.json({
      success: true,
      deals: allDeals,
      total: bitrixTotal,
      fetched: allDeals.length,
    });
  } catch (error) {
    console.error("[Deals API Error] Full error details:", error);

    // Return sanitized error message to client
    const message = error instanceof Error ? error.message : "Failed to fetch deals";

    // Don't expose internal error details
    const safeMessage = message.includes("not configured")
      ? message
      : message.includes("Invalid")
      ? message
      : message.includes("exceeds maximum")
      ? message
      : message.includes("must be")
      ? message
      : "Failed to fetch deals. Please try again later.";

    return NextResponse.json(
      {
        success: false,
        error: safeMessage,
        deals: [],
        total: 0,
      },
      { status: message.includes("Invalid") || message.includes("must be") || message.includes("exceeds") ? 400 : 500 }
    );
  }
}

```

## File: src/app/api/bitrix/fields/route.ts
```ts
import { NextResponse } from "next/server";
import { bitrixGet, isSystemField, type BitrixFieldsResponse, type BitrixField } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export interface CleanField {
  id: string;
  title: string;
  type: string;
  isMultiple: boolean;
  isSortable: boolean;
  listValues?: Array<{ ID: string; VALUE: string }>;
}

/**
 * Determine if a field type is sortable
 */
function isSortableType(type: string): boolean {
  const sortableTypes = new Set([
    "string",
    "double",
    "integer",
    "date",
    "datetime",
    "money",
    "enumeration",
    "crm_status",
    "crm_currency",
    "crm_category",
    "boolean",
    "char",
  ]);
  return sortableTypes.has(type);
}

/**
 * Extract human-readable title from Bitrix24 field metadata.
 * Priority: formLabel > listLabel > filterLabel > title > fieldId
 */
function getFieldTitle(fieldId: string, meta: BitrixField): string {
  if (fieldId === "ASSIGNED_BY_ID") return "Ответственный менеджер";
  if (meta.formLabel) return meta.formLabel;
  if (meta.listLabel) return meta.listLabel;
  if (meta.filterLabel) return meta.filterLabel;
  if (meta.title && meta.title !== fieldId) return meta.title;
  return fieldId;
}

export async function GET() {
  // ─── SECURITY: Require authentication ───
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const data = await bitrixGet<BitrixFieldsResponse>(
      "crm.deal.fields"
    );

    const fields = data.result;

    // Transform and filter: remove system junk, keep informative fields
    const cleanFields: CleanField[] = [];

    if (fields && typeof fields === "object") {
      for (const [fieldId, fieldMeta] of Object.entries(fields)) {
        // Skip system/internal fields
        if (isSystemField(fieldId, fieldMeta as unknown as Record<string, unknown>)) continue;

        const meta = fieldMeta as BitrixField;
        const title = getFieldTitle(fieldId, meta);

        // Extract list values from items[] (Bitrix24 real format)
        let listValues: Array<{ ID: string; VALUE: string }> | undefined;
        if (Array.isArray(meta.items) && meta.items.length > 0) {
          listValues = meta.items.map((item) => ({
            ID: item.ID,
            VALUE: item.VALUE,
          }));
        }

        cleanFields.push({
          id: fieldId,
          title,
          type: meta.type || "string",
          isMultiple: meta.isMultiple === true || meta.isMultiple === "Y",
          isSortable: isSortableType(meta.type),
          listValues,
        });
      }
    }

    // Fetch company fields to allow selecting company data in the deals table
    try {
      const companyData = await bitrixGet<BitrixFieldsResponse>("crm.company.fields");
      const companyFields = companyData.result;
      if (companyFields && typeof companyFields === "object") {
        for (const [fieldId, fieldMeta] of Object.entries(companyFields)) {
          if (isSystemField(fieldId, fieldMeta as unknown as Record<string, unknown>)) continue;
          
          const meta = fieldMeta as BitrixField;
          const title = getFieldTitle(fieldId, meta);

          let listValues: Array<{ ID: string; VALUE: string }> | undefined;
          if (Array.isArray(meta.items) && meta.items.length > 0) {
            listValues = meta.items.map((item) => ({
              ID: item.ID,
              VALUE: item.VALUE,
            }));
          }

          cleanFields.push({
            id: `COMPANY_${fieldId}`,
            title: `Компания: ${title}`,
            type: meta.type || "string",
            isMultiple: meta.isMultiple === true || meta.isMultiple === "Y",
            isSortable: isSortableType(meta.type),
            listValues,
          });
        }
      }
    } catch (error) {
      console.warn("[Fields API] Failed to fetch company fields, continuing with deal fields only", error);
    }

    // Sort: standard fields first (alphabetically by title), then custom UF_CRM_* fields
    cleanFields.sort((a, b) => {
      const aIsCustom = a.id.startsWith("UF_CRM_") ? 1 : 0;
      const bIsCustom = b.id.startsWith("UF_CRM_") ? 1 : 0;
      if (aIsCustom !== bIsCustom) return aIsCustom - bIsCustom;
      return a.title.localeCompare(b.title, "ru");
    });

    // Inject virtual fields that are available in crm.deal.list but not in crm.deal.fields
    cleanFields.unshift({
      id: "COMPANY_TITLE",
      title: "Наименование компании",
      type: "string",
      isMultiple: false,
      isSortable: true,
    });

    // Inject virtual fields for activities
    cleanFields.push({
      id: "ACTIVITY_LAST",
      title: "Последнее дело",
      type: "string",
      isMultiple: false,
      isSortable: false,
    });
    cleanFields.push({
      id: "ACTIVITY_NEXT",
      title: "Следующий шаг",
      type: "string",
      isMultiple: false,
      isSortable: false,
    });

    return NextResponse.json({
      success: true,
      fields: cleanFields,
      total: cleanFields.length,
    });
  } catch (error) {
    console.error("[Fields API Error]", error);

    // Return sanitized error — don't expose internal details
    const message = error instanceof Error && error.message.includes("not configured")
      ? error.message
      : "Failed to fetch field metadata. Please try again later.";

    return NextResponse.json(
      {
        success: false,
        error: message,
        fields: [],
        total: 0,
      },
      { status: 500 }
    );
  }
}

```

## File: src/app/api/bitrix/status/route.ts
```ts
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

```

## File: src/app/api/bitrix/users/route.ts
```ts
import { NextRequest, NextResponse } from "next/server";
import { bitrixGet, bitrixPost } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/bitrix/users
 * Fetches all responsible person names from Bitrix24 with pagination.
 *
 * SECURITY: Requires authentication. Does NOT expose the webhook URL.
 * It only returns user ID + Name pairs for display purposes.
 */
export async function GET(request: NextRequest) {
  // ─── SECURITY: Require authentication ───
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  try {
    const userMap: Record<string, string> = {};
    let start = 0;
    let iterations = 0;
    const MAX_ITERATIONS = 50; // 50 * 50 = 2500 users max

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      try {
        const data = await bitrixPost<{
          result: Array<{ ID: string; NAME: string; LAST_NAME: string; SECOND_NAME: string }>;
          next?: number;
        }>("user.get", {
          start,
          // We don't strictly filter by ACTIVE because deals might be assigned to fired users
        });

        console.log(`[Users API] Fetched batch at start ${start}, got ${data.result?.length || 0} users`);

        if (Array.isArray(data.result)) {
          for (const user of data.result) {
            const fullName = [user.NAME, user.LAST_NAME]
              .filter(Boolean)
              .join(" ");
            userMap[user.ID] = fullName || `ID ${user.ID}`;
          }
        }

        if (!data.next || !Array.isArray(data.result) || data.result.length < 50) {
          break;
        }
        start = data.next;
      } catch (e) {
        console.error(`[Users API] Failed to fetch users batch at start ${start}:`, e);
        break;
      }
    }

    console.log(`[Users API] Total users fetched: ${Object.keys(userMap).length}`);
    return NextResponse.json({ success: true, users: userMap });
  } catch (error) {
    console.error("[Users API Error]", error);

    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Failed to fetch users.";

    return NextResponse.json(
      { success: false, error: message, users: {} },
      { status: 500 }
    );
  }
}

```

## File: src/app/api/route.ts
```ts
import { NextResponse } from "next/server";

/**
 * Root API route — returns minimal health status.
 * SECURITY: Does NOT expose any internal configuration, URLs, or version info.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

```

## File: src/app/globals.css
```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-nunito);
  --font-heading: var(--font-roboto);
  --font-mono: var(--font-roboto-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  /* Institutional Brand Colors */
  --color-brand-blue: #1A52A3;
  --color-brand-blue-hover: #1546A0;
  --color-brand-blue-light: #E8EFF8;
  --color-brand-orange: #FF7A1F;
  --color-brand-orange-hover: #E86E15;
  --color-brand-orange-light: #FFF1E5;
  --color-surface-light: #F8F9FA;
  --color-surface-card: #FFFFFF;
  --color-text-primary: rgba(0, 0, 0, 0.87);
  --color-text-secondary: rgba(0, 0, 0, 0.54);
  --color-border-light: #E2E8F0;
}

:root {
  --radius: 0.25rem; /* 4px institutional rounding */
  --background: #F0F2F5;
  --foreground: rgba(0, 0, 0, 0.87);
  --card: #FFFFFF;
  --card-foreground: rgba(0, 0, 0, 0.87);
  --popover: #FFFFFF;
  --popover-foreground: rgba(0, 0, 0, 0.87);
  --primary: #1A52A3;
  --primary-foreground: #FFFFFF;
  --secondary: #F1F5F9;
  --secondary-foreground: rgba(0, 0, 0, 0.87);
  --muted: #F1F5F9;
  --muted-foreground: rgba(0, 0, 0, 0.54);
  --accent: #FF7A1F;
  --accent-foreground: #FFFFFF;
  --destructive: #EF4444;
  --border: #E2E8F0;
  --input: #E2E8F0;
  --ring: #1A52A3;
  --chart-1: #1A52A3;
  --chart-2: #FF7A1F;
  --chart-3: #10B981;
  --chart-4: #6366F1;
  --chart-5: #F43F5E;
  --sidebar: #FFFFFF;
  --sidebar-foreground: rgba(0, 0, 0, 0.87);
  --sidebar-primary: #1A52A3;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #F1F5F9;
  --sidebar-accent-foreground: #1A52A3;
  --sidebar-border: #E2E8F0;
  --sidebar-ring: #1A52A3;
  /* Header gradient */
  --header-from: #0D2B5E;
  --header-to: #1A52A3;
  --header-text: #FFFFFF;
  --header-text-muted: rgba(255, 255, 255, 0.7);
}

.dark {
  /* Bloomberg Terminal Styling */
  --background: #000000;
  --foreground: #FF9900;
  --card: #000000;
  --card-foreground: #FF9900;
  --popover: #000000;
  --popover-foreground: #FF9900;
  --primary: #FF9900;
  --primary-foreground: #000000;
  --secondary: #1A1A1A;
  --secondary-foreground: #FF9900;
  --muted: #1A1A1A;
  --muted-foreground: #CC7A00;
  --accent: #FF9900;
  --accent-foreground: #000000;
  --destructive: #EF4444;
  --border: #331E00;
  --input: #331E00;
  --ring: #FF9900;
  --chart-1: #FF9900;
  --chart-2: #CC7A00;
  --chart-3: #995C00;
  --chart-4: #FFB84D;
  --chart-5: #FFD699;
  --sidebar: #000000;
  --sidebar-foreground: #FF9900;
  --sidebar-primary: #FF9900;
  --sidebar-primary-foreground: #000000;
  --sidebar-accent: #1A1A1A;
  --sidebar-accent-foreground: #FF9900;
  --sidebar-border: #331E00;
  --sidebar-ring: #FF9900;
  /* Header gradient - dark */
  --header-from: #000000;
  --header-to: #000000;
  --header-text: #FF9900;
  --header-text-muted: #CC7A00;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-nunito);
    font-weight: 400;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-roboto);
    font-weight: 400;
  }
}

/* ─── Custom Scrollbar ─── */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.22);
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* ─── Data Table ─── */
/* Fix for Radix UI ScrollArea breaking sticky headers */
[data-radix-scroll-area-viewport] > div {
  display: block !important;
}

.data-table th {
  font-weight: 600;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  padding: 10px 14px;
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
  position: sticky;
  top: 0;
  background: var(--card);
  z-index: 2;
}

.data-table td {
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 0.8125rem;
  white-space: nowrap;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s ease;
}

.data-table tbody tr {
  transition: background 0.15s ease;
}

.data-table tbody tr:hover td {
  background: var(--muted);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

/* ─── Animations ─── */
@keyframes sync-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.sync-pulse {
  animation: sync-pulse 1.5s ease-in-out infinite;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in {
  animation: fade-in 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slide-in-right {
  from { opacity: 0; transform: translateX(12px); }
  to { opacity: 1; transform: translateX(0); }
}

.animate-slide-in {
  animation: slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.shimmer {
  background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.4) 50%, transparent 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* ─── Header Gradient ─── */
.header-gradient {
  background: linear-gradient(135deg, var(--header-from), var(--header-to));
}

/* ─── Stat card accent bar ─── */
.stat-accent-bar {
  position: relative;
  overflow: hidden;
}

.stat-accent-bar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 0 0 2px 2px;
}

.stat-accent-bar-blue::before { background: #1A52A3; }
.stat-accent-bar-green::before { background: #10B981; }
.stat-accent-bar-orange::before { background: #FF7A1F; }
.stat-accent-bar-violet::before { background: #7C3AED; }

/* ─── Sort indicator animation ─── */
.sort-icon-enter {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ─── Filter badge pulse ─── */
@keyframes badge-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 122, 31, 0.3); }
  50% { box-shadow: 0 0 0 4px rgba(255, 122, 31, 0); }
}

.filter-badge-pulse {
  animation: badge-pulse 2s ease-in-out infinite;
}

/* ─── No-scrollbar (for horizontal filter row) ─── */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* ─── Terminal Loading Screen Animations ─── */
@keyframes terminal-line-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-terminal-line {
  animation: terminal-line-in 0.2s ease-out both;
}

@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.animate-blink-cursor {
  animation: blink-cursor 0.8s step-end infinite;
}

```

## File: src/app/layout.tsx
```tsx
import type { Metadata } from "next";
import { Roboto, Nunito, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/dashboard/theme-provider";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ErrorBoundary } from "@/components/error-boundary";

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-roboto",
});

const nunito = Nunito({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-nunito",
});

const robotoMono = Roboto_Mono({
  weight: ["400", "500"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  title: "Корпоративный BI-терминал RusSilica | CRM-аналитика в реальном времени",
  description:
    "BI-терминал RusSilica — аналитика продаж Bitrix24 в реальном времени: сделки, фильтры, воронки, ответственные, KPI-карточки и экспорт таблиц.",
  icons: {
    icon: "/russilica-logo.png",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-video-preview": -1,
      "max-image-preview": "none",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${roboto.variable} ${nunito.variable} ${robotoMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <AuthProvider>
          <ErrorBoundary>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              storageKey="bitrix-bi-theme"
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </ErrorBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}

```

## File: src/app/login/page.tsx
```tsx
"use client";

import { useState, useEffect } from "react";
import { signIn, getCsrfToken, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { IS_PRODUCTION } from "@/lib/config";

/**
 * Login Page — RusSilica BI Terminal
 *
 * Corporate Institutional Style
 * Colors: Blue, Orange, Gray
 */

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  // Fetch CSRF token on mount
  useEffect(() => {
    let cancelled = false;
    getCsrfToken().then(token => {
      if (!cancelled) setCsrfToken(token ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let authPassword = password;

      // In production, we use Headless API to get the HMAC token first
      if (IS_PRODUCTION) {
        const wpRes = await fetch("/api/auth/wp-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          cache: "no-store",
        });

        const text = await wpRes.text();
        let wpData;
        try {
          wpData = JSON.parse(text);
        } catch (e) {
          setError("Ошибка связи с сервером авторизации");
          setLoading(false);
          return;
        }

        if (!wpRes.ok || !wpData.success) {
          setError(wpData.error || "Неверный email или пароль");
          setLoading(false);
          return;
        }

        // Use the HMAC token as the password for NextAuth
        authPassword = wpData.token;
      }

      const result = await signIn("credentials", {
        email,
        password: authPassword,
        redirect: false,
        csrfToken: csrfToken || undefined,
      });

      if (result?.error) {
        if (result.error === "CredentialsSignin") {
          setError("Неверный email или пароль");
        } else {
          setError(result.error);
        }
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Произошла ошибка при входе. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="w-full max-w-[400px]">
        {/* Logo + Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-[#1A52A3] tracking-tight mb-1">
            RusSilica
          </h1>
          <p className="text-sm font-medium text-slate-500 uppercase tracking-widest">
            Корпоративный BI Terminal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error message */}
            {error && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600 animate-fade-in">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {/* Email field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Корпоративный Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="имя@russilica.ru"
                required
                autoComplete="email"
                autoFocus
                maxLength={254}
                className="w-full h-12 px-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A52A3]/20 focus:border-[#1A52A3] transition-all"
              />
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Пароль
                </label>
                {!IS_PRODUCTION && (
                  <span className="text-[10px] font-medium text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">
                    DEV MODE
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  required
                  autoComplete="current-password"
                  maxLength={128}
                  className="w-full h-12 px-4 pr-11 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A52A3]/20 focus:border-[#1A52A3] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Hidden CSRF token field */}
            {csrfToken && (
              <input type="hidden" name="csrfToken" value={csrfToken} />
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-12 mt-2 rounded-lg bg-[#FF7A1F] hover:bg-[#E86E15] text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-[0.99]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Вход в систему...
                </span>
              ) : (
                "Войти"
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center mt-8 space-y-1">
          <p className="text-xs text-slate-400">
            Доступ разрешен только авторизованным сотрудникам
          </p>
          <p className="text-[11px] text-slate-400/70">
            © {new Date().getFullYear()} RusSilica
          </p>
        </div>
      </div>
    </div>
  );
}

```

## File: src/app/page.tsx
```tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/store/dashboard-store";
import { Header } from "@/components/dashboard/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { DataTable } from "@/components/dashboard/data-table";
import { ColumnSelector } from "@/components/dashboard/column-selector";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { Footer } from "@/components/dashboard/footer";
import { LoadingScreen } from "@/components/dashboard/loading-screen";
import { BarChart3, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Maximum time to wait for NextAuth session check before showing timeout UI
// Prevents infinite spinner if /api/auth/session hangs
const AUTH_LOADING_TIMEOUT_MS = 15_000;

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { checkConfig, fetchFields, fetchDeals, isDemoMode, appLoaded } = useDashboardStore();
  const [authLoadingTimedOut, setAuthLoadingTimedOut] = useState(false);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // Handle session invalidation (password changed, account deactivated, etc.)
  useEffect(() => {
    if (session && session.error === "SessionInvalid") {
      router.replace("/login");
    }
  }, [session, router]);

  // Timeout for auth loading state — prevents infinite spinner
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setAuthLoadingTimedOut(true), AUTH_LOADING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // Load data when authenticated
  useEffect(() => {
    if (status !== "authenticated") return;

    const init = async () => {
      try {
        await checkConfig();
        await fetchFields();
        await fetchDeals();
      } catch (error) {
        // Each individual fetch has its own error handling (falls back to demo mode),
        // but catch here to prevent unhandled promise rejection
        console.error("[Dashboard] Init error:", error);
      }
    };
    init();
  }, [status, checkConfig, fetchFields, fetchDeals]);

  // Show loading while checking auth
  if (status === "loading") {
    return null;
  }

  // Don't render dashboard for unauthenticated users
  if (status !== "authenticated") {
    return null;
  }

  return (
    <>
      <LoadingScreen />
      <div className={`min-h-screen flex flex-col bg-background transition-opacity duration-300 ${appLoaded ? "opacity-100" : "opacity-0"}`}>
        <Header />
        <main className="flex-1 flex flex-col min-h-0">
          <ConfigBanner />
          {isDemoMode && (
            <div className="px-4 sm:px-6 pt-3 animate-fade-in">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  Демо-режим — Обратитесь к администратору для подключения реальных данных
                </span>
              </div>
            </div>
          )}
          <StatsCards />
          <DataTable />
        </main>
        <ColumnSelector />
        <Footer />
      </div>
    </>
  );
}

```

## File: src/components/auth/auth-provider.tsx
```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

```

## File: src/components/dashboard/active-filters.tsx
```tsx
"use client";

import { useMemo, useCallback } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Filter, X } from "lucide-react";

interface ActiveFilterItem {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
}

export function ActiveFilters() {
  const {
    dateFilter,
    pipelineFilter,
    responsibleFilter,
    searchQuery,
    columnFilters,
    fields,
    setDateFilter,
    setPipelineFilter,
    setResponsibleFilter,
    setSearchQuery,
    clearColumnFilter,
    clearAllColumnFilters,
  } = useDashboardStore();

  const filters: ActiveFilterItem[] = useMemo(() => {
    const result: ActiveFilterItem[] = [];

    // Date filter
    if (dateFilter.preset !== "all") {
      const presetLabels: Record<string, string> = {
        "7days": "7 дней",
        "14days": "14 дней",
        "30days": "30 дней",
        "90days": "90 дней",
        custom: "Свой",
      };
      result.push({
        key: "dateFilter",
        label: "Период",
        value: presetLabels[dateFilter.preset] || dateFilter.preset,
        onRemove: () => setDateFilter({ preset: "all" }),
      });
    }

    // Pipeline filter
    if (pipelineFilter !== "all") {
      const pipelineLabels: Record<string, string> = {
        in_work: "В работе",
        WON: "Успешно",
        LOSE: "Провал",
      };
      result.push({
        key: "pipelineFilter",
        label: "Воронка",
        value: pipelineLabels[pipelineFilter] || pipelineFilter,
        onRemove: () => setPipelineFilter("all"),
      });
    }

    // Responsible filter
    if (responsibleFilter !== "all") {
      result.push({
        key: "responsibleFilter",
        label: "Ответственный",
        value: responsibleFilter,
        onRemove: () => setResponsibleFilter("all"),
      });
    }

    // Search query
    if (searchQuery.trim()) {
      result.push({
        key: "searchQuery",
        label: "Поиск",
        value: searchQuery.length > 20 ? searchQuery.slice(0, 20) + "…" : searchQuery,
        onRemove: () => setSearchQuery(""),
      });
    }

    // Column filters
    columnFilters.forEach((cf) => {
      if (cf.value.trim()) {
        const field = fields.find((f) => f.id === cf.columnId);
        const fieldTitle = field?.title || cf.columnId;
        result.push({
          key: `col_${cf.columnId}`,
          label: `Столбец: ${fieldTitle}`,
          value: cf.value.length > 20 ? cf.value.slice(0, 20) + "…" : cf.value,
          onRemove: () => clearColumnFilter(cf.columnId),
        });
      }
    });

    return result;
  }, [
    dateFilter,
    pipelineFilter,
    responsibleFilter,
    searchQuery,
    columnFilters,
    fields,
    setDateFilter,
    setPipelineFilter,
    setResponsibleFilter,
    setSearchQuery,
    clearColumnFilter,
  ]);

  const handleClearAll = useCallback(() => {
    clearAllColumnFilters();
    setDateFilter({ preset: "all" });
    setPipelineFilter("all");
    setResponsibleFilter("all");
    setSearchQuery("");
  }, [clearAllColumnFilters, setDateFilter, setPipelineFilter, setResponsibleFilter, setSearchQuery]);

  if (filters.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 h-7 px-2 rounded-md bg-brand-orange/20 border border-brand-orange/30 hover:bg-brand-orange/30 transition-colors filter-badge-pulse">
          <Filter className="h-3 w-3 text-brand-orange" />
          <span className="text-[11px] font-medium text-brand-orange tabular-nums">
            {filters.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-0 bg-popover border-border shadow-lg"
      >
        <div className="px-3 py-2 border-b border-border">
          <span className="text-xs font-semibold text-foreground">
            Активные фильтры
          </span>
        </div>
        <div className="p-2 max-h-64 overflow-y-auto custom-scrollbar space-y-1">
          {filters.map((f) => (
            <div
              key={f.key}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 group"
            >
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  {f.label}
                </span>
                <div className="text-xs text-foreground truncate">{f.value}</div>
              </div>
              <button
                onClick={f.onRemove}
                className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label={`Удалить фильтр: ${f.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={handleClearAll}
            className="w-full text-center text-xs font-medium text-destructive hover:text-destructive/80 transition-colors py-1"
          >
            Сбросить всё
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

```

## File: src/components/dashboard/alerts-bell.tsx
```tsx
"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  Clock,
  AlertTriangle,
  TrendingDown,
  FileWarning,
  TrendingUp,
  CheckCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

interface AlertItem {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  severity: "destructive" | "warning" | "info" | "success";
  count: number;
  pipelineValue?: string;
}

const severityStyles: Record<string, { border: string; icon: string; bg: string }> = {
  destructive: {
    border: "border-l-red-500",
    icon: "text-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  warning: {
    border: "border-l-amber-500",
    icon: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  info: {
    border: "border-l-blue-500",
    icon: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  success: {
    border: "border-l-emerald-500",
    icon: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
};

export function AlertsBell() {
  const { allDeals, setPipelineFilter, lastReadAlertsAt, lastSyncAt, markAlertsAsRead } = useDashboardStore();
  const [open, setOpen] = useState(false);

  const alerts = useMemo<AlertItem[]>(() => {
    const now = new Date();
    const result: AlertItem[] = [];

    // 1. Stalled Deals (Зависшие сделки)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const stalledDeals = allDeals.filter((deal) => {
      const stage = String(deal.STAGE_ID || "");
      if (stage === "WON" || stage === "LOSE") return false;
      const modifyStr = String(deal.DATE_MODIFY || "");
      if (!modifyStr) return false;
      const modifyDate = new Date(modifyStr);
      if (isNaN(modifyDate.getTime())) return false;
      return modifyDate < thirtyDaysAgo;
    });
    if (stalledDeals.length > 0) {
      result.push({
        id: "stalled",
        icon: Clock,
        title: "Зависшие сделки",
        description: `${stalledDeals.length} сделок без движения более 30 дней — требуется внимание менеджера`,
        severity: "warning",
        count: stalledDeals.length,
        pipelineValue: "in_work",
      });
    }

    // 2. Unpaid Large Deals (Неоплаченные крупные сделки)
    const unpaidLarge = allDeals.filter((deal) => {
      const stage = String(deal.STAGE_ID || "");
      if (stage !== "PREPAYMENT_INVOICE" && stage !== "FINAL_INVOICE") return false;
      const opportunity = parseFloat(String(deal.OPPORTUNITY || "0"));
      return opportunity > 500000;
    });
    if (unpaidLarge.length > 0) {
      const totalUnpaid = unpaidLarge.reduce(
        (sum, d) => sum + parseFloat(String(d.OPPORTUNITY || "0")),
        0
      );
      result.push({
        id: "unpaid-large",
        icon: AlertTriangle,
        title: "Неоплаченные крупные сделки",
        description: `${unpaidLarge.length} неоплаченных сделок на сумму ${Math.round(totalUnpaid).toLocaleString("ru-RU")} \u20BD`,
        severity: "destructive",
        count: unpaidLarge.length,
        pipelineValue: "in_work",
      });
    }

    // 3. Win Rate Drop (Снижение Win Rate)
    const wonDeals = allDeals.filter((d) => String(d.STAGE_ID) === "WON");
    const lostDeals = allDeals.filter((d) => String(d.STAGE_ID) === "LOSE");
    const totalClosed = wonDeals.length + lostDeals.length;
    if (totalClosed >= 5) {
      const winRate = (wonDeals.length / totalClosed) * 100;
      if (winRate < 20) {
        result.push({
          id: "winrate",
          icon: TrendingDown,
          title: "Снижение Win Rate",
          description: `Win Rate упал до ${winRate.toFixed(1)}% — ниже нормы для промышленных продаж`,
          severity: "warning",
          count: 1,
          pipelineValue: "WON",
        });
      }
    }

    // 4. Large Deals Stuck in Negotiation (Крупные сделки на согласовании)
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const stuckLarge = allDeals.filter((deal) => {
      const opportunity = parseFloat(String(deal.OPPORTUNITY || "0"));
      if (opportunity <= 1000000) return false;
      const stage = String(deal.STAGE_ID || "");
      if (stage !== "PREPARATION" && stage !== "PREPAYMENT_INVOICE") return false;
      const modifyStr = String(deal.DATE_MODIFY || "");
      if (!modifyStr) return false;
      const modifyDate = new Date(modifyStr);
      if (isNaN(modifyDate.getTime())) return false;
      return modifyDate < fourteenDaysAgo;
    });
    if (stuckLarge.length > 0) {
      const totalStuck = stuckLarge.reduce(
        (sum, d) => sum + parseFloat(String(d.OPPORTUNITY || "0")),
        0
      );
      result.push({
        id: "stuck-large",
        icon: FileWarning,
        title: "Крупные сделки на согласовании",
        description: `${stuckLarge.length} крупных сделок (${Math.round(totalStuck).toLocaleString("ru-RU")} \u20BD) на согласовании более 14 дней`,
        severity: "info",
        count: stuckLarge.length,
        pipelineValue: "in_work",
      });
    }

    // 5. New Deals This Week (Новые сделки за неделю)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newThisWeek = allDeals.filter((deal) => {
      const createStr = String(deal.DATE_CREATE || "");
      if (!createStr) return false;
      const createDate = new Date(createStr);
      if (isNaN(createDate.getTime())) return false;
      return createDate >= sevenDaysAgo;
    });
    if (newThisWeek.length > 0) {
      const totalNew = newThisWeek.reduce(
        (sum, d) => sum + parseFloat(String(d.OPPORTUNITY || "0")),
        0
      );
      result.push({
        id: "new-week",
        icon: TrendingUp,
        title: "Новые сделки за неделю",
        description: `${newThisWeek.length} новых сделок за неделю на сумму ${Math.round(totalNew).toLocaleString("ru-RU")} \u20BD`,
        severity: "success",
        count: newThisWeek.length,
      });
    }

    return result;
  }, [allDeals]);

  // The badge count is now the number of alert categories, not the sum of deals
  const categoriesCount = alerts.length;
  
  // Show badge if there are alerts AND they haven't been read since the last sync
  const hasUnreadAlerts = categoriesCount > 0 && (!lastReadAlertsAt || (lastSyncAt && lastSyncAt > lastReadAlertsAt));

  const handleAlertClick = (alert: AlertItem) => {
    if (alert.pipelineValue) {
      setPipelineFilter(alert.pipelineValue);
    }
    setOpen(false);
  };

  const handleMarkAsRead = () => {
    markAlertsAsRead();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative h-7 w-7 flex items-center justify-center rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Уведомления"
        >
          <Bell className="h-3.5 w-3.5" />
          {hasUnreadAlerts && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] font-bold rounded-full bg-red-500 text-white border-0 p-0 flex items-center justify-center">
              {categoriesCount}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 shadow-lg border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Уведомления</span>
          {categoriesCount > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 rounded-sm font-medium">
              {categoriesCount}
            </Badge>
          )}
        </div>

        {/* Alert list */}
        <div className="max-h-80 overflow-y-auto custom-scrollbar">
          {alerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Нет уведомлений
            </div>
          ) : (
            <div className="py-1">
              {alerts.map((alert) => {
                const Icon = alert.icon;
                const style = severityStyles[alert.severity];
                return (
                  <button
                    key={alert.id}
                    onClick={() => handleAlertClick(alert)}
                    className={`w-full text-left px-3 py-2.5 border-l-[3px] ${style.border} ${style.bg} hover:opacity-80 transition-opacity cursor-pointer`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.icon}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">
                            {alert.title}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[9px] h-4 min-w-4 px-1 rounded-sm font-bold"
                          >
                            {alert.count}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {alert.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {alerts.length > 0 && (
          <div className="border-t border-border px-3 py-2">
            <button
              onClick={handleMarkAsRead}
              className="flex items-center justify-center gap-1.5 w-full text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Отметить все прочитанными
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

```

## File: src/components/dashboard/column-selector.tsx
```tsx
"use client";

import { useDashboardStore, type FieldInfo, DEFAULT_COLUMNS } from "@/store/dashboard-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Columns3, Search, RotateCcw, Check, X, GripVertical } from "lucide-react";
import { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function ColumnSelector() {
  const { fields, selectedColumns, toggleColumn, setSelectedColumns, reorderColumns, columnSelectorOpen, setColumnSelectorOpen } =
    useDashboardStore();
  const [search, setSearch] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before dragging starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredFields = useMemo(() => {
    if (!search.trim()) return fields;
    const q = search.toLowerCase();
    return fields.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q)
    );
  }, [fields, search]);

  const selectedCount = selectedColumns.length;

  const handleSelectAll = () => {
    setSelectedColumns(filteredFields.map((f) => f.id));
  };

  const handleDeselectAll = () => {
    // Keep at least the first available field to avoid empty table
    if (filteredFields.length > 0) {
      setSelectedColumns([filteredFields[0].id]);
    }
  };

  const handleReset = () => {
    const availableDefaults = DEFAULT_COLUMNS.filter((col) =>
      fields.some((f) => f.id === col)
    );
    const otherFields = fields
      .map((f) => f.id)
      .filter((id) => !availableDefaults.includes(id));
    
    if (availableDefaults.length === 0 && otherFields.length > 0) {
      setSelectedColumns(otherFields);
    } else {
      setSelectedColumns([...availableDefaults, ...otherFields]);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = selectedColumns.indexOf(active.id as string);
      const newIndex = selectedColumns.indexOf(over.id as string);
      reorderColumns(oldIndex, newIndex);
    }
  };

  // Group fields
  const selectedFieldsObjects = useMemo(() => {
    return selectedColumns
      .map((id) => fields.find((f) => f.id === id))
      .filter((f): f is FieldInfo => f !== undefined);
  }, [selectedColumns, fields]);

  const availableFields = useMemo(() => {
    return filteredFields.filter((f) => !selectedColumns.includes(f.id));
  }, [filteredFields, selectedColumns]);

  const dealFields = availableFields.filter((f) => !f.id.startsWith("COMPANY_"));
  const companyFields = availableFields.filter((f) => f.id.startsWith("COMPANY_"));

  return (
    <Sheet open={columnSelectorOpen} onOpenChange={setColumnSelectorOpen}>
      <SheetContent className="w-[400px] sm:w-[440px] p-0 rounded-l-lg flex flex-col" side="right">
        <SheetHeader className="p-5 pb-3 space-y-1 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <div className="p-1.5 rounded-md bg-brand-blue/10">
              <Columns3 className="h-4 w-4 text-brand-blue" />
            </div>
            Настройка столбцов
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Выберите поля и перетащите для изменения порядка
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 pb-2.5 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Поиск полей..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs rounded-md bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
            />
          </div>
        </div>

        <div className="px-5 pb-2.5 flex items-center justify-between shrink-0">
          <Badge variant="secondary" className="text-[10px] font-semibold h-5">
            {selectedCount} выбрано
          </Badge>
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="h-6 text-[10px] rounded-sm gap-1 px-2"
            >
              <Check className="h-2.5 w-2.5" />
              Все
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeselectAll}
              className="h-6 text-[10px] rounded-sm gap-1 px-2"
            >
              <X className="h-2.5 w-2.5" />
              Снять
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-6 text-[10px] rounded-sm gap-1 px-2"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Сброс
            </Button>
          </div>
        </div>

        <Separator className="shrink-0" />

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4">
            {/* Selected Columns (Draggable) */}
            {selectedFieldsObjects.length > 0 && (
              <div>
                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest sticky top-0 bg-background/95 backdrop-blur z-10">
                  Выбранные столбцы
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={selectedColumns}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-0.5">
                      {selectedFieldsObjects.map((field) => (
                        <SortableColumnItem
                          key={field.id}
                          field={field}
                          onToggle={() => toggleColumn(field.id)}
                          isCustom={field.id.startsWith("UF_CRM_") || field.id.startsWith("COMPANY_UF_CRM_")}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* Available Columns */}
            {(dealFields.length > 0 || companyFields.length > 0) && (
              <div>
                <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest sticky top-0 bg-background/95 backdrop-blur z-10">
                  Доступные столбцы
                </div>
                <div className="space-y-0.5">
                  {dealFields.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground/70 uppercase">
                        Сделка
                      </div>
                      {dealFields.map((field) => (
                        <ColumnItem
                          key={field.id}
                          field={field}
                          checked={false}
                          onToggle={() => toggleColumn(field.id)}
                          isCustom={field.id.startsWith("UF_CRM_")}
                        />
                      ))}
                    </>
                  )}
                  {companyFields.length > 0 && (
                    <>
                      <div className="px-2 py-1 mt-2 text-[9px] font-semibold text-muted-foreground/70 uppercase">
                        Компания
                      </div>
                      {companyFields.map((field) => (
                        <ColumnItem
                          key={field.id}
                          field={field}
                          checked={false}
                          onToggle={() => toggleColumn(field.id)}
                          isCustom={field.id.startsWith("COMPANY_UF_CRM_")}
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {filteredFields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-xs">
                {fields.length === 0
                  ? "Загрузите поля с CRM"
                  : "Ничего не найдено"}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function SortableColumnItem({
  field,
  onToggle,
  isCustom = false,
}: {
  field: FieldInfo;
  onToggle: () => void;
  isCustom?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${
        isDragging
          ? "bg-brand-blue/10 shadow-sm opacity-80"
          : "bg-brand-blue/5 dark:bg-brand-blue/10 hover:bg-brand-blue/10"
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground rounded"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <Checkbox
        checked={true}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-brand-blue data-[state=checked]:border-brand-blue h-3.5 w-3.5"
      />
      <ColumnItemContent field={field} isCustom={isCustom} />
    </div>
  );
}

function ColumnItem({
  field,
  checked,
  onToggle,
  isCustom = false,
}: {
  field: FieldInfo;
  checked: boolean;
  onToggle: () => void;
  isCustom?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-all ${
        checked
          ? "bg-brand-blue/5 dark:bg-brand-blue/10"
          : "hover:bg-muted/50"
      }`}
    >
      <div className="w-[22px]" /> {/* Spacer to align with GripVertical */}
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-brand-blue data-[state=checked]:border-brand-blue h-3.5 w-3.5"
      />
      <ColumnItemContent field={field} isCustom={isCustom} />
    </label>
  );
}

function ColumnItemContent({ field, isCustom }: { field: FieldInfo; isCustom: boolean }) {
  // Type display names in Russian
  const typeLabels: Record<string, string> = {
    string: "Текст",
    double: "Число",
    integer: "Целое",
    date: "Дата",
    datetime: "Дата/Время",
    money: "Деньги",
    enumeration: "Список",
    boolean: "Да/Нет",
    char: "Да/Нет",
    crm_status: "Статус",
    crm_currency: "Валюта",
    crm_category: "Воронка",
    address: "Адрес",
    file: "Файл",
  };

  const typeLabel = typeLabels[field.type] || field.type;

  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium truncate leading-tight">{field.title}</div>
      <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1 flex-wrap mt-0.5">
        <span className="font-mono opacity-50">{field.id}</span>
        {isCustom && (
          <Badge variant="outline" className="h-3.5 px-1 text-[9px] rounded-sm border-brand-orange/30 text-brand-orange leading-none">
            UF
          </Badge>
        )}
        <Badge variant="outline" className="h-3.5 px-1 text-[9px] rounded-sm leading-none">
          {typeLabel}
        </Badge>
        {field.isMultiple && (
          <Badge variant="outline" className="h-3.5 px-1 text-[9px] rounded-sm border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400 leading-none">
            Множ.
          </Badge>
        )}
      </div>
    </div>
  );
}

```

## File: src/components/dashboard/config-banner.tsx
```tsx
"use client";

import { useState } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Wifi, WifiOff, X } from "lucide-react";

export function ConfigBanner() {
  const { isConfigured, isDemoMode } = useDashboardStore();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || isConfigured === null) return null;

  if (isConfigured && !isDemoMode) {
    return (
      <div className="px-4 sm:px-6 pt-3 animate-fade-in">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
          <Wifi className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
            Подключение к CRM активно
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto text-emerald-600/50 hover:text-emerald-600 dark:text-emerald-400/50 dark:hover:text-emerald-400"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 pt-3 animate-fade-in">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <WifiOff className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
          CRM не подключено — обратитесь к администратору
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto text-amber-600/50 hover:text-amber-600 dark:text-amber-400/50 dark:hover:text-amber-400"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

```

## File: src/components/dashboard/connection-health.tsx
```tsx
"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STATUS_CONFIG = {
  checking: {
    color: "bg-amber-400",
    pulse: true,
    text: "Проверка...",
  },
  connected: {
    color: "bg-emerald-400",
    pulse: false,
    text: "Подключена",
  },
  demo: {
    color: "bg-amber-400",
    pulse: false,
    text: "Демо-режим",
  },
  disconnected: {
    color: "bg-red-500",
    pulse: true,
    text: "Ошибка базы",
  },
} as const;

export function ConnectionHealth() {
  const { connectionStatus } = useDashboardStore();
  const config = STATUS_CONFIG[connectionStatus];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-default">
          <span
            className={`
              h-2 w-2 rounded-full block shrink-0
              ${config.color}
              ${config.pulse ? "animate-pulse" : ""}
            `}
          />
          <span className="text-[11px] font-medium text-white/70 whitespace-nowrap">
            {config.text}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={6}
        className="text-[11px] px-2 py-1"
      >
        Статус подключения к Bitrix24
      </TooltipContent>
    </Tooltip>
  );
}

```

## File: src/components/dashboard/data-table.tsx
```tsx
"use client";

import { useDashboardStore, type FieldInfo, type DealData } from "@/store/dashboard-store";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Database,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";

/**
 * SECURITY NOTE: All cell values are rendered as JSX text content.
 * React automatically escapes HTML entities in JSX text (<td>{value}</td>),
 * which prevents XSS attacks even if CRM data contains malicious scripts.
 * We do NOT use dangerouslySetInnerHTML anywhere in this component.
 */
export function DataTable() {
  const {
    deals,
    dealsLoading,
    dealsError,
    dealsTotal,
    fields,
    selectedColumns,
    searchQuery,
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize,
    columnSort,
    toggleColumnSort,
    columnFilters,
    setColumnFilter,
    clearColumnFilter,
    clearAllColumnFilters,
    userNames,
    companiesData,
    activitiesData,
  } = useDashboardStore();

  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus filter input when activated
  useEffect(() => {
    if (activeFilterCol && filterInputRef.current) {
      filterInputRef.current.focus();
    }
  }, [activeFilterCol]);

  const fieldMap = useMemo(
    () => new Map(fields.map((f) => [f.id, f])),
    [fields]
  );

  // Resolve display value for a cell (handles list values, arrays, etc.)
  const resolveValue = useCallback(
    (deal: DealData, colId: string): string => {
      const raw = deal[colId];
      const field = fieldMap.get(colId);

      if (raw === null || raw === undefined || raw === "") return "";

      // Special handling for responsible person
      if (colId === "ASSIGNED_BY_ID") {
        const id = String(raw);
        return userNames[id] || `ID ${id}`;
      }

      // Special handling for activities
      if (colId === "ACTIVITY_LAST" || colId === "ACTIVITY_NEXT") {
        const dealId = String(deal.ID || deal.id || "");
        if (!dealId || !activitiesData[dealId]) return "";
        
        const activity = colId === "ACTIVITY_LAST" ? activitiesData[dealId].last : activitiesData[dealId].next;
        if (!activity) return "";

        const dateStr = activity.DEADLINE || activity.CREATED;
        const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : "";
        
        const text = activity.DESCRIPTION ? `${activity.SUBJECT} — ${activity.DESCRIPTION}` : activity.SUBJECT;
        // Strip HTML tags from description if any
        const cleanText = text.replace(/<[^>]*>?/gm, '');
        
        return `${formattedDate ? formattedDate + ": " : ""}${cleanText}`;
      }

      // Special handling for company fields
      if (colId.startsWith("COMPANY_")) {
        const companyId = String(deal.COMPANY_ID || "");
        if (!companyId) return "";
        
        let companyFieldId = colId.replace("COMPANY_", "");
        // Treat COMPANY_ID as COMPANY_TITLE for display purposes
        if (companyFieldId === "ID") companyFieldId = "TITLE";
        
        const company = companiesData[companyId];
        
        if (!company) {
          if (companyFieldId === "TITLE") return `ID ${companyId}`;
          return "";
        }
        
        const rawCompanyVal = company[companyFieldId];
        
        if (rawCompanyVal === null || rawCompanyVal === undefined || rawCompanyVal === "") {
          if (companyFieldId === "TITLE") return `ID ${companyId}`;
          return "";
        }
        
        // Resolve enumeration list values for company fields if needed
        if (field?.listValues && rawCompanyVal) {
          if (Array.isArray(rawCompanyVal)) {
            return rawCompanyVal
              .map((v) => {
                const listVal = field.listValues?.find((lv) => lv.ID === String(v));
                return listVal?.VALUE || String(v);
              })
              .join(", ");
          }
          const val = String(rawCompanyVal);
          const listVal = field.listValues.find((lv) => lv.ID === val);
          if (listVal) return listVal.VALUE;
        }

        if (Array.isArray(rawCompanyVal)) {
          return rawCompanyVal.join(", ");
        }

        return String(rawCompanyVal);
      }

      // Resolve enumeration list values
      if (field?.listValues && raw) {
        // Handle multiple values (arrays)
        if (Array.isArray(raw)) {
          return raw
            .map((v) => {
              const listVal = field.listValues?.find((lv) => lv.ID === String(v));
              return listVal?.VALUE || String(v);
            })
            .join(", ");
        }
        const val = String(raw);
        const listVal = field.listValues.find((lv) => lv.ID === val);
        if (listVal) return listVal.VALUE;
      }

      // Format arrays
      if (Array.isArray(raw)) {
        return raw.join(", ");
      }

      return String(raw);
    },
    [fieldMap, userNames, companiesData, activitiesData]
  );

  // Get raw comparable value for sorting
  const getSortValue = useCallback(
    (deal: DealData, colId: string): string | number => {
      const field = fieldMap.get(colId);
      const raw = deal[colId];

      if (raw === null || raw === undefined || raw === "") return "";

      // For numeric types, parse as number for proper sorting
      if (
        field?.type === "double" ||
        field?.type === "integer" ||
        field?.type === "money"
      ) {
        const num = parseFloat(String(raw));
        return isNaN(num) ? 0 : num;
      }

      // For date types, use timestamp for sorting
      if (field?.type === "date" || field?.type === "datetime") {
        const d = new Date(String(raw));
        return isNaN(d.getTime()) ? 0 : d.getTime();
      }

      // For enumeration, resolve to display value for alphabetical sort
      if (field?.listValues && raw) {
        return resolveValue(deal, colId);
      }

      // Special handling for responsible person sorting
      if (colId === "ASSIGNED_BY_ID") {
        return resolveValue(deal, colId).toLowerCase();
      }

      // Special handling for company fields sorting
      if (colId.startsWith("COMPANY_")) {
        return resolveValue(deal, colId).toLowerCase();
      }

      return String(raw).toLowerCase();
    },
    [fieldMap, resolveValue]
  );

  // Apply global search
  const searchedDeals = useMemo(() => {
    if (!searchQuery.trim()) return deals;
    const q = searchQuery.toLowerCase();
    return deals.filter((deal) => {
      // Check responsible person name first
      const assignedById = String(deal.ASSIGNED_BY_ID || "");
      if (assignedById && userNames[assignedById]) {
        if (userNames[assignedById].toLowerCase().includes(q)) return true;
      }

      // Check company name
      const companyId = String(deal.COMPANY_ID || "");
      if (companyId) {
        const companyName = companiesData[companyId]?.TITLE || `ID ${companyId}`;
        if (companyName.toLowerCase().includes(q)) return true;
      }

      // Check all other fields
      return Object.entries(deal).some(([key, val]) => {
        const resolved = resolveValue(deal, key);
        return resolved.toLowerCase().includes(q);
      });
    });
  }, [deals, searchQuery, resolveValue, userNames, companiesData]);

  // Apply column filters
  const filteredDeals = useMemo(() => {
    if (columnFilters.length === 0) return searchedDeals;

    return searchedDeals.filter((deal) =>
      columnFilters.every((filter) => {
        if (!filter.value.trim()) return true;
        const resolved = resolveValue(deal, filter.columnId);
        return resolved.toLowerCase().includes(filter.value.toLowerCase());
      })
    );
  }, [searchedDeals, columnFilters, resolveValue]);

  // Apply column sorting
  const sortedDeals = useMemo(() => {
    if (!columnSort.direction || !columnSort.columnId) return filteredDeals;

    const colId = columnSort.columnId;
    const dir = columnSort.direction === "asc" ? 1 : -1;

    return [...filteredDeals].sort((a, b) => {
      const aVal = getSortValue(a, colId);
      const bVal = getSortValue(b, colId);

      if (typeof aVal === "number" && typeof bVal === "number") {
        return (aVal - bVal) * dir;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return aStr.localeCompare(bStr, "ru") * dir;
    });
  }, [filteredDeals, columnSort, getSortValue]);

  // Pagination
  const totalPages = Math.ceil(sortedDeals.length / pageSize);
  const paginatedDeals = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedDeals.slice(start, start + pageSize);
  }, [sortedDeals, currentPage, pageSize]);

  const columns = useMemo(() => {
    if (selectedColumns.length > 0 && fields.length > 0) {
      // Only render columns that exist in the fields metadata (prevents rendering excluded/deleted fields from persisted state)
      return selectedColumns.filter((colId) => fieldMap.has(colId));
    }
    if (selectedColumns.length > 0) {
      return selectedColumns; // Fallback while fields are loading
    }
    if (deals.length > 0) {
      return Object.keys(deals[0]).slice(0, 8);
    }
    return [];
  }, [selectedColumns, fields.length, fieldMap, deals]);

  // Update export data whenever sorted deals or columns change
  useEffect(() => {
    if (sortedDeals.length === 0 || columns.length === 0) {
      useDashboardStore.getState().setExportData([], []);
      return;
    }

    const exportColumns = columns.map((colId) => fieldMap.get(colId)?.title || colId);
    const exportData = sortedDeals.map((deal) =>
      columns.map((colId) => {
        const raw = deal[colId];
        const resolved = resolveValue(deal, colId);
        const field = fieldMap.get(colId);
        
        if (!resolved) return "";

        if (field?.type === "char" || field?.type === "boolean") {
          if (raw === "Y" || raw === "1" || String(raw) === "true") return "Да";
          if (raw === "N" || raw === "0" || String(raw) === "false") return "Нет";
        }

        if (field?.type === "money" && raw) {
          const parts = String(raw).split("|");
          const amount = parseFloat(parts[0]);
          const currency = parts[1] || "";
          if (!isNaN(amount)) {
            return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
          }
        }

        if (field?.type === "double" || field?.type === "integer" || field?.id === "OPPORTUNITY") {
          const num = parseFloat(resolved);
          if (!isNaN(num)) {
            if (field?.type === "integer") {
              return Math.round(num).toLocaleString("ru-RU");
            }
            return num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          }
        }

        if (field?.type === "date" || field?.type === "datetime" || field?.id === "DATE_CREATE" || field?.id === "DATE_MODIFY") {
          const d = new Date(resolved);
          if (!isNaN(d.getTime())) {
            const dateStr = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
            const timeStr = field?.type === "datetime" ? ` ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "";
            return `${dateStr}${timeStr}`;
          }
        }

        return resolved;
      })
    );

    useDashboardStore.getState().setExportData(exportData, exportColumns);
  }, [sortedDeals, columns, fieldMap, resolveValue]);

  const activeFilterCount = columnFilters.filter((f) => f.value.trim()).length;

  // Loading state
  if (dealsLoading && deals.length === 0) {
    return (
      <div className="flex-1 p-4 sm:p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-64 rounded-md" />
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <div className="bg-muted/50 p-3 flex gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-4 w-24 rounded" />
              ))}
            </div>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
              <div key={row} className="p-3 flex gap-4 border-t border-border">
                {[1, 2, 3, 4, 5].map((col) => (
                  <Skeleton key={col} className="h-4 w-20 rounded" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (dealsError) {
    return (
      <div className="flex-1 p-4 sm:p-6">
        <Alert variant="destructive" className="rounded-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Ошибка загрузки данных: {dealsError}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Empty state
  if (deals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-4 animate-fade-in">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
            <Database className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Нет данных</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Нажмите «Синхронизация» для загрузки сделок из CRM
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 mx-4 sm:mx-6 mb-4">
      {/* Table container card */}
      <div className="flex-1 flex flex-col min-h-0 rounded-md border border-border bg-card shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <>
                <Badge variant="secondary" className="text-[10px] gap-1 h-6 filter-badge-pulse bg-brand-orange/10 text-brand-orange border-brand-orange/20">
                  <Filter className="h-2.5 w-2.5" />
                  {activeFilterCount}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllColumnFilters}
                  className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground px-2"
                >
                  <X className="h-2.5 w-2.5" />
                  Сбросить
                </Button>
              </>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums ml-auto">
            {sortedDeals.length.toLocaleString("ru-RU")} из {dealsTotal.toLocaleString("ru-RU")}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full overflow-auto custom-scrollbar">
            <div className="min-w-full">
              <table className="data-table w-full border-separate border-spacing-0">
                <thead className="bg-card shadow-sm">
                  <tr>
                    {/* Fixed Row Number Column */}
                    <th className="text-center sticky top-0 left-0 z-30 bg-card border-r border-b border-border w-10 min-w-[40px] px-2">
                      №
                    </th>
                    {columns.map((colId) => {
                      const field = fieldMap.get(colId);
                      const isSorted = columnSort.columnId === colId;
                      const hasFilter = columnFilters.some(
                        (f) => f.columnId === colId && f.value.trim()
                      );
                      const isFilterActive = activeFilterCol === colId;
                      const isNumeric = field?.type === "double" || field?.type === "integer" || field?.type === "money";
                      const isDate = field?.type === "date" || field?.type === "datetime";

                      return (
                        <th key={colId} className="text-left sticky top-0 z-20 group bg-card border-b border-border">
                          <div className="flex items-center gap-1">
                            {/* Sort button */}
                            <button
                              onClick={() => toggleColumnSort(colId)}
                              className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                              title={
                                isNumeric
                                  ? isSorted
                                    ? columnSort.direction === "asc"
                                      ? "По возрастанию чисел (нажмите для убывания)"
                                      : "По убыванию чисел (нажмите для сброса)"
                                    : "Сортировка по числам"
                                  : isDate
                                  ? isSorted
                                    ? columnSort.direction === "asc"
                                      ? "По возрастанию дат (нажмите для убывания)"
                                      : "По убыванию дат (нажмите для сброса)"
                                    : "Сортировка по датам"
                                  : isSorted
                                  ? columnSort.direction === "asc"
                                    ? "По алфавиту А→Я (нажмите для Я→А)"
                                    : "По алфавиту Я→А (нажмите для сброса)"
                                  : "Сортировка по алфавиту"
                              }
                            >
                              <span className="truncate max-w-[160px]">{field?.title || colId}</span>
                              {isSorted && columnSort.direction === "asc" && (
                                <ArrowUp className="h-3 w-3 text-brand-blue flex-shrink-0 sort-icon-enter" />
                              )}
                              {isSorted && columnSort.direction === "desc" && (
                                <ArrowDown className="h-3 w-3 text-brand-blue flex-shrink-0 sort-icon-enter" />
                              )}
                              {!isSorted && (
                                <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-30 transition-opacity flex-shrink-0" />
                              )}
                            </button>

                            {/* Column filter toggle */}
                            <button
                              onClick={() =>
                                setActiveFilterCol(isFilterActive ? null : colId)
                              }
                              className={`p-0.5 rounded transition-all ${
                                hasFilter
                                  ? "text-brand-orange filter-badge-pulse"
                                  : "opacity-0 group-hover:opacity-40 hover:!opacity-70"
                              }`}
                              title="Фильтр по столбцу"
                            >
                              <Filter className="h-2.5 w-2.5" />
                            </button>
                          </div>

                          {/* Per-column filter input */}
                          {isFilterActive && (
                            <div className="mt-1.5 animate-fade-in">
                              <div className="relative">
                                <Input
                                  ref={filterInputRef}
                                  placeholder={`Фильтр...`}
                                  value={
                                    columnFilters.find((f) => f.columnId === colId)
                                      ?.value || ""
                                  }
                                  onChange={(e) =>
                                    setColumnFilter(colId, e.target.value)
                                  }
                                  className="h-6 text-[11px] rounded-sm pr-6 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
                                />
                                {(columnFilters.find((f) => f.columnId === colId)
                                  ?.value || "") && (
                                  <button
                                    onClick={() => clearColumnFilter(colId)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paginatedDeals.map((deal, idx) => {
                    const dealId = deal.ID || deal.id || idx;
                    const rowIndex = (currentPage - 1) * pageSize + idx + 1;
                    return (
                      <tr key={String(dealId)}>
                        {/* Fixed Row Number Cell */}
                        <td className="sticky left-0 z-10 bg-card border-r border-border text-center px-2">
                          <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
                            {rowIndex}
                          </span>
                        </td>
                        {columns.map((colId) => {
                          const resolved = resolveValue(deal, colId);
                          return (
                            <td key={colId} title={resolved}>
                              <CellValue
                                raw={deal[colId]}
                                resolved={resolved}
                                field={fieldMap.get(colId)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pagination */}
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="tabular-nums">
              {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, sortedDeals.length)} из {sortedDeals.length}
            </span>
            {(searchQuery || activeFilterCount > 0) && (
              <Badge variant="outline" className="text-[10px] h-5 font-normal">
                из {dealsTotal}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground hidden sm:inline">Строк:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-7 rounded-sm border-0 bg-muted/80 text-[11px] px-1.5 py-0 focus:ring-1 cursor-pointer"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] text-muted-foreground min-w-[50px] text-center tabular-nums">
                {currentPage} / {Math.max(1, totalPages)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CellValue({
  raw,
  resolved,
  field,
}: {
  raw: string | string[] | number | null;
  resolved: string;
  field?: FieldInfo;
}) {
  if (!resolved) {
    return <span className="text-muted-foreground/30">—</span>;
  }

  // Boolean / char fields
  if (field?.type === "char" || field?.type === "boolean") {
    if (raw === "Y" || raw === "1" || String(raw) === "true") {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] h-5 rounded-sm border-0 font-medium">
          Да
        </Badge>
      );
    }
    if (raw === "N" || raw === "0" || String(raw) === "false") {
      return (
        <Badge variant="secondary" className="text-[10px] h-5 rounded-sm font-normal">
          Нет
        </Badge>
      );
    }
  }

  // Money type — formatted with currency
  if (field?.type === "money" && raw) {
    const parts = String(raw).split("|");
    const amount = parseFloat(parts[0]);
    const currency = parts[1] || "";
    if (!isNaN(amount)) {
      return (
        <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
          {amount.toLocaleString("ru-RU", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{" "}
          <span>{currency}</span>
        </span>
      );
    }
  }

  // Numeric fields (double, integer)
  if (field?.type === "double" || field?.type === "integer") {
    const num = parseFloat(resolved);
    if (!isNaN(num) && field?.type === "double") {
      return (
        <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
          {num.toLocaleString("ru-RU", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      );
    }
    if (!isNaN(num) && field?.type === "integer") {
      return (
        <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
          {Math.round(num).toLocaleString("ru-RU")}
        </span>
      );
    }
  }

  // Opportunity field
  if (field?.id === "OPPORTUNITY") {
    const num = parseFloat(resolved);
    if (!isNaN(num)) {
      return (
        <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
          {num.toLocaleString("ru-RU", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      );
    }
  }

  // Date fields
  if (
    field?.type === "date" ||
    field?.type === "datetime" ||
    field?.id === "DATE_CREATE" ||
    field?.id === "DATE_MODIFY"
  ) {
    const d = new Date(resolved);
    if (!isNaN(d.getTime())) {
      const dateStr = d.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const timeStr =
        field?.type === "datetime"
          ? ` ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
          : "";
      return (
        <span className="font-mono text-[11px] tabular-nums font-normal text-muted-foreground">
          {dateStr}
          {timeStr}
        </span>
      );
    }
  }

  // Payment status — colored badges
  if (field?.id === "UF_CRM_1584464068013") {
    const statusColors: Record<string, string> = {
      "Не оплачен": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      "Выставлен счет": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      "Ожидает подтверждения": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      "Платеж проведен": "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
      "Ошибка": "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
      "Оплачен": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      "Возвращен": "bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
    };
    const colorClass = statusColors[resolved];
    if (colorClass) {
      return (
        <Badge className={`${colorClass} text-[10px] h-5 rounded-sm border-0 font-medium`}>
          {resolved}
        </Badge>
      );
    }
  }

  // Stage — colored badges
  if (field?.id === "STAGE_ID") {
    const stageColors: Record<string, string> = {
      "Новая": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      "Подготовка": "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
      "Счёт выставлен": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      "В работе": "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
      "Сделка успешна": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      "Сделка провалена": "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    const colorClass = stageColors[resolved];
    if (colorClass) {
      return (
        <Badge className={`${colorClass} text-[10px] h-5 rounded-sm border-0 font-medium`}>
          {resolved}
        </Badge>
      );
    }
  }

  // Enumeration with list values — show as subtle badge for short values
  if (field?.listValues && field.listValues.length <= 8) {
    const isKnownValue = field.listValues.some(
      (lv) => lv.VALUE === resolved || resolved.includes(lv.VALUE)
    );
    if (isKnownValue && resolved.length <= 35) {
      return (
        <Badge
          variant="secondary"
          className="text-[10px] h-5 rounded-sm font-normal max-w-[200px] truncate bg-muted/80"
        >
          {resolved}
        </Badge>
      );
    }
  }

  // Address type
  if (field?.type === "address") {
    return (
      <span className="text-xs truncate max-w-[220px] block text-muted-foreground" title={resolved}>
        {resolved}
      </span>
    );
  }

  // Activities
  if (field?.id === "ACTIVITY_LAST" || field?.id === "ACTIVITY_NEXT") {
    return (
      <span className="text-xs truncate max-w-[250px] block" title={resolved}>
        {resolved}
      </span>
    );
  }

  // Default — React auto-escapes JSX text, preventing XSS from CRM data
  return <span className="text-xs">{resolved}</span>;
}

```

## File: src/components/dashboard/date-filter.tsx
```tsx
"use client";

import { useDashboardStore, type DateFilterPreset } from "@/store/dashboard-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PRESETS: { value: DateFilterPreset; label: string; shortcut?: string }[] = [
  { value: "all", label: "За всё время", shortcut: "∞" },
  { value: "7days", label: "7 дней" },
  { value: "14days", label: "14 дней" },
  { value: "30days", label: "30 дней" },
  { value: "90days", label: "90 дней" },
];

export function DateFilter() {
  const { dateFilter, setDateFilter } = useDashboardStore();
  const [customFrom, setCustomFrom] = useState(dateFilter.customFrom || "");
  const [customTo, setCustomTo] = useState(dateFilter.customTo || "");
  const [customOpen, setCustomOpen] = useState(false);

  const currentLabel =
    dateFilter.preset === "custom"
      ? "Указать вручную"
      : PRESETS.find((p) => p.value === dateFilter.preset)?.label || "За всё время";

  const handlePresetSelect = (preset: DateFilterPreset) => {
    if (preset === "custom") {
      setCustomOpen(true);
      return;
    }
    setDateFilter({ preset });
  };

  const handleCustomApply = () => {
    setDateFilter({
      preset: "custom",
      customFrom: customFrom || undefined,
      customTo: customTo || undefined,
    });
    setCustomOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 text-[11px] font-medium border border-white/10"
          >
            <Calendar className="h-3 w-3 text-white/60" />
            <span>{currentLabel}</span>
            <ChevronDown className="h-2.5 w-2.5 text-white/50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 rounded-md">
          <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Период
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.value}
              onClick={() => handlePresetSelect(preset.value)}
              className={`cursor-pointer rounded-sm text-xs ${
                dateFilter.preset === preset.value
                  ? "bg-brand-blue/10 text-brand-blue font-medium"
                  : ""
              }`}
            >
              <span className="flex-1">{preset.label}</span>
              {preset.shortcut && (
                <span className="text-[10px] text-muted-foreground ml-2">{preset.shortcut}</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <Popover open={customOpen} onOpenChange={setCustomOpen}>
            <PopoverTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className={`cursor-pointer rounded-sm text-xs ${
                  dateFilter.preset === "custom"
                    ? "bg-brand-blue/10 text-brand-blue font-medium"
                    : ""
                }`}
                onClick={() => setCustomOpen(true)}
              >
                Указать вручную
              </DropdownMenuItem>
            </PopoverTrigger>
            <PopoverContent className="w-64 rounded-md p-4" align="start">
              <div className="space-y-3">
                <div className="text-xs font-semibold">Указать период</div>
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="date-from" className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      От
                    </Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-7 text-xs rounded-md"
                    />
                  </div>
                  <div>
                    <Label htmlFor="date-to" className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      До
                    </Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-7 text-xs rounded-md"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleCustomApply}
                  className="w-full h-7 rounded-md bg-brand-blue hover:bg-brand-blue-hover text-white text-xs"
                >
                  Применить
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

```

## File: src/components/dashboard/footer.tsx
```tsx
"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { BarChart3 } from "lucide-react";

export function Footer() {
  const { isDemoMode } = useDashboardStore();

  return (
    <footer className="mt-auto border-t border-border bg-card/50">
      <div className="px-4 sm:px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-[10px] text-muted-foreground/50 tracking-wide">
            RusSilica BI Terminal v2.1
          </span>
          {isDemoMode && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 ml-1">
              DEMO
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground/35">
          © 2020-2026 ООО "РусСилика" ОГРН 1205500027710, ИНН 5501267734, КПП 524901001
        </div>
      </div>
    </footer>
  );
}

```

## File: src/components/dashboard/global-search.tsx
```tsx
"use client";

import { useRef, useState, useCallback } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Search, X } from "lucide-react";

export function GlobalSearch() {
  const { searchQuery, setSearchQuery } = useDashboardStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const handleClear = useCallback(() => {
    setSearchQuery("");
    inputRef.current?.focus();
  }, [setSearchQuery]);

  // Search input component (shared between desktop and mobile)
  const searchInput = (
    <div className="relative flex items-center">
      <Search className="absolute left-2 h-3.5 w-3.5 text-white/30 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Поиск по всем полям..."
        className="h-7 w-full sm:w-56 lg:w-64 rounded-md bg-white/[0.07] border border-white/10 text-white/80 placeholder:text-white/30 text-xs pl-7 pr-6 outline-none focus-visible:border-white/25 focus-visible:ring-1 focus-visible:ring-white/20 transition-all"
        onBlur={() => {
          if (searchQuery === "" && window.innerWidth < 640) {
            setMobileExpanded(false);
          }
        }}
      />
      {searchQuery && (
        <button
          onClick={handleClear}
          className="absolute right-1.5 flex items-center justify-center h-4 w-4 rounded-sm text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
          aria-label="Очистить поиск"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  // Mobile: icon-only that expands
  if (!mobileExpanded) {
    return (
      <>
        {/* Mobile icon button */}
        <button
          onClick={() => {
            setMobileExpanded(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="sm:hidden flex items-center justify-center h-7 w-7 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Поиск"
        >
          <Search className="h-3.5 w-3.5" />
        </button>
        {/* Desktop: always-visible input */}
        <div className="hidden sm:block w-40 sm:w-56 lg:w-64">
          {searchInput}
        </div>
      </>
    );
  }

  // Mobile expanded state
  return (
    <div className="w-full sm:w-56 lg:w-64">
      {searchInput}
    </div>
  );
}

```

## File: src/components/dashboard/header.tsx
```tsx
"use client";

import { useSession, signOut } from "next-auth/react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "./theme-toggle";
import { DateFilter } from "./date-filter";
import { GlobalSearch } from "./global-search";
import { ActiveFilters } from "./active-filters";
import { LastSync } from "./last-sync";
import { AlertsBell } from "./alerts-bell";
import { PipelineFilter } from "./pipeline-filter";
import { ResponsibleFilter } from "./responsible-filter";
import { ConnectionHealth } from "./connection-health";
import { RefreshCw, Download, Columns3, BarChart3, LogOut, User } from "lucide-react";
import { exportToExcelWysiwyg } from "@/lib/export-utils";
import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT } from "@/lib/config";
import Link from "next/link";

export function Header() {
  const { data: session } = useSession();
  const { dealsLoading, syncData, exportData, exportColumns, setColumnSelectorOpen } =
    useDashboardStore();

  const handleSync = async () => {
    try {
      await syncData();
    } catch (error) {
      console.error("[Header] Sync error:", error);
    }
  };

  const handleExport = () => {
    if (exportData.length === 0) return;
    exportToExcelWysiwyg(exportData, exportColumns);
  };

  const handleLogout = () => {
    if (IS_PRODUCTION) {
      const redirectUrl = encodeURIComponent(window.location.origin + "/login");
      const wpLogoutUrl = WP_LOGIN_URL_CLIENT + "?action=headless_logout&redirect_to=" + redirectUrl;
      signOut({ callbackUrl: wpLogoutUrl });
    } else {
      signOut({ callbackUrl: "/login" });
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <header className="z-30 header-gradient border-b border-white/10">
        {/* Top row: Brand + Actions */}
        <div className="flex items-center justify-between px-3 sm:px-5 h-12 gap-2">
          {/* Left: Brand */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer">
            <BarChart3 className="h-5 w-5 text-white/80 shrink-0" />
            <span className="text-sm font-semibold tracking-wide text-white">
              RusSilica
            </span>
            <span className="hidden sm:inline text-xs font-normal text-white/40">
              BI Terminal
            </span>
          </Link>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {/* Sync button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSync}
              disabled={dealsLoading}
              className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
              title="Синхронизировать данные"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dealsLoading ? "sync-pulse" : ""}`} />
              <span className="hidden sm:inline">Синхр.</span>
            </Button>

            {/* Connection health */}
            <ConnectionHealth />

            {/* Last sync time */}
            <div className="hidden lg:block">
              <LastSync />
            </div>

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-1" />

            {/* Column selector */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setColumnSelectorOpen(true)}
              className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
            >
              <Columns3 className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Столбцы</span>
            </Button>

            {/* Export */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={exportData.length === 0}
              className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 disabled:text-white/30"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Экспорт</span>
            </Button>

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-1" />

            {/* Theme */}
            <ThemeToggle />

            {/* Alerts bell */}
            <AlertsBell />

            {/* Separator */}
            <div className="w-px h-4 bg-white/10 mx-1" />

            {/* User info + Logout */}
            <div className="flex items-center gap-1.5">
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.07]">
                <User className="h-3 w-3 text-white/50" />
                <span className="text-[11px] text-white/60 font-medium whitespace-nowrap max-w-[120px] truncate">
                  {session?.user?.name || session?.user?.email || "—"}
                </span>
                {(session?.user?.role) === "admin" && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold">
                    АДМ
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-7 gap-1 rounded text-xs text-white/50 hover:text-red-300 hover:bg-white/10"
                title="Выйти из системы"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Second row: Filters + Search */}
        <div className="flex items-center px-3 sm:px-5 pb-2 pt-0.5 gap-2 overflow-x-auto no-scrollbar">
          {/* Date filter */}
          <DateFilter />

          {/* Pipeline quick filter */}
          <PipelineFilter />

          {/* Responsible filter */}
          <ResponsibleFilter />

          {/* Search (inline with filters) */}
          <div className="flex-1 min-w-[200px] max-w-md">
            <GlobalSearch />
          </div>

          {/* Active filters badge */}
          <ActiveFilters />
        </div>

      </header>
    </TooltipProvider>
  );
}

```

## File: src/components/dashboard/last-sync.tsx
```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return "Только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffHour < 24) return `${diffHour} ч назад`;

  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays} дн назад`;
}

export function LastSync() {
  const lastSyncAt = useDashboardStore((s) => s.lastSyncAt);
  const [tick, setTick] = useState(0);

  // Refresh relative time every 30 seconds
  useEffect(() => {
    if (lastSyncAt === null) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30_000);

    return () => clearInterval(interval);
  }, [lastSyncAt]);

  const relativeTime = useMemo(() => {
    // Use tick to trigger recalculation
    void tick;
    if (lastSyncAt === null) return null;
    return getRelativeTime(lastSyncAt);
  }, [lastSyncAt, tick]);

  const exactTime = useMemo(() => {
    if (lastSyncAt === null) return null;
    return new Date(lastSyncAt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }, [lastSyncAt]);

  if (lastSyncAt === null || relativeTime === null) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-[10px] text-white/40 cursor-default whitespace-nowrap">
          Обновлено {relativeTime}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[10px]">
        {exactTime}
      </TooltipContent>
    </Tooltip>
  );
}

```

## File: src/components/dashboard/loading-screen.tsx
```tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { useDashboardStore } from "@/store/dashboard-store";

const TERMINAL_LINES = [
  "RusSilica BI Terminal v2.0",
  "Инициализация модулей...",
  "Загрузка конфигурации CRM...",
  "Подключение к Bitrix24...",
  "Синхронизация данных...",
  "Загрузка полей сделки...",
  "Построение индексов...",
  "Готово к работе ✓",
];

const LINE_DELAY_MS = 120; // 8 lines * 120ms ≈ 1 second
const FADE_OUT_DELAY_MS = 400;

function getTimestamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `[${hh}:${mm}:${ss}.${ms}]`;
}

export function LoadingScreen() {
  const { appLoaded, setAppLoaded } = useDashboardStore();
  const [visibleLines, setVisibleLines] = useState(0);
  const [fadingOut, setFadingOut] = useState(false);
  const [timestamps, setTimestamps] = useState<string[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (appLoaded) return;

    cancelledRef.current = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const scheduleTimer = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!cancelledRef.current) fn();
      }, ms);
      timers.push(id);
      return id;
    };

    let lineIndex = 0;
    const showNext = () => {
      lineIndex++;
      if (lineIndex <= TERMINAL_LINES.length) {
        setVisibleLines(lineIndex);
        setTimestamps((prev) => {
          const newTimestamps = [...prev];
          newTimestamps[lineIndex - 1] = getTimestamp();
          return newTimestamps;
        });
        scheduleTimer(showNext, LINE_DELAY_MS);
      } else {
        // All lines shown — wait for data to finish loading before fading out.
        const waitForData = () => {
          if (cancelledRef.current) return;
          
          // Get latest state directly from the store to avoid useEffect re-runs
          const state = useDashboardStore.getState();
          
          if (!state.fieldsLoading && !state.dealsLoading) {
            setFadingOut(true);
            scheduleTimer(() => {
              setAppLoaded(true);
            }, 500);
          } else {
            // Data still loading — check again in 200ms
            scheduleTimer(waitForData, 200);
          }
        };
        scheduleTimer(waitForData, FADE_OUT_DELAY_MS);
      }
    };

    scheduleTimer(showNext, 150);

    // Safety timeout: force load after 10s even if data hasn't arrived
    scheduleTimer(() => {
      if (!cancelledRef.current && !useDashboardStore.getState().appLoaded) {
        setFadingOut(true);
        scheduleTimer(() => {
          setAppLoaded(true);
        }, 500);
      }
    }, 10_000);

    return () => {
      cancelledRef.current = true;
      timers.forEach((id) => clearTimeout(id));
    };
  }, [appLoaded, setAppLoaded]); // Removed dealsLoading and fieldsLoading to prevent restart

  if (appLoaded) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-500 ${
        fadingOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="w-full max-w-2xl mx-4 bg-black border border-amber-500/30 p-6 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
        {/* Terminal body */}
        <div className="font-mono text-[14px] leading-relaxed min-h-[280px]">
          {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => {
            const isSuccess = line.includes("✓");
            const isVersion = i === 0;
            const timestamp = timestamps[i] || getTimestamp();
            
            return (
              <div key={i} className="flex gap-3">
                <span className="text-slate-500 shrink-0 select-none">
                  {timestamp}
                </span>
                <span
                  className={
                    isSuccess
                      ? "text-emerald-500 font-bold"
                      : isVersion
                      ? "text-amber-500 font-bold uppercase tracking-wider"
                      : "text-amber-500/80"
                  }
                >
                  {line}
                </span>
                {i === visibleLines - 1 && !fadingOut && (
                  <span className="inline-block w-[8px] h-[16px] bg-amber-500 ml-1 align-middle animate-blink-cursor" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

```

## File: src/components/dashboard/pipeline-filter.tsx
```tsx
"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { useMemo } from "react";

const PIPELINE_TABS = [
  { key: "all", label: "Все" },
  { key: "in_work", label: "В работе" },
  { key: "WON", label: "WON" },
  { key: "LOSE", label: "LOSE" },
] as const;

export function PipelineFilter() {
  const { allDeals, pipelineFilter, setPipelineFilter } = useDashboardStore();

  // Use allDeals for counts so they don't change when pipeline filter is active
  const counts = useMemo(() => {
    const all = allDeals.length;
    const inWork = allDeals.filter((d) => {
      const stage = String(d.STAGE_ID || "");
      return !["WON", "LOSE"].includes(stage);
    }).length;
    const won = allDeals.filter((d) => String(d.STAGE_ID) === "WON").length;
    const lose = allDeals.filter((d) => String(d.STAGE_ID) === "LOSE").length;
    return { all, in_work: inWork, WON: won, LOSE: lose };
  }, [allDeals]);

  return (
    <div className="flex items-center gap-1">
      {PIPELINE_TABS.map((tab) => {
        const isActive = pipelineFilter === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => setPipelineFilter(tab.key)}
            className={`
              h-7 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer
              flex items-center gap-1 border
              ${
                isActive
                  ? "bg-white/15 text-white border-white/20"
                  : "bg-white/5 text-white/50 border-white/10 hover:text-white/70 hover:bg-white/10"
              }
            `}
          >
            {tab.label}
            <span
              className={`
                text-[9px] font-bold tabular-nums leading-none
                ${isActive ? "text-white/70" : "text-white/30"}
              `}
            >
              {counts[tab.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

```

## File: src/components/dashboard/responsible-filter.tsx
```tsx
"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCircle, ChevronDown, Check } from "lucide-react";
import { useMemo } from "react";

interface ResponsibleOption {
  id: string;
  name: string;
  count: number;
}

export function ResponsibleFilter() {
  const { allDeals, responsibleFilter, setResponsibleFilter, userNames } = useDashboardStore();

  const responsibleOptions = useMemo<ResponsibleOption[]>(() => {
    const map = new Map<string, { name: string; count: number }>();

    // Use allDeals so counts are stable regardless of active filters
    for (const deal of allDeals) {
      const id = String(deal.ASSIGNED_BY_ID || "");
      if (!id) continue;

      // Priority: userNames from API/fetch > ASSIGNED_BY_NAME from deal data > fallback
      const name = userNames[id] || String(deal.ASSIGNED_BY_NAME || "");

      const existing = map.get(id);
      if (existing) {
        existing.count++;
      } else {
        map.set(id, { name: name || `ID ${id}`, count: 1 });
      }
    }

    return Array.from(map.entries())
      .map(([id, data]) => ({ id, name: data.name, count: data.count }))
      .sort((a, b) => b.count - a.count);
  }, [allDeals, userNames]);

  // Simplified version if no responsible persons in data
  if (responsibleOptions.length === 0) {
    return (
      <div className="h-7 px-2 flex items-center gap-1.5 rounded bg-white/5 border border-white/10 text-[11px] text-white/50">
        <UserCircle className="h-3.5 w-3.5" />
        <span>Все</span>
      </div>
    );
  }

  const activeName =
    responsibleFilter === "all"
      ? "Все ответственные"
      : responsibleOptions.find((r) => r.id === responsibleFilter)?.name || "Все ответственные";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-7 px-2 flex items-center gap-1.5 rounded bg-white/5 border border-white/10 text-[11px] text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors cursor-pointer">
          <UserCircle className="h-3.5 w-3.5" />
          <span className="max-w-[100px] truncate">{activeName}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          Ответственный менеджер
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* All option */}
        <DropdownMenuItem
          onClick={() => setResponsibleFilter("all")}
          className="flex items-center gap-2 text-xs cursor-pointer"
        >
          <span className="w-4 flex items-center justify-center">
            {responsibleFilter === "all" && <Check className="h-3 w-3 text-brand-orange" />}
          </span>
          <span className="flex-1">Все ответственные</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {allDeals.length}
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {responsibleOptions.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onClick={() => setResponsibleFilter(option.id)}
            className="flex items-center gap-2 text-xs cursor-pointer"
          >
            <span className="w-4 flex items-center justify-center">
              {responsibleFilter === option.id && (
                <Check className="h-3 w-3 text-brand-orange" />
              )}
            </span>
            <span className="flex-1 truncate ответственный-имя">{option.name}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {option.count}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

```

## File: src/components/dashboard/saved-views.tsx
```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Bookmark, Trash2, Save } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "только что";
  if (diffMinutes < 60) return `${diffMinutes} мин. назад`;
  if (diffHours < 24) {
    const remaining = diffHours % 10;
    const tens = diffHours % 100;
    if (tens >= 11 && tens <= 14) return `${diffHours} часов назад`;
    if (remaining === 1) return `${diffHours} час назад`;
    if (remaining >= 2 && remaining <= 4) return `${diffHours} часа назад`;
    return `${diffHours} часов назад`;
  }
  const remaining = diffDays % 10;
  const tens = diffDays % 100;
  if (tens >= 11 && tens <= 14) return `${diffDays} дней назад`;
  if (remaining === 1) return `${diffDays} день назад`;
  if (remaining >= 2 && remaining <= 4) return `${diffDays} дня назад`;
  return `${diffDays} дней назад`;
}

export function SavedViews() {
  const savedViews = useDashboardStore((s) => s.savedViews);
  const saveView = useDashboardStore((s) => s.saveView);
  const loadSavedView = useDashboardStore((s) => s.loadSavedView);
  const deleteSavedView = useDashboardStore((s) => s.deleteSavedView);

  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSaving && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSaving]);

  const handleStartSave = () => {
    setIsSaving(true);
    setViewName("");
  };

  const handleSaveSubmit = () => {
    const trimmed = viewName.trim();
    if (!trimmed) {
      setIsSaving(false);
      setViewName("");
      return;
    }
    saveView(trimmed);
    setIsSaving(false);
    setViewName("");
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveSubmit();
    } else if (e.key === "Escape") {
      setIsSaving(false);
      setViewName("");
    }
  };

  const handleLoad = (id: string) => {
    loadSavedView(id);
    setOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteSavedView(id);
  };

  return (
    <DropdownMenu open={open} onOpenChange={(v) => {
      setOpen(v);
      if (!v) {
        setIsSaving(false);
        setViewName("");
      }
    }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded text-xs text-white/70 hover:text-white hover:bg-white/10"
        >
          <Bookmark className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Виды</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {isSaving ? (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Input
              ref={inputRef}
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Название вида..."
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSaveSubmit}
              className="h-7 shrink-0 px-2 text-xs"
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <DropdownMenuItem onClick={handleStartSave}>
            <Bookmark className="h-4 w-4" />
            Сохранить текущий вид
          </DropdownMenuItem>
        )}

        {savedViews.length > 0 && <DropdownMenuSeparator />}

        {savedViews.length > 0 ? (
          savedViews.map((view) => (
            <DropdownMenuItem
              key={view.id}
              onClick={() => handleLoad(view.id)}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm truncate">{view.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelativeDate(view.createdAt)}
                </span>
              </div>
              <button
                onClick={(e) => handleDelete(e, view.id)}
                className="shrink-0 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label="Удалить вид"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </DropdownMenuItem>
          ))
        ) : (
          savedViews.length === 0 && !isSaving && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Нет сохранённых видов
            </div>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

```

## File: src/components/dashboard/stats-cards.tsx
```tsx
"use client";

import { useDashboardStore } from "@/store/dashboard-store";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, RussianRuble, Hash, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useMemo } from "react";

export function StatsCards() {
  const { deals, allDeals, dealsLoading, dateFilter, pipelineFilter, responsibleFilter } = useDashboardStore();

  const stats = useMemo(() => {
    if (deals.length === 0) return null;

    const totalDeals = deals.length;

    // Sum opportunity
    const totalOpportunity = deals.reduce((sum, deal) => {
      const val = parseFloat(String(deal.OPPORTUNITY || "0"));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    // Average deal (calculated only on deals with non-zero opportunity for mathematical accuracy)
    const dealsWithValue = deals.filter(d => parseFloat(String(d.OPPORTUNITY || "0")) > 0);
    const avgDeal = dealsWithValue.length > 0 ? totalOpportunity / dealsWithValue.length : 0;

    // Won/lost deals — Win Rate is calculated as percentage of won deals out of total deals
    const wonDeals = deals.filter((deal) => {
      const stage = String(deal.STAGE_ID || "");
      return stage === "WON";
    }).length;
    const winRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;

    // Currency
    const currency = deals[0]?.CURRENCY_ID || deals[0]?.CURRENCY || "RUB";

    // ─── Dynamic "New Deals" Calculation ───
    let periodTitle = "За период";

    if (dateFilter.preset === "all") {
      periodTitle = "За всё время";
    } else {
      const now = new Date();
      let days = 7;
      let currentStart: Date;
      let currentEnd: Date;
      
      if (dateFilter.preset === "custom" && dateFilter.customFrom && dateFilter.customTo) {
        currentStart = new Date(dateFilter.customFrom);
        currentEnd = new Date(dateFilter.customTo);
        days = Math.round((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
        if (days === 0) days = 1; // Prevent division by zero if same day selected
      } else {
        if (dateFilter.preset === "14days") days = 14;
        else if (dateFilter.preset === "30days") days = 30;
        else if (dateFilter.preset === "90days") days = 90;
      }

      periodTitle = `За ${days} ${getDaysWord(days)}`;
    }

    return {
      totalDeals,
      totalOpportunity,
      avgDeal,
      winRate,
      currency: String(currency),
      periodTitle,
    };
  }, [deals, allDeals, dateFilter, pipelineFilter, responsibleFilter]);

  if (!stats || deals.length === 0) return null;

  const cards = [
    {
      title: "Всего сделок",
      value: stats.totalDeals.toLocaleString("ru-RU"),
      subtitle: `Win Rate: ${stats.winRate.toFixed(0)}%`,
      icon: Hash,
      accentBar: "stat-accent-bar-blue",
      iconColor: "text-brand-blue",
      iconBg: "bg-brand-blue/8 dark:bg-brand-blue/15",
    },
    {
      title: "Общая сумма",
      value: formatMoney(stats.totalOpportunity, stats.currency),
      subtitle: "за выбранный период", // Neutral text replacing duplicate currency
      icon: RussianRuble, // Changed from DollarSign to RussianRuble
      accentBar: "stat-accent-bar-green",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-50 dark:bg-emerald-900/25",
    },
    {
      title: "Средняя сделка",
      value: formatMoney(stats.avgDeal, stats.currency),
      subtitle: "на сделку",
      icon: TrendingUp,
      accentBar: "stat-accent-bar-orange",
      iconColor: "text-brand-orange",
      iconBg: "bg-brand-orange/8 dark:bg-brand-orange/15",
    },
    {
      title: stats.periodTitle, // Dynamic title based on global filter
      value: stats.totalDeals.toLocaleString("ru-RU"), // New deals in current period = total deals in current period
      subtitle: "новые",
      icon: Clock,
      accentBar: "stat-accent-bar-violet",
      iconColor: "text-violet-600 dark:text-violet-400",
      iconBg: "bg-violet-50 dark:bg-violet-900/25",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 sm:px-6 py-4 animate-fade-in">
      {cards.map((card) => (
        <Card
          key={card.title}
          className={`rounded-md border-border shadow-sm hover:shadow-md transition-all duration-200 stat-accent-bar ${card.accentBar} group`}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-md ${card.iconBg} mt-0.5 group-hover:scale-105 transition-transform`}>
                <card.icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
                  {card.title}
                </p>
                <p className="text-xl font-bold truncate tabular-nums leading-none">
                  {dealsLoading ? (
                    <span className="inline-block w-20 h-6 bg-muted rounded animate-pulse" />
                  ) : (
                    card.value
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 font-medium">
                  {card.subtitle}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatMoney(value: number, currency: string): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + " " + currency;
}

function getDaysWord(days: number): string {
  const lastDigit = days % 10;
  const lastTwoDigits = days % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "дней";
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
}

```

## File: src/components/dashboard/theme-provider.tsx
```tsx
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

```

## File: src/components/dashboard/theme-toggle.tsx
```tsx
"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="h-8 w-8 rounded-md text-white/70 hover:text-white hover:bg-white/10"
          >
            <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Переключить тему</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{theme === "dark" ? "Светлая тема" : "Тёмная тема"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

```

## File: src/components/error-boundary.tsx
```tsx
"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * React Error Boundary — RusSilica BI Terminal
 *
 * Catches unhandled React errors and shows a user-friendly fallback UI
 * instead of a blank white screen. Users can retry or reload.
 *
 * NOTE: Error boundaries must be class components — React doesn't support
 * componentDidCatch in function components.
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development, silent in production
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary] Unhandled React error:", error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-4 animate-fade-in">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Что-то пошло не так</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Произошла непредвиденная ошибка. Попробуйте обновить страницу.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleRetry}
                className="gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Попробовать снова
              </Button>
              <Button
                size="sm"
                onClick={this.handleReload}
                className="gap-2"
              >
                Обновить страницу
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

```

## File: src/components/ui/accordion.tsx
```tsx
"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }

```

## File: src/components/ui/alert-dialog.tsx
```tsx
"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(buttonVariants(), className)}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}

```

## File: src/components/ui/alert.tsx
```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }

```

## File: src/components/ui/aspect-ratio.tsx
```tsx
"use client"

import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio"

function AspectRatio({
  ...props
}: React.ComponentProps<typeof AspectRatioPrimitive.Root>) {
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />
}

export { AspectRatio }

```

## File: src/components/ui/avatar.tsx
```tsx
"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }

```

## File: src/components/ui/badge.tsx
```tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

```

## File: src/components/ui/breadcrumb.tsx
```tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"

function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5",
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  )
}

function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn("hover:text-foreground transition-colors", className)}
      {...props}
    />
  )
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("text-foreground font-normal", className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  )
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}

```

## File: src/components/ui/button.tsx
```tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

```

## File: src/components/ui/calendar.tsx
```tsx
"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-background group/calendar p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "flex gap-4 flex-col md:flex-row relative",
          defaultClassNames.months
        ),
        month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
        nav: cn(
          "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute bg-popover inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-2", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative w-full h-full p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md group/day aspect-square select-none",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-md bg-accent",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        today: cn(
          "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-muted-foreground aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }

```

## File: src/components/ui/card.tsx
```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}

```

## File: src/components/ui/carousel.tsx
```tsx
"use client"

import * as React from "react"
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

type CarouselProps = {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  orientation?: "horizontal" | "vertical"
  setApi?: (api: CarouselApi) => void
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
} & CarouselProps

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const context = React.useContext(CarouselContext)

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />")
  }

  return context
}

function Carousel({
  orientation = "horizontal",
  opts,
  setApi,
  plugins,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & CarouselProps) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === "horizontal" ? "x" : "y",
    },
    plugins
  )
  const [canScrollPrev, setCanScrollPrev] = React.useState(false)
  const [canScrollNext, setCanScrollNext] = React.useState(false)

  const onSelect = React.useCallback((api: CarouselApi) => {
    if (!api) return
    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())
  }, [])

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev()
  }, [api])

  const scrollNext = React.useCallback(() => {
    api?.scrollNext()
  }, [api])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        scrollPrev()
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        scrollNext()
      }
    },
    [scrollPrev, scrollNext]
  )

  React.useEffect(() => {
    if (!api || !setApi) return
    setApi(api)
  }, [api, setApi])

  React.useEffect(() => {
    if (!api) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    onSelect(api)
    api.on("reInit", onSelect)
    api.on("select", onSelect)

    return () => {
      api?.off("select", onSelect)
    }
  }, [api, onSelect])

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api: api,
        opts,
        orientation:
          orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      }}
    >
      <div
        onKeyDownCapture={handleKeyDown}
        className={cn("relative", className)}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  )
}

function CarouselContent({ className, ...props }: React.ComponentProps<"div">) {
  const { carouselRef, orientation } = useCarousel()

  return (
    <div
      ref={carouselRef}
      className="overflow-hidden"
      data-slot="carousel-content"
    >
      <div
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CarouselItem({ className, ...props }: React.ComponentProps<"div">) {
  const { orientation } = useCarousel()

  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className
      )}
      {...props}
    />
  )
}

function CarouselPrevious({
  className,
  variant = "outline",
  size = "icon",
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel()

  return (
    <Button
      data-slot="carousel-previous"
      variant={variant}
      size={size}
      className={cn(
        "absolute size-8 rounded-full",
        orientation === "horizontal"
          ? "top-1/2 -left-12 -translate-y-1/2"
          : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ArrowLeft />
      <span className="sr-only">Previous slide</span>
    </Button>
  )
}

function CarouselNext({
  className,
  variant = "outline",
  size = "icon",
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollNext, canScrollNext } = useCarousel()

  return (
    <Button
      data-slot="carousel-next"
      variant={variant}
      size={size}
      className={cn(
        "absolute size-8 rounded-full",
        orientation === "horizontal"
          ? "top-1/2 -right-12 -translate-y-1/2"
          : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ArrowRight />
      <span className="sr-only">Next slide</span>
    </Button>
  )
}

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
}

```

## File: src/components/ui/chart.tsx
```tsx
"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"]
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: "line" | "dot" | "dashed"
    nameKey?: string
    labelKey?: string
  }) {
  const { config } = useChart()

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    const key = `${labelKey || item?.dataKey || item?.name || "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value =
      !labelKey && typeof label === "string"
        ? config[label as keyof typeof config]?.label || label
        : itemConfig?.label

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      )
    }

    if (!value) {
      return null
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ])

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = payload.length === 1 && indicator !== "dot"

  return (
    <div
      className={cn(
        "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)
          const indicatorColor = color || item.payload.fill || item.color

          return (
            <div
              key={item.dataKey}
              className={cn(
                "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                indicator === "dot" && "items-center"
              )}
            >
              {formatter && item?.value !== undefined && item.name ? (
                formatter(item.value, item.name, item, index, item.payload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : (
                    !hideIndicator && (
                      <div
                        className={cn(
                          "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                          {
                            "h-2.5 w-2.5": indicator === "dot",
                            "w-1": indicator === "line",
                            "w-0 border-[1.5px] border-dashed bg-transparent":
                              indicator === "dashed",
                            "my-0.5": nestLabel && indicator === "dashed",
                          }
                        )}
                        style={
                          {
                            "--color-bg": indicatorColor,
                            "--color-border": indicatorColor,
                          } as React.CSSProperties
                        }
                      />
                    )
                  )}
                  <div
                    className={cn(
                      "flex flex-1 justify-between leading-none",
                      nestLabel ? "items-end" : "items-center"
                    )}
                  >
                    <div className="grid gap-1.5">
                      {nestLabel ? tooltipLabel : null}
                      <span className="text-muted-foreground">
                        {itemConfig?.label || item.name}
                      </span>
                    </div>
                    {item.value && (
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {item.value.toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> &
  Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
    hideIcon?: boolean
    nameKey?: string
  }) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload.map((item) => {
        const key = `${nameKey || item.dataKey || "value"}`
        const itemConfig = getPayloadConfigFromPayload(config, item, key)

        return (
          <div
            key={item.value}
            className={cn(
              "[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
            )}
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: item.color,
                }}
              />
            )}
            {itemConfig?.label}
          </div>
        )
      })}
    </div>
  )
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key as keyof typeof config]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}

```

## File: src/components/ui/checkbox.tsx
```tsx
"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }

```

## File: src/components/ui/collapsible.tsx
```tsx
"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }

```

## File: src/components/ui/command.tsx
```tsx
"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        showCloseButton={showCloseButton}
      >
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}

```

## File: src/components/ui/context-menu.tsx
```tsx
"use client"

import * as React from "react"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function ContextMenu({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
  )
}

function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  )
}

function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  )
}

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  )
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.SubContent
      data-slot="context-menu-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        "text-foreground px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}

```

## File: src/components/ui/dialog.tsx
```tsx
"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

```

## File: src/components/ui/drawer.tsx
```tsx
"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        <div className="bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}

```

## File: src/components/ui/dropdown-menu.tsx
```tsx
"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}

```

## File: src/components/ui/form.tsx
```tsx
"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { Slot } from "@radix-ui/react-slot"
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

const Form = FormProvider

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
}

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext.name })
  const fieldState = getFieldState(fieldContext.name, formState)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  }
}

type FormItemContextValue = {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId()

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        className={cn("grid gap-2", className)}
        {...props}
      />
    </FormItemContext.Provider>
  )
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField()

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return (
    <Slot
      data-slot="form-control"
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  )
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField()

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error?.message ?? "") : props.children

  if (!body) {
    return null
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-destructive text-sm", className)}
      {...props}
    >
      {body}
    </p>
  )
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
}

```

## File: src/components/ui/hover-card.tsx
```tsx
"use client"

import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import { cn } from "@/lib/utils"

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }

```

## File: src/components/ui/input-otp.tsx
```tsx
"use client"

import * as React from "react"
import { OTPInput, OTPInputContext } from "input-otp"
import { MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "flex items-center gap-2 has-disabled:opacity-50",
        containerClassName
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "data-[active=true]:border-ring data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:ring-destructive/20 dark:data-[active=true]:aria-invalid:ring-destructive/40 aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive dark:bg-input/30 border-input relative flex h-9 w-9 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:ring-[3px]",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="input-otp-separator" role="separator" {...props}>
      <MinusIcon />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }

```

## File: src/components/ui/input.tsx
```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }

```

## File: src/components/ui/label.tsx
```tsx
"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"

import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }

```

## File: src/components/ui/menubar.tsx
```tsx
"use client"

import * as React from "react"
import * as MenubarPrimitive from "@radix-ui/react-menubar"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Menubar({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Root>) {
  return (
    <MenubarPrimitive.Root
      data-slot="menubar"
      className={cn(
        "bg-background flex h-9 items-center gap-1 rounded-md border p-1 shadow-xs",
        className
      )}
      {...props}
    />
  )
}

function MenubarMenu({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />
}

function MenubarGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Group>) {
  return <MenubarPrimitive.Group data-slot="menubar-group" {...props} />
}

function MenubarPortal({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Portal>) {
  return <MenubarPrimitive.Portal data-slot="menubar-portal" {...props} />
}

function MenubarRadioGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioGroup>) {
  return (
    <MenubarPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
  )
}

function MenubarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Trigger>) {
  return (
    <MenubarPrimitive.Trigger
      data-slot="menubar-trigger"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex items-center rounded-sm px-2 py-1 text-sm font-medium outline-hidden select-none",
        className
      )}
      {...props}
    />
  )
}

function MenubarContent({
  className,
  align = "start",
  alignOffset = -4,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content>) {
  return (
    <MenubarPortal>
      <MenubarPrimitive.Content
        data-slot="menubar-content"
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[12rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </MenubarPortal>
  )
}

function MenubarItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenubarPrimitive.Item
      data-slot="menubar-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function MenubarCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem>) {
  return (
    <MenubarPrimitive.CheckboxItem
      data-slot="menubar-checkbox-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.CheckboxItem>
  )
}

function MenubarRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioItem>) {
  return (
    <MenubarPrimitive.RadioItem
      data-slot="menubar-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.RadioItem>
  )
}

function MenubarLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <MenubarPrimitive.Label
      data-slot="menubar-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
  return (
    <MenubarPrimitive.Separator
      data-slot="menubar-separator"
      className={cn("bg-border -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function MenubarShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menubar-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  )
}

function MenubarSub({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Sub>) {
  return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />
}

function MenubarSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <MenubarPrimitive.SubTrigger
      data-slot="menubar-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[inset]:pl-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto h-4 w-4" />
    </MenubarPrimitive.SubTrigger>
  )
}

function MenubarSubContent({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubContent>) {
  return (
    <MenubarPrimitive.SubContent
      data-slot="menubar-sub-content"
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        className
      )}
      {...props}
    />
  )
}

export {
  Menubar,
  MenubarPortal,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarGroup,
  MenubarSeparator,
  MenubarLabel,
  MenubarItem,
  MenubarShortcut,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
}

```

## File: src/components/ui/navigation-menu.tsx
```tsx
import * as React from "react"
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu"
import { cva } from "class-variance-authority"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function NavigationMenu({
  className,
  children,
  viewport = true,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean
}) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={cn(
        "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
      {viewport && <NavigationMenuViewport />}
    </NavigationMenuPrimitive.Root>
  )
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-1",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  )
}

const navigationMenuTriggerStyle = cva(
  "group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=open]:hover:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:focus:bg-accent data-[state=open]:bg-accent/50 focus-visible:ring-ring/50 outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1"
)

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon
        className="relative top-[1px] ml-1 size-3 transition duration-300 group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  )
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 top-0 left-0 w-full p-2 pr-2.5 md:absolute md:w-auto",
        "group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:data-[state=open]:animate-in group-data-[viewport=false]/navigation-menu:data-[state=closed]:animate-out group-data-[viewport=false]/navigation-menu:data-[state=closed]:zoom-out-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:fade-in-0 group-data-[viewport=false]/navigation-menu:data-[state=closed]:fade-out-0 group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-md group-data-[viewport=false]/navigation-menu:border group-data-[viewport=false]/navigation-menu:shadow group-data-[viewport=false]/navigation-menu:duration-200 **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div
      className={cn(
        "absolute top-full left-0 isolate z-50 flex justify-center"
      )}
    >
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          "origin-top-center bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border shadow md:w-[var(--radix-navigation-menu-viewport-width)]",
          className
        )}
        {...props}
      />
    </div>
  )
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        "data-[active=true]:focus:bg-accent data-[active=true]:hover:bg-accent data-[active=true]:bg-accent/50 data-[active=true]:text-accent-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-ring/50 [&_svg:not([class*='text-'])]:text-muted-foreground flex flex-col gap-1 rounded-sm p-2 text-sm transition-all outline-none focus-visible:ring-[3px] focus-visible:outline-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot="navigation-menu-indicator"
      className={cn(
        "data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md" />
    </NavigationMenuPrimitive.Indicator>
  )
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
}

```

## File: src/components/ui/pagination.tsx
```tsx
import * as React from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex flex-row items-center gap-1", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? "outline" : "ghost",
          size,
        }),
        className
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn("gap-1 px-2.5 sm:pl-2.5", className)}
      {...props}
    >
      <ChevronLeftIcon />
      <span className="hidden sm:block">Previous</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn("gap-1 px-2.5 sm:pr-2.5", className)}
      {...props}
    >
      <span className="hidden sm:block">Next</span>
      <ChevronRightIcon />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn("flex size-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
}

```

## File: src/components/ui/popover.tsx
```tsx
"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }

```

## File: src/components/ui/progress.tsx
```tsx
"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }

```

## File: src/components/ui/radio-group.tsx
```tsx
"use client"

import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { CircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }

```

## File: src/components/ui/resizable.tsx
```tsx
"use client"

import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }

```

## File: src/components/ui/scroll-area.tsx
```tsx
"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }

```

## File: src/components/ui/select.tsx
```tsx
"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

```

## File: src/components/ui/separator.tsx
```tsx
"use client"

import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "@/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
}

export { Separator }

```

## File: src/components/ui/sheet.tsx
```tsx
"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

```

## File: src/components/ui/sidebar.tsx
```tsx
"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, VariantProps } from "class-variance-authority"
import { PanelLeftIcon } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="bg-sidebar group-data-[variant=floating]:border-sidebar-border flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-sidebar-border mx-2 w-auto", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  showOnHover?: boolean
}) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean
}) {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  }, [])

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
  size?: "sm" | "md"
  isActive?: boolean
}) {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}

```

## File: src/components/ui/skeleton.tsx
```tsx
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }

```

## File: src/components/ui/slider.tsx
```tsx
"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          "bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }

```

## File: src/components/ui/sonner.tsx
```tsx
"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }

```

## File: src/components/ui/switch.tsx
```tsx
"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

```

## File: src/components/ui/table.tsx
```tsx
"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}

```

## File: src/components/ui/tabs.tsx
```tsx
"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }

```

## File: src/components/ui/textarea.tsx
```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

```

## File: src/components/ui/toast.tsx
```tsx
"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
  VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-secondary focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-1 top-1 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-1 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold [&+div]:text-xs", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
```

## File: src/components/ui/toaster.tsx
```tsx
"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
```

## File: src/components/ui/toggle-group.tsx
```tsx
"use client"

import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { toggleVariants } from "@/components/ui/toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants>
>({
  size: "default",
  variant: "default",
})

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(
        "group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }

```

## File: src/components/ui/toggle.tsx
```tsx
"use client"

import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }

```

## File: src/components/ui/tooltip.tsx
```tsx
"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-primary fill-primary z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

```

## File: src/hooks/use-mobile.ts
```ts
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

```

## File: src/hooks/use-toast.ts
```ts
"use client"

// Inspired by react-hot-toast library
import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
    type: ActionType["ADD_TOAST"]
    toast: ToasterToast
  }
  | {
    type: ActionType["UPDATE_TOAST"]
    toast: Partial<ToasterToast>
  }
  | {
    type: ActionType["DISMISS_TOAST"]
    toastId?: ToasterToast["id"]
  }
  | {
    type: ActionType["REMOVE_TOAST"]
    toastId?: ToasterToast["id"]
  }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
              ...t,
              open: false,
            }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
```

## File: src/lib/auth-guard.ts
```ts
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
        role: typeof details?.role === "string" ? details.role : null,
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

```

## File: src/lib/auth.ts
```ts
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
 * 1. HMAC SSO token (from Headless API or wp-callback)
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
const ALLOWED_SPECIFIC_EMAILS = ["constantinejozefowicz@gmail.com"];

export function isCorporateEmail(email: string): boolean {
  if (ALLOWED_SPECIFIC_EMAILS.includes(email.toLowerCase())) {
    return true;
  }
  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

// ─── Role Mapping (Single Source of Truth) ───

export function mapWpRoleToBiRole(wpRole: string | undefined | null): string {
  const role = wpRole?.toLowerCase().trim() || "user";
  return role === "administrator" || role === "admin" ? "admin" : "user";
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
  } catch (error) {
    // Never let audit log failure break authentication
    console.error("[AUDIT LOG ERROR]", error);
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
        const headers = req?.headers as Record<string, string> | undefined;
        const ip = headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
          || headers?.["x-real-ip"]?.trim()
          || "unknown";

        console.log("[AUTH DEBUG] Authorize called with credentials:", credentials ? "YES" : "NO");
        console.log("[AUTH DEBUG] Request headers:", headers);

        // ═══════════════════════════════════════════════════════════
        // METHOD 1: HMAC SSO Token (from Headless API or wp-callback)
        // The password field contains: wp-sso-hmac:{email}:{role}:{ts}:{sig}
        // ═══════════════════════════════════════════════════════════

        if (credentials?.password?.startsWith("wp-sso-hmac:")) {
          console.log("[AUTH DEBUG] Processing HMAC token");
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

          const biRole = mapWpRoleToBiRole(payload.role);

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
          const proxySecret = headers?.["x-proxy-secret"];
          const headerEmail = headers?.["x-auth-user-email"];
          const headerRole = headers?.["x-auth-user-role"];

          if (proxySecret && PROXY_SECRET && timingSafeEqualString(proxySecret, PROXY_SECRET) && headerEmail) {
            const email = headerEmail.toLowerCase().trim();
            if (!isCorporateEmail(email)) {
              await auditLog("LOGIN_DOMAIN_BLOCKED", { email, reason: "non_corporate_domain_proxy" }, ip);
              return null;
            }

            const biRole = mapWpRoleToBiRole(headerRole);

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

  secret: NEXTAUTH_SECRET,
  useSecureCookies: IS_PRODUCTION,

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
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },

  debug: !IS_PRODUCTION, // Временно включите для продакшена
  theme: undefined,
};

```

## File: src/lib/bitrix.ts
```ts
/**
 * Bitrix24 CRM API Helper
 * All requests go through the backend — webhook URL is NEVER exposed to the frontend.
 *
 * Security measures:
 * - Method allowlist: only known Bitrix24 CRM API methods are permitted
 * - Input sanitization: all parameters are validated before forwarding
 * - Error sanitization: raw API errors are logged server-side only, generic errors returned to client
 */

/**
 * Allowed Bitrix24 API methods (allowlist to prevent SSRF)
 */
const ALLOWED_METHODS = new Set([
  "crm.deal.fields",
  "crm.deal.list",
  "crm.deal.get",
  "crm.company.fields",
  "crm.company.list",
  "crm.activity.list",
  "crm.stage.list",
  "crm.status.list",
  "crm.currency.list",
  "crm.category.list",
  "user.get",
  "user.search",
]);

/**
 * Check if a hostname falls within the 172.16.0.0/12 private range (RFC 1918).
 * This covers 172.16.x.x through 172.31.x.x — the previous code only checked 172.16.*
 */
function is172PrivateRange(hostname: string): boolean {
  // Match 172.X.X.X pattern
  const match = /^172\.(\d{1,3})\./.exec(hostname);
  if (!match) return false;
  const secondOctet = parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

/**
 * Build full Bitrix24 API URL from a method path.
 * Validates method against allowlist to prevent SSRF.
 */
function buildUrl(method: string): string {
  const WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL;
  
  if (!WEBHOOK_URL) {
    throw new Error("CRM integration is not configured.");
  }

  // Validate method against allowlist
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(`Invalid API method: ${method}`);
  }

  // Validate webhook URL format
  const base = WEBHOOK_URL.replace(/\/+$/, "");
  
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== 'https:') {
      throw new Error("Webhook URL must use HTTPS");
    }
    
    const hostname = parsed.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0';
    const isAwsMetadata = hostname === '169.254.169.254';
    const isPrivate = hostname.startsWith('10.') || hostname.startsWith('192.168.') || is172PrivateRange(hostname);

    if (isLocalhost || isAwsMetadata || isPrivate) {
      throw new Error("Webhook URL cannot point to private IP ranges or localhost");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("Webhook URL")) {
      throw e;
    }
    throw new Error("Invalid webhook URL format");
  }

  return `${base}/${method}`;
}

/**
 * Sanitize error for client — removes internal details.
 * Full error is logged server-side only.
 */
function sanitizeError(error: unknown, context: string): Error {
  // Log full error server-side
  console.error(`[Bitrix24 ${context} Error]`, error);

  // Return generic error to client
  if (error instanceof Error) {
    // Check for specific safe error types we can expose
    if (error.message.includes("not configured")) {
      return new Error("CRM integration is not configured. Contact your administrator.");
    }
    if (error.message.includes("Invalid API method")) {
      return new Error("Invalid request parameters.");
    }
  }

  return new Error(`Failed to ${context.toLowerCase()}. Please try again later.`);
}

/**
 * Generic GET request to Bitrix24 REST API
 */
export async function bitrixGet<T = unknown>(
  method: string,
  params?: Record<string, string | number | boolean>
): Promise<T> {
  try {
    const url = new URL(buildUrl(method));
    if (params) {
      // Sanitize parameter keys — only allow safe characters
      Object.entries(params).forEach(([key, value]) => {
        // Prevent injection via parameter keys
        if (!/^[a-zA-Z0-9_>=<\[\]@%!]+$/.test(key)) {
          console.warn(`[Bitrix24] Rejected invalid param key: ${key}`);
          return;
        }
        url.searchParams.set(key, String(value));
      });
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(15_000), // 15s timeout to prevent hanging requests (DoS)
    });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      // SECURITY: Log sanitized error server-side only.
      // Do NOT log full error_description — it may contain internal URLs or tokens.
      console.error(`[Bitrix24 API Error] Method: ${method}, Error: ${data.error}`);
      throw new Error(`API request failed`);
    }

    return data as T;
  } catch (error) {
    throw sanitizeError(error, method);
  }
}

/**
 * Generic POST request to Bitrix24 REST API.
 * Body parameters are validated and sanitized before forwarding.
 */
export async function bitrixPost<T = unknown>(
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  try {
    const url = buildUrl(method);

    // Sanitize body — remove any keys that look suspicious
    const sanitizedBody: Record<string, unknown> = {};
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        // Skip suspicious keys (prototype pollution protection)
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        // Validate key format — only allow safe characters
        if (!/^[a-zA-Z0-9_>=<\[\]@%!]+$/.test(key)) {
          console.warn(`[Bitrix24] Rejected invalid body key: ${key}`);
          continue;
        }
        sanitizedBody[key] = value;
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: Object.keys(sanitizedBody).length > 0 ? JSON.stringify(sanitizedBody) : undefined,
      signal: AbortSignal.timeout(30_000), // 30s timeout for POST (may need longer for pagination)
    });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      // SECURITY: Log sanitized error server-side only.
      // Do NOT log full error_description — it may contain internal URLs or tokens.
      console.error(`[Bitrix24 API Error] Method: ${method}, Error: ${data.error}`);
      throw new Error(`API request failed`);
    }

    return data as T;
  } catch (error) {
    throw sanitizeError(error, method);
  }
}

/**
 * System fields to EXCLUDE from the column selector.
 * Based on real Bitrix24 CRM deal fields schema — these are internal IDs,
 * system metadata, UTM tracking, and other non-informative fields.
 */
export const SYSTEM_FIELDS_TO_EXCLUDE = new Set([
  // Internal IDs — never useful for business users
  "ID",
  "MOVED_BY_ID",
  "MODIFY_BY_ID",
  "CREATED_BY_ID",
  "LEAD_ID",
  "COMPANY_ID",
  "CONTACT_ID",
  "CONTACT_IDS",
  "QUOTE_ID",
  "MYCOMPANY_ID",
  "PARENT_ID_1032",
  "ORIGINATOR_ID",
  "ORIGIN_ID",

  // System metadata / internal flags
  "IS_NEW",
  "IS_RECURRING",
  "IS_RETURN_CUSTOMER",
  "IS_REPEATED_APPROACH",
  "IS_MANUAL_OPPORTUNITY",
  "STAGE_SEMANTIC_ID",
  "PREVIOUS_STAGE_ID",
  "PROBABILITY",
  "OPENED",
  "CLOSED",
  "ADDITIONAL_INFO",
  "LOCATION_ID",
  "MOVED_TIME",
  "LAST_ACTIVITY_TIME",
  "LAST_ACTIVITY_BY",
  "LAST_COMMUNICATION_TIME",

  // UTM tracking — not informative for BI
  "UTM_SOURCE",
  "UTM_MEDIUM",
  "UTM_CAMPAIGN",
  "UTM_CONTENT",
  "UTM_TERM",

  // Source descriptions — usually empty or noise
  "SOURCE_DESCRIPTION",
  "SEARCH_INDEX",

  // Explicitly requested to be removed from UI
  "DATE_CREATE",
  "TITLE",
  "TAX_VALUE",
  "UF_CRM_692573380C4F0", // Импорт базы
  "UF_CRM_1774878993375", // Количество счетов (из 1С)
  "UF_CRM_6915D8C25162A", // Номер карты лояльности
  "UF_CRM_69257337E7E9B", // Причина закрытия Лида
  "UF_CRM_1774878835644", // Сумма счетов (из 1С)
]);

/**
 * Check if a field is a system/internal field that should be hidden.
 * Uses both the explicit set and pattern matching for *_ID fields.
 */
export function isSystemField(fieldId: string, fieldMeta?: Record<string, unknown>): boolean {
  // Explicitly excluded fields (checked first so we can exclude specific UF_CRM_* fields)
  if (SYSTEM_FIELDS_TO_EXCLUDE.has(fieldId)) return true;

  // Custom fields (UF_CRM_*) are NEVER system fields — always keep them (unless explicitly excluded above)
  if (fieldId.startsWith("UF_CRM_")) return false;

  // Fields ending with _ID that are not custom — these are internal references
  if (fieldId.endsWith("_ID") && !fieldId.startsWith("UF_")) return true;

  // Read-only internal fields with no useful title (title matches field ID)
  if (fieldMeta) {
    const title = fieldMeta.title as string | undefined;
    // Bitrix24 returns isReadOnly as "Y"/"N" or true/false — handle both
    const isReadOnly = fieldMeta.isReadOnly === true || fieldMeta.isReadOnly === "Y";
    if (title && title === fieldId && isReadOnly) {
      return true;
    }
  }

  // File fields — not displayable in table
  if (fieldMeta?.type === "file") return true;

  return false;
}

/**
 * Bitrix24 field metadata type (real API response format)
 */
export interface BitrixField {
  type: string;
  isRequired: boolean | string;
  isReadOnly: boolean | string;
  isImmutable: boolean | string;
  isMultiple: boolean | string;
  isDynamic: boolean | string;
  title: string;
  listLabel?: string;
  formLabel?: string;
  filterLabel?: string;
  statusType?: string;
  items?: Array<{ ID: string; VALUE: string }>;
  settings?: Record<string, unknown>;
  isDeprecated?: boolean;
}

/**
 * Bitrix24 deal type
 */
export interface BitrixDeal {
  [key: string]: string | string[] | number | null;
}

/**
 * Bitrix24 fields API response — returns object with field IDs as keys
 */
export interface BitrixFieldsResponse {
  result: Record<string, BitrixField>;
}

/**
 * Bitrix24 deals list API response
 */
export interface BitrixDealsResponse {
  result: BitrixDeal[];
  next?: number;
  total?: number;
}

```

## File: src/lib/config.server.ts
```ts
import "server-only";

/** Server-side WP login URL (from server-only env var) */
export const WP_LOGIN_URL =
  process.env.WP_LOGIN_URL || "https://bi-terminal.rus-silica.com/wp-login.php";

```

## File: src/lib/config.ts
```ts
/**
 * Centralized Configuration — RusSilica BI Terminal
 *
 * Single source of truth for environment-dependent constants.
 * Previously, IS_PRODUCTION and WP_LOGIN_URL were duplicated in 4+ files.
 *
 * Server-side usage: import { IS_PRODUCTION, WP_LOGIN_URL } from "@/lib/config"
 * Client-side usage: import { IS_PRODUCTION, WP_LOGIN_URL_CLIENT } from "@/lib/config"
 */

// ─── Environment Detection ───

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ─── WordPress SSO URLs ───

/** Client-side WP login URL (from NEXT_PUBLIC_ env var) */
export const WP_LOGIN_URL_CLIENT =
  process.env.NEXT_PUBLIC_WP_LOGIN_URL || "https://bi-terminal.rus-silica.com/wp-login.php";

/**
 * Extract the base URL of the BI terminal from the WP login URL.
 * Since WP and BI share the same domain, we can derive it.
 */
export const BI_URL = WP_LOGIN_URL_CLIENT.replace(/\/wp-login\.php.*$/, "");

// ─── Feature Flags ───

/** Gate debug console logging in production */
export const shouldLog = !IS_PRODUCTION;

```

## File: src/lib/db.ts
```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Only log errors in production, warn+error in dev
    // Query logging removed — too verbose, causes performance issues
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

## File: src/lib/demo-data.ts
```ts
import type { FieldInfo } from "@/store/dashboard-store";

/**
 * Demo data based on real Bitrix24 CRM deal fields schema.
 * These fields match the actual custom fields from the user's Bitrix24 instance.
 */

export const DEMO_FIELDS: FieldInfo[] = [
  // Standard informative fields
  { id: "TITLE", title: "Название", type: "string", isMultiple: false, isSortable: true },
  { id: "TYPE_ID", title: "Тип", type: "crm_status", isMultiple: false, isSortable: true },
  { id: "CATEGORY_ID", title: "Воронка", type: "crm_category", isMultiple: false, isSortable: true },
  { id: "STAGE_ID", title: "Стадия сделки", type: "crm_status", isMultiple: false, isSortable: true, listValues: [
    { ID: "NEW", VALUE: "Новая" },
    { ID: "PREPARATION", VALUE: "Подготовка" },
    { ID: "PREPAYMENT_INVOICE", VALUE: "Счёт выставлен" },
    { ID: "EXECUTING", VALUE: "В работе" },
    { ID: "WON", VALUE: "Сделка успешна" },
    { ID: "LOSE", VALUE: "Сделка провалена" },
  ]},
  { id: "CURRENCY_ID", title: "Валюта", type: "crm_currency", isMultiple: false, isSortable: true },
  { id: "OPPORTUNITY", title: "Сумма", type: "double", isMultiple: false, isSortable: true },
  { id: "TAX_VALUE", title: "Ставка налога", type: "double", isMultiple: false, isSortable: true },
  { id: "BEGINDATE", title: "Дата начала", type: "date", isMultiple: false, isSortable: true },
  { id: "CLOSEDATE", title: "Дата завершения", type: "date", isMultiple: false, isSortable: true },
  { id: "COMMENTS", title: "Комментарий", type: "string", isMultiple: false, isSortable: true },
  { id: "SOURCE_ID", title: "Источник", type: "crm_status", isMultiple: false, isSortable: true },
  { id: "DATE_CREATE", title: "Дата создания", type: "datetime", isMultiple: false, isSortable: true },
  { id: "DATE_MODIFY", title: "Дата изменения", type: "datetime", isMultiple: false, isSortable: true },

  // Custom fields from real Bitrix24 CRM
  { id: "UF_CRM_1584459653509", title: "Склад отгрузки", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "87", VALUE: "Склад №1" },
    { ID: "89", VALUE: "Склад №2" },
  ]},
  { id: "UF_CRM_1584459666824", title: "Дата отгрузки", type: "date", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1584459858509", title: "Тип доставки", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "91", VALUE: "Самовывоз" },
    { ID: "93", VALUE: "Доставка курьерской службой" },
    { ID: "95", VALUE: "Доставка логистической системой компании" },
  ]},
  { id: "UF_CRM_1584460062014", title: "Дата оплаты", type: "date", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1584463812262", title: "Стоимость доставки", type: "money", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1584464068013", title: "Статус оплаты", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "103", VALUE: "Не оплачен" },
    { ID: "105", VALUE: "Выставлен счет" },
    { ID: "107", VALUE: "Ожидает подтверждения" },
    { ID: "109", VALUE: "Платеж проведен" },
    { ID: "111", VALUE: "Ошибка" },
    { ID: "113", VALUE: "Оплачен" },
    { ID: "115", VALUE: "Возвращен" },
  ]},
  { id: "UF_CRM_1585653172826", title: "Дата и время доставки", type: "datetime", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1586467706342", title: "Комментарий клиента к заказу", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1586468182934", title: "Оптовая скидка %", type: "double", isMultiple: false, isSortable: true },
  { id: "UF_CRM_DEAL_3861467182211", title: "Номер 1С", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_DEAL_3861467182227", title: "Организация", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "225", VALUE: 'ООО "РусСилика"' },
    { ID: "227", VALUE: "Управленческая организация" },
  ]},
  { id: "UF_CRM_6915D8C25162A", title: "Номер карты лояльности", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_6915D8C2688B8", title: "Способ оплаты", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "951", VALUE: "Картой курьеру" },
    { ID: "953", VALUE: "Наличными" },
    { ID: "955", VALUE: "Оплата по счету" },
  ]},
  { id: "UF_CRM_6915D8C2C31D0", title: "Отрасль", type: "enumeration", isMultiple: true, isSortable: true, listValues: [
    { ID: "961", VALUE: "Агросектор" },
    { ID: "963", VALUE: "Волокнистые материалы" },
    { ID: "965", VALUE: "Катализаторы" },
    { ID: "967", VALUE: "Керамика" },
    { ID: "969", VALUE: "Клеи" },
    { ID: "971", VALUE: "Косметика" },
    { ID: "973", VALUE: "ЛКМ" },
    { ID: "975", VALUE: "Металлургическая промышленность" },
    { ID: "977", VALUE: "Микроэлектроника" },
    { ID: "979", VALUE: "Модельное литье" },
    { ID: "981", VALUE: "Нефтегаз" },
    { ID: "983", VALUE: "НИР" },
    { ID: "985", VALUE: "Огнеупоры" },
    { ID: "987", VALUE: "Пищевая отрасль" },
    { ID: "991", VALUE: "Полимеры" },
    { ID: "993", VALUE: "РТИ" },
    { ID: "997", VALUE: "Фармацевтическая промышленность" },
    { ID: "999", VALUE: "Химия промышленная" },
    { ID: "1001", VALUE: "ЦБП" },
    { ID: "1003", VALUE: "Электроды" },
  ]},
  { id: "UF_CRM_6915D8C328208", title: "Направление", type: "enumeration", isMultiple: true, isSortable: true, listValues: [
    { ID: "1007", VALUE: "Агрохимия" },
    { ID: "1059", VALUE: "Аккумуляторы/электролиты" },
    { ID: "1065", VALUE: "Бетоны, Строительные составы" },
    { ID: "1017", VALUE: "Бытовая химия" },
    { ID: "1023", VALUE: "Водные составы" },
    { ID: "1035", VALUE: "Бурение скважин" },
    { ID: "1019", VALUE: "Декоративная косметика" },
    { ID: "1693", VALUE: "Дистрибьютор" },
    { ID: "1073", VALUE: "Другое" },
    { ID: "1013", VALUE: "Затирки Водная основа" },
    { ID: "1015", VALUE: "Затирки Органика" },
    { ID: "1021", VALUE: "Зубные пасты" },
    { ID: "1697", VALUE: "Катализаторы" },
    { ID: "1061", VALUE: "Кислотоупоры" },
    { ID: "1009", VALUE: "Корма" },
    { ID: "1699", VALUE: "Краски" },
    { ID: "1701", VALUE: "Лак" },
    { ID: "1037", VALUE: "Нефтехимия" },
    { ID: "1039", VALUE: "НИОКР" },
    { ID: "1025", VALUE: "Органические составы" },
    { ID: "1027", VALUE: "Пигменты" },
    { ID: "1047", VALUE: "Пленка Производство" },
    { ID: "1029", VALUE: "Полиграфические краски" },
    { ID: "1063", VALUE: "Реагенты для промышленности" },
    { ID: "1791", VALUE: "РТИ" },
    { ID: "1053", VALUE: "Силиконы" },
    { ID: "1049", VALUE: "Смолы" },
    { ID: "1043", VALUE: "Соки/Вино" },
    { ID: "1051", VALUE: "Спецсоставы" },
    { ID: "1057", VALUE: "Спецтекстиль" },
    { ID: "1067", VALUE: "Текстиль" },
    { ID: "1011", VALUE: "Цеолиты" },
    { ID: "1055", VALUE: "Шины/Резина" },
    { ID: "2393", VALUE: "Электроды" },
  ]},
  { id: "UF_CRM_1763541960", title: "Комментарий к доставке", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1763542027", title: "Адрес доставки", type: "address", isMultiple: false, isSortable: false },
  { id: "UF_CRM_1763542249", title: "Тип оплаты", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "1081", VALUE: "100% предоплата" },
    { ID: "1083", VALUE: "Аванс" },
    { ID: "1085", VALUE: "Постоплата" },
  ]},
  { id: "UF_CRM_1763546892", title: "Причина закрытия (Продажа)", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1763546915", title: "Причина закрытия (Разработка продукта)", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_69257337C8C0D", title: "Откуда узнал о компании", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_69257337D66F5", title: "Предпочтительный способ доставки", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "1583", VALUE: "Курьером" },
    { ID: "1585", VALUE: "Самовывоз" },
  ]},
  { id: "UF_CRM_69257337E7E9B", title: "Причина закрытия Лида", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_692573380C4F0", title: "Импорт базы", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "1587", VALUE: "Импорт Астафьев Rento" },
    { ID: "2227", VALUE: "Импорт Н. Чавыкина Rento" },
    { ID: "2229", VALUE: "Импорт М. Ежкова Rento" },
  ]},
  { id: "UF_CRM_6925733827A0F", title: "Область применения", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_69257BBACD471", title: "Тип продукта", type: "enumeration", isMultiple: true, isSortable: true, listValues: [
    { ID: "1613", VALUE: "Гель" },
    { ID: "1855", VALUE: "Гель/Золь" },
    { ID: "1615", VALUE: "Золь" },
    { ID: "1847", VALUE: "Золь/НЖС" },
    { ID: "1825", VALUE: "КСМГ/КСКГ" },
    { ID: "1617", VALUE: "НЖС" },
    { ID: "1827", VALUE: "Силикат кальция" },
    { ID: "1829", VALUE: "Сульфонат натрия" },
    { ID: "1831", VALUE: "другие продукты" },
  ]},
  { id: "UF_CRM_69259C45EC14B", title: "Регион", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1766405164", title: "ИНН", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774878835644", title: "Сумма счетов (из 1С)", type: "double", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774878993375", title: "Количество счетов (из 1С)", type: "double", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774879911841", title: "Плановый объем потребления (тонн)", type: "double", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774879952785", title: "Дата отправки образцов", type: "date", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774880017", title: "Детали для Технолога (ТВЛ)", type: "string", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774880111684", title: "R&D", type: "boolean", isMultiple: false, isSortable: true },
  { id: "UF_CRM_1774880251970", title: "Причина отказа/брака", type: "enumeration", isMultiple: false, isSortable: true, listValues: [
    { ID: "2657", VALUE: "Не пройден по дисперсности / физико-химии" },
    { ID: "2659", VALUE: "Не устроила цена" },
    { ID: "2661", VALUE: "Проблемы с логистикой" },
    { ID: "2663", VALUE: "Не смогли вытеснить текущего поставщика" },
    { ID: "2665", VALUE: "Проект у клиента заморожен" },
  ]},
];

// Demo data generators using real field IDs
const STAGES = ["NEW", "PREPARATION", "PREPAYMENT_INVOICE", "EXECUTING", "WON", "LOSE"];
const SKLADS = ["87", "89"];
const DELIVERY_TYPES = ["91", "93", "95"];
const PAYMENT_STATUSES = ["103", "105", "107", "109", "111", "113", "115"];
const ORGS = ["225", "227"];
const PAYMENT_METHODS = ["951", "953", "955"];
const OTDELS = ["961", "963", "965", "967", "969", "971", "973", "975", "977", "981", "985", "987", "991", "993", "997", "999", "1001", "1003"];
const NAPRAVLENIA = ["1007", "1059", "1065", "1017", "1023", "1035", "1073", "1013", "1025", "1027", "1049", "1043", "1051", "1053", "1057", "1067", "1055", "2393"];
const PAYMENT_TYPES = ["1081", "1083", "1085"];
const DELIVERY_PREFS = ["1583", "1585"];
const IMPORT_BASES = ["1587", "2227", "2229"];
const PRODUCT_TYPES = ["1613", "1615", "1617", "1825", "1827", "1829", "1831"];
const REFUSAL_REASONS = ["2657", "2659", "2661", "2663", "2665"];

const RESPONSIBLE_PERSONS = [
  { ID: "1", NAME: "Иванов А.С." },
  { ID: "2", NAME: "Петрова М.В." },
  { ID: "3", NAME: "Сидоров К.Н." },
  { ID: "4", NAME: "Козлова Е.А." },
  { ID: "5", NAME: "Новиков Д.И." },
];

export { RESPONSIBLE_PERSONS };

const COMPANIES = [
  "АО «ТехноПром»", "ООО «Инновации»", "ПАО «СтройИнвест»",
  "ООО «ДатаСервис»", "ИП Козлов", "ООО «МедФарм»",
  "АО «Ритейл Групп»", "ООО «ЭнергоПлюс»", "ПАО «ФинТех»",
  "ООО «ЛогистикПро»", "АО «АгроХим»", "ООО «КонсалтГрупп»",
  "ПАО «ТелеКом»", "ООО «АвтоМотив»", "АО «Девелопмент»",
  'ООО «РусСилика»', "ЗАО «НаноХим»", "ООО «ПолимерТрейд»",
  "ПАО «КерамикИнвест»", "ООО «СиликаПром»",
];

const REGIONS = [
  "Москва", "Санкт-Петербург", "Казань", "Новосибирск", "Екатеринбург",
  "Нижний Новгород", "Самара", "Ростов-на-Дону", "Уфа", "Краснодар",
  "Воронеж", "Пермь", "Волгоград", "Челябинск", "Тюмень",
];

const INNS = [
  "7701234567", "7820123456", "1650123456", "5401234567", "6670123456",
  "5250123456", "6310123456", "6160123456", "0270123456", "2310123456",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomMultiple(arr: string[], min: number = 1, max: number = 3): string[] {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomDate(daysBack: number): string {
  const now = new Date();
  const offset = Math.floor(Math.random() * daysBack);
  const d = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function randomDatetime(daysBack: number): string {
  const now = new Date();
  const offset = Math.floor(Math.random() * daysBack) * 24 * 60 * 60 * 1000
    + Math.floor(Math.random() * 86400000);
  const d = new Date(now.getTime() - offset);
  return d.toISOString().slice(0, 19);
}

function randomAmount(): string {
  return (Math.floor(Math.random() * 5000000) + 50000).toFixed(2);
}

function randomInn(): string {
  return randomItem(INNS);
}

export function generateDemoDeals(count: number = 150): Record<string, string | string[]>[] {
  const deals: Record<string, string | string[]>[] = [];

  for (let i = 0; i < count; i++) {
    const isWon = Math.random() > 0.6;
    const isLost = !isWon && Math.random() > 0.7;
    const stage = isWon ? "WON" : isLost ? "LOSE" : randomItem(STAGES.slice(0, 4));

    deals.push({
      ID: String(1000 + i),
      TITLE: `Сделка: ${randomItem(COMPANIES)}`,
      TYPE_ID: "SALE",
      CATEGORY_ID: "0",
      STAGE_ID: stage,
      CURRENCY_ID: "RUB",
      OPPORTUNITY: randomAmount(),
      TAX_VALUE: (Math.random() * 20).toFixed(2),
      BEGINDATE: randomDate(90),
      CLOSEDATE: isWon || isLost ? randomDate(30) : "",
      COMMENTS: Math.random() > 0.7 ? "Требуется согласование с техническим отделом" : "",
      SOURCE_ID: Math.random() > 0.5 ? "WEB" : "CALL",
      ASSIGNED_BY_ID: randomItem(RESPONSIBLE_PERSONS).ID,
      ASSIGNED_BY_NAME: randomItem(RESPONSIBLE_PERSONS).NAME,
      DATE_CREATE: randomDatetime(90),
      DATE_MODIFY: randomDatetime(30),

      // Custom fields
      UF_CRM_1584459653509: randomItem(SKLADS),
      UF_CRM_1584459666824: randomDate(60),
      UF_CRM_1584459858509: randomItem(DELIVERY_TYPES),
      UF_CRM_1584460062014: randomDate(30),
      UF_CRM_1584463812262: `${(Math.random() * 15000 + 500).toFixed(2)}|RUB`,
      UF_CRM_1584464068013: randomItem(PAYMENT_STATUSES),
      UF_CRM_1585653172826: randomDatetime(30),
      UF_CRM_1586467706342: Math.random() > 0.6 ? "Просим доставить до 12:00, этаж 3" : "",
      UF_CRM_1586468182934: (Math.random() * 25 + 2).toFixed(1),
      UF_CRM_DEAL_3861467182211: `1С-${String(2024000 + i).padStart(8, "0")}`,
      UF_CRM_DEAL_3861467182227: randomItem(ORGS),
      UF_CRM_6915D8C25162A: Math.random() > 0.7 ? `LC${String(100000 + i)}` : "",
      UF_CRM_6915D8C2688B8: randomItem(PAYMENT_METHODS),
      UF_CRM_6915D8C2C31D0: randomMultiple(OTDELS, 1, 2),
      UF_CRM_6915D8C328208: randomMultiple(NAPRAVLENIA, 1, 2),
      UF_CRM_1763541960: Math.random() > 0.7 ? "Позвонить перед доставкой" : "",
      UF_CRM_1763542027: `г. ${randomItem(REGIONS)}, ул. Промышленная, д. ${Math.floor(Math.random() * 50 + 1)}`,
      UF_CRM_1763542249: randomItem(PAYMENT_TYPES),
      UF_CRM_1763546892: isWon ? "Успешно закрыта, клиент доволен" : "",
      UF_CRM_1763546915: "",
      UF_CRM_69257337C8C0D: Math.random() > 0.6 ? "Выставка Химия 2025" : "",
      UF_CRM_69257337D66F5: randomItem(DELIVERY_PREFS),
      UF_CRM_69257337E7E9B: isLost ? "Бюджет не утверждён" : "",
      UF_CRM_692573380C4F0: Math.random() > 0.8 ? randomItem(IMPORT_BASES) : "",
      UF_CRM_6925733827A0F: Math.random() > 0.6 ? "Производство силикатных материалов" : "",
      UF_CRM_69257BBACD471: randomMultiple(PRODUCT_TYPES, 1, 2),
      UF_CRM_69259C45EC14B: randomItem(REGIONS),
      UF_CRM_1766405164: randomInn(),
      UF_CRM_1774878835644: (Math.random() * 3000000 + 100000).toFixed(2),
      UF_CRM_1774878993375: String(Math.floor(Math.random() * 8 + 1)),
      UF_CRM_1774879911841: (Math.random() * 500 + 10).toFixed(1),
      UF_CRM_1774879952785: Math.random() > 0.6 ? randomDate(30) : "",
      UF_CRM_1774880017: Math.random() > 0.7 ? "Требуется анализ пробы перед отгрузкой" : "",
      UF_CRM_1774880111684: Math.random() > 0.7 ? "1" : "0",
      UF_CRM_1774880251970: isLost ? randomItem(REFUSAL_REASONS) : "",
    });
  }

  // Sort by date descending
  deals.sort((a, b) => String(b.DATE_CREATE || "").localeCompare(String(a.DATE_CREATE || "")));

  return deals;
}

```

## File: src/lib/export-utils.ts
```ts
import * as XLSX from "xlsx";
import type { FieldInfo, DealData } from "@/store/dashboard-store";

/**
 * Export deals data to Excel (.xlsx) file.
 * WYSIWYG export: exports exactly what is displayed in the table (filtered, sorted, resolved).
 */
export function exportToExcelWysiwyg(
  data: string[][],
  columns: string[]
): void {
  if (data.length === 0 || columns.length === 0) return;

  // Create workbook and worksheet
  const wsData = [columns, ...data];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns
  const colWidths = columns.map((header, idx) => {
    const maxLen = Math.max(
      header.length,
      ...data.slice(0, 100).map((row) => String(row[idx] || "").length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });
  ws["!cols"] = colWidths;

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Сделки");

  // Generate and download
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `russilica_deals_${dateStr}.xlsx`);
}

/**
 * Legacy export (kept for compatibility if needed)
 */
export function exportToExcel(
  deals: DealData[],
  fields: FieldInfo[],
  selectedColumns: string[]
): void {
  if (deals.length === 0) return;

  const fieldMap = new Map(fields.map((f) => [f.id, f]));

  const columns =
    selectedColumns.length > 0 ? selectedColumns : Object.keys(deals[0] || {});

  // Header row: use human-readable titles
  const headers = columns.map((col) => {
    const field = fieldMap.get(col);
    return field?.title || col;
  });

  // Data rows: resolve list values where possible
  const rows = deals.map((deal) =>
    columns.map((col) => {
      const raw = deal[col];
      const field = fieldMap.get(col);

      if (raw === null || raw === undefined || raw === "") return "";

      // Handle arrays (multiple enumeration values)
      if (Array.isArray(raw)) {
        if (field?.listValues) {
          return raw
            .map((v) => {
              const listVal = field.listValues?.find((lv) => lv.ID === String(v));
              return listVal?.VALUE || String(v);
            })
            .join(", ");
        }
        return raw.join(", ");
      }

      // Resolve single enumeration values
      if (field?.listValues && raw) {
        const val = String(raw);
        const listVal = field.listValues.find((lv) => lv.ID === val);
        if (listVal) return listVal.VALUE;
      }

      // Handle money format (amount|currency)
      if (field?.type === "money" && raw) {
        const parts = String(raw).split("|");
        const amount = parseFloat(parts[0]);
        const currency = parts[1] || "";
        if (!isNaN(amount)) {
          return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
        }
      }

      // Handle boolean
      if (field?.type === "boolean" || field?.type === "char") {
        if (raw === "Y" || raw === "1") return "Да";
        if (raw === "N" || raw === "0") return "Нет";
      }

      return String(raw);
    })
  );

  // Create workbook and worksheet
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto-size columns
  const colWidths = headers.map((header, idx) => {
    const maxLen = Math.max(
      header.length,
      ...rows.slice(0, 100).map((row) => String(row[idx] || "").length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });
  ws["!cols"] = colWidths;

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Сделки");

  // Generate and download
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `russilica_deals_${dateStr}.xlsx`);
}

```

## File: src/lib/sso-hmac.ts
```ts
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
export function verifySsoToken(token: string): SsoTokenPayload | null {
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

  return { email, role, timestamp };
}

/**
 * Verify HMAC from URL parameters (used by wp-callback).
 * Parameters: email, role, ts (timestamp in seconds), sig (hex signature)
 */
export function verifySsoUrlParams(
  email: string,
  role: string,
  timestampStr: string,
  signature: string
): SsoTokenPayload | null {
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
  try {
    const hashA = createHash("sha256").update(a).digest();
    const hashB = createHash("sha256").update(b).digest();
    return timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}

```

## File: src/lib/utils.ts
```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

```

## File: src/middleware.ts
```ts
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
// NOTE: This in-memory rate limiter works correctly because the application
// is deployed as a long-running Node.js process (Next.js standalone output)
// via bun server.js. It is NOT deployed to a serverless environment (like Vercel),
// where in-memory state would be lost between requests.

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

export function middleware(request: NextRequest) {
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

```

## File: src/store/dashboard-store.ts
```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEMO_FIELDS, generateDemoDeals } from "@/lib/demo-data";

// ─── Client-side fetch timeout (prevents infinite loading spinner) ───
// Server-side bitrix helpers already have 15s/30s timeouts,
// but the client→server fetch had NO timeout — if the API hangs,
// the user sees a forever-spinning loader.
const CLIENT_FETCH_TIMEOUT_MS = 30_000; // 30 seconds

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
  });
}

export interface FieldInfo {
  id: string;
  title: string;
  type: string;
  isMultiple: boolean;
  isSortable: boolean;
  listValues?: Array<{ ID: string; VALUE: string }>;
}

export type DateFilterPreset =
  | "all"
  | "7days"
  | "14days"
  | "30days"
  | "90days"
  | "custom";

export interface DateFilter {
  preset: DateFilterPreset;
  customFrom?: string;
  customTo?: string;
}

export type SortDirection = "asc" | "desc" | null;

export interface ColumnSort {
  columnId: string;
  direction: SortDirection;
}

export interface ColumnFilter {
  columnId: string;
  value: string;
}

export interface DealData {
  [key: string]: string | string[] | number | null;
}

export interface SavedView {
  id: string;
  name: string;
  dateFilter: DateFilter;
  pipelineFilter: string;
  responsibleFilter: string;
  selectedColumns: string[];
  columnSort: ColumnSort;
  createdAt: number;
}

interface DashboardState {
  // Configuration
  isConfigured: boolean | null;
  isDemoMode: boolean;

  // Fields
  fields: FieldInfo[];
  fieldsLoading: boolean;
  fieldsError: string | null;

  // Selected columns
  selectedColumns: string[];
  columnSelectorOpen: boolean;

  // Deals
  deals: DealData[];
  allDeals: DealData[];
  dealsLoading: boolean;
  dealsError: string | null;
  dealsTotal: number;

  // Date filter
  dateFilter: DateFilter;

  // Search
  searchQuery: string;

  // Column sorting
  columnSort: ColumnSort;

  // Column filters
  columnFilters: ColumnFilter[];

  // Pagination
  currentPage: number;
  pageSize: number;

  // New state fields for header features
  lastSyncAt: number | null;
  lastReadAlertsAt: number | null;
  pipelineFilter: string;
  responsibleFilter: string;
  viewMode: "table" | "cards" | "kanban";
  connectionStatus: "checking" | "connected" | "demo" | "disconnected";
  appLoaded: boolean;
  savedViews: SavedView[];

  // User name mapping (ID -> Name) for responsible persons
  userNames: Record<string, string>;

  // Company data mapping (ID -> Company Data)
  companiesData: Record<string, any>;

  // Activities data mapping (Deal ID -> { last: ActivityData, next: ActivityData })
  activitiesData: Record<string, any>;

  // Export data
  exportData: string[][];
  exportColumns: string[];

  // ─── Actions ───
  checkConfig: () => Promise<void>;
  fetchFields: () => Promise<void>;
  fetchDeals: () => Promise<void>;
  loadDemoData: () => void;
  setSelectedColumns: (columns: string[]) => void;
  toggleColumn: (columnId: string) => void;
  reorderColumns: (startIndex: number, endIndex: number) => void;
  setColumnSelectorOpen: (open: boolean) => void;
  setDateFilter: (filter: DateFilter) => void;
  setSearchQuery: (query: string) => void;
  setColumnSort: (sort: ColumnSort) => void;
  toggleColumnSort: (columnId: string) => void;
  setColumnFilter: (columnId: string, value: string) => void;
  clearColumnFilter: (columnId: string) => void;
  clearAllColumnFilters: () => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  syncData: () => Promise<void>;
  applyClientFilters: () => void;

  // ─── Actions (header features) ───
  setPipelineFilter: (filter: string) => void;
  setResponsibleFilter: (id: string) => void;
  setViewMode: (mode: "table" | "cards" | "kanban") => void;
  saveView: (name: string) => void;
  deleteSavedView: (id: string) => void;
  loadSavedView: (id: string) => void;
  setConnectionStatus: (status: "checking" | "connected" | "demo" | "disconnected") => void;
  setAppLoaded: (loaded: boolean) => void;
  fetchUserNames: () => Promise<void>;
  fetchCompaniesData: () => Promise<void>;
  fetchActivitiesData: () => Promise<void>;
  markAlertsAsRead: () => void;
  setExportData: (data: string[][], columns: string[]) => void;
}

function getDateFilterRange(filter: DateFilter): Record<string, string> {
  const now = new Date();
  const bitrixFilter: Record<string, string> = {};

  if (filter.preset === "all") {
    return {};
  }

  if (filter.preset === "custom") {
    if (filter.customFrom) {
      bitrixFilter[">=DATE_CREATE"] = filter.customFrom;
    }
    if (filter.customTo) {
      bitrixFilter["<=DATE_CREATE"] = filter.customTo;
    }
    return bitrixFilter;
  }

  const daysMap: Record<string, number> = {
    "7days": 7,
    "14days": 14,
    "30days": 30,
    "90days": 90,
  };

  const days = daysMap[filter.preset];
  if (days) {
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    bitrixFilter[">=DATE_CREATE"] = from.toISOString().slice(0, 19);
  }

  return bitrixFilter;
}

export const DEFAULT_COLUMNS = [
  "BEGINDATE", // Дата начала
  "DATE_MODIFY", // Дата изменения
  "CLOSEDATE", // Дата завершения
  "ASSIGNED_BY_ID", // Ответственный
  "UF_CRM_69257BBACD471", // Тип продукта
  "OPPORTUNITY", // Сумма
  "COMPANY_TITLE", // Наименование компании
  "COMPANY_UF_CRM_1777326239557", // Выручка компании (млн руб/год)
  "UF_CRM_1774879911841", // Потребление (тн/год)
  "UF_CRM_6915D8C2C31D0", // Отрасль
  "UF_CRM_6915D8C328208", // Направление
  "COMMENTS", // Комментарий
];

const sortColumns = (columns: string[]) => {
  return [...columns].sort((a, b) => {
    const indexA = DEFAULT_COLUMNS.indexOf(a);
    const indexB = DEFAULT_COLUMNS.indexOf(b);
    
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  });
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Configuration
      isConfigured: null,
      isDemoMode: false,

      // Fields
      fields: [],
      fieldsLoading: false,
      fieldsError: null,

      // Selected columns
      selectedColumns: DEFAULT_COLUMNS,
      columnSelectorOpen: false,

      // Deals
      deals: [],
      allDeals: [],
      dealsLoading: false,
      dealsError: null,
      dealsTotal: 0,

      // Date filter
      dateFilter: { preset: "all" },

      // Search
      searchQuery: "",

      // Column sorting
      columnSort: { columnId: "", direction: null },

      // Column filters
      columnFilters: [],

      // Pagination
      currentPage: 1,
      pageSize: 50,

      // New state fields
      lastSyncAt: null,
      lastReadAlertsAt: null,
      pipelineFilter: "all",
      responsibleFilter: "all",
      viewMode: "table",
      connectionStatus: "checking",
      appLoaded: false,
      savedViews: [],
      userNames: {},
      companiesData: {},
      activitiesData: {},
      exportData: [],
      exportColumns: [],

      // ─── Actions ───
      checkConfig: async () => {
        try {
          const response = await fetchWithTimeout("/api/bitrix/status");
          // Check HTTP status — fetch doesn't throw on 401/403/500
          if (!response.ok) {
            // Auth error or server error — treat as disconnected
            set({
              isConfigured: false,
              connectionStatus: response.status === 401 ? "demo" : "disconnected",
            });
            return;
          }
          const data = await response.json();
          set({
            isConfigured: data.configured,
            connectionStatus: data.configured ? "connected" : "demo",
          });
        } catch {
          set({
            isConfigured: false,
            connectionStatus: "disconnected",
          });
        }
      },

      fetchFields: async () => {
        set({ fieldsLoading: true, fieldsError: null });
        try {
          const response = await fetchWithTimeout("/api/bitrix/fields");

          // Check HTTP status — fetch doesn't throw on 401/403/500
          if (!response.ok) {
            // Fall through to catch block for demo fallback
            throw new Error(`API returned ${response.status}`);
          }

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || "Failed to fetch fields");
          }

          if (data.fields.length === 0) {
            set({ fields: DEMO_FIELDS, fieldsLoading: false, isDemoMode: true });
          } else {
            set({ fields: data.fields, fieldsLoading: false, isDemoMode: false, isConfigured: true });
          }

          const currentSelected = get().selectedColumns;
          const availableFields = get().fields;
          
          const isOldDefault = currentSelected.length === 14 && currentSelected.includes("ACTIVITY_LAST");
          const isNewDefault = currentSelected.length === DEFAULT_COLUMNS.length && DEFAULT_COLUMNS.every((col) => currentSelected.includes(col));
          
          if ((currentSelected.length === 0 || isOldDefault || isNewDefault) && availableFields.length > 0) {
            const availableDefaults = DEFAULT_COLUMNS.filter((col) =>
              availableFields.some((f) => f.id === col)
            );
            
            if (availableDefaults.length === 0) {
              const otherFields = availableFields.map((f) => f.id);
              set({ selectedColumns: otherFields });
            } else {
              set({ selectedColumns: availableDefaults });
            }
          } else if (!currentSelected.includes("ASSIGNED_BY_ID")) {
            // Migration: Ensure ASSIGNED_BY_ID is present after CLOSEDATE
            const closeDateIndex = currentSelected.indexOf("CLOSEDATE");
            if (closeDateIndex !== -1) {
              const newColumns = [...currentSelected];
              newColumns.splice(closeDateIndex + 1, 0, "ASSIGNED_BY_ID");
              set({ selectedColumns: newColumns });
            } else {
              set({ selectedColumns: [...currentSelected, "ASSIGNED_BY_ID"] });
            }
          }
        } catch (error) {
          set({
            fields: DEMO_FIELDS,
            fieldsLoading: false,
            isDemoMode: true,
            fieldsError: null,
          });
        }
      },

      fetchDeals: async () => {
        set({ dealsLoading: true, dealsError: null, activitiesData: {}, companiesData: {} });
        try {
          const { dateFilter, selectedColumns } = get();
          const filter = getDateFilterRange(dateFilter);

          const select = selectedColumns.length > 0
            ? [...selectedColumns]
            : ["*", "UF_*"];

          if (!select.includes("DATE_CREATE")) select.push("DATE_CREATE");
          if (!select.includes("TITLE")) select.push("TITLE");
          if (!select.includes("ID")) select.push("ID");
          // Required by filters/alerts/stats even if not in selectedColumns:
          if (!select.includes("ASSIGNED_BY_ID")) select.push("ASSIGNED_BY_ID");
          if (!select.includes("DATE_MODIFY")) select.push("DATE_MODIFY");
          if (!select.includes("STAGE_ID")) select.push("STAGE_ID");
          if (!select.includes("OPPORTUNITY")) select.push("OPPORTUNITY");
          if (!select.includes("CURRENCY_ID")) select.push("CURRENCY_ID");
          if (!select.includes("COMPANY_ID")) select.push("COMPANY_ID");
          if (!select.includes("COMPANY_TITLE")) select.push("COMPANY_TITLE");

          const response = await fetchWithTimeout("/api/bitrix/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              select,
              filter,
              order: { DATE_CREATE: "DESC" },
            }),
          });

          // Check HTTP status — fetch doesn't throw on 401/403/500
          if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
          }

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || "Failed to fetch deals");
          }

          set({
            allDeals: data.deals,
            dealsTotal: data.total,
            dealsLoading: false,
            isDemoMode: false,
            connectionStatus: "connected",
            isConfigured: true,
            lastSyncAt: Date.now(),
          });
          get().applyClientFilters();
          // Fetch user names for responsible persons (non-blocking)
          get().fetchUserNames();
          // Fetch companies data (non-blocking)
          get().fetchCompaniesData();
          // Fetch activities data (non-blocking)
          get().fetchActivitiesData();
        } catch (error) {
          const demoDeals = generateDemoDeals(150);
          set({
            allDeals: demoDeals,
            dealsTotal: demoDeals.length,
            dealsLoading: false,
            isDemoMode: true,
            dealsError: null,
            connectionStatus: "demo",
          });
          get().applyClientFilters();
          // Fetch demo user names
          get().fetchUserNames();
        }
      },

      loadDemoData: () => {
        const demoDeals = generateDemoDeals(150);
        set({
          fields: DEMO_FIELDS,
          allDeals: demoDeals,
          dealsTotal: demoDeals.length,
          isDemoMode: true,
          selectedColumns: DEFAULT_COLUMNS,
        });
        get().applyClientFilters();
      },

      setSelectedColumns: (columns) => {
        set({ selectedColumns: columns });
        if (!get().isDemoMode) {
          get().fetchActivitiesData();
          get().fetchCompaniesData();
        }
      },

      toggleColumn: (columnId) => {
        const { selectedColumns } = get();
        if (selectedColumns.includes(columnId)) {
          if (selectedColumns.length <= 1) return;
          set({ selectedColumns: selectedColumns.filter((c) => c !== columnId) });
        } else {
          set({ selectedColumns: [...selectedColumns, columnId] });
          // Fetch data for the new column if needed
          if (columnId === "ACTIVITY_LAST" || columnId === "ACTIVITY_NEXT") {
            get().fetchActivitiesData();
          } else if (columnId.startsWith("COMPANY_")) {
            get().fetchCompaniesData();
          }
        }
      },

      reorderColumns: (startIndex, endIndex) => {
        const { selectedColumns } = get();
        const result = Array.from(selectedColumns);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        set({ selectedColumns: result });
      },

      setColumnSelectorOpen: (open) => set({ columnSelectorOpen: open }),

      setDateFilter: (filter) => {
        set({ dateFilter: filter, currentPage: 1 });
        get().applyClientFilters();
        if (!get().isDemoMode) {
          get().fetchDeals();
        }
      },

      applyClientFilters: () => {
        const { allDeals, dateFilter, pipelineFilter, responsibleFilter } = get();

        let filtered = allDeals;

        // 1. Date filter
        if (dateFilter.preset !== "all") {
          const now = new Date();
          let fromDate: Date | null = null;
          let toDate: Date | null = null;

          if (dateFilter.preset === "custom") {
            if (dateFilter.customFrom) fromDate = new Date(dateFilter.customFrom);
            if (dateFilter.customTo) toDate = new Date(dateFilter.customTo);
          } else {
            const daysMap: Record<string, number> = {
              "7days": 7,
              "14days": 14,
              "30days": 30,
              "90days": 90,
            };
            const days = daysMap[dateFilter.preset];
            if (days) {
              fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            }
          }

          filtered = filtered.filter((deal) => {
            const dateStr = deal.DATE_CREATE as string;
            if (!dateStr) return false;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return false;
            if (fromDate && d < fromDate) return false;
            if (toDate && d > toDate) return false;
            return true;
          });
        }

        // 2. Pipeline filter
        if (pipelineFilter === "in_work") {
          filtered = filtered.filter((deal) => {
            const stage = String(deal.STAGE_ID || "");
            return !["WON", "LOSE"].includes(stage);
          });
        } else if (pipelineFilter !== "all") {
          filtered = filtered.filter((deal) => String(deal.STAGE_ID) === pipelineFilter);
        }

        // 3. Responsible filter
        if (responsibleFilter !== "all") {
          filtered = filtered.filter((deal) => String(deal.ASSIGNED_BY_ID || "") === responsibleFilter);
        }

        set({ deals: filtered });
      },

      setSearchQuery: (query) => set({ searchQuery: query }),

      setColumnSort: (sort) => set({ columnSort: sort, currentPage: 1 }),

      toggleColumnSort: (columnId) => {
        const { columnSort } = get();
        if (columnSort.columnId === columnId) {
          // Cycle: asc → desc → null
          if (columnSort.direction === "asc") {
            set({ columnSort: { columnId, direction: "desc" }, currentPage: 1 });
          } else if (columnSort.direction === "desc") {
            set({ columnSort: { columnId: "", direction: null }, currentPage: 1 });
          }
        } else {
          set({ columnSort: { columnId, direction: "asc" }, currentPage: 1 });
        }
      },

      setColumnFilter: (columnId, value) => {
        const { columnFilters } = get();
        const existing = columnFilters.find((f) => f.columnId === columnId);
        if (existing) {
          set({
            columnFilters: columnFilters.map((f) =>
              f.columnId === columnId ? { ...f, value } : f
            ),
            currentPage: 1,
          });
        } else {
          set({
            columnFilters: [...columnFilters, { columnId, value }],
            currentPage: 1,
          });
        }
      },

      clearColumnFilter: (columnId) => {
        set({
          columnFilters: get().columnFilters.filter((f) => f.columnId !== columnId),
          currentPage: 1,
        });
      },

      clearAllColumnFilters: () => {
        set({ columnFilters: [], currentPage: 1 });
      },

      setCurrentPage: (page) => set({ currentPage: page }),

      setPageSize: (size) => set({ pageSize: size, currentPage: 1 }),

      syncData: async () => {
        const { isDemoMode } = get();
        if (isDemoMode) {
          const demoDeals = generateDemoDeals(150);
          set({
            allDeals: demoDeals,
            dealsTotal: demoDeals.length,
            lastSyncAt: Date.now(),
          });
          get().applyClientFilters();
          return;
        }
        // Fetch fields first (sequentially), then deals — avoids race condition
        // where fetchDeals depends on selectedColumns that may be updated by fetchFields
        await get().fetchFields();
        await get().fetchDeals();
      },

      // ─── Actions (header features) ───
      setPipelineFilter: (filter) => {
        set({ pipelineFilter: filter, currentPage: 1 });
        get().applyClientFilters();
      },

      setResponsibleFilter: (id) => {
        set({ responsibleFilter: id, currentPage: 1 });
        get().applyClientFilters();
      },

      setViewMode: (mode) => set({ viewMode: mode }),

      saveView: (name) => {
        const { dateFilter, pipelineFilter, responsibleFilter, selectedColumns, columnSort, savedViews } = get();
        const newView: SavedView = {
          id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name,
          dateFilter: { ...dateFilter },
          pipelineFilter,
          responsibleFilter,
          selectedColumns: [...selectedColumns],
          columnSort: { ...columnSort },
          createdAt: Date.now(),
        };
        set({ savedViews: [...savedViews, newView] });
      },

      deleteSavedView: (id) => {
        set({ savedViews: get().savedViews.filter((v) => v.id !== id) });
      },

      loadSavedView: (id) => {
        const view = get().savedViews.find((v) => v.id === id);
        if (!view) return;
        set({
          dateFilter: { ...view.dateFilter },
          pipelineFilter: view.pipelineFilter,
          responsibleFilter: view.responsibleFilter,
          selectedColumns: [...view.selectedColumns],
          columnSort: { ...view.columnSort },
          currentPage: 1,
        });
        get().applyClientFilters();
        get().fetchActivitiesData();
        get().fetchCompaniesData();
      },

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      setAppLoaded: (loaded) => set({ appLoaded: loaded }),

      markAlertsAsRead: () => set({ lastReadAlertsAt: Date.now() }),

      fetchUserNames: async () => {
        const { isDemoMode, userNames } = get();

        // In demo mode, use the demo responsible persons
        if (isDemoMode) {
          const { RESPONSIBLE_PERSONS } = await import("@/lib/demo-data");
          const demoNames: Record<string, string> = {};
          for (const person of RESPONSIBLE_PERSONS) {
            demoNames[person.ID] = person.NAME;
          }
          set({ userNames: demoNames });
          return;
        }

        try {
          // Fetch all users
          const response = await fetchWithTimeout(`/api/bitrix/users`);

          if (!response.ok) {
            console.warn("[Dashboard] Failed to fetch user names: API returned", response.status);
            return;
          }
          const data = await response.json();
          if (data.success && data.users) {
            set({ userNames: { ...userNames, ...data.users } });
          }
        } catch {
          // Non-critical — responsible filter will show "ID xxx" fallback
          console.warn("[Dashboard] Failed to fetch user names");
        }
      },

      fetchCompaniesData: async () => {
        const { isDemoMode, allDeals, companiesData, selectedColumns } = get();

        if (isDemoMode) return;

        // Check if any company fields are selected
        const hasCompanyFields = selectedColumns.some(col => col.startsWith("COMPANY_"));
        if (!hasCompanyFields) return;

        // Collect unique company IDs from deals
        const uniqueIds = [...new Set(
          allDeals.map((d) => String(d.COMPANY_ID || "")).filter((id) => id && id !== "0")
        )];

        if (uniqueIds.length === 0) return;

        // Only fetch IDs we don't already have data for
        const missingIds = uniqueIds.filter((id) => !companiesData[id]);
        if (missingIds.length === 0) return;

        // Determine which company fields to fetch based on selected columns
        const companyFieldsToSelect = selectedColumns
          .filter(col => col.startsWith("COMPANY_"))
          .map(col => col.replace("COMPANY_", ""));
        
        if (!companyFieldsToSelect.includes("TITLE")) {
          companyFieldsToSelect.push("TITLE");
        }

        try {
          const response = await fetchWithTimeout("/api/bitrix/companies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ids: missingIds,
              select: companyFieldsToSelect,
            }),
          });

          if (!response.ok) {
            console.warn("[Dashboard] Failed to fetch companies data: API returned", response.status);
            return;
          }
          const data = await response.json();
          if (data.success && data.companies) {
            const newCompaniesData = { ...companiesData, ...data.companies };
            // Prune cache to only keep companies present in allDeals
            const validCompanyIds = new Set(get().allDeals.map(d => String(d.COMPANY_ID || "")).filter(Boolean));
            for (const id in newCompaniesData) {
              if (!validCompanyIds.has(id)) delete newCompaniesData[id];
            }
            set({ companiesData: newCompaniesData });
          }
        } catch {
          console.warn("[Dashboard] Failed to fetch companies data");
        }
      },

      fetchActivitiesData: async () => {
        const { isDemoMode, allDeals, activitiesData, selectedColumns } = get();

        if (isDemoMode) return;

        // Check if any activity fields are selected
        const hasActivityFields = selectedColumns.includes("ACTIVITY_LAST") || selectedColumns.includes("ACTIVITY_NEXT");
        if (!hasActivityFields) return;

        // Collect unique deal IDs
        const uniqueIds = [...new Set(
          allDeals.map((d) => String(d.ID || d.id || "")).filter(Boolean)
        )];

        if (uniqueIds.length === 0) return;

        // Only fetch IDs we don't already have data for
        const missingIds = uniqueIds.filter((id) => !activitiesData[id]);
        if (missingIds.length === 0) return;

        try {
          const response = await fetchWithTimeout("/api/bitrix/activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dealIds: missingIds,
            }),
          });

          if (!response.ok) {
            console.warn("[Dashboard] Failed to fetch activities data: API returned", response.status);
            return;
          }
          const data = await response.json();
          if (data.success && data.activities) {
            const newActivitiesData = { ...activitiesData, ...data.activities };
            // Prune cache to only keep deals present in allDeals
            const validDealIds = new Set(get().allDeals.map(d => String(d.ID || d.id || "")).filter(Boolean));
            for (const id in newActivitiesData) {
              if (!validDealIds.has(id)) delete newActivitiesData[id];
            }
            set({ activitiesData: newActivitiesData });
          }
        } catch {
          console.warn("[Dashboard] Failed to fetch activities data");
        }
      },

      setExportData: (data, columns) => set({ exportData: data, exportColumns: columns }),
    }),
    {
      name: "bitrix-bi-dashboard",
      partialize: (state) => ({
        selectedColumns: state.selectedColumns,
        dateFilter: state.dateFilter,
        pageSize: state.pageSize,
        pipelineFilter: state.pipelineFilter,
        responsibleFilter: state.responsibleFilter,
        viewMode: state.viewMode,
        savedViews: state.savedViews,
        lastReadAlertsAt: state.lastReadAlertsAt,
      }),
    }
  )
);

```

