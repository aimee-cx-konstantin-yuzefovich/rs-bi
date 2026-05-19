# Company Responsible Column Implementation Plan

## Objective
Add a new column "Company Responsible" (Ответственный компании) to the BI analytics table. This column will display the responsible employee assigned to the COMPANY entity in Bitrix24, not the deal's responsible person.

## Architecture
The relation is second-level: `Deal → COMPANY_ID → Company → ASSIGNED_BY_ID → User → Full Name`.
We will resolve this in-memory on the frontend using the already cached `companiesData` and `userNames`.

## Steps for Implementation

### 1. Update API to Fetch Company Responsible
**File:** `src/app/api/bitrix/companies/route.ts`
- In `normalizeSelect`, add `"ASSIGNED_BY_ID"` to the `safe` array so it is always allowed to be fetched.

### 2. Add Constants
**File:** `src/lib/crm-constants.ts`
- Export `COMPANY_RESPONSIBLE_FIELD_ID = "COMPANY_ASSIGNED_BY_ID"`.
- Export `COMPANY_RESPONSIBLE_FIELD_TITLE = "Ответственный компании"`.
- Add `COMPANY_RESPONSIBLE_FIELD_ID` to `DEAL_TABLE_DEFAULT_COLUMNS` immediately after `RESPONSIBLE_FIELD_ID`.

### 3. Update Dashboard Store
**File:** `src/store/dashboard-store.ts`
- Import `COMPANY_RESPONSIBLE_FIELD_ID`.
- Update the `migrate` function (version < 3 or add a new version block) to ensure `COMPANY_RESPONSIBLE_FIELD_ID` is inserted into `selectedColumns` for existing users, right after `RESPONSIBLE_FIELD_ID`.

### 4. Implement Value Resolution
**File:** `src/hooks/use-table-state.ts`
- Import `COMPANY_RESPONSIBLE_FIELD_ID`.
- In `resolveValue`, add a specific block for `COMPANY_RESPONSIBLE_FIELD_ID` right after the `RESPONSIBLE_FIELD_ID` block:
  - Extract `COMPANY_ID` from the deal.
  - Lookup the company in `companiesData`.
  - Extract `ASSIGNED_BY_ID` from the company.
  - Lookup the user's name in `userNames`.
  - Return the resolved name or fallback to ID.
- *Note:* Sorting and searching will work automatically because `getSortValue` and `searchedDeals` already use `resolveValue` for columns starting with `COMPANY_` or dynamically check all visible columns.

### 5. Update Data Table UI
**File:** `src/components/dashboard/data-table.tsx`
- Import `COMPANY_RESPONSIBLE_FIELD_ID` and `COMPANY_RESPONSIBLE_FIELD_TITLE`.
- In the table header rendering, check if `colId === COMPANY_RESPONSIBLE_FIELD_ID` and display `COMPANY_RESPONSIBLE_FIELD_TITLE`.
- In the `CellValue` component, add a block for `COMPANY_RESPONSIBLE_FIELD_ID` similar to `RESPONSIBLE_FIELD_ID` to show a loading skeleton (`userNamesLoading` or `companiesLoading`) when the data is still being fetched.

### 6. Add Filter Support (Optional but Recommended)
**File:** `src/components/dashboard/responsible-filter.tsx` (if exists) or handle within `useDashboardStore` and `DataTable`.
- Since the user requested it as highly recommended, we can add a filter for "Company Responsible" if applicable, or rely on the generic column filter which will work automatically because `resolveValue` is used for column filters. The generic column filter in `DataTable` will automatically support filtering by the resolved text value!

## QA Checks
- Verify `/api/bitrix/companies` returns `ASSIGNED_BY_ID`.
- Verify `userNames` contains the mapping.
- Verify the table displays the full name (e.g., "Ivan Petrov") and not the ID (e.g., "45").
