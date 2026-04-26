# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Next.js 16 Convention**: Security headers, rate limiting, and CORS are handled in `src/proxy.ts` (NOT `middleware.ts`). The export MUST be named `proxy`.
- **Authentication**: WordPress SSO via HMAC-SHA256 tokens. There is no `/login` page in production; WordPress handles login.
- **Bitrix24 CRM API**: All requests MUST go through the backend (`src/lib/bitrix.ts`). The Webhook URL is NEVER exposed to the frontend.
- **Configuration**: Always use `src/lib/config.ts` as the single source of truth for environment constants (e.g., `IS_PRODUCTION`, `WP_LOGIN_URL`) instead of checking `process.env`.
- **Database**: Prisma query logging is intentionally disabled in production to prevent performance issues (`src/lib/db.ts`).
