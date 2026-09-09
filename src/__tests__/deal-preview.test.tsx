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
    fetchMock.mockResolvedValue(
      ok({
        success: true,
        company: { ID: "42", TITLE: "Компания из таблицы", ASSIGNED_BY_ID: "7" },
        bitrixUrl: "https://russilica.bitrix24.ru/crm/company/details/42/",
      })
    );

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
    expect(screen.getByText("Связанные сделки (2)")).toBeInTheDocument();
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
