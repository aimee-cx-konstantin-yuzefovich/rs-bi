# AGENTS.md

This file provides operational guidance and hard rules for coding agents working with code in this repository.

RusSilica BI Terminal — Next.js dashboard over Bitrix24 CRM data; users authenticate via WordPress SSO (NextAuth v4), and the application has no local user table. Detailed architecture and subsystem specifications live in `CLAUDE.md`.

## Source of truth hierarchy

When reasoning about system behavior, follow this strict precedence:

1. **Current executable code + tests** for implemented behavior
2. **`AGENTS.md`** for operational hard rules, invariant constraints, and guardrails
3. **`CLAUDE.md`** for detailed architecture and subsystem design explanations
4. **`DEPLOYMENT.md`** for production deployment, production database safety, and artifact rules
5. **Historical plans, working briefs, and snapshots**: Files matching `plan.md`, `*-plan.md`, historical implementation briefs, audit reports, and `codebase-snapshot.md` are historical working artifacts unless they explicitly declare themselves current normative documentation. They must **never** take precedence over levels 1–4.

> [!CAUTION]
> **DOCUMENTATION_CONTRACT_CONFLICT**
> If current code/tests appear to contradict a documented business contract, **DO NOT** silently rewrite documentation to normalize the contradiction. Halt and report `DOCUMENTATION_CONTRACT_CONFLICT` with:
> - Affected rule
> - Code location
> - Documentation location
> - Why the conflict matters

## Documentation maintenance & durability contract

### When documentation MUST be updated
Update `AGENTS.md` / `CLAUDE.md` in the same change when a patch materially changes:
- Commercial Funnel business semantics;
- analytical grain or provenance;
- global filter semantics;
- Manager attribution;
- CRM field/status mappings;
- permanent UI tab / Excel workbook contracts;
- authentication/security architecture;
- persisted Zustand schema;
- production database/migration contract;
- canonical QA/release workflow.

Do **NOT** require documentation churn for implementation-only refactors when the documented contract remains unchanged.

### No transient state in long-lived docs
Do not hard-code ephemeral execution state into `AGENTS.md` or `CLAUDE.md`:
- commit SHAs;
- branch names;
- PR numbers;
- CI run IDs;
- current test counts;
- benchmark timings;
- preview URLs;
- temporary deployment state.

Document contracts, operational commands, and stable business mappings (with references to canonical constants such as `INVOICE_SENT_STATUS_CODES` in `src/lib/commercial-funnel/constants.ts`) — not ephemeral task execution results.

### Invariants over executable algorithms (No second engine in Markdown)
Documentation must describe:
- invariants;
- ownership;
- provenance;
- subsystem responsibilities;
- safety rules.

Do not duplicate complete executable algorithms, formulas, loops, or long decision trees in Markdown when the canonical implementation already exists. Prefer:
> `"invariant + canonical function/module"` (e.g. `computeManagerScorecard` attributes awaiting payment independently of active-stage status)

over:
> `"a prose copy of the implementation"`.

Executable code and tests remain authoritative for low-level calculation details.

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

### Analytical data-trust contract
The system distinguishes five conceptual analytical lifecycle states across Samples and Commercial Funnel:
1. `loading`: Data fetch in progress.
2. `ready`: Data loaded successfully and verified complete.
3. `partial`: Business records loaded but metadata or dependent data is degraded/incomplete (`metadataPartial === true`).
4. `refresh_failed`: Background revalidation failed after a prior successful load (`isStale === true`, cached snapshot preserved).
5. `failed` (`unavailable`): Initial load failed with zero items available.

**Data-trust hard invariants**:
- **A. Legitimate complete empty dataset**: When the API successfully returns an empty dataset (`ready` with 0 records), business KPI counts truthfully evaluate to `0`.
- **B. Initial data-load failure**: An initial load failure MUST NOT be represented as valid business KPI `0`. Values render as `—` (dash), tabs display an error state with Retry, misleading empty tables are suppressed, and Excel export is disabled (`exportDisabled = true`).
- **C. Failed refresh with cached snapshot**: When background refresh fails after a prior successful load, the previous snapshot and its `loadedAt` timestamp are preserved. The UI visibly discloses that refresh failed and displays the timestamp of the last successful snapshot with a Retry option. Stale data must not masquerade as fresh, and Excel exports stamp `STALE_SNAPSHOT_DISCLOSURE`.
- **D. Partial / degraded data**: When CRM metadata or activity data is degraded, dataset is flagged (`metadataPartial`), disclosed via UI warning indicator, and stamped in Excel (`METADATA_PARTIAL_DISCLOSURE`). Only defensible metrics may be shown.
- **E. Export guardrails**: UI warnings and Excel disclosures must agree 100%. Export is disabled during initial load failure or empty datasets.
- Canonical state owners: `src/lib/commercial-funnel/use-commercial-funnel-data.ts`, `src/app/commercial-funnel/page.tsx`, `src/app/samples/page.tsx`, `src/lib/commercial-funnel/export-excel.ts`.

### Event vs Snapshot / WIP model
- **Dated Event metrics**: Metrics tied to dated occurrences within the selected analytical period (e.g. new companies created, samples shipped, deals created, payments received, shipments).
- **Snapshot / WIP metrics**: Current operational portfolio state (e.g. companies in sample stages, active deals, awaiting payment, bottlenecks). Current WIP is **never truncated** by the selected period date range.
- Period count KPIs count unique Company IDs unless explicitly documented otherwise.
- **Historical stage transitions are NOT implemented**: The system does not track historical stage movement logs. Never invent stage transition counts (A → B), stage velocity, historical conversion rates, or cohort retention.

### Aligned period contract (Moscow business calendar)
- Samples and Commercial Funnel expose the exact same five period options:
  1. `7 дней` (`7days`: today + 6 previous calendar days)
  2. `14 дней` (`14days`: today + 13 previous calendar days)
  3. `30 дней` (`30days`, default: today + 29 previous calendar days)
  4. `90 дней` (`90days`: today + 89 previous calendar days)
  5. `Указать вручную` (`custom`: inclusive calendar day boundaries)
- **Timezone**: `Europe/Moscow` (`COMMERCIAL_TIMEZONE`, UTC+3). Periods evaluate inclusive business calendar days ending at 23:59:59.999 MSK, not rolling 24-hour windows.
- **Custom range**: Incomplete manual boundaries evaluate strictly to null/empty without silent fallback to 30 days. Inverted dates (`from > to`) safely swap.
- **Legacy normalization**: Obsolete presets (`all`, `quarter`, `year`) safely normalize to `30days`.
- **Equal-duration comparison**: Previous period comparisons span the immediately preceding equal-duration calendar window (`currentEnd - currentStart`).
- Canonical modules: `src/lib/commercial-funnel/date-utils.ts` (`computePeriodBoundaries`), `src/components/dashboard/samples/samples-filters.tsx` (`samplesPeriodWindow`, `matchesPeriod`).

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
- A deal is awaiting payment if and only if: `paymentStatus ∈ INVOICE_SENT_STATUS_CODES` (defined in `src/lib/commercial-funnel/constants.ts`).
- Current configured business values: `105` ("Выставлен счет") and `107` ("Ожидает подтверждения").
- **`103` ("Не оплачен") is NOT awaiting payment**.
- **Critical invariant**: Awaiting payment does **NOT** depend on `isDealActiveStage(...)`. A deal in a terminal stage (e.g. `WON` or `C1:LOSE`) with payment status `105`/`107` truthfully remains awaiting payment. Never gate awaiting-payment classification behind active-stage filtering.

### Sample provenance
- Never overwrite factual Company fields with Deal-derived analytical values.
- Deal-derived current sample state preserves exact Deal provenance: `sampleResponsibleDealId` identifies the specific sample Deal, and `sampleResponsibleId` identifies its responsible person.
- Sample bottlenecks and action items must reference the sample Deal, **never** an unrelated representative `primaryDeal`.
- When sample state is Company fallback (`sampleStatusSource === "COMPANY"`), do not borrow an unrelated Deal to populate deal columns.

### Samples canonical engine & Smart Process 1032 (authoritative)
- ONE canonical sample engine lives in `src/lib/samples/` (`buildCanonicalSampleDomain`); Samples UI/KPI/Excel, Commercial Funnel, Managers, and the Commercial Funnel Excel all consume it. No surface may re-parse raw Company/Deal fields for current sample state.
- Smart Process 1032 (`entityTypeId=1032`, `categoryId=15`, «Тестирование образца») is **authoritative for new/current sample cycles**. Legacy Deal fields (`UF_CRM_1779386185`, `UF_CRM_1774879952785`, …) and legacy Company fields (`UF_CRM_1753187313314`, `UF_CRM_1764156557536`, `UF_CRM_1783429999269`, …) remain historical/fallback evidence: never cleared, never overwritten, never used to fabricate physical cycles.
- Current-state precedence: `SMART_PROCESS → DEAL_LEGACY → COMPANY_LEGACY → NONE` (current state only — historical evidence is never deleted or overridden).
- Smart Process stage IDs (`DT1032_15:*`) are the stable key; stage semantics and ACTIVE/TERMINAL sets are canonical in `src/lib/samples/smart-process-contract.ts`. Unknown stage IDs and unknown result enum IDs stay unclassified (`Не классифицировано`) — never mapped by wording, and raw numeric enum IDs must never leak to user-facing UI or Excel.
- **Smart Process custom UF field IDs are live-discovered only** (`scripts/discover-smart-process-contract.mjs`, `crm.item.fields` with `useOriginalUfNames="Y"`); the runtime is fail-closed (`assertSmartProcessContractReady`) until verified IDs are committed. Never guess a UF ID.
- The **only** authoritative dated `samples_sent` event from Smart Process is the manual «Дата отправки» field. `createdTime`/`updatedTime`/`MOVED_TIME`/stage transitions are never substitutes. A sent-or-later stage without a manual date produces current state but NO dated event.
- Multiple active Smart Process items for one company → `AMBIGUOUS_MULTIPLE_ACTIVE`: no arbitrary current cycle, no fabricated current manager.
- Manager attribution: Smart Process events/states attribute to the item's own `ASSIGNED_BY_ID` — never to the Company owner. Period `samples_sent` manager flow attributes each dated event to its own source-entity responsible.
- Deal field `UF_CRM_1779394379` («Тестирование образцов») is **MARKER_ONLY**: navigation/preview/display only. It must never contribute to sample status, result, `samples_sent`, KPIs, current contour membership, or manager attribution.

### Smart Process display view & bulk read seam
- ONE canonical Smart Process item display view lives in `src/lib/samples/smart-process-view.ts` (`buildSmartProcessItemViews` / `indexSmartProcessItemViews`): a pure projector over already-adapted `SampleEvidenceUnit` evidence. No surface may re-parse raw Smart Process UF fields for display purposes; `smart-process-view.ts` never alters current-state reconciliation.
- Attribution invariants: `byDealId` membership is exact `parentId2` (`linkedDealId`) only — never Company-shared matching; relation-conflict items may stay visible under their exact linked Deal (the Deal relation is factual) with their quality issue, but are excluded from Company aggregation; orphans are unattributed. Multiple active items remain multiple everywhere (no fabricated winner).
- ONE bulk server read seam: `src/lib/samples/smart-process-service.ts` + `POST /api/bitrix/smart-process-items` (auth-gated, fail-closed contract gate, no-store). The Deal → Company relation map reads ONLY Deal IDs referenced by `parentId2`, in bounded bulk chunks — never one request per item. Client consumption goes through the principal-scoped in-memory session cache (`smart-process-client-cache.ts`); Smart Process datasets are never persisted to localStorage.
- Production Smart Process reads are gated for ID-bearing PARTITIONED `crm.item.list` reads (`fetchSmartProcessSampleItems` → `SMART_PROCESS_PARTITIONED_READ_ENABLED` → `fetchAndMergeSmartProcessPartitions` in `src/lib/samples/bitrix-fetch.ts`): the gate is live-measurement owned and stays OFF. Production runs the full production select in ONE unchanged fail-closed pagination. If ever enabled: every partition select includes the documented `id`, partitions merge strictly by exact string item ID, and reconciliation is fail-closed (`SMART_PROCESS_PARTITION_SET_MISMATCH`) after exactly one whole-read retry on ID-set divergence. No positional merge, no per-item `crm.item.get`, no `select:["*"]` production path.
- **Production transport is `useOriginalUfNames="N"`** (live-verified verdict `N_MODE_FIELD_CONTRACT_OK`): the earlier live measurement (`USE_ORIGINAL_UF_NAMES_Y_BREAKS_ID`) proved Y-mode drops `id` from every select on this portal, so the canonical production read uses N-mode with the verified static N-mode field mapping (`SMART_PROCESS_N_MODE_FIELD_NAMES` in `src/lib/samples/smart-process-contract.ts`) and ONE transport normalizer (`normalizeSmartProcessNModeRow` in `src/lib/samples/bitrix-fetch.ts`) that rewrites N-mode custom keys back to the canonical original UF keys at the seam — downstream code never learns N-mode aliases. The mapping was correlated from live `crm.item.fields` metadata via the documented `upperName` attribute (exactly one candidate per role; never positional, never title-similarity, never hand-converted) and re-verified by the `nModeFieldContract` diagnostic section / `scripts/verify-n-mode-field-contract.mjs` (read-only: `crm.item.fields` + `crm.item.list` only). Y-mode remains ONLY in diagnostics and in the metadata label-map read. Fail-closed: a missing or ambiguous N-mode name (`N_MODE_FIELD_MAPPING_AMBIGUOUS`) never reaches the transport.
- Display labels vs semantics: business semantics stay keyed on committed stable stage IDs (`SMART_PROCESS_STAGE_SEMANTICS`); user-facing stage labels prefer the live `crm.status.list` NAME for a known committed stage ID (`fetchSmartProcessStageDirectory`, `ENTITY_ID = DYNAMIC_1032_STAGE_15`), with committed static labels only as fallback. Unknown stage IDs stay user-facing «Не классифицировано»; raw `DT1032_*` IDs remain internal provenance. Stage semantics are never derived from Russian label wording.
- Deals-table virtual Smart Process columns (`SP_STAGE`, `SP_SENT_DATE`, `SP_RESULT`, `SP_SAMPLES`) and activity columns are client-only enrichment: the canonical classification helper `splitDealTableColumns` (`src/lib/deal-table-columns.ts`) guarantees no virtual/enrichment column ever enters an upstream `crm.deal.list`/`crm.company.list` `select`. Sorting/filtering for these columns is client-side only.
- **Synthetic Company enrichment columns are client-only by structural family rule**: every `COMPANY_*` Deal-table column (Company responsible, industry, `COMPANY_UF_CRM_*` mirrors, `COMPANY_TITLE`, …) is resolved client-side from `companiesData` and must never enter an upstream `crm.deal.list select`; the single whitelisted exception is `COMPANY_ID` (`UPSTREAM_COMPANY_DEAL_COLUMNS`), a real Bitrix Deal field. Eligibility is decided by `isClientOnlyDealColumn` — never by ad-hoc prefix assumptions at call sites; `COMPANY_TITLE` is never force-pushed upstream.
- `POST /api/bitrix/smart-process-items` enforces a strict body contract: `{}` (full scope) or `{ "companyId": "<positive integer string>" }` (company scope). Unknown keys, non-string, empty, zero, negative, decimal or alphanumeric `companyId` values are HTTP 400 **before** any Bitrix work — an invalid scope never degrades into an unscoped/full population query. Validation mirrors `/api/bitrix/samples`.

### Samples ambiguity semantics
- The ambiguous Samples population (`ambiguous` / «С неоднозначными данными») in `src/lib/samples/` (`buildCanonicalSampleDomain`) covers all canonical ambiguity causes:
  - conflicting legacy evidence across Deal and Company fields;
  - multiple active Smart Process items for a single company (`AMBIGUOUS_MULTIPLE_ACTIVE`);
  - mixed result evidence across sample cycles (`MIXED`).
- User-facing descriptions and hints must truthfully reflect this complete population and must not be reduced solely to "conflicting sources".

### Current Company classification (Samples)
- The visible Samples Industry filter and current sample projection use the current approved Company-card field `UF_CRM_1784195884554` («Отрасль (согл.список)»); direction uses `UF_CRM_1784200275341` («Направление (согл.список)»).
- The legacy standard `INDUSTRY` and the retired `UF_CRM_6915D8C0C6814` («Отрасль (не использовать)») must never override the current approved fields. Absent current field = truthfully absent (no invented fallback).

### Segment semantics
- All Commercial Funnel views and exports share one global analytical slice.
- **Strict Company dimension grain**: Segment breakdowns (Industry, Direction, Product, Region) evaluate strictly from authoritative Company fields (`getCompanyDimensionValues`). Deal fields never substitute or override Company dimensions.
- **Non-pruning dimensional filtering**: Filters for Product, Industry, Direction, and Region evaluate strictly on Company fields. Once a Company matches, its child Deals are **not pruned** by deal-level dimensions, preventing hidden undercounts in financial and operational KPIs.
- **Same-dimension filter constraint**: When a global filter is active on a dimension, the segment breakdown for that same dimension must contain only the selected filter value (e.g. Product = Gel must not emit Sol).
- **Cross-dimension analysis**: Filtering on one dimension (e.g. Product = Gel) does not collapse other dimensions (Industries and Directions display all relevant values within the Gel slice).
- Multi-valued dimensions (Product, Direction) allow a company to appear in multiple rows; table totals represent the union of unique Company IDs, not row sums.
- «Не указано» represents genuinely missing CRM dimension data, not records filtered out by active filters.
- Never mutate factual CRM fields to implement analytical segmentation.

### Commercial continuation and Deal terminal semantics
- **Commercial continuation stages**: Evaluated canonically via `isCommercialContinuationStage(stageId, categoryId)` in `src/lib/stage-utils.ts`. For Category 0 («Общая воронка»), recognized continuation stages are `8`, `PREPARATION`, `5`, `6`, `9`, `10`, `11`, `7`, and `WON`. Testing stage `UC_SP94UZ`, `NEW`, `EXECUTING`, and terminal apology/failure stages are excluded. Non-zero categories return `false`.
- **Full terminal apology stages**: Deal apology/lost stages across Category 0 (`1`, `2`, `4`), Category 1 (`C1:3..6`), Category 3 (`C3:2..3`), Category 5 (`C5:APOLOGY`), and Category 7 (`C7:LOSE`) are canonically terminal (`isTerminalLostStage`/`isTerminalStage`), never active, and never create stalled deal bottlenecks.
- **Sample WIP Deal count**: In `computeWipMetrics`, `dealCount` strictly counts the Deal attached to the current canonical sample cycle (`sampleRelatedDealId` for Smart Process, `sampleResponsibleDealId` for Deal legacy, and `0` for Company legacy fallback). Sibling deals are never summed into sample WIP deal count.

### Financial quality and currency isolation
- Aggregate financial amount data-quality states:
  - `COMPLETE`: All relevant amounts are valid.
  - `PARTIAL`: Some amounts are valid, while at least one is unknown or invalid.
  - `UNKNOWN`: No valid amounts observed and all values missing.
  - `INVALID_ONLY`: No valid amounts observed and invalid records exist.
- Never silently convert missing or invalid financial values to `0`.
- **Multi-currency isolation**: Never cross-sum different currencies into a single scalar sum. Amounts are tracked and displayed per currency with independent quality states.

### Unknown Deal stage fail-closed semantics
- Deal stage classification evaluates across three conceptual states via `getDealStageSemantics` in `src/lib/stage-utils.ts`: `ACTIVE`, `TERMINAL`, and `UNKNOWN`.
- **Fail-closed active evaluation**: `isDealActiveStage(stageId)` evaluates strictly to `false` for unknown, unmapped, empty, or undefined stage IDs. An unrecognized stage must **NEVER** be assumed active merely because it is not in a terminal list.
- **Active metrics authority**: Only positively recognized active stages (`isKnownActiveStage(stageId)`) contribute to active-stage metrics («Активные сделки», stalled deals, missing next step). Category-prefixed active stages (`C1:1`, `C1:2`, `C3:1`, `C3:4`, `C5:1`, `C5:2`, `C7:1`) are canonical in `KNOWN_ACTIVE_STAGES`.
- Known terminal won (`isTerminalWonStage`) and terminal lost/apology stages (`isTerminalLostStage`) remain terminal and never active.

### CRM metadata completeness and enum sanitization
- Unresolved CRM enum/status values are never guessed or silently mapped to arbitrary business categories.
- Missing or degraded CRM dictionary metadata that materially affects classification sets `metadataPartial = true`, triggering a visible UI indicator and Excel disclosure (`METADATA_PARTIAL_DISCLOSURE`).
- **Canonical user-facing fallback**: When an enum/status label is unresolvable, normal UI and Excel cells display strictly the neutral label: **`Не классифицировано`** (`UNCLASSIFIED_LABEL` from `src/lib/crm-constants.ts` / `src/lib/commercial-funnel/constants.ts`).
- **Prohibition on raw ID leakage**: Raw numeric IDs, technical tokens (e.g. `2695`), and composite strings like `Не классифицировано (2695)` must **NEVER** be displayed to the user or exported to normal Excel columns. Raw IDs are preserved exclusively in internal provenance/diagnostic objects (`rawResult`, `rawStageId`).

### One analysis clock (`analysisNow`)
- The Commercial Funnel UI and Excel export share a single frozen analytical timestamp (`analysisNow`) initialized strictly from the active successful snapshot (`loadedAt`).
- **Failed refresh clock preservation**: When a background refresh fails, `loadedAt` and `analysisNow` are preserved without alteration. The clock does **NOT** tick, advance, or drift across Moscow midnight or failed refreshes.
- UI-initiated Excel export never generates an independent `new Date()`. This guarantees strict reconciliation between UI tables and exported workbooks across day, month, and quarter boundaries.
- Canonical owners: `src/app/commercial-funnel/page.tsx`, `src/lib/commercial-funnel/use-commercial-funnel-data.ts`.

### Shared Deal Type registry (DEAL_TYPE)
- Deal `TYPE_ID` user-facing titles are resolved from the Bitrix Deal Type status registry: `crm.status.list` with `ENTITY_ID = DEAL_TYPE`.
- Raw technical codes (e.g. `SALE`) are internal status identifiers, never user-facing titles.
- **Architecture**: Bitrix `DEAL_TYPE` registry (`buildDealTypeRegistry`) → shared resolver (`resolveDealType` in `src/lib/deal-type.ts`) → UI drawer and Excel exports.
- **Invariants**:
  - Never hardcode a static `SALE → business name` mapping as the single source of truth.
  - Deal Type metadata is loaded centrally in fields/status envelopes, not fetched per individual deal.
  - Fallback order: current `DEAL_TYPE` registry → valid `TYPE_ID` field `listValues` → `Не классифицировано` (or `–` if absent). Raw `TYPE_ID` must never leak to UI or Excel.

### Deal Preview timeline semantics
- The Deal Preview model (`buildDealPreviewModel` in `src/lib/deal-preview.ts`) enforces strict timeline attribute mappings:
  - `Дата создания сделки` → Deal `DATE_CREATE`.
  - `Последнее касание с клиентом` → factual CRM/customer activity timestamp according to canonical activity model (`lastTouchTimestamp` / `activity.CREATED` / `deal.LAST_ACTIVITY_TIME`, null if absent).
  - `Последнее изменение сделки` → Deal `DATE_MODIFY` (`deal.DATE_MODIFY` / `deal.updatedTime`).
  - `Последняя активность` → factual activity subject/description (`activity.SUBJECT`).
- **Critical invariant**: `DATE_MODIFY` is **NEVER** a fallback for customer touch (`Последнее касание с клиентом`). Field edits (payment date, stage, amounts, internal notes) update `DATE_MODIFY` without representing interaction with the customer.
- UI drawer and Deal Excel export consume the exact same shared Deal Preview model.

### Company Preview canonical drawer contract
- `src/components/dashboard/company-preview.tsx` is the **ONE canonical company drawer** for the whole application. Every UI action whose semantic meaning is "open this company" (Companies browser, Deals table / Deal Preview, Samples, Commercial Funnel drill-downs) renders this same component. Callers may pass only navigation/focus callbacks (`onClose`, `onOpenDealPreview`, `onRestoreFocus`) — never field sets or business content; caller-specific content overrides (`sampleFieldsFor`, `previewSampleFields`, legacy `defaultSampleFields`/`defaultCompanyFields` builders) are removed.
- The Company Preview model (`buildCompanyPreviewModel` in `src/lib/company-preview.ts`) governs all company inspection surfaces (drawer and Company Excel export):
  - **ONE approved current-card whitelist** (`COMPANY_PREVIEW_CURRENT_FIELDS`): 21 business fields mirroring the live Bitrix Company card layout and order (Ответственный → Комментарий), plus the `Тестирование образцов` marker field and the system `DATE_CREATE`/`DATE_MODIFY` pair; no page-specific field lists; no generic `UF_CRM_*` iteration.
  - **Current fields authoritative**: Current approved fields (`UF_CRM_1784195884554` Industry, `UF_CRM_1784200275341` Direction, `UF_CRM_69259C45D3399` Region) are authoritative; legacy `Сфера деятельности` and retired fields must never substitute.
  - **Empty-field invariant**: every whitelisted field renders even when empty — an unresolvable value becomes the truthful `—` placeholder (`EMPTY_FIELD_PLACEHOLDER`); fields are never dropped, values never fabricated. UI and Excel inherit this from the same resolved model.
  - Product type is analytical, separate from Company card preview.
  - Legacy sample fields remain in canonical analytics, never rendering as individual current-card rows.
- **Drawer sections (fixed order)**: header (title, `Просмотр компании · ID <id>`, sticky) → `ИНФОРМАЦИЯ О КОМПАНИИ` (21 business fields) → `ИНФОРМАЦИЯ ОБ ОБРАЗЦАХ` (the Bitrix marker field only) → `ТЕСТИРОВАНИЕ ОБРАЗЦОВ` (canonical Smart Process analytics + counts + every physical cycle) → `СВЯЗАННЫЕ СДЕЛКИ` → `СИСТЕМНАЯ ИНФОРМАЦИЯ` → footer (Excel export, Bitrix navigation).
- **Company Preview Smart Process data path**: exactly ONE authoritative load — the company-scoped `POST /api/bitrix/samples { companyId }` response, whose `SampleSummary` already embeds the canonical Lite item views, active/terminal counts and related deals. CompanyPreview never mounts the bulk Smart Process loader for data it already received; the shared bulk cache (`smart-process-client-cache.ts`) remains for Deals table / Deal Preview / other bulk consumers.
- **Smart Process cache freshness policy**: ONE named policy lives in `smart-process-client-cache.ts` (`SMART_PROCESS_CACHE_FRESHNESS_MS`, `isSmartProcessCacheFresh`). Cold cache → fetch; fresh complete cache → reuse without any request (mounting another consumer must not duplicate full pagination); expired cache → render cached snapshot + background refresh; explicit retry → always a real request; failed refresh → prior snapshot preserved with stale disclosure. The cache is in-memory only, never persisted to localStorage.
- **Company Excel = Company Preview parity** (`createCompanyExcelWorkbook` in `src/lib/export-utils.ts`): sections `ИНФОРМАЦИЯ О КОМПАНИИ` (same resolved model fields incl. empty `—` rows), `ИНФОРМАЦИЯ ОБ ОБРАЗЦАХ` (marker), `ТЕСТИРОВАНИЕ ОБРАЗЦОВ` (summary rows «Активных процессов»/«Завершённых процессов» + physical-cycle table with exactly 12 columns: ID процесса, Название, Стадия, Связанная сделка, Дата отправки, Марка ГЕЛЬ, Количество ГЕЛЬ кг, Марка ЗОЛЬ, Количество ЗОЛЬ л, Результат испытаний, Ответственный, Качество данных / предупреждение), `СВЯЗАННЫЕ СДЕЛКИ`, `СИСТЕМНАЯ ИНФОРМАЦИЯ`. One physical Smart Process item = one Excel row (never collapsed); export code never parses raw Bitrix fields; relation is title + retained ID or `Без связанной сделки`; responsible uses the human-name resolver (never a raw user ID); unknown quality-issue codes render the neutral unclassified label. Export depends only on the drawer's own loads, never on table-selected columns.

### Company Preview lookup truthfulness (field metadata vs user directory)

- **One-shot principal-scoped bootstrap**: The drawer bootstraps each shared canonical lookup (`fetchFields` / `fetchUserNames`) at most once automatically per mounted drawer / auth principal. A failed attempt stops automatic retry — there are no timers and no automatic request storms against `/api/bitrix/fields` or `/api/bitrix/users`. Only an explicit user retry performs another real request. An in-flight shared request coalesces through the existing store logic; a valid shared lookup means no bootstrap at all (switching Company ID never re-bootstraps); a principal change re-arms exactly one attempt for the new principal.
- **Independent source states**: Field dictionaries and the user directory are independent provenance sources. There is NO combined rule in which one source's success makes the other "ready". Each source resolves to its own truthful state (`loading` / `ready` / `partial` / `failed`) from real store provenance (`fields`/`fieldsLoading`/`fieldsError`/`fieldsCoverage`, `userNames`/`userNamesLoading`/`usersCoverage`, `isDemoMode`). Field enums/statuses resolve strictly by the field-metadata state; responsible persons resolve strictly by the user-directory state (coverage-aware); raw IDs never leak in any state. UI discloses each non-ready source individually.
- **Demo lookups are never production metadata**: when `isDemoMode`, DEMO dictionaries are not authoritative metadata for a real Bitrix Company card — no dictionary is handed to `buildCompanyPreviewModel` and both sources resolve to `failed`. When transitioning out of demo mode, a failed production fetch clears stale demo field arrays from the store (`length > 0` is never production metadata provenance).
- **Excel lookup gating + disclosure**: while any required lookup is still loading, Company Excel export is disabled (the interim `LOOKUP_LOADING_PLACEHOLDER` is never serialized). After loading finishes, `partial`/`failed` lookups keep the export available but stamp the shared disclosure warnings (`buildCompanyLookupWarnings` in `src/lib/company-preview.ts`) as visible workbook rows near the report header (`lookupWarnings` in `ExportCompanyOptions`) — UI warnings and Excel disclosures agree 100%; no raw errors, IDs, webhook information, or credentials ride this channel.

### Samples responsible scope (company grain)

- The Samples `responsibleId` scope is a **COMPANY responsible filter** (Company `ASSIGNED_BY_ID` — identical to the Companies browser). It is NEVER applied as a Deal `ASSIGNED_BY_ID` filter (Deal responsible and Company responsible may differ) and NEVER as a Smart Process `assignedById` filter. Canonical seam: `fetchSampleCompanies` (`src/lib/samples/bitrix-fetch.ts`); `fetchSampleDeals` cannot express the responsible filter by construction.
- **ONE allowed-company scope**: responsible-scoped requests build `allowedCompanyIds` from the authoritative Company fetch and apply it at COMPANY grain via `AggregateOptions.allowedCompanyIds` in `src/lib/samples/aggregate.ts` — normal complete Deal and Smart Process populations are fetched (correctness over optimization; no N+1, no unverified `@parentId2`/`@COMPANY_ID` filters), and evidence enters only through canonical Company attribution/relation provenance (`companyId`, `directCompanyId`, `dealCompanyId`). SP-only resurrection (step 5b) and Company reconciliation (step 5a) skip companies outside the set; out-of-scope conflict/orphan items contribute nothing to scoped quality counts; SP assignee never decides scope membership.
- **Combined `{ companyId, responsibleId }` truthfulness**: when the requested Company fails the responsible filter, the API returns a truthful successful empty scope (`samples: []`) and performs NO Deal or Smart Process population load — linked Deals, direct SP `companyId`, or fallback-by-Deal evidence can never resurrect it. When the Company matches, the accepted company-scoped Smart Process mechanism (direct ∪ fallback-by-Deal candidates, complete relation map, conflict detection) remains unchanged.
- Omitting `allowedCompanyIds` keeps full unscoped Samples semantics unchanged.

### Samples responsible display grain (explicit Company responsible)

- `SampleSummary` carries TWO distinct responsibility facts (canonical projector `projectCanonicalCompanyToSummary` in `src/lib/samples/project.ts`; no second parser, no raw Company re-read):
  - `responsibleId` / `responsibleName` — canonical **current sample/process responsibility** (SMART_PROCESS item's own `ASSIGNED_BY_ID` → legacy/current fallback → Company responsible). Meaning unchanged; Commercial Funnel and other consumers may rely on it.
  - `companyResponsibleId` / `companyResponsibleName` — explicit **Company owner grain** (Company `ASSIGNED_BY_ID`, identical to the Companies browser).
- **Grain contract**: the Samples UI responsible filter, the registry responsible column, and the Samples Excel responsible column operate at COMPANY grain and consume `companyResponsibleId` (filter/predicate helpers `buildCompanyResponsibleOptions` / `matchesCompanyResponsibleFilter` in `src/components/dashboard/samples/samples-filters.tsx`; Excel via `buildSamplesWorkbook` in `src/lib/export-utils.ts`). Filtering by a Company owner includes the company even when its current SP cycle belongs to a different manager; filtering by an SP assignee never includes the company merely because of that process assignment.
- Physical Smart Process cycles keep their own process responsible in `SmartProcessItemView` / `SmartProcessItemCard` / Sample Preview cycle details — never erased or replaced by the company owner.

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
