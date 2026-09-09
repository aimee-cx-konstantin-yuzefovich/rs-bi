import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DealPreview } from "@/components/dashboard/deal-preview";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { DataTable } from "@/components/dashboard/data-table";

const mockStore = vi.hoisted(() => ({
  deals: [
    {
      ID: "101",
      TITLE: "Сделка РусСилика 101",
      OPPORTUNITY: 500000,
      CURRENCY_ID: "RUB",
      STAGE_ID: "NEW",
      ASSIGNED_BY_ID: "7",
      COMPANY_ID: "42",
      COMPANY_TITLE: "Компания из таблицы",
    },
  ],
  allDeals: [
    {
      ID: "101",
      TITLE: "Сделка РусСилика 101",
      OPPORTUNITY: 500000,
      CURRENCY_ID: "RUB",
      STAGE_ID: "NEW",
      ASSIGNED_BY_ID: "7",
      COMPANY_ID: "42",
    },
    {
      ID: "102",
      TITLE: "Вторая сделка компании",
      OPPORTUNITY: 250000,
      CURRENCY_ID: "RUB",
      STAGE_ID: "WON",
      ASSIGNED_BY_ID: "7",
      COMPANY_ID: "42",
    },
  ],
  fields: [
    { id: "TITLE", title: "Название сделки", type: "string" },
    { id: "OPPORTUNITY", title: "Сумма", type: "double" },
    { id: "STAGE_ID", title: "Стадия", type: "crm_status" },
    { id: "COMPANY_TITLE", title: "Компания", type: "string" },
  ],
  selectedColumns: ["TITLE", "OPPORTUNITY", "STAGE_ID", "COMPANY_TITLE"],
  searchQuery: "",
  columnSort: { columnId: "", direction: null },
  columnWidths: {},
  columnFilters: [],
  userNames: { "7": "Анна" },
  userNamesLoading: false,
  companiesData: { "42": { ID: "42", TITLE: "Компания из таблицы" } },
  companiesDataLoading: false,
  activitiesData: {},
  activitiesDataLoading: false,
  dealsLoading: false,
  dealsError: null,
  dealsTotal: 1,
  dealsTruncated: false,
  dealsFetched: 1,
  toggleColumnSort: vi.fn(),
  setColumnWidth: vi.fn(),
  setColumnFilter: vi.fn(),
  clearColumnFilter: vi.fn(),
  clearAllColumnFilters: vi.fn(),
  setCurrentPage: vi.fn(),
  setPageSize: vi.fn(),
  fetchDeals: vi.fn(),
}));

vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: (selector?: (s: typeof mockStore) => any) =>
    selector ? selector(mockStore) : mockStore,
}));

vi.mock("react-sparklines", () => ({
  Sparklines: () => null,
  SparklinesLine: () => null,
  SparklinesSpots: () => null,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 40,
        size: 40,
        key: String(index),
      })),
    getTotalSize: () => count * 40,
  }),
}));

vi.mock("nuqs", () => ({
  useQueryState: (key: string, options: any) => {
    if (key === "page") return [1, vi.fn()];
    if (key === "size") return [25, vi.fn()];
    if (key === "filters") return [[], vi.fn()];
    return [null, vi.fn()];
  },
}));

const fetchMock = vi.fn();

const dealDetail = (id = "101", title = "Сделка РусСилика 101", companyTitle = "Компания из таблицы") => ({
  success: true,
  deal: {
    ID: id,
    TITLE: title,
    OPPORTUNITY: 500000,
    CURRENCY_ID: "RUB",
    STAGE_ID: "NEW",
    ASSIGNED_BY_ID: "7",
    COMPANY_ID: "42",
    COMPANY_TITLE: companyTitle,
    DATE_CREATE: "2026-01-01T10:00:00Z",
  },
  bitrixUrl: `https://russilica.bitrix24.ru/crm/deal/details/${id}/`,
  companyBitrixUrl: `https://russilica.bitrix24.ru/crm/company/details/42/`,
});

const ok = (body: unknown = dealDetail()) => ({
  ok: true,
  json: async () => body,
});

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(ok());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("Deal Preview Component and Navigation", () => {
  it("opens Deal Preview on deal-row click with real Bitrix TITLE and correct Bitrix link", async () => {
    render(<DataTable />);

    // Row shows deal title
    expect(screen.getByRole("button", { name: "Сделка РусСилика 101" })).toBeInTheDocument();
    // Invariant: never ID 101 as title
    expect(screen.queryByRole("button", { name: "ID 101" })).not.toBeInTheDocument();

    // Click row TITLE button
    fireEvent.click(screen.getByRole("button", { name: "Сделка РусСилика 101" }));

    // Deal Preview opens
    expect(await screen.findByRole("heading", { name: "Сделка РусСилика 101" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Сделка 101" })).not.toBeInTheDocument();

    // Bitrix link
    const link = screen.getByRole("link", { name: "Открыть сделку в Bitrix24" });
    expect(link).toHaveAttribute("href", "https://russilica.bitrix24.ru/crm/deal/details/101/");
    expect(link).toHaveAttribute("target", "_blank");

    // Associated company shows real title in drawer (and table) and never company ID
    expect(screen.getAllByText("Компания из таблицы").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("ID 42")).not.toBeInTheDocument();
    expect(screen.queryByText("Компания 42")).not.toBeInTheDocument();
  });

  it("never substitutes Deal ID when deal TITLE is empty -> uses 'Без названия'", async () => {
    fetchMock.mockResolvedValue(ok(dealDetail("101", "", "Компания Партнёр")));
    render(<DealPreview id="101" onClose={() => {}} />);

    expect(await screen.findByRole("heading", { name: "Без названия" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "101" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Сделка 101" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "ID 101" })).not.toBeInTheDocument();
  });

  it("never substitutes Company ID when associated company TITLE is empty -> uses 'Без названия'", async () => {
    fetchMock.mockResolvedValue(ok(dealDetail("101", "Сделка", "")));
    render(<DealPreview id="101" onClose={() => {}} />);

    await screen.findByRole("heading", { name: "Сделка" });
    expect(screen.getByText("Без названия")).toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
    expect(screen.queryByText("ID 42")).not.toBeInTheDocument();
    expect(screen.queryByText("Компания 42")).not.toBeInTheDocument();
  });

  it("is race-condition safe: stale response from Deal A cannot overwrite Deal B", async () => {
    let resolveA: (v: any) => void = () => {};
    const promiseA = new Promise((resolve) => {
      resolveA = resolve;
    });

    fetchMock
      .mockImplementationOnce(() => promiseA)
      .mockImplementationOnce(() =>
        Promise.resolve(ok(dealDetail("102", "Сделка B", "Компания B")))
      );

    const { rerender } = render(<DealPreview id="101" onClose={() => {}} />);
    expect(screen.getByText("Загрузка сделки")).toBeInTheDocument();

    // Fast click on Deal B
    rerender(<DealPreview id="102" onClose={() => {}} />);

    // Deal B resolves first
    expect(await screen.findByRole("heading", { name: "Сделка B" })).toBeInTheDocument();

    // Late Deal A resolves
    await act(async () => {
      resolveA(ok(dealDetail("101", "Сделка A", "Компания A")));
    });

    // Drawer still displays Deal B, not Deal A
    expect(screen.getByRole("heading", { name: "Сделка B" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Сделка A" })).not.toBeInTheDocument();
  });

  it("Company Preview shows related deals with real deal titles and navigation", async () => {
    const onOpenDealPreview = vi.fn();
    fetchMock.mockImplementation(async (req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/deals")) {
        return ok({
          success: true,
          deals: [
            {
              ID: "101",
              TITLE: "Сделка РусСилика 101",
              STAGE_ID: "NEW",
              OPPORTUNITY: 500000,
              CURRENCY_ID: "RUB",
              COMPANY_ID: "42",
            },
            {
              ID: "102",
              TITLE: "Вторая сделка компании",
              STAGE_ID: "WON",
              OPPORTUNITY: 250000,
              CURRENCY_ID: "RUB",
              COMPANY_ID: "42",
            },
          ],
        });
      }
      return ok({
        success: true,
        company: { ID: "42", TITLE: "Компания из таблицы", ASSIGNED_BY_ID: "7" },
        bitrixUrl: "https://russilica.bitrix24.ru/crm/company/details/42/",
      });
    });

    render(
      <CompanyPreview
        id="42"
        onClose={() => {}}
        onOpenDealPreview={onOpenDealPreview}
      />
    );

    // Company loaded
    expect(await screen.findByRole("heading", { name: "Компания из таблицы" })).toBeInTheDocument();

    // Related deals section is present
    expect(await screen.findByText("Связанные сделки (2)")).toBeInTheDocument();
    expect(screen.getByText("Сделка РусСилика 101")).toBeInTheDocument();
    expect(screen.getByText("Вторая сделка компании")).toBeInTheDocument();

    // Invariant: never shows Deal ID as title
    expect(screen.queryByText("101")).not.toBeInTheDocument();
    expect(screen.queryByText("ID 101")).not.toBeInTheDocument();
    expect(screen.queryByText("Сделка 101")).not.toBeInTheDocument();

    // Clicking related deal triggers navigation to that exact deal
    fireEvent.click(screen.getByRole("button", { name: "Вторая сделка компании" }));
    expect(onOpenDealPreview).toHaveBeenCalledWith("102");
  });

  describe("Related deals completeness", () => {
    it("results do not depend on dashboard allDeals or date filters, and shows complete set", async () => {
      // client allDeals is EMPTY (e.g. strict date filter or outside 1000 limit)
      mockStore.allDeals = [];

      const authoritativeDeals = [
        { ID: "201", TITLE: "Сделка Январь", STAGE_ID: "WON", OPPORTUNITY: 100000, CURRENCY_ID: "RUB", COMPANY_ID: "42" },
        { ID: "202", TITLE: "Сделка Февраль", STAGE_ID: "NEW", OPPORTUNITY: 200000, CURRENCY_ID: "RUB", COMPANY_ID: "42" },
        { ID: "203", TITLE: "Сделка Архив", STAGE_ID: "LOSE", OPPORTUNITY: 300000, CURRENCY_ID: "RUB", COMPANY_ID: "42" },
      ];

      fetchMock.mockImplementation(async (req: Request | string) => {
        const url = typeof req === "string" ? req : req.url;
        if (url.includes("/deals")) {
          return ok({ success: true, deals: authoritativeDeals });
        }
        return ok({
          success: true,
          company: { ID: "42", TITLE: "Компания 42", ASSIGNED_BY_ID: "7" },
          bitrixUrl: "https://russilica.bitrix24.ru/crm/company/details/42/",
        });
      });

      render(<CompanyPreview id="42" onClose={() => {}} onOpenDealPreview={() => {}} />);

      expect(await screen.findByRole("heading", { name: "Компания 42" })).toBeInTheDocument();
      expect(await screen.findByText("Связанные сделки (3)")).toBeInTheDocument();

      const expectedIds = new Set(["201", "202", "203"]);
      const renderedButtons = screen.getAllByRole("button", { name: /^Сделка / });
      const renderedIds = new Set(renderedButtons.map((b) => b.getAttribute("data-related-deal")));
      expect(renderedIds).toEqual(expectedIds);

      // Fails if one expected related deal is removed
      const subsetIds = new Set(["201", "202"]);
      expect(renderedIds).not.toEqual(subsetIds);
    });

    it("handles zero deals properly", async () => {
      fetchMock.mockImplementation(async (req: Request | string) => {
        const url = typeof req === "string" ? req : req.url;
        if (url.includes("/deals")) return ok({ success: true, deals: [] });
        return ok({
          success: true,
          company: { ID: "42", TITLE: "Компания Без Сделок" },
          bitrixUrl: null,
        });
      });

      render(<CompanyPreview id="42" onClose={() => {}} />);
      expect(await screen.findByRole("heading", { name: "Компания Без Сделок" })).toBeInTheDocument();
      expect(await screen.findByText("Связанные сделки (0)")).toBeInTheDocument();
      expect(screen.getByText("Нет связанных сделок")).toBeInTheDocument();
    });

    it("handles related deals API failure cleanly", async () => {
      fetchMock.mockImplementation(async (req: Request | string) => {
        const url = typeof req === "string" ? req : req.url;
        if (url.includes("/deals")) return { ok: false, status: 502, json: async () => ({ success: false }) };
        return ok({
          success: true,
          company: { ID: "42", TITLE: "Компания С Ошибкой" },
          bitrixUrl: null,
        });
      });

      render(<CompanyPreview id="42" onClose={() => {}} />);
      expect(await screen.findByRole("heading", { name: "Компания С Ошибкой" })).toBeInTheDocument();
      expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить связанные сделки");
    });
  });

  describe("COMPANY_TITLE resolution order in table", () => {
    it("follows exact required resolution order and never falls back to company ID", async () => {
      const { renderHook } = await import("@testing-library/react");
      const { useTableState } = await import("@/hooks/use-table-state");

      // 1. companiesData title exists → use it
      mockStore.companiesData = { "50": { ID: "50", TITLE: "Компания из словаря" } };
      const { result, rerender } = renderHook(() => useTableState());
      const res1 = result.current.resolveValue(
        { COMPANY_ID: "50", COMPANY_TITLE: "Старое название" } as any,
        "COMPANY_TITLE"
      );
      expect(res1).toBe("Компания из словаря");

      // 2. companiesData missing + deal.COMPANY_TITLE exists → use deal.COMPANY_TITLE
      const res2 = result.current.resolveValue(
        { COMPANY_ID: "99", COMPANY_TITLE: "Компания из сделки" } as any,
        "COMPANY_TITLE"
      );
      expect(res2).toBe("Компания из сделки");

      // 3. both titles empty + COMPANY_ID exists → "Без названия"
      const res3 = result.current.resolveValue(
        { COMPANY_ID: "99", COMPANY_TITLE: "   " } as any,
        "COMPANY_TITLE"
      );
      expect(res3).toBe("Без названия");
      expect(res3).not.toBe("99");
      expect(res3).not.toBe("ID 99");

      // 4. no COMPANY_ID → "—"
      const res4 = result.current.resolveValue(
        { COMPANY_ID: "", COMPANY_TITLE: "" } as any,
        "COMPANY_TITLE"
      );
      expect(res4).toBe("—");
    });
  });

  describe("Company enrichment failure", () => {
    it("displays error state in Deal Preview instead of claiming title is empty", async () => {
      const onOpenCompanyPreview = vi.fn();
      fetchMock.mockResolvedValue(
        ok({
          success: true,
          deal: {
            ID: "101",
            TITLE: "Сделка 101",
            COMPANY_ID: "42",
            COMPANY_TITLE: "Название компании не удалось загрузить",
          },
          bitrixUrl: null,
          companyBitrixUrl: null,
        })
      );

      render(
        <DealPreview
          id="101"
          onClose={() => {}}
          onOpenCompanyPreview={onOpenCompanyPreview}
        />
      );

      expect(await screen.findByRole("heading", { name: "Сделка 101" })).toBeInTheDocument();
      expect(screen.getByText("Название компании не удалось загрузить")).toBeInTheDocument();
      expect(screen.queryByText("Без названия")).not.toBeInTheDocument();
      expect(screen.queryByText("ID 42")).not.toBeInTheDocument();

      // Navigation button preserves company ID
      const compBtn = screen.getByRole("button", { name: "Название компании не удалось загрузить" });
      expect(compBtn).toHaveAttribute("data-company-link", "42");
      fireEvent.click(compBtn);
      expect(onOpenCompanyPreview).toHaveBeenCalledWith("42");
    });
  });

  describe("Fix 4: Human-name ID fallbacks", () => {
    it("displays 'Неизвестный сотрудник' instead of ID fallback when employee name is not in userNames", async () => {
      fetchMock.mockResolvedValue(
        ok({
          success: true,
          deal: {
            ID: "101",
            TITLE: "Сделка 101",
            ASSIGNED_BY_ID: "999", // not in mockStore.userNames
          },
          bitrixUrl: null,
          companyBitrixUrl: null,
        })
      );

      render(<DealPreview id="101" onClose={() => {}} />);
      expect(await screen.findByRole("heading", { name: "Сделка 101" })).toBeInTheDocument();
      expect(screen.getByText("Неизвестный сотрудник")).toBeInTheDocument();
      expect(screen.queryByText("Сотрудник ID 999")).not.toBeInTheDocument();
      expect(screen.queryByText("ID 999")).not.toBeInTheDocument();
    });
  });

  it("navigates from Deal Preview to Company Preview cleanly", async () => {
    const onOpenCompanyPreview = vi.fn();
    fetchMock.mockResolvedValue(ok(dealDetail("101", "Сделка", "Компания РусСилика")));

    render(
      <DealPreview
        id="101"
        onClose={() => {}}
        onOpenCompanyPreview={onOpenCompanyPreview}
      />
    );

    expect(await screen.findByRole("heading", { name: "Сделка" })).toBeInTheDocument();

    // Click company link inside deal preview
    const companyButton = screen.getByRole("button", { name: "Компания РусСилика" });
    fireEvent.click(companyButton);

    expect(onOpenCompanyPreview).toHaveBeenCalledWith("42");
  });
});
