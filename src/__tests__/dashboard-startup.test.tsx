import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_STARTUP, runDashboardStartup, type StartupState } from '@/lib/dashboard-startup';
import { LoadingScreen } from '@/components/dashboard/loading-screen';
import { useDashboardStore } from '@/store/dashboard-store';

const good = () => ({ connectionStatus: 'connected', isDemoMode: false, fieldsError: null, dealsError: null });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  useDashboardStore.setState({ appLoaded: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('real startup sequencing', () => {
  it('waits for each operation and only completes after data processing', async () => {
    const tasks = [deferred(), deferred(), deferred()];
    const publish = vi.fn();
    const run = runDashboardStartup([() => tasks[0].promise, () => tasks[1].promise, () => tasks[2].promise], good, publish, () => false);
    expect(publish.mock.lastCall?.[0].steps).toEqual(['running', 'waiting', 'waiting']);
    tasks[0].resolve(); await Promise.resolve();
    expect(publish.mock.lastCall?.[0].steps).toEqual(['complete', 'running', 'waiting']);
    tasks[1].resolve(); await Promise.resolve();
    expect(publish.mock.lastCall?.[0].steps).toEqual(['complete', 'complete', 'running']);
    expect(publish.mock.lastCall?.[0].finished).toBe(false);
    tasks[2].resolve(); await run;
    expect(publish.mock.lastCall?.[0]).toEqual({ steps: ['complete', 'complete', 'complete'], finished: true, demo: false });
  });
  it('does not confuse resolved requests with success', async () => {
    const publish = vi.fn();
    await runDashboardStartup([async () => {}, async () => {}, async () => {}], () => ({ ...good(), fieldsError: 'failed', dealsError: 'failed' }), publish, () => false);
    expect(publish.mock.lastCall?.[0].steps).toEqual(['complete', 'error', 'error']);
  });
  it('captures rejection and continues existing initialization', async () => {
    const publish = vi.fn(); const last = vi.fn();
    await runDashboardStartup([async () => { throw Error(); }, async () => {}, last], good, publish, () => false);
    expect(last).toHaveBeenCalled();
    expect(publish.mock.lastCall?.[0].steps[0]).toBe('error');
  });
  it('labels demo separately', async () => {
    const publish = vi.fn();
    await runDashboardStartup([async () => {}, async () => {}, async () => {}], () => ({ ...good(), connectionStatus: 'demo', isDemoMode: true }), publish, () => false);
    expect(publish.mock.lastCall?.[0].demo).toBe(true);
  });
  it('preserves demo status across all steps even if isDemoMode is false', async () => {
    const publish = vi.fn();
    await runDashboardStartup([async () => {}, async () => {}, async () => {}], () => ({ ...good(), connectionStatus: 'demo', isDemoMode: false }), publish, () => false);
    expect(publish.mock.lastCall?.[0].demo).toBe(true);
  });
  it('ignores an obsolete run after cleanup and does not start its next request', async () => {
    let cancelled = false; const first = deferred(); const next = vi.fn(); const publish = vi.fn();
    const run = runDashboardStartup([() => first.promise, next, next], good, publish, () => cancelled);
    cancelled = true; first.resolve(); await run;
    expect(publish).toHaveBeenCalledTimes(1); expect(next).not.toHaveBeenCalled();
  });
});

const ready: StartupState = { steps: ['complete', 'complete', 'complete'], finished: true, demo: false };
describe('loading screen', () => {
  it('does not dismiss the initial waiting state', () => {
    vi.useFakeTimers(); render(<LoadingScreen startup={INITIAL_STARTUP} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('status')).toHaveTextContent('Подготавливаем');
    expect(useDashboardStore.getState().appLoaded).toBe(false);
    expect(screen.queryByText('Рабочее пространство готово')).not.toBeInTheDocument();
  });
  it('immediately starts a 200ms exit on success without playing intermediate steps', () => {
    vi.useFakeTimers(); const view = render(<LoadingScreen startup={INITIAL_STARTUP} />);
    view.rerender(<LoadingScreen startup={ready} />);
    expect(screen.getByRole('status')).toHaveTextContent('Рабочее пространство готово');
    act(() => vi.advanceTimersByTime(199)); expect(useDashboardStore.getState().appLoaded).toBe(false);
    act(() => vi.advanceTimersByTime(1)); expect(useDashboardStore.getState().appLoaded).toBe(true);
    expect(screen.getByTestId('startup-overlay')).toHaveClass('pointer-events-none');
    act(() => vi.advanceTimersByTime(300)); expect(screen.queryByTestId('startup-overlay')).not.toBeInTheDocument();
  });
  it('exits on failure without claiming success', () => {
    vi.useFakeTimers(); render(<LoadingScreen startup={{ ...ready, steps: ['complete', 'complete', 'error'] }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Открываем');
    expect(screen.queryByText('Рабочее пространство готово')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200)); expect(useDashboardStore.getState().appLoaded).toBe(true);
  });
  it('times out at 10 seconds without marking pending steps complete', () => {
    vi.useFakeTimers(); render(<LoadingScreen startup={{ ...INITIAL_STARTUP, steps: ['running', 'waiting', 'waiting'] }} />);
    act(() => vi.advanceTimersByTime(9999)); expect(useDashboardStore.getState().appLoaded).toBe(false);
    act(() => vi.advanceTimersByTime(1)); expect(screen.getByRole('status')).toHaveTextContent('Открываем');
    expect(screen.queryByText('Рабочее пространство готово')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200)); expect(useDashboardStore.getState().appLoaded).toBe(true);
  });
  it('skips the exit delay with reduced motion', () => {
    reduced = true; render(<LoadingScreen startup={ready} />);
    expect(useDashboardStore.getState().appLoaded).toBe(true);
  });
  it('cancels pending dismissal on unmount', () => {
    vi.useFakeTimers(); const view = render(<LoadingScreen startup={ready} />); view.unmount();
    act(() => vi.advanceTimersByTime(11000)); expect(useDashboardStore.getState().appLoaded).toBe(false);
  });
  it('announces current work and labels demo mode', () => {
    render(<LoadingScreen startup={{ ...INITIAL_STARTUP, steps: ['complete', 'running', 'waiting'], demo: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Загрузка настроек CRM');
    expect(screen.getByText('Демонстрационный режим')).toBeVisible();
  });
  it('stays absent on subsequent visits', () => {
    useDashboardStore.setState({ appLoaded: true }); render(<LoadingScreen startup={INITIAL_STARTUP} />);
    expect(screen.queryByTestId('startup-overlay')).not.toBeInTheDocument();
  });
});
