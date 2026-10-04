// @vitest-environment jsdom
// src/__tests__/dashboard-store-demo-fields-transition.test.ts
// ─────────────────────────────────────────────────────────────────────
// Store-level regression (A.6 store part): a failed PRODUCTION fields fetch
// that transitions out of demo mode must NOT leave the stale DEMO field
// arrays standing in the store — array length > 0 must never be mistaken
// for successful production metadata provenance.
//
// Demo → production USER provenance truthfulness:
//  - leaving demo mode (fetchFields / fetchDeals) clears demo userNames +
//    usersCoverage (clearDemoLookupProvenance);
//  - a successful production /api/bitrix/users response REPLACES the
//    dictionary — demo names never merge into the production directory;
//  - a failed production users fetch after demo leaves NO authoritative
//    demo names and non-COMPLETE provenance.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useDashboardStore } from "@/store/dashboard-store";

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

describe("dashboard-store — demo→production user provenance transition", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setDemoUserState() {
    useDashboardStore.setState({
      userNames: { "7": "Демо Сотрудник", "55": "Демо Процессный" },
      usersCoverage: { status: "COMPLETE", fetched: 2, total: 2 },
      userNamesFromDemo: true,
      isDemoMode: true,
    });
  }

  it("fetchFields leaving demo mode clears demo userNames + usersCoverage (failed production response)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });
    setDemoUserState();

    await useDashboardStore.getState().fetchFields();

    const state = useDashboardStore.getState();
    expect(state.isDemoMode).toBe(false);
    // Demo names can never stand as an authoritative dictionary after the
    // demo→production transition — even when the production fetch FAILED.
    expect(state.userNames).toEqual({});
    expect(state.usersCoverage).toBeNull();
  });

  it("fetchFields leaving demo mode clears demo user provenance (successful production response)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith("/api/bitrix/fields")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            fields: [{ id: "TITLE", title: "Название", type: "string" }],
            dealTypes: { SALE: "Продажа" },
            coverage: { status: "COMPLETE", fetched: 1, total: 1 },
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
    setDemoUserState();

    await useDashboardStore.getState().fetchFields();

    const state = useDashboardStore.getState();
    expect(state.isDemoMode).toBe(false);
    expect(state.fields.length).toBe(1);
    // Demo names cleared on the transition path — the production users
    // bootstrap starts from a clean, truthfully-empty directory.
    expect(state.userNames).toEqual({});
    expect(state.usersCoverage).toBeNull();
  });

  it("successful production /api/bitrix/users after demo REPLACES the dictionary (no demo names merge)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith("/api/bitrix/users")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            users: { "7": "Анна Производственная" },
            coverage: { status: "COMPLETE", fetched: 1, total: 1 },
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
    // Demo names standing with demo provenance (post-transition store
    // shape where the transition clear was NOT exercised — e.g. the demo
    // names were loaded while demo mode was still on and the marker set).
    useDashboardStore.setState({
      userNames: { "7": "Демо Сотрудник", "55": "Демо Процессный" },
      usersCoverage: { status: "COMPLETE", fetched: 2, total: 2 },
      userNamesFromDemo: true,
      isDemoMode: false,
    });

    await useDashboardStore.getState().fetchUserNames();

    const state = useDashboardStore.getState();
    // The production directory REPLACED the demo dictionary: the production
    // value for user 7 wins and demo-only user 55 is gone.
    expect(state.userNames["7"]).toBe("Анна Производственная");
    expect(state.userNames["55"]).toBeUndefined();
    expect(state.usersCoverage?.status).toBe("COMPLETE");
  });

  it("failed production users fetch after demo leaves no authoritative demo names + non-COMPLETE provenance", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith("/api/bitrix/users")) {
        return Promise.resolve({ ok: false, status: 502 });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
    setDemoUserState();

    // Accepted transition path: leaving demo mode clears demo user
    // provenance (isDemoMode false — no demo branch can re-run), THEN the
    // production users fetch is attempted and FAILS.
    useDashboardStore.getState().clearDemoLookupProvenance();
    useDashboardStore.setState({ isDemoMode: false });
    await useDashboardStore.getState().fetchUserNames();

    const state = useDashboardStore.getState();
    expect(state.userNames).toEqual({});
    expect(state.usersCoverage?.status).not.toBe("COMPLETE");
  });

  it("fetchDeals success leaving demo mode clears demo user provenance before the non-blocking users fetch", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith("/api/bitrix/deals")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            deals: [{ ID: "1", TITLE: "Сделка", ASSIGNED_BY_ID: "7", STAGE_ID: "NEW", OPPORTUNITY: 100, CURRENCY_ID: "RUB", COMPANY_ID: "42", DATE_CREATE: "2026-01-01T00:00:00Z", DATE_MODIFY: "2026-01-01T00:00:00Z" }],
            total: 1,
          }),
        });
      }
      if (String(url).endsWith("/api/bitrix/users")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            users: { "7": "Анна Производственная" },
            coverage: { status: "COMPLETE", fetched: 1, total: 1 },
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });
    setDemoUserState();

    await useDashboardStore.getState().fetchDeals({ skipRelated: false });
    // The related users fetch is non-blocking: await it deterministically
    // (its promise resolves when the directory transition completes).
    await useDashboardStore.getState().fetchUserNames();

    const state = useDashboardStore.getState();
    expect(state.isDemoMode).toBe(false);
    // Production users REPLACED demo names (cleared before the users fetch
    // ran) — demo-only entries cannot survive into the directory.
    expect(state.userNames["7"]).toBe("Анна Производственная");
    expect(state.userNames["55"]).toBeUndefined();
    expect(state.usersCoverage?.status).toBe("COMPLETE");
  });
});
