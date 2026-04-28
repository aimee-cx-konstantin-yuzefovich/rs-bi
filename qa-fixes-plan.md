# QA Fixes Plan

This document outlines the plan to address the issues identified in the QA report.

## H1. `fetchDeals` error fallback
- **Location:** `src/store/dashboard-store.ts`, `src/app/page.tsx`
- **Action:** 
  - In `dashboard-store.ts`, update the `catch` block in `fetchDeals` to always set a `dealsError` state instead of silently falling back to demo mode.
  - In `page.tsx`, render a retry banner when `dealsError` is set, with a button to call `syncData()`.

## H2. `setSearchQuery` does not reset pagination
- **Location:** `src/store/dashboard-store.ts`
- **Action:** Update `setSearchQuery` to explicitly reset `currentPage` to 1 before applying client filters.

## H3. `dealsTotal` shown in UI is the unfiltered count
- **Location:** `src/store/dashboard-store.ts`, `src/components/dashboard/data-table.tsx`
- **Action:** 
  - Ensure the store captures the `truncated` flag from the API response.
  - In `data-table.tsx`, display a small warning (e.g., "Показаны первые 1000 сделок") in the filter bar when the results are truncated.

## H4. `fetchActivitiesData` / `fetchCompaniesData` cache TTL
- **Location:** `src/store/dashboard-store.ts`
- **Action:** Add a timestamp to the cached entries for activities and companies. Invalidate and re-fetch entries if they are older than 5 minutes.

## H5. `data-table.tsx` unused dependencies
- **Location:** `src/components/dashboard/data-table.tsx`
- **Action:** Remove unused imports (`ScrollArea`, `ScrollBar`, `useCallback`, etc.) and unused destructured variables from hooks to prevent unnecessary re-renders.

## H6. Bitrix `OPPORTUNITY` parsing
- **Status:** False alarm. No action required.

## H7. Race in `LoadingScreen` safety timeout
- **Location:** `src/components/dashboard/loading-screen.tsx`
- **Action:** Check the `fadingOut` state before the safety timer triggers to prevent redundant state updates on an unmounted component.
