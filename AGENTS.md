# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Deployment**: Uses Next.js `standalone` output. Production runs via `bun .next/standalone/server.js`, not standard `next start`.
- **Bitrix24 API**: MUST use `bitrixGet` / `bitrixPost` from `src/lib/bitrix.ts`. Raw fetch calls to Bitrix24 are forbidden.
- **Config Imports**: Import `IS_PRODUCTION` and `WP_LOGIN_URL` from `src/lib/config.ts` instead of checking `process.env` directly.
- **ESLint**: Many standard rules (e.g., `no-explicit-any`, `exhaustive-deps`) are explicitly disabled in `eslint.config.mjs`. Do not try to fix these "violations".