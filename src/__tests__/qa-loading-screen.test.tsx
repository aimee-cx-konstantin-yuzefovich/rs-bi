import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_STARTUP, runDashboardStartup, type StartupState } from '@/lib/dashboard-startup';
import { LoadingScreen } from '@/components/dashboard/loading-screen';
import { useDashboardStore } from '@/store/dashboard-store';

describe('QA Suite: Dashboard Startup & Loading Screen', () => {
  let reduced = false;

  beforeEach(() => {
    reduced = false;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduced : false,
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

  describe('1. Functional & State Sequencing (Пункт 1: Реальные состояния и уход от противоречия)', () => {
    it('TC-01: Displays initial preparation title while in waiting state and does not dismiss prematurely', () => {
      vi.useFakeTimers();
      render(<LoadingScreen startup={INITIAL_STARTUP} />);
      
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Подготавливаем рабочее пространство');
      expect(screen.queryByText('Рабочее пространство готово')).not.toBeInTheDocument();
      
      // Advance by 3 seconds - should NOT close
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByTestId('startup-overlay')).toBeInTheDocument();
      expect(useDashboardStore.getState().appLoaded).toBe(false);
    });

    it('TC-02: Sequentially advances through 3 real stages: checkConfig -> fetchFields -> fetchDeals', async () => {
      const history: StartupState[] = [];
      const d1 = Promise.withResolvers<void>();
      const d2 = Promise.withResolvers<void>();
      const d3 = Promise.withResolvers<void>();

      const run = runDashboardStartup(
        [() => d1.promise, () => d2.promise, () => d3.promise],
        () => ({ connectionStatus: 'connected', isDemoMode: false, fieldsError: null, dealsError: null }),
        (s) => history.push(JSON.parse(JSON.stringify(s))),
        () => false,
      );

      expect(history[0].steps).toEqual(['running', 'waiting', 'waiting']);
      
      d1.resolve();
      await Promise.resolve();
      // Step 0 completed, step 1 starts
      expect(history[1].steps).toEqual(['complete', 'waiting', 'waiting']);
      expect(history[2].steps).toEqual(['complete', 'running', 'waiting']);

      d2.resolve();
      await Promise.resolve();
      // Step 1 completed, step 2 starts
      expect(history[3].steps).toEqual(['complete', 'complete', 'waiting']);
      expect(history[4].steps).toEqual(['complete', 'complete', 'running']);

      d3.resolve();
      await run;
      // Step 2 completed and finished
      expect(history[5].steps).toEqual(['complete', 'complete', 'complete']);
      expect(history[6].steps).toEqual(['complete', 'complete', 'complete']);
      expect(history[6].finished).toBe(true);
    });

    it('TC-03: On successful completion, shows "Рабочее пространство готово", sets appLoaded at 200ms, and retains live-region until 500ms', () => {
      vi.useFakeTimers();
      const readyState: StartupState = { steps: ['complete', 'complete', 'complete'], finished: true, demo: false };
      const { rerender } = render(<LoadingScreen startup={INITIAL_STARTUP} />);

      rerender(<LoadingScreen startup={readyState} />);

      const overlay = screen.getByTestId('startup-overlay');
      expect(overlay.className).toContain('opacity-0');
      expect(overlay.className).toContain('pointer-events-none');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Рабочее пространство готово');

      // 199ms: still loading in store
      act(() => vi.advanceTimersByTime(199));
      expect(useDashboardStore.getState().appLoaded).toBe(false);

      // 200ms: appLoaded triggers (interface interactive), but overlay remains in DOM for screen readers
      act(() => vi.advanceTimersByTime(1));
      expect(useDashboardStore.getState().appLoaded).toBe(true);
      expect(screen.getByTestId('startup-overlay')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();

      // 500ms: full DOM unmount
      act(() => vi.advanceTimersByTime(300));
      expect(screen.queryByTestId('startup-overlay')).not.toBeInTheDocument();
    });

    it('TC-04: Error handling in step 2 (deals) does not claim success and shows "Открываем рабочее пространство"', () => {
      vi.useFakeTimers();
      const errorState: StartupState = { steps: ['complete', 'complete', 'error'], finished: true, demo: false };
      render(<LoadingScreen startup={errorState} />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Открываем рабочее пространство');
      expect(screen.queryByText('Рабочее пространство готово')).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(200));
      expect(useDashboardStore.getState().appLoaded).toBe(true);

      act(() => vi.advanceTimersByTime(300));
      expect(screen.queryByTestId('startup-overlay')).not.toBeInTheDocument();
    });

    it('TC-05: Safety timeout (10s) opens the interface without claiming success or completed pending steps', () => {
      vi.useFakeTimers();
      const hangingState: StartupState = { steps: ['running', 'waiting', 'waiting'], finished: false, demo: false };
      render(<LoadingScreen startup={hangingState} />);

      act(() => vi.advanceTimersByTime(9999));
      expect(useDashboardStore.getState().appLoaded).toBe(false);

      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Открываем рабочее пространство');
      expect(screen.queryByText('Рабочее пространство готово')).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(200));
      expect(useDashboardStore.getState().appLoaded).toBe(true);

      act(() => vi.advanceTimersByTime(300));
      expect(screen.queryByTestId('startup-overlay')).not.toBeInTheDocument();
    });

    it('TC-06: Subsequent visits with appLoaded=true render nothing (no flash of loading)', () => {
      useDashboardStore.setState({ appLoaded: true });
      render(<LoadingScreen startup={INITIAL_STARTUP} />);
      expect(screen.queryByTestId('startup-overlay')).not.toBeInTheDocument();
    });
  });

  describe('2. Demo Mode Persistence (Пункт 2: Демо-режим и его отображение)', () => {
    it('TC-07: [RESOLVED] Demo mode flag is preserved across steps 1, 2, and in final state when connectionStatus is "demo"', async () => {
      const history: StartupState[] = [];
      // Real store behavior during checkConfig(): connectionStatus is "demo", but isDemoMode is false
      const snapshotState = {
        connectionStatus: 'demo',
        isDemoMode: false,
        fieldsError: null,
        dealsError: null,
      };

      await runDashboardStartup(
        [async () => {}, async () => {}, async () => {}],
        () => snapshotState,
        (s) => history.push(JSON.parse(JSON.stringify(s))),
        () => false,
      );

      // Step 0 completion
      const step0Done = history[1];
      expect(step0Done.demo).toBe(true);

      // Steps 1, 2 and final state maintain demo: true
      const step1Done = history[3];
      const finalState = history[history.length - 1];

      expect(step1Done.demo).toBe(true);
      expect(finalState.demo).toBe(true);
    });
  });

  describe('3. Visual Design & DOM Inspection (Пункт 3: Оформление тёмного терминала)', () => {
    it('TC-08: Renders branding, header, square terminal frame, and blinking cursor on active step', () => {
      const { rerender } = render(<LoadingScreen startup={INITIAL_STARTUP} />);
      const overlay = screen.getByTestId('startup-overlay');

      // Background #0B1120
      expect(overlay.className).toContain('bg-[#0B1120]');
      expect(overlay.className).toContain('text-[#F8FAFC]');

      // Section max-w-[560px]
      const section = overlay.querySelector('section');
      expect(section?.className).toContain('max-w-[560px]');

      // Panel background #111827, border #334155, and square frame (rounded-none)
      const card = section?.querySelector('div.rounded-none');
      expect(card?.className).toContain('bg-[#111827]');
      expect(card?.className).toContain('border-[#334155]');
      expect(card?.className).toContain('rounded-none');

      // Brand typography
      expect(screen.getByText('RusSilica')).toHaveClass('text-[#93C5FD]');
      expect(screen.getByText('Корпоративный BI Terminal')).toHaveClass('text-[#CBD5E1]');

      // Blinking cursor present when step is running
      rerender(<LoadingScreen startup={{ ...INITIAL_STARTUP, steps: ['complete', 'running', 'waiting', 'waiting', 'waiting'] }} />);
      expect(screen.getByTestId('blinking-cursor')).toBeInTheDocument();
      expect(screen.getByTestId('blinking-cursor')).toHaveClass('animate-blink-cursor');
    });

    it('TC-09: Displays correct step icons and amber color for running step', () => {
      const runningState: StartupState = {
        steps: ['complete', 'running', 'waiting'],
        finished: false,
        demo: true,
      };
      render(<LoadingScreen startup={runningState} />);

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(3);

      // Active step has amber text #FBBF24
      expect(items[1].className).toContain('text-[#FBBF24]');
      // Other steps have slate text #CBD5E1
      expect(items[0].className).toContain('text-[#CBD5E1]');
      expect(items[2].className).toContain('text-[#CBD5E1]');

      // Demo mode label
      expect(screen.getByText('Демонстрационный режим')).toBeInTheDocument();
    });
  });

  describe('4. Accessibility & Reduced Motion (Пункт 4: Доступность W3C / WCAG)', () => {
    it('TC-10: Exposes role="status", aria-live="polite", and announces active step to screen reader', () => {
      const activeState: StartupState = {
        steps: ['complete', 'running', 'waiting'],
        finished: false,
        demo: false,
      };
      render(<LoadingScreen startup={activeState} />);

      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
      expect(liveRegion).toHaveTextContent('Загрузка настроек CRM');
    });

    it('TC-11: List items have aria-current="step" on active step and screen reader status text', () => {
      const activeState: StartupState = {
        steps: ['complete', 'running', 'waiting'],
        finished: false,
        demo: false,
      };
      render(<LoadingScreen startup={activeState} />);

      const items = screen.getAllByRole('listitem');
      expect(items[0]).not.toHaveAttribute('aria-current');
      expect(items[1]).toHaveAttribute('aria-current', 'step');
      expect(items[2]).not.toHaveAttribute('aria-current');

      expect(items[0]).toHaveTextContent(': завершено');
      expect(items[1]).toHaveTextContent(': выполняется');
      expect(items[2]).toHaveTextContent(': ожидание');
    });

    it('TC-12: Indeterminate progress bar has aria-hidden="true" and animated class', () => {
      render(<LoadingScreen startup={INITIAL_STARTUP} />);
      const progressContainer = screen.getByTestId('startup-overlay').querySelector('.overflow-hidden.rounded-none');
      expect(progressContainer).toHaveAttribute('aria-hidden', 'true');
      
      const progressBar = progressContainer?.querySelector('div');
      expect(progressBar?.className).toContain('animate-startup-progress');
    });

    it('TC-13: Reduced motion setting immediately sets appLoaded without 200ms delay', () => {
      reduced = true;
      const readyState: StartupState = { steps: ['complete', 'complete', 'complete'], finished: true, demo: false };
      render(<LoadingScreen startup={readyState} />);

      // Instant dismissal without timer
      expect(useDashboardStore.getState().appLoaded).toBe(true);
    });

    it('TC-14: Renders specific icon types: Check, CircleAlert, amber dot, Minus based on status', () => {
      const mixedState: StartupState = {
        steps: ['complete', 'error', 'waiting'],
        finished: false,
        demo: false,
      };
      const { container } = render(<LoadingScreen startup={mixedState} />);

      const items = screen.getAllByRole('listitem');
      // Step 0: complete -> Check (lucide-check)
      expect(items[0].querySelector('svg')).toHaveClass('lucide-check');
      // Step 1: error -> CircleAlert (lucide-circle-alert)
      expect(items[1].querySelector('svg')).toHaveClass('lucide-circle-alert');
      // Step 2: waiting -> Minus (lucide-minus)
      expect(items[2].querySelector('svg')).toHaveClass('lucide-minus');
    });

    it('TC-15: Responsive layout classes verify 32px padding on desktop (sm:p-8), 24px on mobile (p-6), and 20px outer (px-5)', () => {
      render(<LoadingScreen startup={INITIAL_STARTUP} />);
      const overlay = screen.getByTestId('startup-overlay');
      // Outer padding: px-5 (20px)
      expect(overlay.className).toContain('px-5');
      // Inner card padding: p-6 (24px mobile) and sm:p-8 (32px desktop)
      const card = overlay.querySelector('div.rounded-none');
      expect(card?.className).toContain('p-6');
      expect(card?.className).toContain('sm:p-8');
    });

    it('TC-16: Cancels startup process when unmounted/cancelled', async () => {
      let cancelled = false;
      const d1 = Promise.withResolvers<void>();
      const step2 = vi.fn();
      const publish = vi.fn();

      const run = runDashboardStartup(
        [() => d1.promise, step2, step2],
        () => ({ connectionStatus: 'connected', isDemoMode: false, fieldsError: null, dealsError: null }),
        publish,
        () => cancelled,
      );

      // Cancel before d1 resolves
      cancelled = true;
      d1.resolve();
      await run;

      expect(step2).not.toHaveBeenCalled();
      expect(publish).toHaveBeenCalledTimes(1); // Only initial running publication
    });

    it('TC-17: Renders 5 startup steps with timestamps for active and waiting steps', () => {
      render(<LoadingScreen startup={{ ...INITIAL_STARTUP, steps: ['complete', 'running', 'waiting', 'waiting', 'waiting'] }} />);
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(5);
      expect(items[0].textContent).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
      expect(items[1].textContent).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
      expect(items[2].textContent).toMatch(/\[--:--:--\.---\]/);
    });
  });
});
