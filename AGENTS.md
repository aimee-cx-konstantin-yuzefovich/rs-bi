# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Middleware**: Next.js 16 convention uses `src/middleware.ts` (export MUST be named `middleware`). It handles in-memory rate limiting and forces `x-forwarded-proto: https` in production.
- **Config Imports**: Import `IS_PRODUCTION` and `WP_LOGIN_URL` from `src/lib/config.ts` instead of checking `process.env` directly.
- **Deployment**: Uses Next.js `standalone` output. Production runs via `bun .next/standalone/server.js`, not standard `next start`.
- **Bitrix24 API**: MUST use `bitrixGet` / `bitrixPost` from `src/lib/bitrix.ts`. Raw fetch calls to Bitrix24 are forbidden.
- **ESLint**: Many standard rules (e.g., `no-explicit-any`, `exhaustive-deps`) are explicitly disabled in `eslint.config.mjs`. Do not try to fix these "violations".