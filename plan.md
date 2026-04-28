# Security and Performance Remediation Plan

Based on the QA report, here is the plan to address the 10 identified issues across the codebase. The issues are prioritized by criticality.

## Phase 1: Critical Security Fixes (Authentication & Authorization)

1. **Fix `src/lib/auth.ts` (Issue 1)**
   - Remove sensitive header logging (`console.log("[AUTH DEBUG] Request headers:", headers)`). Replace with safe metadata logging or remove in production.
   - Enforce strict origin validation for proxy authentication. Check `x-forwarded-for` against a trusted IP list and validate `x-proxy-secret`.

2. **Fix `src/lib/sso-hmac.ts` & Prisma Schema (Issue 2)**
   - Update `prisma/schema.prisma` to add a `UsedNonce` model for replay protection.
   - Run `npx prisma db push` or generate migrations.
   - Update `verifyHmacToken` in `src/lib/sso-hmac.ts` to require and validate a `nonce` against the database to prevent replay attacks.

3. **Fix `src/app/api/bitrix/companies/route.ts` (Issue 3)**
   - Enforce an allowlist for the `select` array to prevent arbitrary CRM field exposure.

4. **Fix `src/middleware.ts` (Issue 10)**
   - Strengthen IP trust by ensuring `x-forwarded-for` is only trusted if the request comes from a known internal proxy, or fallback to `request.ip`.

## Phase 2: Data Integrity & Logic Fixes

5. **Fix `src/store/dashboard-store.ts` (Issue 4)**
   - Remove the silent fallback to demo data on error. Set an explicit error state instead.
   - Fix the pagination bug in `setSearchQuery` by resetting `currentPage` to 1 and clamping it to `totalPages`.

6. **Fix `src/app/api/bitrix/deals/route.ts` (Issue 5)**
   - Add a `truncated` boolean flag to the response if `bitrixTotal > allDeals.length` to signal to the UI that the dataset is incomplete.

7. **Fix `src/app/api/admin/audit-logs/route.ts` (Issue 6)**
   - Sanitize and validate pagination inputs (`limit` and `offset`) to prevent negative values or `NaN`.

8. **Fix `src/lib/auth-guard.ts` (Issue 7)**
   - Ensure the user's role is stored consistently in the `role` column of the `AuditLog` table, rather than just in the `details` JSON.

## Phase 3: Performance Optimizations

9. **Fix `src/app/api/bitrix/activities/route.ts` (Issue 8)**
   - Introduce a concurrency limiter (e.g., `p-limit`) to prevent excessive parallel requests to the Bitrix API when fetching activities.

10. **Fix `src/components/dashboard/data-table.tsx` (Issue 9)**
    - Remove the heavy export recomputation from `useEffect`. Compute the export data on-demand when the export action is triggered.
