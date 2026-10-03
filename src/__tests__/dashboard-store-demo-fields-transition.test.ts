// @vitest-environment jsdom
// src/__tests__/dashboard-store-demo-fields-transition.test.ts
// ─────────────────────────────────────────────────────────────────────
// Store-level regression (A.6 store part): a failed PRODUCTION fields fetch
// that transitions out of demo mode must NOT leave the stale DEMO field
// arrays standing in the store — array length > 0 must never be mistaken
// for successful production metadata provenance.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();

describe("dashboard-store fetchFields — demo→production transition truthfulness", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("failed production fetch after demo transition clears fields + dealTypeRegistry and discloses the error", async () => {
    const { useDashboardStore } = await import("@/store/dashboard-store");
    fetchMock.mockResolvedValue({ ok: false, status: 502 });

    const demoField = {
      id: "UF_CRM_DEMO_INDUSTRY",
      title: "Демо Отрасль",
      type: "enumeration",
      isMultiple: false,
      isSortable: false,
      listValues: [{ ID: "1739", VALUE: "ДЕМО-ОТРАСЛЬ" }],
    };
    useDashboardStore.setState({
      fields: [demoField],
      dealTypeRegistry: { SALE: "Демо тип" },
      isDemoMode: true,
      fieldsLoading: false,
      fieldsError: null,
    });

    await useDashboardStore.getState().fetchFields();

    const state = useDashboardStore.getState();
    // Demo arrays must not survive the failed production lookup: length > 0
    // is never production metadata provenance.
    expect(state.fields).toEqual([]);
    expect(state.dealTypeRegistry).toEqual({});
    expect(state.isDemoMode).toBe(false);
    expect(state.fieldsError).toBe("Failed to load fields");
    expect(state.fieldsCoverage?.status).toBe("PARTIAL");
  });

  it("failed production fetch WITHOUT a demo transition keeps prior production fields intact (refresh-failure semantics)", async () => {
    const { useDashboardStore } = await import("@/store/dashboard-store");
    fetchMock.mockResolvedValue({ ok: false, status: 502 });

    const productionField = { id: "TITLE", title: "Название", type: "string", isMultiple: false, isSortable: true } as const;
    useDashboardStore.setState({
      fields: [productionField],
      isDemoMode: false,
      fieldsLoading: false,
      fieldsError: null,
    });

    await useDashboardStore.getState().fetchFields();

    const state = useDashboardStore.getState();
    // Non-demo failure: previously loaded production data stays (failed
    // refresh must not destroy valid data); coverage discloses PARTIAL.
    expect(state.fields).toEqual([productionField]);
    expect(state.fieldsError).toBe("Failed to load fields");
    expect(state.fieldsCoverage?.status).toBe("PARTIAL");
  });
});
