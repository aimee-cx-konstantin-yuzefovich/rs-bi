# AGENTS.md

This file provides operational guidance and hard rules for coding agents working with code in this repository.

RusSilica BI Terminal — Next.js dashboard over Bitrix24 CRM data; users authenticate via WordPress SSO (NextAuth v4), and the application has no local user table. Detailed architecture and subsystem specifications live in `CLAUDE.md`.

## Source of truth hierarchy

When reasoning about system behavior, follow this strict precedence:

1. **Current executable code + tests** for implemented behavior
2. **`AGENTS.md`** for operational hard rules, invariant constraints, and guardrails
3. **`CLAUDE.md`** for detailed architecture and subsystem design explanations
4. **`DEPLOYMENT.md`** for production deployment, production database safety, and artifact rules
5. **Historical plans and snapshots** (`codebase-snapshot.md` is legacy documentation)

> [!CAUTION]
> **DOCUMENTATION_CONTRACT_CONFLICT**
> If current code/tests appear to contradict a documented business contract, **DO NOT** silently rewrite documentation to normalize the contradiction. Halt and report `DOCUMENTATION_CONTRACT_CONFLICT` with:
> - Affected rule
> - Code location
> - Documentation location
> - Why the conflict matters

## Hard operational rules

- **Agent work style**: Make changes in small, incremental steps — one file or small file group per tool call, run tests after each logical unit, and commit after each passing step. Never attempt to emit entire multi-file features in a single giant response. Prefer many small safe steps over one big fragile one.
- **Bitrix24 API transport**: All live CRM calls MUST go through `bitrixGet`/`bitrixPost` from `src/lib/bitrix.ts` (enforcing method allowlist, SSRF protection, param sanitization). Raw `fetch` to Bitrix24 is strictly forbidden.
- **Config imports**: Import `IS_PRODUCTION` / `WP_LOGIN_URL_CLIENT` from `src/lib/config.ts` (server-only secrets from `src/lib/config.server.ts`) instead of reading `process.env` directly.
- **Middleware**: The Next.js middleware file is `src/proxy.ts` with default export named `proxy` — keep that file name, location, and export name (rate limiting, CORS, CSP live there).
- **Auth compliance**: Every login attempt must be recorded in the `AuditLog` Prisma table (compliance requirement — never remove when touching auth). `NEXTAUTH_SECRET` and `PROXY_SECRET` are hard-required in production; never relax this.
- **ESLint rules**: Strict rules (`no-explicit-any`, `exhaustive-deps`, `no-unused-vars`, etc.) are intentionally disabled in `eslint.config.mjs`. Do not "fix" these violations.
- **Zustand store**: `src/store/dashboard-store.ts` persists to localStorage (key `bitrix-bi-dashboard`). When the persisted shape changes, bump `version` and add a branch in `migrate()`.
- **CRM configuration centralization**: CRM-specific IDs (field IDs, stage IDs, default columns, alert thresholds) are centralized in `src/lib/crm-constants.ts` — that should be the only file needing updates when Bitrix24 CRM configuration changes.
- **Demo mode**: Without `BITRIX_WEBHOOK_URL`, the application falls back to demo mode (`src/lib/demo-data.ts`) — expected behavior on unconfigured installs, not a bug.
- **UI primitives**: Use existing shadcn/ui components under `src/components/ui/`; do not hand-roll duplicate UI primitives.

## Bitrix24 REST + MCP developer knowledge

When implementing or modifying Bitrix24 CRM REST integrations, adhere to this strict separation:

- **Bitrix24 MCP Dev Server** (`https://mcp-dev.bitrix24.com/mcp`): Official Bitrix24 developer documentation and API schema knowledge. When available to development agents, consult it before implementation to verify exact REST method names, parameter names, field types, pagination contracts, scopes/permissions, and error behaviors.
- **Application Bitrix integration**: Actual live CRM data transport performed exclusively by the backend via `bitrixGet`/`bitrixPost` in `src/lib/bitrix.ts`.
- **Prohibitions**:
  - The MCP server is **NOT** the application's CRM transport.
  - Never invent CRM field IDs, stage IDs, status IDs, or undocumented parameters.
  - Never send `BITRIX_WEBHOOK_URL`, production secrets, or authentication tokens to the documentation MCP.

## Production database safety (fail-closed)

Production SQLite stores compliance-critical records (`AuditLog` and `UsedNonce`).

- **Strict prohibitions against production**:
  - **NEVER** run `prisma migrate reset`.
  - **NEVER** run `prisma db push`.
  - **NEVER** pass `--accept-data-loss`.
  - **NEVER** delete the production database or replace it with a blank database to resolve deployment errors.
  - **NEVER** silently relocate the database, delete persistent database volumes, or overwrite production SQLite from a build artifact.
- **Production migration contract**:
  - All production migrations must use the repository's fail-closed deployment gate: `node scripts/migrate-deploy.mjs`.
  - Production `DATABASE_URL` must be **absolute** and point to the actual live database file. Inspect the live configuration and `DEPLOYMENT.md` before modifying database settings. Never guess or hardcode a single host path.

## Commercial Funnel invariants

The Commercial Funnel (`/commercial-funnel`) is a **management analytics layer** over Companies, Deals, samples, and activities for the Commercial Director. It is **NOT** an operational entity registry.

### Product boundary and UI tabs
- Exactly five permanent management tabs exist in this order:
  1. `Обзор` (`overview`)
  2. `Воронка` (`funnel`)
  3. `Сегменты` (`segments`)
  4. `Менеджеры` (`managers`)
  5. `Требуют внимания` (`bottlenecks`)
- **Do not restore** permanent internal entity tabs (`Образцы`, `Компании`, `Сделки`) inside Commercial Funnel. Dedicated operational browsers exist as top-level terminal products (`/`, `/companies`, `/samples`).
- Fixed 6-sheet Excel management workbook structure:
  1. `Executive Summary`
  2. `Funnel`
  3. `Segments`
  4. `Sample Testing` (management snapshot of current sample cycle, not raw registry)
  5. `Managers`
  6. `Action Plan`

### Event vs Snapshot / WIP model
- **Dated Event metrics**: Metrics tied to dated occurrences within the selected analytical period (e.g. new companies created, samples shipped, deals created, payments received, shipments).
- **Snapshot / WIP metrics**: Current operational portfolio state (e.g. companies in sample stages, active deals, awaiting payment, bottlenecks). Current WIP is **never truncated** by the selected period date range.
- Period count KPIs count unique Company IDs unless explicitly documented otherwise.
- **Historical stage transitions are NOT implemented**: The system does not track historical stage movement logs. Never invent stage transition counts (A → B), stage velocity, historical conversion rates, or cohort retention.

### Current contour («Компании в текущем контуре»)
- A company belongs to «Компании в текущем контуре» if and only if:
  - It has a real current sample/testing state (`sampleStatus` present, not `"—"`, `sampleStatusSource !== "NONE"`); **OR**
  - It has ≥1 active commercial Deal (`isDealActiveStage(deal.stageId)`).
- **Manager attribution**:
  - `sampleStatusSource === "DEAL"` → `sampleResponsibleId`
  - `sampleStatusSource === "COMPANY"` → Company owner (when `companyFactsIncluded !== false`)
  - Active commercial Deal → Deal responsible manager (`deal.responsibleId || company.responsibleId`)
- **Deduplication**: One company counts once per manager (Set union). A company may legitimately appear under two different managers when the sample cycle and active commercial deal belong to different employees.

### Awaiting payment invariant
- A deal is awaiting payment if and only if: `paymentStatus ∈ INVOICE_SENT_STATUS_CODES`.
- Current configured business values: `105` ("Выставлен счет") and `107` ("Ожидает подтверждения").
- **`103` ("Не оплачен") is NOT awaiting payment**.
- **Critical invariant**: Awaiting payment does **NOT** depend on `isDealActiveStage(...)`. A deal in a terminal stage (e.g. `WON` or `C1:LOSE`) with payment status `105`/`107` truthfully remains awaiting payment. Never gate awaiting-payment classification behind active-stage filtering.

### Sample provenance
- Never overwrite factual Company fields with Deal-derived analytical values.
- Deal-derived current sample state preserves exact Deal provenance: `sampleResponsibleDealId` identifies the specific sample Deal, and `sampleResponsibleId` identifies its responsible person.
- Sample bottlenecks and action items must reference the sample Deal, **never** an unrelated representative `primaryDeal`.
- When sample state is Company fallback (`sampleStatusSource === "COMPANY"`), do not borrow an unrelated Deal to populate deal columns.

### Segment semantics
- All Commercial Funnel views and exports share one global analytical slice.
- **Same-dimension filter constraint**: When a global filter is active on a dimension, the segment breakdown for that same dimension must contain only the selected filter value (e.g. Product = Gel must not emit Sol).
- **Cross-dimension analysis**: Filtering on one dimension (e.g. Product = Gel) does not collapse other dimensions (Industries and Directions display all relevant values within the Gel slice).
- Multi-valued dimensions (Product, Direction) allow a company to appear in multiple rows; table totals represent the union of unique Company IDs, not row sums.
- «Не указано» represents genuinely missing CRM dimension data, not records filtered out by active filters.
- Never mutate factual CRM fields to implement analytical segmentation.

### Financial quality and currency isolation
- Aggregate financial amount data-quality states:
  - `COMPLETE`: All relevant amounts are valid.
  - `PARTIAL`: Some amounts are valid, while at least one is unknown or invalid.
  - `UNKNOWN`: No valid amounts observed and all values missing.
  - `INVALID_ONLY`: No valid amounts observed and invalid records exist.
- Never silently convert missing or invalid financial values to `0`.
- **Multi-currency isolation**: Never cross-sum different currencies into a single scalar sum. Amounts are tracked and displayed per currency with independent quality states.

### One analysis clock (`analysisNow`)
- The Commercial Funnel UI and Excel export must share the identical analytical instant (`analysisNow`) for a given rendered view or export session.
- Never generate an independent `new Date()` during UI-initiated Excel export. This guarantees strict reconciliation between UI tables and exported workbooks across day, month, and quarter boundaries.

## Commands and QA matrix

Run commands from the repository root:

- `npm run dev` — Dev server on `:3000`, output piped to `dev.log`.
- `npm run build` — Type-checks and builds standalone output. Also copies static assets into `.next/standalone/`.
- `npm run start` — Runs the standalone server (`NODE_ENV=production node .next/standalone/server.js`).
- `npm run lint` — Runs ESLint.

### QA matrix by change category

1. **Small code patch**:
   ```bash
   npx vitest run <affected-test-file>
   npm run lint
   npm run build
   ```
2. **Commercial Funnel analytical changes**:
   ```bash
   npx vitest run
   npm run lint
   npm run build
   npm run qa:bitrix-contract:offline
   npm run qa:benchmark
   git diff --check
   ```
3. **Deployment / runtime-sensitive work**:
   ```bash
   npm run qa:standalone-smoke
   sh scripts/qa-deployment.sh
   # Linux artifact verification:
   npm run build:deploy
   sh scripts/verify-deploy-artifact.sh deploy-staging
   ```
4. **Browser acceptance**:
   ```bash
   npm run qa:e2e
   ```
   - Authenticated E2E may require external WordPress credentials.
   - Skipped or unavailable E2E is **PENDING**, not PASS. Never weaken auth guards or create bypasses to make E2E pass.
   - Do not invent test counts; 100% pass rate does not equal 100% test coverage.
   - Documentation-only patches do not require executing the full Vitest suite.

## Git and exact-SHA discipline

- Before beginning substantial work:
  ```bash
  git fetch origin
  git switch main
  git status
  git rev-parse HEAD
  ```
  Ensure the working tree is clean and you are operating on the expected base SHA.
- **Prohibitions**:
  - Never silently rebase or merge a moving `main`.
  - Never force-push (`git push --force`) unless explicitly instructed and approved.
  - Never claim CI success for a different commit SHA.
  - Never equate local QA with GitHub Actions CI.
  - Never equate a Vercel preview deployment with production deployment.
  - Never claim production is deployed without actual runtime verification.
- After any integration, merge, or conflict resolution, all QA and validation statements must reference the resulting exact commit SHA.

## Deployment

- Production runs the Next.js `standalone` output via `node server.js` (PM2 / Docker) — not `next start`, not Vercel.
- Host deploy path: `build-deploy.sh` creates Linux `deploy-prod.zip` (standalone bundle + Prisma migrations). Artifacts exclude `.env*` and SQLite files. See `DEPLOYMENT.md` for `DEPLOY_ARCH`, the baseline procedure, absolute `DATABASE_URL`, and Docker volume topology.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
