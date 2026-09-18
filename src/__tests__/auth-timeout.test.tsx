import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import DashboardPage from '@/app/page';
import { useDashboardStore } from '@/store/dashboard-store';

let currentSessionStatus: 'loading' | 'authenticated' | 'unauthenticated' = 'loading';
let currentSessionData: any = null;

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: currentSessionData, status: currentSessionStatus }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));

vi.mock('nuqs', () => ({
  useQueryStates: () => [{}, vi.fn()],
}));

const mockLoginRedirect = vi.fn(() => '/login?callbackUrl=%2F');
vi.mock('@/lib/login-navigation', () => ({
  loginRedirect: () => mockLoginRedirect(),
}));

vi.mock('@/components/dashboard/header', () => ({ Header: () => null }));
vi.mock('@/components/dashboard/stats-cards', () => ({ StatsCards: () => null }));
vi.mock('@/components/dashboard/data-table', () => ({ DataTable: () => null }));
vi.mock('@/components/dashboard/column-selector', () => ({ ColumnSelector: () => null }));
vi.mock('@/components/dashboard/config-banner', () => ({ ConfigBanner: () => null }));
vi.mock('@/components/dashboard/footer', () => ({ Footer: () => null }));
vi.mock('@/components/dashboard/loading-screen', () => ({ LoadingScreen: () => null }));

describe('NextAuth Loading Timeout & Recovery UI', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    currentSessionStatus = 'loading';
    currentSessionData = null;
    mockReplace.mockClear();
    mockPush.mockClear();
    mockLoginRedirect.mockClear();
    useDashboardStore.setState({ appLoaded: false });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('1. loading below timeout -> recovery UI absent, loading spinner shown', () => {
    render(<DashboardPage />);

    // Fast-forward 10 seconds (below 15s timeout)
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByTestId('auth-timeout-recovery')).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-loading-spinner')).toBeInTheDocument();
  });

  it('2. loading reaches timeout (15s) -> recovery UI present with Retry and Sign-in buttons', () => {
    render(<DashboardPage />);

    // Fast-forward to 15 seconds
    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByTestId('auth-timeout-recovery')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /повторить/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /войти снова/i })).toBeInTheDocument();
  });

  it('3. authentication completes before timeout -> recovery UI never appears', () => {
    const { rerender } = render(<DashboardPage />);

    // Advance 5 seconds while loading
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.queryByTestId('auth-timeout-recovery')).not.toBeInTheDocument();

    // Transition to authenticated
    currentSessionStatus = 'authenticated';
    currentSessionData = { user: { email: 'user@russilica.ru' } };
    act(() => {
      rerender(<DashboardPage />);
    });

    // Advance past 15 seconds
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(screen.queryByTestId('auth-timeout-recovery')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument();
  });

  it('4. loading -> authenticated -> stale timer cannot fire later', () => {
    const { rerender } = render(<DashboardPage />);

    // Advance 8s
    act(() => {
      vi.advanceTimersByTime(8_000);
    });

    // Authenticate
    currentSessionStatus = 'authenticated';
    currentSessionData = { user: { email: 'user@russilica.ru' } };
    act(() => {
      rerender(<DashboardPage />);
    });

    // Advance another 10s (total 18s)
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByTestId('auth-timeout-recovery')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument();
  });

  it('5. component unmount -> timer is cleared (no state update on unmounted component)', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const { unmount } = render(<DashboardPage />);

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('6. unauthenticated path still follows existing login redirect logic', () => {
    currentSessionStatus = 'unauthenticated';
    currentSessionData = null;

    render(<DashboardPage />);

    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('/login'));
  });

  it('7. clicking Retry button triggers page reload', () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, reload: reloadSpy },
    });

    render(<DashboardPage />);
    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    const retryButton = screen.getByRole('button', { name: /повторить/i });
    act(() => {
      retryButton.click();
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('8. clicking Sign-in again button invokes login redirect', () => {
    let assignedHref = '';
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        href: 'http://localhost:3000/',
        pathname: '/',
        search: '',
      },
    });
    Object.defineProperty(window.location, 'href', {
      set: (val: string) => { assignedHref = val; },
      get: () => assignedHref,
      configurable: true,
    });

    render(<DashboardPage />);
    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    const signInButton = screen.getByRole('button', { name: /войти снова/i });
    act(() => {
      signInButton.click();
    });

    expect(assignedHref).toContain('/login');
  });
});
