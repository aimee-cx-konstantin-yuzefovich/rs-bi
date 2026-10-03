// @vitest-environment jsdom
// src/__tests__/company-preview-lookup-bootstrap.test.tsx
// ─────────────────────────────────────────────────────────────────────
// CompanyPreview lookup bootstrap + independent metadata-source states:
//  A.1 fields fetch fails → exactly ONE automatic attempt, no request loop;
//  A.2 users fetch fails → exactly ONE automatic attempt, no request loop;
//  A.3 explicit retry performs a second real request;
//  A.4 fields ready + users failed → fields resolve; user incompleteness
//      still disclosed (independent sources);
//  A.5 users ready + fields failed → user names resolve; enums stay safely
//      unclassified + field warning visible;
//  A.6 DEMO_FIELDS can never become authoritative for a real Company card
//      (failed production fetch after demo → no demo label resolution,
//      truthful warning), including the store-level transition cleanup.
// ─────────────────────────────────────────────────────────────────────
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { buildCompanyPreviewModel } from "@/lib/company-preview";
import {
  COMPANY_INDUSTRY_CURRENT_FIELD_ID,
} from "@/lib/crm-constants";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "principal-bootstrap" } }, status: "authenticated" }),
}));

const storeState = vi.hoisted(() => ({
  userNames: {} as Record<string, string>,
  usersCoverage: null as import("@/lib/dataset-coverage").DatasetCoverage | null,
  fields: [] as Array<{ id: string; title?: string; type?: string; listValues?: Array<{ ID: string; VALUE: string }> }>,
  fieldsCoverage: null as import("@/lib/dataset-coverage").DatasetCoverage | null,
  fieldsError: null as string | null,
  isDemoMode: false,
  allDeals: [] as Array<Record<string, unknown>>,
  dealsCoverage: null as import("@/lib/dataset-coverage").DatasetCoverage | null,
  selectedColumns: [] as string[],
  fieldsLoading: false,
  userNamesLoading: false,
  fetchFields: vi.fn(async () => {}),
  fetchUserNames: vi.fn(async () => {}),
}));

vi.mock("@/store/dashboard-store", () => {
  const useDashboardStore = (selector?: (s: typeof storeState) => unknown) =>
    selector ? selector(storeState) : storeState;
  (useDashboardStore as any).setState = () => {};
  return { useDashboardStore };
});

vi.mock("@/lib/export-utils", () => ({ exportCompanyToExcel: vi.fn() }));

const fetchMock = vi.fn();

const INDUSTRY_FIELD = COMPANY_INDUSTRY_CURRENT_FIELD_ID;

const companyPayload = {
  success: true,
  company: {
    ID: "42",
    TITLE: "Компания справочников",
    ASSIGNED_BY_ID: "7",
    COMPANY_TYPE: "1",
    [INDUSTRY_FIELD]: "1739",
    DATE_CREATE: "2025-01-10T10:00:00Z",
    DATE_MODIFY: "2026-06-01T10:00:00Z",
  },
  bitrixUrl: "https://portal.example/crm/company/details/42/",
};

const samplesPayload = {
  success: true,
  samples: [
    {
      companyId: "42",
      normalizedResult: "pending",
      dataIssues: [],
      sentDates: [],
      sampleIndicators: [],
      processStatuses: [],
      relatedDeals: [],
      smartProcessItems: [],
    },
  ],
};

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

function installBaseTransport() {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).endsWith("/api/bitrix/samples")) {
      return Promise.resolve(ok(samplesPayload));
    }
    if (/\/api\/bitrix\/companies\/42\/deals$/.test(String(url))) {
      return Promise.resolve(ok({ success: true, deals: [] }));
    }
    if (/\/api\/bitrix\/companies\/42$/.test(String(url))) {
      return Promise.resolve(ok(companyPayload));
    }
    return Promise.resolve(ok({ success: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  installBaseTransport();
  storeState.userNames = {};
  storeState.usersCoverage = null;
  storeState.fields = [];
  storeState.fieldsCoverage = null;
  storeState.fieldsError = null;
  storeState.isDemoMode = false;
  storeState.fieldsLoading = false;
  storeState.userNamesLoading = false;
  storeState.fetchFields = vi.fn(async () => {});
  storeState.fetchUserNames = vi.fn(async () => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("A. one-shot lookup bootstrap", () => {
  it("A.1: fields fetch fails → exactly one automatic attempt, no request loop", async () => {
    const { rerender } = render(<CompanyPreview id="42" onClose={() => {}} />);

    await screen.findByText("Компания справочников");
    // Bootstrap fired exactly once per source on mount.
    await waitFor(() => expect(storeState.fetchFields).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(storeState.fetchUserNames).toHaveBeenCalledTimes(1));

    // Simulate the failed store outcome (loading=false, data still empty,
    // error disclosed) and re-render repeatedly — the pre-fix effect re-fetched
    // forever on exactly this shape; the one-shot guard must not.
    await act(async () => {
      storeState.fieldsError = "Failed to load fields";
      storeState.fieldsLoading = false;
      rerender(<CompanyPreview id="42" onClose={() => {}} />);
    });
    await act(async () => {
      rerender(<CompanyPreview id="42" onClose={() => {}} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
      rerender(<CompanyPreview id="42" onClose={() => {}} />);
    });
    expect(storeState.fetchFields).toHaveBeenCalledTimes(1);
    expect(storeState.fetchUserNames).toHaveBeenCalledTimes(1);

    // Field failure disclosed truthfully.
    const disclosure = document.querySelector('[data-metadata-source="fields"]');
    expect(disclosure).toBeTruthy();
    expect(disclosure!.getAttribute("data-metadata-state")).toBe("failed");
  });

  it("A.2: users fetch fails → exactly one automatic attempt, no request loop", async () => {
    const { rerender } = render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByText("Компания справочников");
    await waitFor(() => expect(storeState.fetchUserNames).toHaveBeenCalledTimes(1));

    // Failed user outcome: coverage PARTIAL fetched 0, still empty names —
    // repeated re-renders must never re-attempt automatically.
    await act(async () => {
      storeState.usersCoverage = { status: "PARTIAL", fetched: 0, warning: "Не удалось загрузить справочник сотрудников." };
      storeState.userNamesLoading = false;
      rerender(<CompanyPreview id="42" onClose={() => {}} />);
    });
    await act(async () => {
      rerender(<CompanyPreview id="42" onClose={() => {}} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
      rerender(<CompanyPreview id="42" onClose={() => {}} />);
    });
    expect(storeState.fetchUserNames).toHaveBeenCalledTimes(1);
    expect(storeState.fetchFields).toHaveBeenCalledTimes(1);

    const disclosure = document.querySelector('[data-metadata-source="users"]');
    expect(disclosure).toBeTruthy();
    expect(disclosure!.getAttribute("data-metadata-state")).toBe("failed");
  });

  it("A.3: explicit retry performs a second real request (automatic loop never re-fires)", async () => {
    const { rerender } = render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByText("Компания справочников");
    await waitFor(() => expect(storeState.fetchFields).toHaveBeenCalledTimes(1));

    // Failure state → per-source disclosure with retry appears.
    await act(async () => {
      storeState.fieldsError = "Failed to load fields";
      rerender(<CompanyPreview id="42" onClose={() => {}} />);
    });
    const retry = document.querySelector('[data-metadata-retry="fields"]')!;
    expect(retry).toBeTruthy();
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(storeState.fetchFields).toHaveBeenCalledTimes(2);
    // Still no automatic third attempt afterwards.
    await act(async () => {
      rerender(<CompanyPreview id="42" onClose={() => {}} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(storeState.fetchFields).toHaveBeenCalledTimes(2);
  });

  it("A.4: fields ready + users failed → field labels resolve, user incompleteness disclosed, NO field warning", async () => {
    // Pre-warm fields (valid shared lookup), users failed.
    storeState.fields = [
      {
        id: INDUSTRY_FIELD,
        title: "Отрасль (согл. список)",
        type: "enumeration",
        listValues: [{ ID: "1739", VALUE: "Химия" }],
      },
    ];
    storeState.fieldsCoverage = { status: "COMPLETE", fetched: 1, total: 1 };
    storeState.usersCoverage = { status: "PARTIAL", fetched: 0, warning: "Не удалось загрузить справочник сотрудников." };

    render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByText("Компания справочников");

    // Field metadata resolves the known enum label.
    expect(await screen.findByText("Химия")).toBeInTheDocument();
    // User directory failure IS disclosed (never hidden by field success).
    const userDisclosure = document.querySelector('[data-metadata-source="users"]');
    expect(userDisclosure).toBeTruthy();
    expect(userDisclosure!.getAttribute("data-metadata-state")).toBe("failed");
    // No field warning: fields are complete.
    expect(document.querySelector('[data-metadata-source="fields"]')).toBeNull();
    // No raw IDs.
    expect(screen.queryByText("1739")).not.toBeInTheDocument();
  });

  it("A.5: users ready + fields failed → user names resolve, enums stay unclassified + field warning", async () => {
    storeState.userNames = { "7": "Анна Иванова" };
    storeState.usersCoverage = { status: "COMPLETE", fetched: 1, total: 1 };
    storeState.fieldsError = "Failed to load fields";

    render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByText("Компания справочников");

    // User names resolve through the independent user-directory state.
    expect(await screen.findByText("Анна Иванова")).toBeInTheDocument();
    // Enum values cannot resolve → canonical unclassified label (raw ID never leaks).
    expect(await screen.findAllByText("Не классифицировано")).not.toHaveLength(0);
    expect(screen.queryByText("1739")).not.toBeInTheDocument();
    // Field failure IS disclosed (never hidden by user success).
    const fieldDisclosure = document.querySelector('[data-metadata-source="fields"]');
    expect(fieldDisclosure).toBeTruthy();
    expect(fieldDisclosure!.getAttribute("data-metadata-state")).toBe("failed");
    expect(document.querySelector('[data-metadata-source="users"]')).toBeNull();
  });

  it("A.6: DEMO_FIELDS cannot become authoritative for a real Company card", async () => {
    // Simulate the store holding DEMO field dictionaries with demo
    // provenance (isDemoMode=true → state derivation = failed).
    storeState.fields = [
      {
        id: INDUSTRY_FIELD,
        title: "Демо Отрасль",
        type: "enumeration",
        listValues: [{ ID: "1739", VALUE: "ДЕМО-ОТРАСЛЬ" }],
      },
    ];
    storeState.isDemoMode = true;

    render(<CompanyPreview id="42" onClose={() => {}} />);
    await screen.findByText("Компания справочников");

    // Real Company enum ID 1739 must NOT resolve via the demo dictionary.
    expect((await screen.findAllByText("Не классифицировано")).length).toBeGreaterThan(0);
    expect(screen.queryByText("ДЕМО-ОТРАСЛЬ")).not.toBeInTheDocument();
    expect(screen.queryByText("1739")).not.toBeInTheDocument();
    // Truthful metadata warning remains visible.
    const fieldDisclosure = document.querySelector('[data-metadata-source="fields"]');
    expect(fieldDisclosure).toBeTruthy();
    expect(fieldDisclosure!.getAttribute("data-metadata-state")).toBe("failed");

    // Model-level proof: the drawer hands NO dictionary to the model in demo
    // mode (isDemoMode → fields: []), so even a failed state can never
    // resolve a real card's enum values against DEMO labels.
    const model = buildCompanyPreviewModel(
      { ID: "42", [INDUSTRY_FIELD]: "1739" },
      {
        fields: [],
        metadataState: "failed",
      }
    );
    const industry = model.fields.find((f) => f.id === INDUSTRY_FIELD);
    expect(industry?.value).toBe("Не классифицировано");
    // And the shared model contract: a partial state also never fabricates
    // labels for unknown IDs (raw IDs never leak through the model).
    const partialModel = buildCompanyPreviewModel(
      { ID: "42", [INDUSTRY_FIELD]: "1739" },
      { fields: [], metadataState: "partial" }
    );
    expect(partialModel.fields.find((f) => f.id === INDUSTRY_FIELD)?.value).toBe("Не классифицировано");
  });
});
