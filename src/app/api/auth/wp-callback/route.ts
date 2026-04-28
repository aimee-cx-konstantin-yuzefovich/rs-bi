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
