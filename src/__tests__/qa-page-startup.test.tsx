import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/page';
import { useDashboardStore } from '@/store/dashboard-store';

// ─── Mocks: NextAuth / navigation / URL state / redirect ───
// The real store and real runDashboardStartup are used; only the environment
// (session, URL hooks) and the store's network actions are controlled.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'QA' } }, status: 'authenticated' }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('nuqs', () => ({
  useQueryStates: () => [{}, vi.fn()],
}));
vi.mock('@/hooks/use-login-redirect', () => ({
  useLoginRedirect: () => {},
}));

// Child components are irrelevant to startup visibility/inertness — stub them
// out so the harness only exercises page-level composition logic.
vi.mock('@/components/dashboard/header', () => ({ Header: () => <div data-testid="stub-header" /> }));
vi.mock('@/components/dashboard/stats-cards', () => ({ StatsCards: () => <div data-testid="stub-stats" /> }));
vi.mock('@/components/dashboard/data-table', () => ({ DataTable: () => <div data-testid="stub-table" /> }));
vi.mock('@/components/dashboard/column-selector', () => ({ ColumnSelector: () => null }));
vi.mock('@/components/dashboard/config-banner', () => ({ ConfigBanner: () => null }));
vi.mock('@/components/dashboard/footer', () => ({ Footer: () => null }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  useDashboardStore.setState({ appLoaded: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Overrides the store's startup-related actions with controllable ones.
 * jsdom does not enforce `inert`/focus behavior, so the tests assert the
 * attributes the page applies (inert / aria-hidden / className), which is the
 * contract the browser uses.
 */
function installStartupActions(hanging: boolean) {
  useDashboardStore.setState(state => ({
    ...state,
    checkConfig: hanging ? () => new Promise<void>(() => {}) : async () => {},
    fetchFields: hanging ? () => new Promise<void>(() => {}) : async () => {},
    fetchDeals: hanging ? () => new Promise<void>(() => {}) : async () => {},
    fetchUserNames: hanging ? () => new Promise<void>(() => {}) : async () => {},
    fetchCompaniesData: hanging ? () => new Promise<void>(() => {}) : async () => {},
    fetchActivitiesData: hanging ? () => new Promise<void>(() => {}) : async () => {},
    applyClientFilters: () => {},
  }));
}

/** Flushes the chained startup microtasks until runDashboardStartup settles. */
async function flushStartup() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

function getDashboard() {
  return document.querySelector('[data-testid="dashboard-root"]') as HTMLElement;
}

describe('QA Suite: Page-level startup visibility / interactivity', () => {
  it('normal success: dashboard visible but inert under fading overlay, interactive after 200ms', async () => {
    vi.useFakeTimers();
    installStartupActions(false);
    render(<DashboardPage />);

    // Startup runs to completion (all step promises resolve immediately).
    await flushStartup();

    const overlay = screen.getByTestId('startup-overlay');
    const dashboard = getDashboard();

    // VISIBILITY: overlay is fading out (closing) while dashboard is already visible
    expect(overlay.className).toContain('opacity-0');
    expect(overlay.className).toContain('pointer-events-none');
    expect(dashboard.className).toContain('opacity-100');
    expect(dashboard.className).not.toContain('opacity-0');

    // INTERACTIVITY: still gated
    expect(dashboard).toHaveAttribute('inert');
    expect(dashboard).toHaveAttribute('aria-hidden', 'true');
    expect(useDashboardStore.getState().appLoaded).toBe(false);

    // 200ms: dashboard becomes interactive; overlay stays for SR announcement until 500ms
    act(() => vi.advanceTimersByTime(200));
    expect(useDashboardStore.getState().appLoaded).toBe(true);
    expect(dashboard).not.toHaveAttribute('inert');
    // React renders aria-hidden={false} as the string "false"; the accessibility
    // contract is the *value*: "true" hides, anything else exposes the element.
    expect(dashboard).not.toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('startup-overlay')).toBeInTheDocument();

    // 500ms: overlay fully unmounted
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByTestId('startup-overlay')).not.toBeInTheDocument();
    expect(getDashboard()).not.toHaveAttribute('inert');
  });

  it('REGRESSION 10s timeout: no frame with invisible overlay AND invisible dashboard; dashboard inert until 200ms', async () => {
    vi.useFakeTimers();
    installStartupActions(true);
    render(<DashboardPage />);

    await act(async () => { await Promise.resolve(); });
    await flushStartup();

    const dashboard = getDashboard();
    // Before timeout: dashboard hidden
    expect(dashboard.className).toContain('opacity-0');
    expect(useDashboardStore.getState().appLoaded).toBe(false);

    // Timeout fires at 10s: overlay starts closing...
    act(() => vi.advanceTimersByTime(10_000));
    const overlay = screen.getByTestId('startup-overlay');
    expect(overlay.className).toContain('opacity-0');

    // ...and THE KEY REGRESSION: dashboard must NOT still be opacity-0 here.
    // The original bug produced a light-theme flash frame: overlay opacity-0
    // while dashboard opacity-0. Both must never hold simultaneously.
    expect(dashboard.className).toContain('opacity-100');
    expect(dashboard.className).not.toContain('opacity-0');

    // But interactivity is still gated behind the 200ms grace.
    expect(dashboard).toHaveAttribute('inert');
    expect(dashboard).toHaveAttribute('aria-hidden', 'true');
    expect(useDashboardStore.getState().appLoaded).toBe(false);

    // 200ms after timeout: interactive
    act(() => vi.advanceTimersByTime(200));
    expect(useDashboardStore.getState().appLoaded).toBe(true);
    expect(dashboard).not.toHaveAttribute('inert');
    expect(dashboard).not.toHaveAttribute('aria-hidden', 'true');
  });
});
