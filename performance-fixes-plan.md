# Performance Remediation Plan

This document outlines the steps to fix four critical performance bottlenecks identified in the RusSilica BI Terminal.

## 1. Fix Massive N+1 API Query Problem in Activities
**File:** `src/app/api/bitrix/activities/route.ts`
- **Issue:** The current implementation fires a separate API request for every single deal, leading to rate limit errors (503/QUOTA_EXCEEDED) when loading many deals.
- **Fix:** Update the API route to fetch activities for up to 50 deals in a single request using the `@OWNER_ID` filter. Group the returned activities back to their respective deals.

## 2. Fix UI Freezing due to Zustand Subscription in Table Cells
**File:** `src/components/dashboard/data-table.tsx`
- **Issue:** `CellValue` component subscribes to the entire Zustand store without a selector, causing all cells to re-render on any state change (e.g., typing in search).
- **Fix:** Extract `companiesDataLoading` and `activitiesDataLoading` using selectors at the top of the `DataTable` component. Pass these as props down to `CellValue` and remove the direct store subscription from `CellValue`.

## 3. Fix CPU Hog in Global Search
**File:** `src/hooks/use-table-state.ts`
- **Issue:** Global search iterates over every key in the deal object, causing massive CPU usage (e.g., 100,000 function calls per keystroke for 1000 deals).
- **Fix:** Move the `columns` memoization before `searchedDeals`. Update `searchedDeals` to only iterate over the currently visible `columns` instead of `Object.entries(deal)`.

## 4. Fix Sequential Pagination Slowness
**File:** `src/app/api/bitrix/deals/route.ts`
- **Issue:** Fetching pages sequentially takes too long and risks hitting serverless timeouts.
- **Fix:** Calculate required offsets based on the `total` count from the first request. Use `p-limit` and `Promise.allSettled` to fetch the remaining pages in parallel (up to 5 concurrent requests).
