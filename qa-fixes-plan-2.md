# QA and Code Review Fixes Plan 2

## Overview
This plan addresses three performance and logic bugs identified in the RusSilica BI Terminal:
1. Sequential batching in Activities API.
2. Massive overhead in `useUserDetails` hook.
3. Excessive store subscriptions in `DataTable`.

## Tasks

### 1. Fix Sequential Batching in Activities API
- **File:** `src/app/api/bitrix/activities/route.ts`
- **Action:** Wrap the batch requests in the `limit()` function and use `Promise.all` to execute them concurrently instead of awaiting inside the `for` loop.

### 2. Optimize `useUserDetails` Hook
- **File:** `src/hooks/use-user-details.ts`
- **Action:** Remove the expensive `/api/bitrix/users` fetch. Read the user name directly from the `DashboardStore` cache (`useDashboardStore.getState().userNames[userId]`).

### 3. Hoist `openDrawer` in `DataTable`
- **File:** `src/components/dashboard/data-table.tsx`
- **Action:** Extract `openDrawer` at the `DataTable` level and pass it down as a prop to `CellValue` to avoid creating thousands of Zustand store subscriptions.
