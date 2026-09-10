export type StartupStepStatus = "waiting" | "running" | "complete" | "error";
export type StartupState = {
  steps: [StartupStepStatus, StartupStepStatus, StartupStepStatus];
  finished: boolean;
  demo: boolean;
};
export const INITIAL_STARTUP: StartupState = { steps: ["waiting", "waiting", "waiting"], finished: false, demo: false };

type StartupSnapshot = {
  connectionStatus: string;
  isDemoMode: boolean;
  fieldsError: string | null;
  dealsError: string | null;
};

/** Tracks the real initial requests; background enrichment is not part of startup. */
export async function runDashboardStartup(
  actions: readonly [() => Promise<void>, () => Promise<void>, () => Promise<void>],
  snapshot: () => StartupSnapshot,
  publish: (state: StartupState) => void,
  cancelled: () => boolean,
) {
  let state: StartupState = { ...INITIAL_STARTUP, steps: [...INITIAL_STARTUP.steps] };
  for (let index = 0; index < actions.length; index++) {
    if (cancelled()) return;
    state = { ...state, steps: [...state.steps] };
    state.steps[index] = "running";
    publish(state);
    let failed = false;
    try { await actions[index](); } catch { failed = true; }
    if (cancelled()) return;
    const result = snapshot();
    const stepFailed = index === 0 ? result.connectionStatus === "disconnected" : index === 1 ? !!result.fieldsError : !!result.dealsError;
    state = { ...state, steps: [...state.steps], demo: state.demo || result.isDemoMode || result.connectionStatus === "demo" };
    state.steps[index] = failed || stepFailed ? "error" : "complete";
    publish(state);
  }
  if (!cancelled()) publish({ ...state, finished: true });
}
