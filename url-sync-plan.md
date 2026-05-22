# URL Synchronization Fix Plan

## Problem
Currently, the application uses `zustand` with `persist` middleware (localStorage) to save user preferences (date filters, selected columns, etc.). When a user opens a shared URL containing specific state parameters (e.g., `?date={"preset":"30days"}`), the application reads the URL for the UI components, but the initial data fetch (`fetchDeals`) uses the state from `localStorage`. This results in the wrong data being loaded, ignoring the shared URL parameters.

## Solution
We need to synchronize the URL state into the global `zustand` store *before* the initial data fetch occurs, but *only* if the URL actually contains these parameters (to avoid overwriting saved preferences when a user just opens the base URL).

## Steps

1. **Update `dashboard-store.ts`:**
   - Add a new action `syncUrlState(urlParams: Partial<DashboardState>)` to `useDashboardStore`.
   - This action will merge the provided URL parameters into the store state.

2. **Update `page.tsx` (Dashboard Entry Point):**
   - Import `useSearchParams` from `next/navigation` and `useQueryStates` from `nuqs`.
   - Read the raw search params to detect *which* parameters are actually present in the URL.
   - Read the parsed `urlState` from `useQueryStates(searchParams)`.
   - Create a `useEffect` that runs once on mount. It will check which keys exist in the URL, extract their parsed values from `urlState`, and call `syncUrlState` with only the present values.
   - Add a `isUrlSynced` state flag. Set it to `true` after the sync is complete.
   - Modify the existing `init` `useEffect` to wait for `isUrlSynced === true` before executing `checkConfig`, `fetchFields`, and `fetchDeals`.

3. **Test the Implementation:**
   - Verify that opening the base URL `/` still loads preferences from `localStorage`.
   - Verify that opening a shared URL (e.g., `/?date={"preset":"7days"}`) overrides the `localStorage` and fetches data for the 7-day period.