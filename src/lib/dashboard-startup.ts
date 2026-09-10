export type StartupStepStatus = "waiting" | "running" | "complete" | "error";
export type StartupState = {
  steps: StartupStepStatus[];
  finished: boolean;
  demo: boolean;
};
export const INITIAL_STARTUP: StartupState = {
  steps: ["waiting", "waiting", "waiting", "waiting", "waiting"],
  finished: false,
  demo: false,
};

type StartupSnapshot = {
  connectionStatus: string;
  isDemoMode: boolean;
  fieldsError: string | null;
  dealsError: string | null;
};

/** Tracks real initial startup requests and preloads background data for start screen. */
export async function runDashboardStartup(
  actions: readonly (() => Promise<void>)[],
  snapshot: () => StartupSnapshot,
  publish: (state: StartupState) => void,
  cancelled: () => boolean,
) {
  const initialSteps: StartupStepStatus[] =
    actions.length > 0
      ? actions.map(() => "waiting" as StartupStepStatus)
      : [...INITIAL_STARTUP.steps];

  let state: StartupState = {
    steps: initialSteps,
    finished: false,
    demo: false,
  };

  for (let index = 0; index < actions.length; index++) {
    if (cancelled()) return;
    state = { ...state, steps: [...state.steps] };
    state.steps[index] = "running";
    publish(state);
    let failed = false;
    try {
      await actions[index]();
    } catch {
      failed = true;
    }
    if (cancelled()) return;
    const result = snapshot();
    const stepFailed =
      index === 0
        ? result.connectionStatus === "disconnected"
        : index === 1
        ? !!result.fieldsError
        : index === 2
        ? !!result.dealsError
        : false;
    state = {
      ...state,
      steps: [...state.steps],
      demo: state.demo || result.isDemoMode || result.connectionStatus === "demo",
    };
    state.steps[index] = failed || stepFailed ? "error" : "complete";
    publish(state);
  }
  if (!cancelled()) publish({ ...state, finished: true });
}
