# Entity Click-Through Drawer Implementation Plan

## 1. Architecture & State
- Create `src/store/entity-drawer-store.ts` using Zustand to manage drawer state (`isOpen`, `entityType`, `entityId`).

## 2. Data Fetching (Hooks)
- Create `src/hooks/use-company-details.ts` to fetch company data and related deals via existing `/api/bitrix/companies` and `/api/bitrix/deals` endpoints.
- Create `src/hooks/use-user-details.ts` to fetch user data and related deals via existing `/api/bitrix/users` and `/api/bitrix/deals` endpoints.

## 3. UI Components
- Create `src/components/dashboard/entity-drawer.tsx` using shadcn/ui `Sheet`.
- Implement `CompanyDrawerContent` displaying revenue, industry, related deals, and an "Open in CRM" button.
- Implement `ResponsibleDrawerContent` displaying user details, related deals, and an "Open in CRM" button.
- Ensure responsive behavior: full-screen on mobile, 520px right-side drawer on desktop.

## 4. Integration
- Inject `<EntityDrawer />` into `src/app/layout.tsx`.
- Update `src/components/dashboard/data-table.tsx` to make `COMPANY_TITLE` and `ASSIGNED_BY_ID` columns clickable, triggering the drawer.

## 5. Edge Cases
- Show Skeletons during loading.
- Handle "Not found" errors.
- Handle "No related deals" empty states.
- Prevent opening if ID is missing.