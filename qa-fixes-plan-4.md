# QA Fixes Analysis Plan

## Objective
Analyze the requested bug fixes and verify their status in the current codebase.

## Analysis of Requested Fixes

### 1. `src/store/dashboard-store.ts`
- **Requested:** Add `userNamesLoading` to interface and initial state.
  - **Status:** ✅ Already implemented.
- **Requested:** Replace `fetchUserNames` to handle loading state.
  - **Status:** ✅ Already implemented.
- **Requested:** Remove 3 debug `console.log` statements from `fetchCompaniesData`.
  - **Status:** ✅ Already removed (not present in the file).

### 2. `src/hooks/use-table-state.ts`
- **Requested:** Add `userNamesLoading` to selector and return it.
  - **Status:** ✅ Already implemented.
- **Requested:** Remove hardcoded debug block for `companyId === "1627"`.
  - **Status:** ✅ Already removed (not present in the file).

### 3. `src/app/api/bitrix/companies/route.ts`
- **Requested:** Remove debug log `console.log("[Companies API] crm.company.list data:"...)`.
  - **Status:** ✅ Already removed (not present in the file).

### 4. `src/components/dashboard/data-table.tsx`
- **Requested:** Add `userNamesLoading` state and pass it to `CellValue`.
  - **Status:** ✅ Already implemented.
- **Requested:** Update `CellValue` signature and add skeleton logic for `ASSIGNED_BY_ID`.
  - **Status:** ✅ Skeleton logic is already implemented. *Note: The requested snippet included an `openDrawer` function which is not present in the current file, but the core loading/skeleton logic is fully functional.*

## Conclusion
All the requested bug fixes and performance improvements (loading states, removing debug logs) are **already present** in the codebase. No further code changes are required for this specific task.