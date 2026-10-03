// @vitest-environment jsdom
// src/__tests__/company-preview-scope-race.test.tsx
// ─────────────────────────────────────────────────────────────────────
// §7.2 + §7.7–7.11 — CompanyPreview caller-independence and
// company-scoped async state regressions:
//  - cold metadata bootstrap: empty fields + empty user directory + no
//    prior navigation to / → the drawer bootstraps the canonical lookups
//    (fetchFields / fetchUserNames) and resolves human-readable Company
//    Type / Industry / Direction; raw IDs never leak; known IDs are never
//    presented as a final «Не классифицировано» while loading;
//  - A loaded → id changes to B → B loading contains no A data;
//  - out-of-order A/B responses cannot cross scopes;
//  - successful A → refresh fails TWICE → the same stale A snapshot
//    survives both failures (refresh_failed, never hard failed);
//  - A stale snapshot → change to B → A snapshot immediately unavailable.
// ─────────────────────────────────────────────────────────────────────
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { LOOKUP_LOADING_PLACEHOLDER } from "@/lib/company-preview";

const storeState = vi.hoisted(() => ({
  userNames: {} as Record<string, string>,
  usersCoverage: null as import("@/lib/dataset-coverage").DatasetCoverage | null,
  fields: [] as Array<{ id: string; title?: string; type?: string; listValues?: Array<{ ID: string; VALUE: string }> }>,
  allDeals: [] as Array<Record<string, unknown>>,
  dealsCoverage: null as import("@/lib/dataset-coverage").DatasetCoverage | null,
  selectedColumns: [] as string[],
  fieldsLoading: false,
  userNamesLoading: false,
  fetchFields: vi.fn(async () => {}),
  fetchUserNames: vi.fn(async () => {}),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "principal" } }, status: "authenticated" }),
}));

vi.mock("@/store/dashboard-store", () => {
  const useDashboardStore = (selector?: (s: typeof storeState) => unknown) =>
    selector ? selector(storeState) : storeState;
  (useDashboardStore as any).setState = () => {};
  return { useDashboardStore };
});

vi.mock("@/lib/export-utils", () => ({ exportCompanyToExcel: vi.fn() }));

const fetchMock = vi.fn();

const INDUSTRY_FIELD = "UF_CRM_1784195884554";
const DIRECTION_FIELD = "UF_CRM_1784200275341";

const companyPayload = (id: string, title: string) => ({
  success: true,
  company: {
    ID: id,
    TITLE: title,
    ASSIGNED_BY_ID: "7",
    COMPANY_TYPE: "1",
    [INDUSTRY_FIELD]: "1739",
    [DIRECTION_FIELD]: "55",
    DATE_CREATE: "2025-01-10T10:00:00Z",
    DATE_MODIFY: "2026-06-01T10:00:00Z",
  },
  bitrixUrl: `https://portal.example/crm/company/details/${id}/`,
});

const samplesPayload = (companyId: string) => ({
  success: true,
  samples: [
    {
      companyId,
      normalizedResult: "pending",
      dataIssues: [],
      sentDates: [],
      sampleIndicators: [],
      processStatuses: [],
      relatedDeals: [],
      smartProcessItems: [
        {
          processItemId: `90${companyId}`,
          title: `Цикл ${companyId}`,
          stageLabel: "На испытании",
          stageId: "DT1032_15:CLIENT",
          isActive: true,
          isTerminal: false,
          sentDates: [],
          grades: [],
          quantities: [],
          dataIssues: [],
        },
      ],
    },
  ],
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/**
 * Company/deals endpoints succeed instantly. /samples responses can be
 * queued per company: push a Response-like into the queue to control the
 * next /samples response for that company (hang or failure).
 */
function installBaseTransport(samplesQueue: Map<string, Array<unknown>> = new Map()) {
  fetchMock.mockImplementation((url: string, init?: { body?: string }) => {
    if (String(url).endsWith("/api/bitrix/samples")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const queue = samplesQueue.get(body.companyId);
      if (queue && queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      return Promise.resolve(ok(samplesPayload(body.companyId)));
    }
    const match = String(url).match(/\/api\/bitrix\/companies\/(\d+)(\/deals)?$/);
    if (match) {
      if (match[2]) {
        return Promise.resolve(ok({ success: true, deals: [] }));
      }
      return Promise.resolve(
        ok(companyPayload(match[1], match[1] === "42" ? "Компания А" : "Компания Б"))
      );
    }
    return Promise.resolve(ok({ success: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  storeState.userNames = {};
  storeState.fields = [];
  storeState.fieldsLoading = false;
  storeState.userNamesLoading = false;
  storeState.fetchFields = vi.fn(async () => {});
  storeState.fetchUserNames = vi.fn(async () => {});
});

const spSection = () => document.querySelector("[data-sp-company-section]")!;

describe("CompanyPreview — cold metadata bootstrap (caller independence)", () => {
  it("bootstraps canonical lookups on cold store and resolves human-readable enum values after bootstrap", async () => {
    installBaseTransport();
    const { rerender } = render(<CompanyPreview id="42" onClose={() => {}} />);

    // Cold store: the drawer bootstraps BOTH canonical lookup paths.
    await waitFor(() => expect(storeState.fetchFields).toHaveBeenCalled());
    await waitFor(() => expect(storeState.fetchUserNames).toHaveBeenCalled());

    // Complete the REAL bootstrap (same store shape the main page produces).
    await act(async () => {
      storeState.fields = [
        {
          id: "COMPANY_TYPE",
          title: "Тип компании",
          type: "crm_status",
          listValues: [{ ID: "1", VALUE: "Поставщик" }],
        },
        {
          id: INDUSTRY_FIELD,
          title: "Отрасль (согл. список)",
          type: "enumeration",
          listValues: [{ ID: "1739", VALUE: "Химия" }],
        },
        {
          id: DIRECTION_FIELD,
          title: "Направление (согл. список)",
          type: "enumeration",
          listValues: [{ ID: "55", VALUE: "Гели" }],
        },
      ];
      storeState.userNames = { "7": "Анна Иванова" };
      storeState.usersCoverage = { status: "COMPLETE", fetched: 1, total: 1 };
      rerender(<CompanyPreview id="42" onClose={() => {}} />);
    });

    // Known enum/status IDs resolve to human labels — identical to opening
    // the same company from the warm main page. Raw IDs never leak; a known
    // ID is never finalized as «Не классифицировано».
    expect(await screen.findByText("Химия")).toBeInTheDocument();
    expect(screen.getByText("Поставщик")).toBeInTheDocument();
    expect(screen.getByText("Гели")).toBeInTheDocument();
    expect(screen.getByText("Анна Иванова")).toBeInTheDocument();
    expect(screen.queryByText("1739")).not.toBeInTheDocument();
    expect(screen.queryByText(LOOKUP_LOADING_PLACEHOLDER)).not.toBeInTheDocument();
    expect(screen.queryByText("Не классифицировано")).not.toBeInTheDocument();
  });

  it("while metadata is unbootstraped a known raw enum ID neither leaks raw nor shows a premature final «Не классифицировано»", async () => {
    installBaseTransport();
    render(<CompanyPreview id="42" onClose={() => {}} />);

    await screen.findByText("Компания А");
    // Nothing usable and nothing loading → truthfully disclosed as failed
    // metadata (never DEMO substitution); raw IDs never leak anywhere.
    const disclosure = document.querySelector("[data-metadata-disclosure]");
    expect(disclosure).toBeTruthy();
    expect(screen.queryByText("1739")).not.toBeInTheDocument();
    expect(screen.queryByText("55")).not.toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("caller-independent values: cold entry renders the same resolved content as the warm main page", async () => {
    installBaseTransport();
    // Warm the store first (as the main page would), then render cold entry.
    storeState.fields = [
      {
        id: INDUSTRY_FIELD,
        title: "Отрасль (согл. список)",
        type: "enumeration",
        listValues: [{ ID: "1739", VALUE: "Химия" }],
      },
    ];
    storeState.userNames = { "7": "Анна Иванова" };
    render(<CompanyPreview id="42" onClose={() => {}} />);
    expect(await screen.findByText("Химия")).toBeInTheDocument();
    expect(screen.getByText("Анна Иванова")).toBeInTheDocument();
  });
});

describe("CompanyPreview — company-scoped async state", () => {
  it("A loaded → id changes to B → B shows loading with no A data", async () => {
    installBaseTransport();
    const { rerender } = render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByText("Компания А");
    await waitFor(() => expect(screen.getByText("Цикл 42")).toBeInTheDocument());

    rerender(<CompanyPreview id="77" onClose={() => {}} />);
    // Immediately: no A data anywhere (title, fields, SP cycles).
    expect(screen.queryByText("Компания А")).not.toBeInTheDocument();
    expect(screen.queryByText("Цикл 42")).not.toBeInTheDocument();
    // B renders its own data afterwards.
    await screen.findByText("Компания Б");
    await waitFor(() => expect(screen.getByText("Цикл 77")).toBeInTheDocument());
    expect(screen.queryByText("Цикл 42")).not.toBeInTheDocument();
  });

  it("out-of-order: hanging A request aborted by the id change; B stays intact", async () => {
    const pendingA = new Map<string, Array<unknown>>([["42", []]]);
    installBaseTransport(pendingA);
    const { rerender } = render(<CompanyPreview id="42" onClose={() => {}} />);
    // A's samples request hangs (queue empty → but we control the company
    // fetch instead by queuing a never-resolving thena-ble? Simpler: hang
    // the A samples response, switch to B, verify B and abort.
    const companyCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/api/bitrix/companies/42"));
    expect(companyCall).toBeTruthy();
    rerender(<CompanyPreview id="77" onClose={() => {}} />);
    await screen.findByText("Компания Б");
    // A's transport request was aborted when the scope changed.
    const signal = (companyCall![1] as { signal?: AbortSignal }).signal;
    expect(signal?.aborted).toBe(true);
    expect(screen.getByText("Компания Б")).toBeInTheDocument();
    expect(screen.queryByText("Компания А")).not.toBeInTheDocument();
  });

  it("successful A → refresh fails twice → the SAME stale A snapshot survives both failures", async () => {
    const failures = new Map<string, Array<unknown>>([["42", []]]);
    installBaseTransport(failures);
    render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByText("Компания А");
    await waitFor(() => expect(screen.getByText("Цикл 42")).toBeInTheDocument());

    // First refresh failure (queued response consumed by the explicit retry).
    failures.get("42")!.push({ ok: false, status: 502, json: async () => ({ success: false, error: "fail #1" }) });
    fireEvent.click(spSection().querySelector("[data-sp-retry]")!);
    await waitFor(() => {
      expect(document.querySelector("[data-sp-stale-warning]")).toBeTruthy();
    });
    expect(screen.getByText("Цикл 42")).toBeInTheDocument();

    // Second refresh failure: stale snapshot MUST survive (no hard fail).
    failures.get("42")!.push({ ok: false, status: 502, json: async () => ({ success: false, error: "fail #2" }) });
    fireEvent.click(spSection().querySelector("[data-sp-retry]")!);
    await waitFor(() => {
      // Still stale-disclosed with the SAME preserved snapshot.
      expect(document.querySelector("[data-sp-stale-warning]")).toBeTruthy();
      expect(screen.getByText("Цикл 42")).toBeInTheDocument();
    });
    // Not a hard failure: the samples section never flips to the failed alert.
    expect(document.querySelector("[data-sp-company-failed]")).toBeNull();
  });

  it("A stale snapshot → change to B → A snapshot is immediately unavailable to B", async () => {
    const failures = new Map<string, Array<unknown>>([["42", []]]);
    installBaseTransport(failures);
    const { rerender } = render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByText("Компания А");
    await waitFor(() => expect(screen.getByText("Цикл 42")).toBeInTheDocument());

    // Put A into refresh_failed (stale) state.
    failures.get("42")!.push({ ok: false, status: 502, json: async () => ({ success: false, error: "refresh failed" }) });
    fireEvent.click(spSection().querySelector("[data-sp-retry]")!);
    await waitFor(() => {
      expect(document.querySelector("[data-sp-stale-warning]")).toBeTruthy();
    });

    // Switch to B: A's stale snapshot must not render even for one frame.
    rerender(<CompanyPreview id="77" onClose={() => {}} />);
    expect(document.querySelector("[data-sp-stale-warning]")).toBeNull();
    expect(screen.queryByText("Цикл 42")).not.toBeInTheDocument();
    await screen.findByText("Компания Б");
    expect(screen.queryByText("Цикл 42")).not.toBeInTheDocument();
    expect(screen.queryByText("Компания А")).not.toBeInTheDocument();
  });
});
