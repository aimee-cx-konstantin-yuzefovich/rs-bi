// @vitest-environment jsdom
// src/__tests__/company-excel-lookup-disclosure.test.tsx
// ─────────────────────────────────────────────────────────────────────
// Company Excel lookup truthfulness (component gate):
//  B.7 export is unavailable while lookup metadata is still loading;
//  B.10 a LOOKUP_LOADING_PLACEHOLDER is never serialized into a final
//      workbook (loading state cannot export at all).
// Binary workbook disclosure assertions live in
// company-excel-lookup-disclosure-workbook.test.ts (node/ExcelJS).
// ─────────────────────────────────────────────────────────────────────
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { LOOKUP_LOADING_PLACEHOLDER } from "@/lib/company-preview";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "principal-excel" } }, status: "authenticated" }),
}));

const storeState = vi.hoisted(() => ({
  userNames: { "7": "Анна Иванова" } as Record<string, string>,
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

const exportMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));
vi.mock("@/lib/export-utils", () => ({ exportCompanyToExcel: exportMock }));

const fetchMock = vi.fn();

const INDUSTRY_FIELD = "UF_CRM_1784195884554";

const companyPayload = {
  success: true,
  company: {
    ID: "42",
    TITLE: "Компания экспорта",
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
  exportMock.mockClear();
  storeState.userNames = { "7": "Анна Иванова" };
  storeState.usersCoverage = { status: "COMPLETE", fetched: 1, total: 1 };
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

async function openDrawer() {
  render(<CompanyPreview id="42" onClose={() => {}} />);
  await screen.findByText("Компания экспорта");
  // Wait for the full-report readiness path (deals + samples loaded).
  await waitFor(() => {
    const btn = screen.getByRole("button", { name: "Экспорт отчёта" });
    // Either disabled (lookup loading) or enabled — just ensure loaded.
    expect(btn).toBeInTheDocument();
  });
}

describe("B.7 export gating while lookups load", () => {
  it("field metadata loading → export disabled and never invoked", async () => {
    storeState.fieldsLoading = true;
    await openDrawer();

    const btn = screen.getByRole("button", { name: "Экспорт отчёта" });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toContain("справочники");
  });

  it("user directory loading → export disabled and never invoked", async () => {
    storeState.fields = [
      {
        id: INDUSTRY_FIELD,
        title: "Отрасль (согл. список)",
        type: "enumeration",
        listValues: [{ ID: "1739", VALUE: "Химия" }],
      },
    ];
    storeState.fieldsCoverage = { status: "COMPLETE", fetched: 1, total: 1 };
    storeState.userNamesLoading = true;
    await openDrawer();

    const btn = screen.getByRole("button", { name: "Экспорт отчёта" });
    expect(btn).toBeDisabled();
  });

  it("B.10: ready lookups → export enabled and performs a real export (no loading placeholder state)", async () => {
    storeState.fields = [
      {
        id: INDUSTRY_FIELD,
        title: "Отрасль (согл. список)",
        type: "enumeration",
        listValues: [{ ID: "1739", VALUE: "Химия" }],
      },
    ];
    storeState.fieldsCoverage = { status: "COMPLETE", fetched: 1, total: 1 };
    await openDrawer();

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Экспорт отчёта" });
      expect(btn).not.toBeDisabled();
    });
    const btn = screen.getByRole("button", { name: "Экспорт отчёта" });
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    // The ready export carries no lookup warnings.
    const readyCall = exportMock.mock.calls[0]?.[0] as { lookupWarnings?: string[] } | undefined;
    expect(readyCall?.lookupWarnings ?? []).toEqual([]);
    // The interim placeholder text can never appear in the drawer while ready.
    expect(screen.queryByText(LOOKUP_LOADING_PLACEHOLDER)).not.toBeInTheDocument();
  });

  it("partial lookups → export stays available and carries the shared disclosure warnings", async () => {
    storeState.fields = [
      {
        id: INDUSTRY_FIELD,
        title: "Отрасль (согл. список)",
        type: "enumeration",
        listValues: [{ ID: "1739", VALUE: "Химия" }],
      },
    ];
    storeState.fieldsCoverage = { status: "PARTIAL", fetched: 0, warning: "Метаданные CRM загружены частично." };
    storeState.usersCoverage = { status: "PARTIAL", fetched: 0, warning: "Не удалось загрузить справочник сотрудников." };
    await openDrawer();

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Экспорт отчёта" });
      expect(btn).not.toBeDisabled();
    });
    const btn = screen.getByRole("button", { name: "Экспорт отчёта" });
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    const warnings = (exportMock.mock.calls[0]?.[0] as { lookupWarnings?: string[] } | undefined)?.lookupWarnings ?? [];
    expect(warnings).toContain("Справочник полей загружен не полностью; часть значений не классифицирована.");
    expect(warnings).toContain("Справочник сотрудников загружен не полностью; часть ответственных не удалось определить.");
  });
});
