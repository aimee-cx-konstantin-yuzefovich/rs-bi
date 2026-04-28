# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- **Middleware**: Next.js 16 convention uses `src/proxy.ts` instead of `middleware.ts`. The export MUST be named `proxy`.
- **Config Imports**: Import `IS_PRODUCTION` and `WP_LOGIN_URL` from `src/lib/config.ts` instead of checking `process.env` directly.
- **Deployment**: The project uses Next.js `standalone` output. The `deploy-prod.zip` archive contains ONLY `server.js`, `node_modules`, `.next`, `public`, `package.json`, and `prisma`. It strictly EXCLUDES `.env`, `db/` (SQLite), and `src/`.
- **Build/Start**: `npm run build` includes custom copy steps for standalone output. Production runs via `bun .next/standalone/server.js`, not standard `next start`.
- **Bitrix24 API**: MUST use `bitrixGet` / `bitrixPost` from `src/lib/bitrix.ts`. Raw fetch calls to Bitrix24 are forbidden.