# Plan: Fix Company Fields Caching Issue

## Problem Description
In the BI analytics dashboard, company fields (both standard and custom) often display as dashes (`—`) even when the data exists in Bitrix24. The company name (`COMPANY_TITLE`) displays correctly.

This happens because of a caching bug in `src/store/dashboard-store.ts`. The `fetchCompaniesData` function checks if a company ID exists in the local cache (`companiesData`). If it does, it skips fetching data for that company. However, it fails to check if the *specific fields* requested by the user (via the column selector) are present in the cached company object. Since `COMPANY_TITLE` is fetched by default, the company ID is cached early on. When a user later adds a new company column (e.g., `COMPANY_TYPE`), the system sees the company ID in the cache, assumes it has all the data, and skips the fetch. The table then tries to render the missing field, resulting in a dash.

## Proposed Solution

1.  **Reorder Logic in `fetchCompaniesData`**: Move the determination of `companyFieldsToSelect` *before* the cache check logic.
2.  **Enhance Cache Check**: Update the `missingIds` filter to check not only if the company exists in the cache, but also if *all* requested fields (`companyFieldsToSelect`) exist as keys within the cached company object.
3.  **Deep Merge Cached Data**: When new data is fetched, merge it with the existing cached data for each company, rather than overwriting the entire company object. This ensures previously fetched fields (like `TITLE`) are not lost when fetching new fields (like `TYPE`).

## Implementation Steps

1.  **Edit `src/store/dashboard-store.ts`**:
    *   Locate `fetchCompaniesData`.
    *   Move the `companyFieldsToSelect` calculation up.
    *   Update the `missingIds` filter:
        ```typescript
        const missingIds = uniqueIds.filter((id) => {
          const cached = companiesData[id];
          const fetchedAt = get().companiesDataFetchedAt[id];
          if (!cached) return true;
          if (!fetchedAt || now - fetchedAt > 5 * 60 * 1000) return true;
          
          // Check if all required fields are present in the cached object
          const hasAllFields = companyFieldsToSelect.every(field => field in cached);
          if (!hasAllFields) return true;
          
          return false;
        });
        ```
    *   Update the state setter to deep merge company objects:
        ```typescript
        const newCompaniesData = { ...state.companiesData };
        for (const [id, companyData] of Object.entries(normalizedCompanies)) {
          newCompaniesData[id] = {
            ...(newCompaniesData[id] || {}),
            ...companyData
          };
        }
        ```

## Expected Outcome
When a user adds a new company column to the table, the system will detect that the field is missing from the cache and will correctly fetch the new field data from Bitrix24, displaying the actual values instead of dashes.