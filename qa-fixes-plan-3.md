# QA Fixes Plan 3

## 1. Fix SQLite DB Error Blocking Login
**File:** `src/lib/sso-hmac.ts`
**Issue:** When checking the nonce in SQLite, any DB error (like unique constraint violation or actual DB failure) causes the function to return `null`, blocking all users from logging in.
**Fix:** Differentiate between unique constraint errors (race conditions) and other DB errors. For unique constraint errors, return `null` (reject replay). For other DB errors, log the error but proceed with login to avoid blocking all users.

## 2. Clear Persistent State on Logout
**File:** `src/components/dashboard/header.tsx`
**Issue:** Calling `signOut` does not clear `localStorage`, leaving saved views, filters, and preferences visible to the next user on the same machine.
**Fix:** Add `localStorage.removeItem("bitrix-bi-dashboard");` before calling `signOut`.

## 3. Remove or Protect `loadDemoData`
**File:** `src/store/dashboard-store.ts`
**Issue:** `loadDemoData` is exposed and can overwrite real production data with demo deals.
**Fix:** Remove `loadDemoData` entirely if it's no longer needed, or add a strict check (e.g., `if (IS_PRODUCTION) return;`) to prevent it from running in production. Given the instructions, it's safer to remove it or add a strict guard. Let's add a strict guard `if (process.env.NODE_ENV === 'production') return;` or similar, or just remove it if it's not used. Actually, the user says "Метод публичный, нигде в UI сейчас не вызывается". We should remove it or add a guard. Let's add a guard `if (get().isConfigured) return;` or just remove it. Let's remove it to be safe, or add a `console.warn` and return if `isConfigured` is true. Let's just remove the `loadDemoData` function and `isDemoMode` state if possible, or just make it a no-op in production.

*Note: Bugs 2, 3, and 4 from the user's list were already fixed in previous iterations.*