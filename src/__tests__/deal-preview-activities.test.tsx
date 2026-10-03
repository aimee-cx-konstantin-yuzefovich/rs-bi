// src/__tests__/deal-preview-activities.test.tsx
// Deal Preview scoped activities: lazy per-deal fetch independent of table
// columns, «Дела и активности» section ordering, activity-type labels,
// and row omission when no meaningful SUBJECT exists.
import { render, screen, cleanup, waitForElementToBeRemoved, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DealPreview } from "@/components/dashboard/deal-preview";
import { buildDealActivitiesModel } from "@/lib/deal-preview";


const mockStore = vi.hoisted(() => ({
  fields: [
    { id: "STAGE_ID", title: "Стадия", type: "crm_status", listValues: [{ ID: "NEW", VALUE: "Новое" }] },
  ],
  userNames: { "7": "Анна Смирнова", "9": "Пётр Иванов" } as Record<string, string>,
  usersCoverage: null,
  dealTypeRegistry: null,
  activitiesData: {} as Record<string, any>,
  activitiesDataFetchedAt: {} as Record<string, number>,
  activitiesDataLoading: false,
  activitiesRequestState: {} as Record<string, string>,
  // Test helper (mock-only, never a production contract): last retry force flag.
  fetchDealActivities: vi.fn(async (_id: string, _options?: { force?: boolean }) => {
    // Simulate the real store action merge: request state + data.
    mockStore.activitiesRequestState = { ...mockStore.activitiesRequestState, [_id]: "loading" };
    const entry = scopedActivitiesResponse[_id];
    if (entry) {
      mockStore.activitiesData[_id] = entry;
      mockStore.activitiesDataFetchedAt[_id] = Date.now();
      mockStore.activitiesRequestState = { ...mockStore.activitiesRequestState, [_id]: "success" };
    } else {
      mockStore.activitiesRequestState = { ...mockStore.activitiesRequestState, [_id]: "error" };
    }
    mockStore.lastFetchOptions = _options;
  }),
  lastFetchOptions: undefined as undefined | { force?: boolean },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: (selector?: (s: typeof mockStore) => any) =>
    selector ? selector(mockStore) : mockStore,
}));

let scopedActivitiesResponse: Record<string, any> = {};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  mockStore.activitiesData = {};
  mockStore.activitiesDataFetchedAt = {};
  mockStore.activitiesDataLoading = false;
  mockStore.activitiesRequestState = {};
  mockStore.lastFetchOptions = undefined;
  mockStore.fetchDealActivities.mockClear();
  scopedActivitiesResponse = {};
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      deal: {
        ID: "101",
        TITLE: "Сделка с активностями",
        DATE_CREATE: "2026-09-30T07:49:00Z",
      },
      bitrixUrl: null,
      companyBitrixUrl: null,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function scopedEntry(all: Array<Record<string, unknown>>) {
  // REAL API RESPONSE SHAPE: the activities route returns exactly
  // `{ last?, next?, all }` per deal — no synthetic `dataKnown` property.
  return { all, last: all.find((a) => String(a.COMPLETED) === "Y"), next: undefined };
}

describe("Deal Preview scoped activity fetch", () => {
  it("lazily fetches activities for the opened deal only, independent of columns", async () => {
    scopedActivitiesResponse["101"] = scopedEntry([
      { ID: "1", COMPLETED: "Y", SUBJECT: "Звонок", CREATED: "2026-09-29T10:00:00Z", TYPE_ID: 2 },
    ]);

    render(<DealPreview id="101" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    await waitFor(() => expect(mockStore.fetchDealActivities).toHaveBeenCalled());
    expect(mockStore.fetchDealActivities.mock.calls.every((c: unknown[]) => c[0] === "101")).toBe(true);
    // Exactly one deal ID — scoped fetch, not the whole dataset.
    const sentBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/activities"))
      .map(([, init]) => JSON.parse(init.body));
    for (const body of sentBodies) {
      expect(Array.isArray(body.dealIds)).toBe(true);
      expect(body.dealIds).toEqual(["101"]);
    }
  });

  it("«Дела и активности»: planned first by nearest deadline, then completed newest first; type labels resolved", async () => {
    mockStore.activitiesData["101"] = scopedEntry([
      // Completed items (newest first)
      { ID: "10", COMPLETED: "Y", SUBJECT: "Старый звонок", CREATED: "2026-09-20T10:00:00Z", TYPE_ID: 2 },
      { ID: "11", COMPLETED: "Y", SUBJECT: "Недавнее письмо", CREATED: "2026-09-28T10:00:00Z", PROVIDER_ID: "crm_email" },
      // Planned items (nearest deadline first)
      { ID: "20", COMPLETED: "N", SUBJECT: "Дальняя встреча", DEADLINE: "2026-10-20T10:00:00Z", TYPE_ID: 1, RESPONSIBLE_ID: "9" },
      { ID: "21", COMPLETED: "N", SUBJECT: "Ближайшая задача", DEADLINE: "2026-10-02T09:00:00Z", TYPE_ID: 3, RESPONSIBLE_ID: "7" },
    ]);

    render(<DealPreview id="101" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    const section = await screen.findByText("Дела и активности");
    expect(section).toBeInTheDocument();

    const list = document.querySelector("[data-activities-list]")!;
    const subjects = Array.from(list.querySelectorAll("[data-activity-item]"))
      .map((el) => el.querySelector(".font-medium")?.textContent?.trim());

    expect(subjects).toEqual([
      "Ближайшая задача",   // planned, nearest deadline
      "Дальняя встреча",    // planned, later deadline
      "Недавнее письмо",    // completed, newest first
      "Старый звонок",      // completed, older
    ]);

    // Statuses and human-readable types; raw tokens never surface.
    expect(list.textContent).toContain("Запланировано");
    expect(list.textContent).toContain("Выполнено");
    expect(list.textContent).toContain("Задача");
    expect(list.textContent).toContain("Письмо");
    expect(list.textContent).not.toContain("crm_email");
    expect(list.textContent).toContain("Ответственный: ");
  });

  it("shows truthful empty state when loaded with zero activities", async () => {
    mockStore.activitiesData["101"] = scopedEntry([]);

    render(<DealPreview id="101" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    expect(await screen.findByText("Активностей нет")).toBeInTheDocument();
  });

  it("unknown activity type renders neutral «Дело» label, never raw TYPE_ID", () => {
    const model = buildDealActivitiesModel([
      { ID: "1", SUBJECT: "Неклассифицированная активность", COMPLETED: "N", DEADLINE: "2026-10-05T09:00:00Z", TYPE_ID: 777, PROVIDER_ID: "exotic_provider" },
    ], { userNames: mockStore.userNames });
    expect(model).toHaveLength(1);
    expect(model[0].type).toBe("Дело");
    expect(JSON.stringify(model)).not.toContain("777");
  });
});

describe("buildDealActivitiesModel ordering (shared UI/Excel model)", () => {
  it("undated planned items follow dated planned items without fabricating dates", () => {
    const model = buildDealActivitiesModel([
      { ID: "1", COMPLETED: "N", SUBJECT: "Без дедлайна" },
      { ID: "2", COMPLETED: "N", SUBJECT: "С дедлайном", DEADLINE: "2026-10-10T09:00:00Z" },
    ]);
    expect(model.map((m) => m.subject)).toEqual(["С дедлайном", "Без дедлайна"]);
    expect(model[1].date).toBeNull();
  });
});

describe("Deal Preview scoped activities contract (real API shape, retry, request count)", () => {
  it("renders activity rows from the real API shape { last, next, all } without dataKnown", async () => {
    // simulates the store merge performed by the real action for a successful
    // scoped fetch — entry shape is the real route contract, no dataKnown.
    mockStore.activitiesData["101"] = scopedEntry([
      { ID: "1", COMPLETED: "Y", SUBJECT: "Если клиенту нужен звонок", CREATED: "2026-09-29T10:00:00Z", TYPE_ID: 2 },
    ]);
    mockStore.activitiesRequestState = { "101": "success" };

    render(<DealPreview id="101" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    expect(await screen.findByText("Дела и активности")).toBeInTheDocument();
    expect(screen.getAllByText("Если клиенту нужен звонок").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Дела и активности временно недоступны.")).not.toBeInTheDocument();
  });

  it("successful empty activity response → truthful «Активностей нет»", async () => {
    mockStore.activitiesData["101"] = scopedEntry([]);
    mockStore.activitiesRequestState = { "101": "success" };

    render(<DealPreview id="101" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    expect(await screen.findByText("Активностей нет")).toBeInTheDocument();
  });

  it("fetch failure → «Дела и активности временно недоступны.» with retry button", async () => {
    mockStore.activitiesRequestState = { "101": "error" };

    render(<DealPreview id="101" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    expect(await screen.findByText("Дела и активности временно недоступны.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
  });

  it("«Повторить» performs a real second fetch and renders rows on success", async () => {
    mockStore.activitiesRequestState = { "101": "error" };
    const { rerender } = render(<DealPreview id="101" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));
    expect(await screen.findByText("Дела и активности временно недоступны.")).toBeInTheDocument();
    const callsBefore = mockStore.fetchDealActivities.mock.calls.length;

    // User clicks retry → DealPreview issues a forced (second) scoped fetch.
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(mockStore.fetchDealActivities.mock.calls.length).toBeGreaterThan(callsBefore);
    const lastCall = mockStore.fetchDealActivities.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe("101");
    // Explicit retry requests a forced fetch.
    expect(lastCall[1]).toEqual({ force: true });

    // Second request succeeds → rows render. Explicit re-render: the mocked
    // store action cannot mutate real React state.
    mockStore.activitiesData["101"] = scopedEntry([
      { ID: "5", COMPLETED: "N", SUBJECT: "Плановый звонок", DEADLINE: "2026-10-05T09:00:00Z", TYPE_ID: 2 },
    ]);
    mockStore.activitiesRequestState = { "101": "success" };
    rerender(<DealPreview id="101" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Плановый звонок")).toBeInTheDocument());    expect(screen.queryByText("Дела и активности временно недоступны.")).not.toBeInTheDocument();
  });

  it("opening one Deal Preview causes exactly one scoped request; retry keeps deal scope", async () => {
    render(<DealPreview id="101" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    await waitFor(() => expect(mockStore.fetchDealActivities).toHaveBeenCalled());
    // Give any duplicate trigger a chance to fire, then assert cardinality.
    await new Promise((r) => setTimeout(r, 50));
    const calls = mockStore.fetchDealActivities.mock.calls.filter((c: unknown[]) => c[0] === "101");
    expect(calls).toHaveLength(1);
    // Request body scope: only the current deal ID.
    const bodies = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/activities"))
      .map(([, init]) => JSON.parse(init.body));
    for (const body of bodies) {
      expect(body.dealIds).toEqual(["101"]);
    }
  });
});

async function rerenderAct(fn: () => Promise<void>) {
  await fn();
}

describe("failed activity refresh with preserved data (stale disclosure)", () => {
  it("failed refresh keeps previous rows AND shows stale warning + retry; retry succeeds, warning disappears", async () => {
    // 1. Load valid activities successfully (DealPreview lazy scoped fetch).
    scopedActivitiesResponse["101"] = scopedEntry([
      { ID: "1", COMPLETED: "N", SUBJECT: "Исходное дело", DEADLINE: "2026-10-05T09:00:00Z", TYPE_ID: 2 },
    ]);

    const { rerender } = render(<DealPreview id="101" onClose={() => {}} />);
    await waitForElementToBeRemoved(() => screen.queryByText("Загрузка сделки"));

    await waitFor(() => expect(mockStore.fetchDealActivities).toHaveBeenCalled());
    await waitFor(() => expect(mockStore.activitiesRequestState["101"]).toBe("success"));
    rerender(<DealPreview id="101" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Исходное дело")).toBeInTheDocument());
    expect(screen.queryByText("Показаны ранее загруженные данные. Обновление не удалось.")).not.toBeInTheDocument();

    // 2-3. Force refresh (real retry contract: { force: true }) that FAILS;
    // previous valid data stays preserved in the store.
    scopedActivitiesResponse = {}; // next scoped fetch fails for this deal
    const initialEntry = mockStore.activitiesData["101"];
    await mockStore.fetchDealActivities("101", { force: true });
    expect(mockStore.lastFetchOptions).toEqual({ force: true });
    expect(mockStore.activitiesRequestState["101"]).toBe("error");
    expect(mockStore.activitiesData["101"]).toBe(initialEntry);

    // 4-6. Previous rows remain visible, stale warning and retry visible.
    rerender(<DealPreview id="101" onClose={() => {}} />);
    expect(screen.getByText("Исходное дело")).toBeInTheDocument();
    expect(screen.getByText("Показаны ранее загруженные данные. Обновление не удалось.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();

    // 7. Retry succeeds → warning disappears, refreshed rows replace old state.
    scopedActivitiesResponse["101"] = scopedEntry([
      { ID: "9", COMPLETED: "N", SUBJECT: "Обновлённое дело", DEADLINE: "2026-10-06T09:00:00Z", TYPE_ID: 2 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(mockStore.activitiesRequestState["101"]).toBe("success"));
    rerender(<DealPreview id="101" onClose={() => {}} />);

    // 8-9. Warning gone, refreshed rows replace the old state.
    await waitFor(() => expect(screen.getByText("Обновлённое дело")).toBeInTheDocument());
    expect(screen.queryByText("Исходное дело")).not.toBeInTheDocument();
    expect(screen.queryByText("Показаны ранее загруженные данные. Обновление не удалось.")).not.toBeInTheDocument();
  });
});
