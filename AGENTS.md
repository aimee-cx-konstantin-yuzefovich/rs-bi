# AGENTS.md

This file provides guidance to agents when working with code in this repository.

RusSilica BI Terminal — Next.js dashboard over Bitrix24 CRM data; users authenticate via WordPress SSO
(NextAuth v4), the app has no local user table. Full architecture notes: `CLAUDE.md`.

## Commands

- `npm run dev` — dev server on :3000, output piped to `dev.log` (check that file when console output looks empty).
- `npm run build` — type-checks and builds (there is no separate typecheck script; `ignoreBuildErrors` is deliberately `false` in `next.config.ts`, don't disable it). Also copies `.next/static` + `public/` into `.next/standalone/`.
- `npm run start` — runs the standalone server (`node .next/standalone/server.js`), not `next start`.
- Tests (Vitest + jsdom, files in `src/__tests__/`): `npx vitest` (all), `npx vitest run <path>` (single file), `npx vitest -t "<name>"`.
- Prisma scripts: `db:generate`, `db:push`, `db:migrate`, `db:reset`. The SQLite DB stores only `AuditLog` + `UsedNonce` — a compliance record; never delete/reset it casually. CRM data is always live from Bitrix24.

## Hard rules

- **Bitrix24 API**: all CRM calls MUST go through `bitrixGet`/`bitrixPost` from `src/lib/bitrix.ts` (method allowlist, SSRF protection, param sanitization). Raw `fetch` to Bitrix24 is forbidden.
- **Config imports**: import `IS_PRODUCTION` / `WP_LOGIN_URL_CLIENT` from `src/lib/config.ts` (server-only secrets from `src/lib/config.server.ts`) instead of reading `process.env` directly.
- **Middleware**: the Next.js middleware file is `src/proxy.ts` with default export named `proxy` — keep that file name, location, and export name (rate limiting, CORS, CSP live there). Ignore the stale `src/middleware.ts` mention in a `next.config.ts` comment.
- **Auth**: every login attempt must be written to the `AuditLog` Prisma table (compliance requirement — don't remove when touching auth). `NEXTAUTH_SECRET` and `PROXY_SECRET` are hard-required in production; never relax this.
- **ESLint**: strict rules (`no-explicit-any`, `exhaustive-deps`, `no-unused-vars`, etc.) are intentionally disabled in `eslint.config.mjs`. Do not "fix" these "violations".
- **Zustand store**: `src/store/dashboard-store.ts` persists to localStorage (key `bitrix-bi-dashboard`). When the persisted shape changes, bump `version` and add a branch in `migrate()`.
- CRM-specific IDs (field IDs, stage IDs, default columns, alert thresholds) are centralized in `src/lib/crm-constants.ts` — that should be the only file needing updates when Bitrix24 config changes.
- Without `BITRIX_WEBHOOK_URL` the app falls back to demo mode (`src/lib/demo-data.ts`) — expected behavior on unconfigured installs, not a bug.
- UI: use existing shadcn/ui components under `src/components/ui/`; don't hand-roll duplicates.

## Deployment

- Production runs the Next.js `standalone` output via `node server.js` (Docker `CMD` / pm2) — not `next start`, not Vercel.
- Two host deploy paths: `.gitflic-ci.yaml` (master/main only: Linux ZIP build → protected rsync → packaged Prisma migrations → `pm2 restart`) and `build-deploy.sh` (manual Linux `deploy-prod.zip`). Both exclude `.env*` and SQLite files. See `DEPLOYMENT.md` for `DEPLOY_ARCH`, the one-time existing-DB baseline, absolute `DATABASE_URL`, and the separate Docker volume path.
