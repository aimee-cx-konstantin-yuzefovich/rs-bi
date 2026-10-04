# CLAUDE.md

This file provides architectural guidance and system specifications for Claude Code (claude.ai/code) and other software engineering agents working with code in this repository.

## What this is

RusSilica BI Terminal — a Next.js dashboard that displays Bitrix24 CRM deals/companies data for internal business analysis. Users authenticate via WordPress SSO (the WordPress site is the source of truth for users/roles); the app itself has no local user table, only an audit log in SQLite via Prisma.

## Source of truth hierarchy

1. **Current executable code + tests** for implemented behavior
2. **`AGENTS.md`** for operational hard rules, invariant constraints, and quality gates
3. **`CLAUDE.md`** for architecture, subsystem design, and data flow specifications
4. **`DEPLOYMENT.md`** for production deployment, production database safety, and artifact packaging rules
5. **Historical plans, working briefs, and snapshots**: Files matching `plan.md`, `*-plan.md`, historical implementation briefs, audit reports, and `codebase-snapshot.md` are historical working artifacts unless they explicitly declare themselves current normative documentation. They must never override levels 1–4.

If code and documentation ever appear to contradict a documented business contract, do not silently rewrite the documentation. Halt and report `DOCUMENTATION_CONTRACT_CONFLICT`.

## Commands

```bash
npm run dev          # next dev -p 3000, output piped to dev.log (check dev.log if console output seems missing)
npm run build        # next build, then copies static assets + public/ into .next/standalone (required for standalone deploy)
npm run start        # runs the standalone server: NODE_ENV=production node .next/standalone/server.js
npm run lint         # eslint .
npm run db:push      # prisma db push
npm run db:generate  # prisma generate
npm run db:migrate   # prisma migrate dev
npm run db:reset     # prisma migrate reset

npx vitest           # run all tests
npx vitest run <path> # run a single test file, e.g. npx vitest run src/__tests__/utils.test.ts
npx vitest -t "<name>" # run tests matching a name pattern
```

There is no separate typecheck script; `next build` type-checks (see `next.config.ts` — `ignoreBuildErrors` is deliberately `false`, don't disable it).

## Architecture

### Data flow: Bitrix24 → API routes → Zustand store → UI

- **Never call Bitrix24 directly from a component or route handler with raw `fetch`.** All CRM access goes
  through [`bitrixGet`/`bitrixPost`](src/lib/bitrix.ts), which enforces a method allowlist, validates the
  webhook URL isn't pointing at a private/internal IP (SSRF protection), sanitizes params/body, and strips
  internal error detail before it reaches the client. `BITRIX_WEBHOOK_URL` lives server-side only and is never
  exposed to the frontend.
- Route handlers under `src/app/api/bitrix/*` (fields, deals, companies, activities, users, status) are thin
  wrappers around `bitrixGet`/`bitrixPost`.
- [`src/store/dashboard-store.ts`](src/store/dashboard-store.ts) is the single Zustand store driving the main
  deals dashboard: fields, deals, filters, column selection/widths/order, pagination, saved views, and secondary data
  (`companiesData`, `activitiesData`, `userNames` — fetched lazily and only for fields currently selected).
  `applyClientFilters()` re-derives `deals` from `allDeals` whenever a filter changes; date/pipeline/responsible
  filtering happens client-side against the deal set already fetched from Bitrix.
  The store is `persist`-ed to localStorage (key `bitrix-bi-dashboard`) with a `version`/`migrate` scheme — bump
  `version` and add a branch in `migrate()` whenever the persisted shape changes.
  If `BITRIX_WEBHOOK_URL` isn't configured or the API returns no fields, the store falls back to
  [`src/lib/demo-data.ts`](src/lib/demo-data.ts) demo mode (`isDemoMode: true`) — this is what unconfigured
  installs see.
- URL state (`?date=&pipeline=&responsible=&q=&page=&size=&filters=`) is managed with `nuqs`
  ([`src/lib/search-params.ts`](src/lib/search-params.ts)) and synced into the store on mount in
  [`src/app/page.tsx`](src/app/page.tsx) (`syncUrlState`) — URL is the source of truth only on initial load, not
  continuously bound.
- CRM-specific IDs (field IDs, stage IDs, default columns, alert thresholds) are centralized in
  [`src/lib/crm-constants.ts`](src/lib/crm-constants.ts) — when Bitrix24 field/stage config changes, this is the
  only file that should need updating.
- Field visibility rules (which Bitrix24 fields are hidden from the column selector as internal/system fields)
  live in `SYSTEM_FIELDS_TO_EXCLUDE` / `isSystemField()` in `src/lib/bitrix.ts`.
- [`src/app/companies/page.tsx`](src/app/companies/page.tsx) is a standalone Companies browser (its own route,
  own column selector `company-column-selector.tsx`, own Excel export) separate from the main deals dashboard —
  it uses `src/app/api/bitrix/companies/list/route.ts` rather than the deals-oriented
  `src/app/api/bitrix/companies/route.ts`.

### Bitrix24 REST integration & Developer Knowledge (MCP)

When reasoning about or modifying Bitrix24 integrations, distinguish between developer documentation and runtime data access:

```
AI Developer Agent
├── Official Bitrix24 MCP Dev Server (https://mcp-dev.bitrix24.com/mcp)
│   └── Answers: "HOW does the official REST API work?" (methods, schemas, params, errors)
└── Application Bitrix Integration (src/lib/bitrix.ts)
    └── Answers: "WHAT is currently in our live CRM?" (live data transport via bitrixGet/bitrixPost)
```

- **Bitrix24 MCP Dev Server**: Authoritative developer documentation reference. Consult it to verify method names, parameters, field types, pagination, and error handling.
- **Application Webhook / Transport**: Live requests must go exclusively through `bitrixGet`/`bitrixPost` in `src/lib/bitrix.ts`.
- Never submit `BITRIX_WEBHOOK_URL`, production tokens, or customer data to the MCP documentation server.

### Commercial Funnel architecture

The Commercial Funnel ([`src/app/commercial-funnel/page.tsx`](src/app/commercial-funnel/page.tsx)) is an executive management analytics subsystem over normalized Companies, Deals, samples, and activities designed for the Commercial Director.

It is **NOT** an operational entity registry. Operational registers live in their dedicated top-level terminal products:
- Deals registry: `/`
- Companies registry: `/companies`
- Samples registry: `/samples`

The Commercial Funnel provides management insight across exactly five permanent views:
1. **Обзор** (`CommercialOverviewTab`): High-level KPI summary, period results, compact portfolio status, and management signals.
2. **Воронка** (`CommercialFunnelTab`): Two distinct, related tracks (Samples & Testing vs Commercialization).
3. **Сегменты** (`CommercialSegmentsTab`): Portfolio distribution across Industries, Directions, and Products with drill-down parity.
4. **Менеджеры** (`CommercialManagersTab`): Manager scorecard covering current contour load, period achievements, and bottlenecks without subjective rankings.
5. **Требуют внимания** (`CommercialBottlenecksTab`): Deterministic action center identifying stalled items, overdue payments, and missing next steps.

#### Subsystem responsibility map

- [`src/lib/commercial-funnel/normalize.ts`](src/lib/commercial-funnel/normalize.ts): Ingests raw CRM companies and deals, establishes Deal precedence over Company fallback, preserves explicit sample provenance (`sampleStatusSource`, `sampleResponsibleDealId`, `sampleResponsibleId`), and handles clean scalar string/enum sanitization.
- [`src/lib/commercial-funnel/engine.ts`](src/lib/commercial-funnel/engine.ts): Core analytical engine. Computes dated period activity KPIs, current WIP metrics, manager scorecards, objective bottlenecks, and evaluates financial data quality.
- [`src/lib/commercial-funnel/analytics.ts`](src/lib/commercial-funnel/analytics.ts): Management projections derived from canonical engine metrics. Builds the two-track Funnel view, Segment breakdowns, Action Plan rows, Sample Testing snapshots, and Management Signals.
- [`src/lib/commercial-funnel/stage-utils.ts`](src/lib/commercial-funnel/stage-utils.ts) & [`src/lib/stage-utils.ts`](src/lib/stage-utils.ts): Canonical stage semantic helpers (`isDealActiveStage` fail-closed, `isKnownActiveStage`, `KNOWN_ACTIVE_STAGES`, `getDealStageSemantics`, `isTerminalWonStage`, `isTerminalLostStage`, `isProgressedCommercialStage`).
- [`src/lib/commercial-funnel/date-utils.ts`](src/lib/commercial-funnel/date-utils.ts): Business timezone normalization (`Europe/Moscow`), calendar part extraction, boundary derivation, and safe delta percent calculations.
- [`src/lib/commercial-funnel/currency.ts`](src/lib/commercial-funnel/currency.ts): Multi-currency universe derivation, currency normalization, and formatted symbol helpers.
- [`src/lib/commercial-funnel/export-excel.ts`](src/lib/commercial-funnel/export-excel.ts): Generates the authoritative 6-sheet management Excel workbook consuming the exact same filtered population, boundaries, and analytical rules as the UI.
- [`src/app/commercial-funnel/page.tsx`](src/app/commercial-funnel/page.tsx): Subsystem orchestrator managing the frozen `analysisNow` clock, global filter bar, filtered analytical slice, tab navigation, and drill-down sheet dispatch.
- [`src/lib/deal-type.ts`](src/lib/deal-type.ts): Authoritative Deal Type registry (`buildDealTypeRegistry`) and shared resolver (`resolveDealType`) consuming Bitrix `crm.status.list` (`ENTITY_ID = DEAL_TYPE`).
- [`src/lib/deal-preview.ts`](src/lib/deal-preview.ts): Shared Deal Preview model (`buildDealPreviewModel`) for drawer and Deal Excel export; enforces strict timeline mapping (`DATE_MODIFY` is never customer touch).
- [`src/lib/company-preview.ts`](src/lib/company-preview.ts): Shared Company Preview model (`buildCompanyPreviewModel`), 21-business-field whitelist (`COMPANY_PREVIEW_CURRENT_FIELDS`), consumed identically by UI drawer and Company Excel export.

#### Natural-grain filtering & re-projection model

Global dimensional filtering (Responsible, Product, Industry, Direction, Region) operates at natural grain:

1. A Company is retained in the analytical slice if:
   - **Condition A**: The Company's factual attributes match the active filters; **OR**
   - **Condition B**: One or more child Deals match the active filters.
2. In [`src/lib/commercial-funnel/engine.ts`](src/lib/commercial-funnel/engine.ts) (`filterCompaniesByDimensions`), child deals are pruned strictly to matching deals.
3. The retained company is re-projected via `reprojectCompanyForFilteredGrain` in [`src/lib/commercial-funnel/normalize.ts`](src/lib/commercial-funnel/normalize.ts):
   - Factual Company fields are **never mutated**.
   - Deal-derived state (sample testing status, sample shipment dates, primaryDeal, attention flags) is re-evaluated strictly from surviving matching deals.
   - `companyFactsIncluded` flag: set to `true` if the company matched Condition A, or `false` if it was retained solely via Condition B. When `false`, Company-level fallback values (e.g. company creation date in period, company-level sample status) are excluded from analytical projections.

#### Sample current-cycle provenance chain

**Phase C (canonical engine)**: current sample state is resolved by the ONE canonical sample engine in `src/lib/samples/` (`buildCanonicalSampleDomain` → `reconcileCompanySample`), consumed identically by the Samples registry, Commercial Funnel, Managers, and Excel exports. `normalize.ts` no longer resolves current sample state itself and `reprojectCompanyForFilteredGrain` no longer recomputes it from matching deals — the canonical company-level state survives dimensional filtering when the company matches, and surfaces under a responsible-filter slice only when the canonical sample manager matches the filter.

- **Precedence (current state only)**: `SMART_PROCESS → DEAL_LEGACY → COMPANY_LEGACY → NONE`. Smart Process 1032 is authoritative for new/current cycles; legacy Deal/Company fields are historical/fallback evidence (never cleared, never overwritten). See `src/lib/samples/smart-process-contract.ts` for the canonical stage semantics, and the "Samples canonical engine & Smart Process 1032" section in `AGENTS.md` for the full invariant list.
- **Smart Process display view & bulk seam (Phase D)**: physical SP item display is projected ONCE by `src/lib/samples/smart-process-view.ts` over already-adapted evidence (never raw UF fields) and served to the Deals table, Deal Preview, Company Preview, and Sample Preview through the single bulk seam `POST /api/bitrix/smart-process-items` (`src/lib/samples/smart-process-service.ts`) with a principal-scoped in-memory client cache (no localStorage). Deal-table virtual columns (`SP_*`) and activity columns are client-only: `splitDealTableColumns` in `src/lib/deal-table-columns.ts` is the canonical guard that keeps enrichment columns out of upstream `crm.deal.list` selects. Stage display labels prefer the live `crm.status.list` directory for committed stage IDs; semantics never change with labels. See the "Smart Process display view & bulk read seam" section in `AGENTS.md`.
- **Deal-tier chronology**: among multiple legacy deals with sample evidence, the latest factual `sampleSentDate` wins (stable numeric Deal ID tie-break only on exact equality); conflicting undated statuses are strictly `AMBIGUOUS` — never the highest Deal ID.
- **Marker isolation**: Deal field `UF_CRM_1779394379` («Тестирование образцов») is MARKER_ONLY — navigation/preview/display (`sampleTestingStatus` on `CommercialDeal`/`RelatedDealSampleInfo` as raw preview) only. It never contributes to sample status, result, `samples_sent`, KPIs, current contour membership, or manager attribution.
- **Provenance assignment (legacy tiers, unchanged)**:
  - `sampleStatusSource = "DEAL"` → `sampleResponsibleDealId = currentSampleDeal.id`, `sampleResponsibleId = currentSampleDeal.responsibleId`
  - `sampleStatusSource = "SMART_PROCESS"` → `sampleResponsibleProcessItemId` (SP item ID — never stored in `sampleResponsibleDealId`), `sampleRelatedDealId` for the exact factual linked Deal
  - `sampleStatusSource = "COMPANY"` → deal fields remain `undefined`. The system never borrows an arbitrary representative deal merely to populate columns.
- **Sent-event attribution**: `sampleSentEvents` carry per-event provenance; the manager `samplesSent` flow attributes each event to its own source-entity responsible (SP event → SP `ASSIGNED_BY_ID`; Deal event → Deal responsible; Company event → Company owner). Global KPI counts unique companies; manager rows count unique companies per manager; the manager union reconciles to the attributable global population.
- **Invariants**:
  - When `sampleStatusSource === "DEAL"`, sample bottlenecks and Action Plan entries use `sampleResponsibleDealId`, **never** substituting `primaryDealId` (which may be an unrelated commercial deal).
  - When `sampleStatusSource === "SMART_PROCESS"`, bottlenecks use `sampleRelatedDealId` when a factual linked Deal exists and leave Deal blank otherwise.
  - When `sampleStatusSource === "COMPANY"`, deal fields remain `undefined`. The system never borrows an arbitrary representative deal merely to populate columns.
  - The Samples registry and Commercial Funnel Industry filter uses the current approved Company-card field `UF_CRM_1784195884554` («Отрасль (согл.список)»); direction uses `UF_CRM_1784200275341` («Направление (согл.список)»); region uses `UF_CRM_69259C45D3399` («Регион»); legacy `INDUSTRY` and retired `UF_CRM_6915D8C0C6814` never override them.

#### Event vs Snapshot model (Two analytical planes)

The analytics engine maintains two distinct analytical planes:

1. **Dated Events ("What occurred in the period?")**:
   - Strictly bounded by the selected period dates (`currentStart` to `currentEnd`).
   - Counts unique companies with verified dated occurrences: new companies created, sample shipments sent, deals created, payments received, shipments made.
2. **Current Snapshot / WIP ("Where does the portfolio stand now?")**:
   - Represents the current operational portfolio state.
   - **Never truncated by the date filter**: changing the period filter from 30 days to 7 days does not alter the number of companies currently on testing or awaiting payment.
3. **No historical stage transitions**: Bitrix CRM does not store reliable historical stage transition logs in this data pipeline. The application **does not implement** stage transition counts (A → B), stage velocity, historical conversion rates, or cohort retention. Agents must never invent or estimate these metrics.

#### Funnel as two related tracks

The Funnel view ([`src/components/commercial-funnel/funnel-tab.tsx`](src/components/commercial-funnel/funnel-tab.tsx)) models two related operational tracks rather than a single artificial linear funnel:

- **Track 1 — Samples & Testing**:
  - Current WIP snapshot across standard stages (`WIP_STATUS_KEYS`):
    - `Требуются образцы`
    - `Подготовка к отправке`
    - `Образцы отправлены`
    - `На испытании`
    - `Подошли`
    - `Не подошли`
    - `Требуется доработка`
    - `Не классифицировано`
  - Period event counts are present **only** where authoritative dated evidence exists: currently `Образцы отправлены` (via `sampleSentDate` provenance). For all other stages, period events are truthfully omitted (`periodEventCount = null`, displayed as "–").
- **Track 2 — Commercialization**:
  - Current snapshot: companies with active commercial deals (`isDealActiveStage`) and deals awaiting payment (`INVOICE_SENT_STATUS_CODES`).
  - Period events: deals created in period, payments received in period, isolated payment amounts by currency, and shipments completed in period.
- **Continuation Link**:
  - Connects companies currently at `Подошли` that have progressed commercial deals (`isProgressedCommercialStage`). This represents factual operational continuation, not historical cohort conversion.

#### Awaiting payment contract

- Evaluated strictly from `paymentStatus ∈ INVOICE_SENT_STATUS_CODES`:
  - `105`: "Выставлен счет"
  - `107`: "Ожидает подтверждения"
- **`103` ("Не оплачен") is NOT awaiting payment**.
- **Critical invariant**: Awaiting payment does **NOT** depend on `isDealActiveStage(...)`. A deal in a terminal stage (e.g. `WON` or `C1:LOSE`) with status `105`/`107` truthfully remains awaiting payment. Never gate awaiting-payment calculations behind active-stage filtering.

#### Manager attribution & scorecard rules

The Manager Scorecard ([`src/components/commercial-funnel/managers-tab.tsx`](src/components/commercial-funnel/managers-tab.tsx)) attributes portfolio load and period performance to responsible individuals:

- **«Компании в текущем контуре» (`activeCompanies`)**:
  - Unique company union of:
    - Real current sample state (`sampleStatusSource !== "NONE"`, not `"—"`): attributed to `sampleResponsibleId` (DEAL) or company owner (COMPANY, if `companyFactsIncluded !== false`).
    - Active commercial deals: attributed to `deal.responsibleId || company.responsibleId`.
  - One company counts once per manager (Set union). If manager A owns the sample cycle and manager B owns the active commercial deal, the company legitimately appears under both managers.
- **Awaiting payment**: Attributed to the deal's responsible manager, evaluated across all deals with `INVOICE_SENT_STATUS_CODES` regardless of stage.
- **No Next Step**: Counts active deals where activity data is reliably known (`activityDataKnown === true`), but no upcoming deadline or task exists (`!activityNext`).

#### Segment provenance & active filter rules

The Segments view ([`src/components/commercial-funnel/segments-tab.tsx`](src/components/commercial-funnel/segments-tab.tsx)) organizes the portfolio across `industry`, `direction`, and `product`:

- **Segment Value Derivation (`getAnalyticalSegmentValues`)**:
  - If `companyFactsIncluded !== false`: Company's factual dimension values are used.
  - If `companyFactsIncluded === false`: Derived from the union of dimension values across surviving matching deals.
  - Factual Company fields are **never mutated**.
- **Same-Dimension Filter Constraint**:
  - When an active global filter is applied to a dimension (e.g. Product = Gel), the segment rows for that dimension must show **only** the selected value. A company never appears under a value that the active filter excluded.
- **Cross-Dimension Independence**:
  - Filtering by Product = Gel does not collapse Industry or Direction rows; all industries and directions relevant to the Gel population remain visible.
- **Grand Totals**:
  - Product and Direction are multi-valued dimensions (a company may appear in multiple rows). Table "Итого" represents the union of unique Company IDs, not the sum of row counts.
- **«Не указано»**:
  - Represents records with genuinely missing CRM dimension data. It is never used to represent records removed by a filter.

#### Period & timezone semantics

- All period boundary, date comparison, and day-age calculations are normalized to the business timezone: `Europe/Moscow` (`COMMERCIAL_TIMEZONE`, UTC+3).
- **Aligned period presets**: Exactly five options are exposed across Samples and Commercial Funnel: `7 дней` (`7days`), `14 дней` (`14days`), `30 дней` (`30days`, default in both), `90 дней` (`90days`), and `Указать вручную` (`custom`).
- Rolling presets represent inclusive calendar days ending at 23:59:59.999 in Moscow: 7d (today + 6 days prior), 14d (today + 13 days prior), 30d (today + 29 days prior), 90d (today + 89 days prior).
- **Manual period (`custom`)**: Evaluates inclusive Moscow calendar day bounds `start 00:00:00` to `end 23:59:59.999`. If boundaries are incomplete or missing, returns null bounds without fallback to 30 days. Obsolete legacy presets (`all`, `quarter`, `year`) normalize to `30days`.
- Previous comparison periods have duration exactly equal to the current period (`currentEnd - currentStart`).

#### Analytical data-trust & error-state lifecycle

The system distinguishes five conceptual analytical lifecycle states across Samples (`useSamplesData`) and Commercial Funnel (`useCommercialFunnelData`):
1. `loading`: Initial or background fetch active.
2. `ready`: Data loaded successfully and verified complete.
3. `partial`: Business records loaded successfully, but CRM dictionary metadata or activity logs returned partial/degraded (`metadataPartial === true`).
4. `refresh_failed`: Background revalidation failed after a prior successful snapshot (`isStale === true`). Cached companies, deals, samples, and `loadedAt` are preserved. UI displays a prominent warning with the last successful load time (`HH:MM:SS`) and a Retry button.
5. `failed` (`unavailable`): Initial load failed with zero items available.

**Hard invariants**:
- **Truthful zero vs unavailable**: Real empty response from API (`ready` with `[]`) evaluates truthfully to business KPI `0`. Initial failure (`failed` / `isUnavailable`) renders `—` (dash), suppressing deceptive zero counts across all tabs (`overview`, `funnel`, `segments`, `managers`, `bottlenecks`).
- **Cached snapshot preservation**: Refresh failure never wipes cached data, never injects zeroes, and never silently presents stale numbers as fresh.
- **Export guardrail**: Excel export is disabled (`exportDisabled = true`) during initial load failure or empty datasets. Stale snapshots exported to Excel stamp `STALE_SNAPSHOT_DISCLOSURE`. Degraded metadata stamps `METADATA_PARTIAL_DISCLOSURE`.

#### One analysis clock (`analysisNow`)

- The Commercial Funnel UI and Excel export share a single frozen analytical timestamp (`analysisNow`) initialized strictly from the active successful snapshot's `loadedAt` (`useMemo(() => loadedAt ? new Date(loadedAt) : new Date(), [loadedAt])`).
- `analysisNow` is passed directly to `computePeriodBoundaries`, `computeBottlenecks`, and `export-excel.ts`.
- **Clock preservation across failed refreshes**: When a refresh fails, `analysisNow` remains frozen to the timestamp of the surviving snapshot. It does not tick, advance, or drift across Moscow midnight.
- UI-initiated Excel export never generates an independent `new Date()`. This guarantees strict parity between UI tables and exported spreadsheets even across midnight or month/quarter boundaries.

#### Deal stage fail-closed architecture

- Deal stage classification evaluates across three conceptual states via `getDealStageSemantics` in `src/lib/stage-utils.ts`: `ACTIVE`, `TERMINAL`, and `UNKNOWN`.
- **Fail-closed active evaluation**: `isDealActiveStage(stageId)` returns `false` for unknown, unmapped, blank, or undefined stage IDs. Unrecognized stages are never assumed active merely because they are not terminal.
- **Active metrics authority**: Only positively recognized active stages (`isKnownActiveStage(stageId)`) contribute to active-stage metrics («Активные сделки», stalled deals, missing next step). Category-prefixed active stages (`C1:1`, `C1:2`, `C3:1`, `C3:4`, `C5:1`, `C5:2`, `C7:1`) are registered canonically in `KNOWN_ACTIVE_STAGES`.
- Known terminal won (`isTerminalWonStage`) and terminal lost/apology stages (`isTerminalLostStage`) remain terminal and never active.

#### CRM metadata completeness & enum sanitization

- CRM enum/status metadata is part of analytical data quality. Missing or failed dictionaries flag `metadataPartial = true` in API envelopes.
- **Neutral fallback**: When an enum/status label is unresolvable, normal UI and Excel cells display strictly the neutral label: **`Не классифицировано`** (`UNCLASSIFIED_LABEL` from `src/lib/crm-constants.ts` / `src/lib/commercial-funnel/constants.ts`).
- **Prohibition on raw ID leakage**: Raw numeric IDs, technical tokens (e.g. `2695`), and composite strings like `Не классифицировано (2695)` must **NEVER** leak to user-facing UI or normal Excel columns. Raw IDs are preserved exclusively in internal provenance/diagnostic objects (`rawResult`, `rawStageId`).

#### Shared Deal Type resolution subsystem

- Deal `TYPE_ID` user-facing titles resolve from the Bitrix Deal Type status registry: `crm.status.list` with `ENTITY_ID = DEAL_TYPE`.
- Raw technical codes (e.g. `SALE`) are internal status identifiers, never user-facing titles.
- **Architecture**: Bitrix `DEAL_TYPE` registry (`buildDealTypeRegistry`) → shared resolver (`resolveDealType` in `src/lib/deal-type.ts`) → UI drawer and Excel exports.
- **Invariants**:
  - Never hardcode a static `SALE → business name` mapping as the single source of truth.
  - Deal Type metadata is loaded centrally in fields/status envelopes, not fetched per individual deal.
  - Fallback order: current `DEAL_TYPE` registry → valid `TYPE_ID` field `listValues` → `Не классифицировано` (or `–` if absent). Raw `TYPE_ID` must never leak to UI or Excel.

#### Deal Preview timeline architecture

- The Deal Preview model (`buildDealPreviewModel` in `src/lib/deal-preview.ts`) enforces strict timeline attribute mappings:
  - `Дата создания сделки` → Deal `DATE_CREATE`.
  - `Последнее касание с клиентом` → factual CRM/customer activity timestamp according to canonical activity model (`lastTouchTimestamp` / `activity.CREATED` / `deal.LAST_ACTIVITY_TIME`, null if absent).
  - `Последнее изменение сделки` → Deal `DATE_MODIFY` (`deal.DATE_MODIFY` / `deal.updatedTime`).
  - `Последняя активность` → factual activity subject/description (`activity.SUBJECT`).
- **Critical invariant**: `DATE_MODIFY` is **NEVER** a fallback for customer touch (`Последнее касание с клиентом`). Field edits (payment date, stage, amounts, internal notes) update `DATE_MODIFY` without representing interaction with the customer.
- UI drawer and Deal Excel export consume the exact same shared Deal Preview model.

#### Company Preview architecture

- The Company Preview model (`buildCompanyPreviewModel` in `src/lib/company-preview.ts`) governs all company inspection surfaces (drawer and Company Excel export):
  - **ONE approved current-card whitelist**: 21 business fields (`COMPANY_PREVIEW_CURRENT_FIELDS`) mirroring the live Bitrix Company card layout and order, plus the `Тестирование образцов` marker field and the system `DATE_CREATE`/`DATE_MODIFY` pair; no page-specific field lists; no generic `UF_CRM_*` iteration.
  - **Current fields authoritative**: Current approved fields (`UF_CRM_1784195884554` Industry, `UF_CRM_1784200275341` Direction, `UF_CRM_69259C45D3399` Region) are authoritative; legacy `Сфера деятельности` and retired fields must never substitute.
  - **Empty-field invariant**: every whitelisted field renders even when empty — an unresolvable value becomes the truthful `—` placeholder; fields are never dropped, values never fabricated. UI and Excel inherit this from the same resolved model.
  - Product type is analytical, separate from Company card preview.
  - Legacy sample fields remain in canonical analytics, never rendering as individual current-card rows.
- The drawer (`src/components/dashboard/company-preview.tsx`) is the single canonical company drawer for every "open this company" action; callers pass only navigation/focus callbacks. Its Smart Process section consumes exactly ONE data path — the company-scoped `POST /api/bitrix/samples { companyId }` response (`SampleSummary.smartProcessItems`, active/terminal counts); the shared bulk cache (`smart-process-client-cache.ts`, one named freshness policy `SMART_PROCESS_CACHE_FRESHNESS_MS`) remains for Deals table / Deal Preview bulk consumers. Company Excel export mirrors the drawer sections; the Smart Process cycle table renders one physical item per row with exactly 12 columns. See the "Company Preview canonical drawer contract" section in `AGENTS.md`.
- **Caller-independent lookup bootstrap**: The drawer bootstraps the shared canonical lookup directories (`fetchFields` / `fetchUserNames` store actions) when they are empty — opening a company from `/samples`, Commercial Funnel, or a cold store resolves Company Type / Industry / Direction identically to the warm main page. Bootstrap is one-shot per mounted drawer / auth principal: a failed attempt stops automatic retry (no timers, no request storms); only an explicit user retry performs another real request; a valid shared lookup means no bootstrap at all. While lookups load, an unresolvable enum/status value renders the interim `LOOKUP_LOADING_PLACEHOLDER` (never a premature final «Не классифицировано» for a possibly-known ID; raw IDs never leak). Field dictionaries and the user directory resolve to INDEPENDENT truthful states (`loading`/`ready`/`partial`/`failed` from real store provenance) — one source's success never marks the other ready, and each non-ready source is disclosed individually. If field metadata ultimately fails, the drawer discloses it and unresolvable values fall back to the canonical `UNCLASSIFIED_LABEL` — labels are never fabricated and DEMO metadata is never substituted for a failed production lookup (in demo mode no dictionary reaches `buildCompanyPreviewModel`; a failed post-demo production fetch clears the stale demo arrays from the store). The field-metadata state enters the model via `buildCompanyPreviewModel(..., { metadataState })`.
- **Excel lookup gating + disclosure**: while any required lookup is still loading, the drawer's export is disabled — the interim `LOOKUP_LOADING_PLACEHOLDER` is never serialized into a final workbook. After loading finishes, `partial`/`failed` field/user lookups keep the export available but stamp `buildCompanyLookupWarnings` (`src/lib/company-preview.ts`) as visible disclosure rows near the workbook report header (`lookupWarnings` in `ExportCompanyOptions`), so a detached workbook truthfully discloses incomplete lookup provenance — UI warnings and Excel disclosures agree 100%; no raw errors, IDs, webhook information, or credentials ride this channel.
- **Company-scoped async state**: Every drawer async slice (company card, related deals, Samples/SP summary) is explicitly stamped with its Company ID and guarded by abort + request-sequence counters. Changing the `id` prop A→B makes A's card fields, deals, and SP cycles unavailable to B immediately — even for one intermediate render — and a late A response can never overwrite B. Export proceeds only when every snapshot's scope matches the current `id`.
- **Repeated-failure stale preservation**: A Samples refresh failure after a prior success for the SAME company preserves that snapshot as `refresh_failed` through ANY number of consecutive failed retries; a second failure never converts `refresh_failed` into a hard `failed` state and never discards previously valid data. Prior data is never carried across different companies.
- **Canonical UI/Excel field partition**: `partitionCompanyPreviewFields` (`src/lib/company-preview.ts`) is the ONE section partition, driven exclusively by `COMPANY_BUSINESS_FIELD_IDS` / `COMPANY_MARKER_FIELD_ID` / `COMPANY_SYSTEM_FIELD_IDS`; neither the drawer nor `createCompanyExcelWorkbook` hard-codes a marker UF token. Company ID appears only in the workbook account header (`CRM ID:`) — never as an extra `ID компании` row inside «ИНФОРМАЦИЯ О КОМПАНИИ»; Section 1 rows are exactly the canonical business-field sequence the drawer renders.

#### Samples registry Excel

- `buildSamplesWorkbook` (Samples registry export) renders ONE COMPANY = ONE row from the canonical `SampleSummary` and includes the Smart Process presentation facts `Текущий этап тестирования` (from `currentActiveStageLabels`: empty for 0 active, the label for exactly 1, all unique labels joined for >1 — never a winner) and `Активных процессов` (numeric `activeSmartProcessCount`). Labels are sanitized FIRST and deduplicated AFTER sanitization — two different unsafe/raw representations that both sanitize to `Не классифицировано` render once. No second Smart Process fetch is performed for export.

#### Company-scoped Smart Process read seam

- **ONE shared trustworthy company-scope mechanism** (`collectCompanyScopedSmartProcessCandidates` in `src/lib/samples/smart-process-service.ts`) serves BOTH `POST /api/bitrix/samples { companyId }` and `POST /api/bitrix/smart-process-items { companyId }`. Scope semantics: candidates = SP items with direct `companyId === X` UNION items whose exact `parentId2` points to a Deal of X, deduplicated by item ID; a COMPLETE Deal→Company map is then built (bounded bulk `crm.deal.list` `{"@ID": [...]}` chunks) over ALL Deal IDs referenced by the candidates — including foreign-linked deals needed to detect relation conflicts; attribution is decided only by the canonical `adaptSmartProcessSampleEvidence` + view indexer (post-adaptation selection). A direct-company-only SP filter is forbidden: it silently loses the fallback-by-Deal case. An `@parentId2` IN-filter optimization must stay disabled until its Universal CRM filter contract is live-verified read-only.
- `buildCanonicalSampleDomain` / `buildSampleSummaries` accept an OPTIONAL `authoritativeDealCompanyById` map (scoped routes supply the complete map so conflict detection never runs on a scoped deal subset); omitted → full-scope semantics are unchanged. No per-item Deal requests; no second parser; global/full-scope behavior is identical to before this seam.

#### Samples responsible scope (company grain)

- The Samples `responsibleId` scope is a COMPANY responsible filter (Company `ASSIGNED_BY_ID` — identical to the Companies browser), never a Deal owner filter and never a Smart Process assignee filter. `/api/bitrix/samples` builds `allowedCompanyIds` from the authoritative Company fetch and applies it at COMPANY grain via `AggregateOptions.allowedCompanyIds` in `src/lib/samples/aggregate.ts`; `fetchSampleDeals` (`src/lib/samples/bitrix-fetch.ts`) cannot express a responsible filter by construction. Responsible-scoped requests fetch the normal complete Deal and Smart Process populations (correctness over optimization; no N+1, no unverified `@parentId2`/`@COMPANY_ID` filters) and evidence enters only through canonical Company attribution/relation provenance — SP-only resurrection (step 5b), Company reconciliation (step 5a), and scoped quality counts all respect the set; out-of-scope conflict/orphan items contribute nothing. Combined `{ companyId, responsibleId }` where the Company fails the responsible filter returns a truthful successful empty scope and performs no Deal or SP population load. Omitting `allowedCompanyIds` keeps full unscoped semantics unchanged. See the "Samples responsible scope (company grain)" section in `AGENTS.md`.

#### Samples responsible display grain (explicit Company responsible)

- `SampleSummary` distinguishes `responsibleId` (canonical CURRENT sample/process responsibility: SMART_PROCESS item's own `ASSIGNED_BY_ID` → legacy/current fallback → Company responsible) from the explicit `companyResponsibleId` / `companyResponsibleName` (Company `ASSIGNED_BY_ID` owner grain). Both facts are projected by the ONE canonical projector `projectCanonicalCompanyToSummary` (`src/lib/samples/project.ts`) — no second parser, no raw Company re-read.
- The Samples UI responsible filter, the registry responsible column («Ответственный компании»), and the Samples Excel responsible column operate at COMPANY grain and consume `companyResponsibleId` (helpers `buildCompanyResponsibleOptions` / `matchesCompanyResponsibleFilter` in `src/components/dashboard/samples/samples-filters.tsx`; Excel via `buildSamplesWorkbook` in `src/lib/export-utils.ts`). Physical Smart Process cycles (`SmartProcessItemCard`, Sample Preview cycle details) keep their own process responsible. See the "Samples responsible display grain" section in `AGENTS.md`.

#### Samples ambiguity semantics

- The ambiguous Samples population (`ambiguous` / «С неоднозначными данными») in `src/lib/samples/` (`buildCanonicalSampleDomain`) covers all canonical ambiguity causes:
  - conflicting legacy evidence across Deal and Company fields;
  - multiple active Smart Process items for a single company (`AMBIGUOUS_MULTIPLE_ACTIVE`);
  - mixed result evidence across sample cycles (`MIXED`).
- User-facing descriptions and hints must truthfully reflect this complete population and must not be reduced solely to "conflicting sources".

#### Financial quality and multi-currency architecture

Commercial Deal opportunities are tracked per currency:

- **Aggregate Quality States**:
  - `COMPLETE`: 0 paid deals (sum = 0), or all paid deals have valid numerical opportunities.
  - `PARTIAL`: At least one deal has a valid opportunity, and at least one deal has missing/invalid data.
  - `UNKNOWN`: No valid opportunities observed, and all values are missing.
  - `INVALID_ONLY`: No valid opportunities observed, and invalid records exist.
- **Rules**:
  - Never convert missing or invalid amounts to `0`.
  - **Multi-currency isolation**: Deals in RUB, USD, EUR, etc. are tracked separately in `paymentAmountsByCurrency` with individual quality states. Currencies are never collapsed into an arbitrary combined sum.

#### Excel management contract

The Excel exporter ([`src/lib/commercial-funnel/export-excel.ts`](src/lib/commercial-funnel/export-excel.ts)) produces a branded 6-sheet workbook:
1. `Executive Summary`: Core KPIs, period comparisons, portfolio status, and corporate metadata.
2. `Funnel`: Samples & Testing and Commercialization tracks with exact company counts.
3. `Segments`: Matrices for Industries, Directions, and Products with current and period columns.
4. `Sample Testing`: Management snapshot of current sample cycles (not the raw historical registry).
5. `Managers`: Complete manager scorecard with portfolio loads, achievements, and currency breakdowns.
6. `Action Plan`: Objective bottlenecks requiring management intervention.

- **Demo mode guard**: Workbook export throws immediately if invoked in demo mode (`isDemoMode: true`), preventing mock data from being circulated as executive reports.
- **Data trust guardrails**: Export button is disabled (`exportDisabled = true`) during initial load failures or empty datasets. Stale snapshots exported to Excel stamp `STALE_SNAPSHOT_DISCLOSURE`. Partial metadata stamps `METADATA_PARTIAL_DISCLOSURE`.

#### Explicit out-of-scope / non-goals

The following concepts are deliberately **NOT** implemented in the Commercial Funnel:
- Historical stage transition tracking (A → B logs).
- Funnel stage velocity and dwell times.
- Cohort conversion analytics.
- Automated revenue forecasts.
- Subjective manager rankings or efficiency scores.
- AI-based priority recommendations.
- Fabricated invoice issuance dates (Bitrix CRM provides no invoice date field).
- Fabricated testing completion dates.
- Undocumented CRM field IDs or guessed status semantics.

### Auth (WordPress SSO via HMAC, NextAuth v4)

- [`src/lib/auth.ts`](src/lib/auth.ts) configures a single NextAuth `CredentialsProvider` that accepts three
  distinct paths, tried in order inside `authorize()`:
  1. **HMAC SSO token** — password field is `wp-sso-hmac|{email}|{role}|{ts}|{sig}`, generated by WordPress and
     verified in [`src/lib/sso-hmac.ts`](src/lib/sso-hmac.ts) (`verifySsoToken`). Tokens expire after 30s and are
     single-use (nonce recorded in the `UsedNonce` Prisma table) to block replay.
  2. **Caddy proxy headers** (`x-auth-user-email`/`x-auth-user-role` + `x-proxy-secret`) — alternative to (1) for
     reverse-proxy-based setups; only trusted in production, compared with `timingSafeEqualString`.
  3. **Dev password** (`DEV_PASSWORD`, default `dev1234`) — development only, never reachable in production.
  - Every login attempt (success/failure/blocked) is written to the `AuditLog` Prisma table via `auditLog()` /
    `persistAuditLog()` — this is a compliance requirement, don't remove it when touching auth code.
  - `isCorporateEmail()` enforces the `@russilica.ru` domain (plus an explicit allowlist) as defense-in-depth
    even after SSO/proxy trust.
  - `NEXTAUTH_SECRET` and `PROXY_SECRET` are hard-required in production (the app throws / logs FATAL and
    rejects all logins if missing) — never relax this.
- [`src/lib/auth-guard.ts`](src/lib/auth-guard.ts) provides `requireAuth`/`requireAdmin`/`requireAuthOnly` for
  API routes; role comes from the JWT (set at sign-in from WordPress), there's no live DB lookup of role per
  request.
- [`src/proxy.ts`](src/proxy.ts) is this app's Next.js middleware (note the filename — it's `proxy.ts`, not
  `middleware.ts`, exporting a default function named `proxy`; keep that name/location when editing it). It
  applies, in order: forced `x-forwarded-proto: https` in prod, per-route-class in-memory rate limiting
  (stricter for `/api/auth/*` and `/api/admin/*`), CORS (single allowed origin in prod:
  `bi-terminal.rus-silica.com`), request body size caps, and a full security header set including
  environment-specific CSP (dev allows `unsafe-eval`/websocket for HMR; prod does not).

### Config

- `src/lib/config.ts` — safe for both client and server (`IS_PRODUCTION`, `WP_LOGIN_URL_CLIENT`, `BI_URL`,
  `shouldLog`).
- `src/lib/config.server.ts` — server-only (`import "server-only"`), holds `WP_LOGIN_URL`. **Always import
  `IS_PRODUCTION`/`WP_LOGIN_URL_CLIENT` from `src/lib/config.ts` instead of reading `process.env` directly** —
  this was previously duplicated across 4+ files.

### Deployment

- Production runs the Next.js **standalone** output via `node server.js` — not `next start`, not Vercel.
  `npm run build` explicitly copies `.next/static` and `public/` into `.next/standalone/` because standalone
  mode doesn't include them by default.
- Host deploy paths: `build-deploy.sh` builds a Linux ZIP for PM2 deployment,
  rsyncs with environment/database exclusions, runs the packaged migration CLI, then
  restarts PM2. Manual ZIP builds require matching Debian/OpenSSL 3 Linux and
  `DEPLOY_ARCH`. `.env*` and SQLite files never belong in deployment artifacts.
- Docker uses matching Alpine build/runtime stages, a non-root user and the
  persistent `/app/db` volume. It applies migrations before starting `server.js`.
  Caddy (`Caddyfile`) or the existing nginx/LiteSpeed layer proxies the application.
- SQLite stores only `AuditLog` and `UsedNonce`. The documented legacy host path is
  `prisma/db/audit.db`; Docker uses `/app/db/audit.db`. Production URLs must be
  absolute and point to the existing file. Never delete/reset or silently relocate
  the compliance database. See `DEPLOYMENT.md` for the mandatory one-time baseline
  procedure for existing tables without migration history.

## Project conventions

- Path alias `@/*` → `src/*` (see `tsconfig.json`).
- ESLint intentionally disables most strict TS/React rules (`no-explicit-any`, `exhaustive-deps`,
  `no-unused-vars`, etc. — see `eslint.config.mjs`). Don't "fix" these; they're off by design, not oversight.
- UI is shadcn/ui components (`src/components/ui/*`, configured via `components.json`) + Tailwind v4 + Radix
  primitives. Don't hand-roll a component that already exists under `src/components/ui/`.
- Tests use Vitest + Testing Library + jsdom (`vitest.config.mts`); test files live in `src/__tests__/`.

### Documentation maintenance & durability contract

- **Update in the same change**: Update `AGENTS.md` / `CLAUDE.md` in the same patch when materially changing Commercial Funnel business semantics, analytical grain/provenance, global filter semantics, manager attribution, CRM field/status mappings, permanent UI tab / workbook contracts, auth/security architecture, Zustand store schema, DB migrations, or canonical QA workflows.
- **No churn for refactors**: Do not edit documentation for internal implementation refactors when the documented contract remains unchanged.
- **No transient state**: Never write commit SHAs, branch names, PR numbers, CI IDs, test counts, benchmark timings, or preview URLs into long-lived documentation.
- **Invariants over algorithms**: Describe invariants, ownership, provenance rules, and subsystem responsibilities alongside the canonical function/module. Do not duplicate complete procedural algorithms or decision trees into Markdown. Executable code and tests remain the authority for low-level computational details.
