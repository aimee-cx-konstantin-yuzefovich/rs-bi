// @vitest-environment jsdom
// §8.15 + §8.16: Deal Preview renders ALL exact linked SP items with
// truthful states; Company Preview renders correct counts and all company
// cycles with NO relation-conflict leakage.
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSession = vi.hoisted(() => ({
  status: "authenticated",
  userId: "principal-preview",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: mockSession.userId } },
    status: mockSession.status,
  }),
}));

vi.mock("@/store/dashboard-store", () => {
  const state = {
    userNames: { "7": "Анна Смирнова" } as Record<string, string>,
    usersCoverage: null,
    allDeals: [
      { ID: "505", TITLE: "Поставка партии", COMPANY_ID: "10" },
      { ID: "506", TITLE: "Другая сделка", COMPANY_ID: "11" },
    ] as Array<Record<string, unknown>>,
    fields: [],
    dealTypeRegistry: null,
    activitiesData: {} as Record<string, unknown>,
    fieldsLoading: false,
    userNamesLoading: false,
    fetchFields: vi.fn(async () => {}),
    fetchUserNames: vi.fn(async () => {}),
  };
  const useDashboardStore = (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state;
  return { useDashboardStore };
});

import { DealPreview } from "@/components/dashboard/deal-preview";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { clearSmartProcessCache } from "@/lib/samples/smart-process-client-cache";

const fetchMock = vi.fn();

/** Extracts the JSON body of the most recent /api/bitrix/samples call. */
function mockBodyOfLastSamplesCall(): Record<string, unknown> {
  for (let i = fetchMock.mock.calls.length - 1; i >= 0; i--) {
    const [u, init] = fetchMock.mock.calls[i] as [unknown, { body?: string } | undefined];
    if (String(u).includes("/api/bitrix/samples")) {
      return JSON.parse(String(init?.body ?? "{}"));
    }
  }
  return {};
}

const SP_BODY = {
  success: true,
  stageDirectoryAvailable: true,
  items: [
    // Exact-linked to deal 505: active cycle
    {
      processItemId: "9001",
      title: "Цикл активный",
      companyId: "10",
      linkedDealId: "505",
      stageId: "DT1032_15:CLIENT",
      stageLabel: "Образцы на испытании",
      isActive: true,
      isTerminal: false,
      responsibleId: "7",
      sentDates: ["2026-03-10"],
      grades: [{ productFamily: "Гель", value: "Г10" }],
      quantities: [{ productFamily: "Гель", value: 5, unit: "кг" }],
      rawTestResult: "Соответствует",
      normalizedResult: "positive",
      dataIssues: [],
    },
    // Exact-linked to deal 505: terminal cycle
    {
      processItemId: "9002",
      title: "Цикл завершён",
      companyId: "10",
      linkedDealId: "505",
      stageId: "DT1032_15:SUCCESS",
      stageLabel: "Образец подошел",
      isActive: false,
      isTerminal: true,
      sentDates: ["2026-02-01"],
      grades: [],
      quantities: [],
      normalizedResult: "positive",
      dataIssues: [],
    },
    // Linked to a DIFFERENT deal — must NOT render in deal 505 preview
    {
      processItemId: "9003",
      title: "Чужой цикл",
      companyId: "11",
      linkedDealId: "506",
      stageId: "DT1032_15:NEW",
      stageLabel: "Подготовка к отправке",
      isActive: true,
      isTerminal: false,
      sentDates: [],
      grades: [],
      quantities: [],
      normalizedResult: "pending",
      dataIssues: [],
    },
    // Company-10 trustworthy cycles for the Company Preview
    // (9001 active + 9002 terminal + one company-only active cycle)
    {
      processItemId: "9004",
      title: "Без сделки",
      companyId: "10",
      stageId: "DT1032_15:UC_ZARRMX",
      stageLabel: "Образцы отправлены",
      isActive: true,
      isTerminal: false,
      sentDates: ["2026-03-20"],
      grades: [],
      quantities: [],
      normalizedResult: "pending",
      dataIssues: [],
    },
  ],
  byDealId: {
    "505": [
      {
        processItemId: "9001",
        title: "Цикл активный",
        companyId: "10",
        linkedDealId: "505",
        stageId: "DT1032_15:CLIENT",
        stageLabel: "Образцы на испытании",
        isActive: true,
        isTerminal: false,
        responsibleId: "7",
        sentDates: ["2026-03-10"],
        grades: [{ productFamily: "Гель", value: "Г10" }],
        quantities: [{ productFamily: "Гель", value: 5, unit: "кг" }],
        rawTestResult: "Соответствует",
        normalizedResult: "positive",
        dataIssues: [],
      },
      {
        processItemId: "9002",
        title: "Цикл завершён",
        companyId: "10",
        linkedDealId: "505",
        stageId: "DT1032_15:SUCCESS",
        stageLabel: "Образец подошел",
        isActive: false,
        isTerminal: true,
        sentDates: ["2026-02-01"],
        grades: [],
        quantities: [],
        normalizedResult: "positive",
        dataIssues: [],
      },
    ],
    "506": [],
  },
  byCompanyId: {
    // Trustworthy attribution only — conflict/orphan items never here.
    "10": [
      {
        processItemId: "9001",
        title: "Цикл активный",
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
      {
        processItemId: "9002",
        title: "Цикл завершён",
        companyId: "10",
        linkedDealId: "505",
        stageId: "DT1032_15:SUCCESS",
        stageLabel: "Образец подошел",
        isActive: false,
        isTerminal: true,
        sentDates: ["2026-02-01"],
        grades: [],
        quantities: [],
        normalizedResult: "positive",
        dataIssues: [],
      },
      {
        processItemId: "9004",
        title: "Без сделки",
        companyId: "10",
        stageId: "DT1032_15:UC_ZARRMX",
        stageLabel: "Образцы отправлены",
        isActive: true,
        isTerminal: false,
        sentDates: ["2026-03-20"],
        grades: [],
        quantities: [],
        normalizedResult: "pending",
        dataIssues: [],
      },
    ],
  },
  total: 4,
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  clearSmartProcessCache();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/api/bitrix/smart-process-items")) {
      return new Response(JSON.stringify(SP_BODY), { status: 200 });
    }
    if (url.includes("/api/bitrix/deals/")) {
      return new Response(
        JSON.stringify({
          success: true,
          deal: { ID: "505", TITLE: "Поставка партии", COMPANY_ID: "10", DATE_CREATE: "2026-09-30T07:49:00Z" },
          bitrixUrl: null,
          companyBitrixUrl: null,
        }),
        { status: 200 }
      );
    }
    if (url.includes("/api/bitrix/companies/")) {
      return new Response(
        JSON.stringify({
          success: true,
          company: { ID: "10", TITLE: "ООО Ромашка" },
          bitrixUrl: null,
        }),
        { status: 200 }
      );
    }
    if (url.includes("/api/bitrix/samples")) {
      // Company-scoped canonical Samples response embeds the trustworthy
      // Smart Process cycles for the requested company (Lite item views).
      // CompanyPreview fixtures only request company 10 / 99.
      let companyId = "";
      try {
        companyId = String(mockBodyOfLastSamplesCall().companyId ?? "");
      } catch { companyId = ""; }
      const items = companyId === "99" ? [] : SP_BODY.byCompanyId["10"];
      return new Response(
        JSON.stringify({
          success: true,
          samples: items.length > 0 ? [{ companyId, companyTitle: "ООО Ромашка", smartProcessItems: items, activeSmartProcessCount: items.filter((i) => i.isActive).length, currentActiveStageLabels: [] }] : [],
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  clearSmartProcessCache();
});

describe("Deal Preview — Тестирование образцов (§8.15)", () => {
  it("renders ALL exact linked items (active first, terminal later), excludes other-deal items", async () => {
    render(<DealPreview id="505" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getAllByText("Тестирование образцов").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getByText("Цикл активный")).toBeTruthy();
    });

    expect(screen.getByText("Цикл завершён")).toBeTruthy();
    // Different-deal cycle must NOT appear.
    expect(screen.queryByText("Чужой цикл")).toBeNull();

    // Active first, terminal later.
    const activePos = screen.getByText("Цикл активный").compareDocumentPosition(
      screen.getByText("Цикл завершён")
    );
    expect(activePos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Item details visible: live stage label, manual date, grades, result, responsible.
    expect(screen.getByText("Образцы на испытании")).toBeTruthy();
    expect(screen.getByText(/10\.03\.2026/)).toBeTruthy();
    expect(screen.getByText(/Соответствует/)).toBeTruthy();
    expect(screen.getByText(/Анна Смирнова/)).toBeTruthy();
  });

  it("truthful successful empty: Процессы тестирования не найдены", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/bitrix/smart-process-items")) {
        return new Response(
          JSON.stringify({ success: true, items: [], byDealId: {}, byCompanyId: {}, stageDirectoryAvailable: true, total: 0 }),
          { status: 200 }
        );
      }
      if (url.includes("/api/bitrix/deals/")) {
        return new Response(
          JSON.stringify({ success: true, deal: { ID: "777", TITLE: "X" }, bitrixUrl: null, companyBitrixUrl: null }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    render(<DealPreview id="777" onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Процессы тестирования не найдены")).toBeTruthy();
    });
  });

  it("initial failure → explicit unavailable + retry performs a real request", async () => {
    let failing = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/bitrix/smart-process-items")) {
        if (failing) return new Response(JSON.stringify({ error: "upstream down" }), { status: 502 });
        return new Response(JSON.stringify(SP_BODY), { status: 200 });
      }
      if (url.includes("/api/bitrix/deals/")) {
        return new Response(
          JSON.stringify({ success: true, deal: { ID: "505", TITLE: "X" }, bitrixUrl: null, companyBitrixUrl: null }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    render(<DealPreview id="505" onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Процессы тестирования временно недоступны.")).toBeTruthy();
    });

    failing = false;
    fireEvent.click(screen.getByText("Повторить"));

    await waitFor(() => {
      expect(screen.getByText("Цикл активный")).toBeTruthy();
    });
  });
});

describe("Company Preview — Циклы тестирования (§8.16)", () => {
  it("uses ONE company-scoped data path: correct active/terminal counts and ALL trustworthy company cycles; no conflict leakage; no bulk SP fetch", async () => {
    render(<CompanyPreview id="10" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Активных: 2 · Завершённых: 1/)).toBeTruthy();
    });

    // All three trustworthy cycles render (multiple active never collapsed).
    expect(screen.getByText("Цикл активный")).toBeTruthy();
    expect(screen.getByText("Цикл завершён")).toBeTruthy();
    expect(screen.getByText("Без сделки")).toBeTruthy();

    // Deal titles resolve client-side from the store (no extra fetch).
    // Two trustworthy cycles link to deal 505 → the title appears twice.
    expect(screen.getAllByText(/Поставка партии/).length).toBe(2);

    // THE one data path: the bulk smart-process-items endpoint is never
    // called by Company Preview — data arrives via /api/bitrix/samples.
    const spCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/bitrix/smart-process-items")
    );
    expect(spCalls).toHaveLength(0);
    const samplesCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/bitrix/samples")
    );
    expect(samplesCalls).toHaveLength(1);

    // Conflict/orphan items never leak into company aggregation (fixture
    // contains a foreign-company cycle that must not appear).
    expect(screen.queryByText("Чужой цикл")).toBeNull();
  });

  it("company without cycles → truthful empty disclosure", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/bitrix/samples")) {
        return new Response(
          JSON.stringify({ success: true, samples: [] }),
          { status: 200 }
        );
      }
      if (url.includes("/api/bitrix/companies/")) {
        return new Response(
          JSON.stringify({ success: true, company: { ID: "99", TITLE: "Y" }, bitrixUrl: null }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    render(<CompanyPreview id="99" onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Циклы тестирования не найдены")).toBeTruthy();
    });
  });

  it("initial Samples failure → explicit error + retry performs a real request; failure after success preserves prior cycles with stale disclosure", async () => {
    let failing = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/bitrix/samples")) {
        if (failing) return new Response(JSON.stringify({ error: "upstream down" }), { status: 502 });
        return new Response(
          JSON.stringify({
            success: true,
            samples: [
              {
                companyId: "10",
                companyTitle: "ООО Ромашка",
                responsibleId: "7",
                productFamilies: [],
                grades: [],
                quantities: [],
                sentDates: [],
                sampleIndicators: [],
                processStatuses: [],
                normalizedResult: "pending",
                relatedDeals: [],
                dataIssues: [],
                smartProcessItems: [
                  {
                    processItemId: "9001",
                    title: "Цикл активный",
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
                activeSmartProcessCount: 1,
                currentActiveStageLabels: ["Образцы на испытании"],
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes("/api/bitrix/companies/")) {
        return new Response(
          JSON.stringify({ success: true, company: { ID: "10", TITLE: "ООО Ромашка" }, bitrixUrl: null }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    render(<CompanyPreview id="10" onClose={() => {}} />);

    // Initial failure is explicit and truthful (server error disclosed,
    // never a masquerading empty state).
    await waitFor(() => {
      expect(screen.getByText("upstream down")).toBeTruthy();
    });
    const spSection = () => document.querySelector("[data-sp-company-section]")!;
    expect(spSection().querySelector("[data-sp-retry]")).toBeTruthy();

    failing = false;
    fireEvent.click(spSection().querySelector("[data-sp-retry]")!);
    await waitFor(() => {
      expect(screen.getByText("Цикл активный")).toBeTruthy();
    });

    // Refresh failure AFTER success: prior cycles preserved + stale note.
    failing = true;
    fireEvent.click(spSection().querySelector("[data-sp-retry]")!);
    await waitFor(() => {
      expect(screen.getByText(/показаны ранее загруженные данные/i)).toBeTruthy();
    });
    // Prior data survives the failed refresh.
    expect(screen.getByText("Цикл активный")).toBeTruthy();
  });
});
