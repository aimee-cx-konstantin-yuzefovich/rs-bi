// @vitest-environment jsdom
// §8.14: ONE Deals table load → at most ONE bulk Smart Process UI load;
// concurrent consumers (Deal Preview, Company Preview) coalesce into the
// same in-flight request — never one request per Deal/row.
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardStore } from "@/store/dashboard-store";

const mockSession = vi.hoisted(() => ({
  status: "authenticated",
  userId: "principal-1",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: mockSession.userId } },
    status: mockSession.status,
  }),
}));

// Reset the module-level session cache between tests.
vi.mock("@/lib/samples/smart-process-client-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/samples/smart-process-client-cache")>();
  return {
    ...actual,
  };
});

import {
  clearSmartProcessCache,
} from "@/lib/samples/smart-process-client-cache";
import {
  useSmartProcessData,
} from "@/components/dashboard/samples/use-smart-process-data";

const fetchMock = vi.fn();

function SPProbe({ onState }: { onState?: (s: ReturnType<typeof useSmartProcessData>) => void }) {
  const sp = useSmartProcessData();
  onState?.(sp);
  return (
    <div>
      <span data-testid="sp-state">{sp.dataState}</span>
      <span data-testid="sp-count">{sp.items.length}</span>
    </div>
  );
}

const SP_SUCCESS_BODY = {
  success: true,
  items: [
    {
      processItemId: "9001",
      title: "Цикл 1",
      companyId: "10",
      linkedDealId: "505",
      stageId: "DT1032_15:CLIENT",
      stageLabel: "Образцы на испытании",
      isActive: true,
      isTerminal: false,
      sentDates: ["2026-03-10"],
      grades: [],
      quantities: [],
      normalizedResult: "pending",
      dataIssues: [],
    },
  ],
  byDealId: { "505": [] },
  byCompanyId: { "10": [] },
  stageDirectoryAvailable: true,
  total: 1,
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  clearSmartProcessCache();
  useDashboardStore.setState({
    allDeals: [],
    deals: [],
    dealsLoading: false,
    dealsError: null,
    selectedColumns: ["TITLE", "SP_STAGE"],
    dateFilter: { preset: "all" },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  clearSmartProcessCache();
});

describe("Smart Process bulk loading — coalescing (§8.14)", () => {
  it("three concurrent hook consumers → exactly ONE /api/bitrix/smart-process-items request", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/bitrix/smart-process-items")) {
        return new Response(JSON.stringify(SP_SUCCESS_BODY), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const states: Array<ReturnType<typeof useSmartProcessData>> = [];
    render(
      <div>
        <SPProbe onState={(s) => states.push(s)} />
        <SPProbe />
        <SPProbe />
      </div>
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("sp-state")[0].textContent).toBe("ready");
    });

    const spCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes("/api/bitrix/smart-process-items")
    );
    expect(spCalls).toHaveLength(1);
    expect(screen.getAllByTestId("sp-count")[0].textContent).toBe("1");
  });

  it("failed initial load is explicit (failed state), retry performs a REAL new request", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/bitrix/smart-process-items")) {
        const force = JSON.parse(String(init?.body ?? "{}"));
        // Every load in this test is forced via reload() after the first failure.
        if (force.__fail) {
          return new Response(JSON.stringify({ error: "upstream down" }), { status: 502 });
        }
        return new Response(JSON.stringify(SP_SUCCESS_BODY), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    // First call fails.
    fetchMock.mockImplementationOnce(async (url: string) => {
      if (url.includes("/api/bitrix/smart-process-items")) {
        return new Response(JSON.stringify({ error: "upstream down" }), { status: 502 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/bitrix/smart-process-items")) {
        return new Response(JSON.stringify(SP_SUCCESS_BODY), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    let latest!: ReturnType<typeof useSmartProcessData>;
    render(<SPProbe onState={(s) => (latest = s)} />);

    await waitFor(() => {
      expect(latest.dataState).toBe("failed");
      expect(latest.error).toBeTruthy();
    });

    const callsAfterFailure = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes("/api/bitrix/smart-process-items")
    ).length;
    expect(callsAfterFailure).toBe(1);

    // Retry performs a REAL request.
    latest.reload();
    await waitFor(() => {
      expect(latest.dataState).toBe("ready");
    });
    const callsAfterRetry = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes("/api/bitrix/smart-process-items")
    ).length;
    expect(callsAfterRetry).toBe(2);
  });

  it("successful EMPTY dataset is a truthful ready empty result (not failed, not loading)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/bitrix/smart-process-items")) {
        return new Response(
          JSON.stringify({
            success: true,
            items: [],
            byDealId: {},
            byCompanyId: {},
            stageDirectoryAvailable: true,
            total: 0,
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    let latest!: ReturnType<typeof useSmartProcessData>;
    render(<SPProbe onState={(s) => (latest = s)} />);

    await waitFor(() => {
      expect(latest.dataState).toBe("ready");
      expect(latest.items).toHaveLength(0);
      expect(latest.error).toBeNull();
    });
  });

  it("failed refresh PRESERVES the prior snapshot with stale disclosure", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/bitrix/smart-process-items")) {
        return new Response(JSON.stringify(SP_SUCCESS_BODY), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    let latest!: ReturnType<typeof useSmartProcessData>;
    render(<SPProbe onState={(s) => (latest = s)} />);

    await waitFor(() => {
      expect(latest.dataState).toBe("ready");
      expect(latest.items).toHaveLength(1);
    });
    const firstLoadedAt = latest.loadedAt;
    const firstItems = latest.items;

    // Refresh fails now.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/bitrix/smart-process-items")) {
        return new Response(JSON.stringify({ error: "upstream down" }), { status: 502 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    latest.reload();
    await waitFor(() => {
      expect(latest.dataState).toBe("refresh_failed");
    });
    // Snapshot preserved.
    expect(latest.items).toHaveLength(1);
    expect(latest.items[0].processItemId).toBe(firstItems[0].processItemId);
    expect(latest.loadedAt).toBe(firstLoadedAt);
    expect(latest.isStale).toBe(true);
    expect(latest.refreshError).toBeTruthy();
  });
});
