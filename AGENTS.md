# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Deployment**: Uses Next.js `standalone` output. Production runs via `node server.js` in Docker, not `next start` or `bun`.
- **Bitrix24 API**: MUST use `bitrixGet` / `bitrixPost` from `src/lib/bitrix.ts`. Raw fetch calls to Bitrix24 are forbidden.
- **Config Imports**: Import `IS_PRODUCTION` and `WP_LOGIN_URL_CLIENT` from `src/lib/config.ts` instead of checking `process.env` directly.
- **ESLint**: Many standard rules (e.g., `no-explicit-any`, `exhaustive-deps`) are explicitly disabled in `eslint.config.mjs`. Do not try to fix these "violations".
- **Dev Server**: `npm run dev` pipes output to `dev.log`. Check this file if the console output is missing.