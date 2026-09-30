import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
import { CompanyBrowser } from "@/components/dashboard/company-browser";
import { useDashboardStore } from "@/store/dashboard-store";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/dashboard/company-column-selector", () => ({
  CompanyColumnSelector: () => null,
}));

vi.mock("@/components/dashboard/company-date-filter", () => ({
  CompanyDateFilter: () => null,
}));

vi.mock("@/lib/export-utils", () => ({
  exportToExcelWysiwyg: vi.fn(),
  exportCompanyToExcel: vi.fn(),
}));

describe("Companies Table — Layout, Viewport, Density & Pagination Parity Suite", () => {
  const mockCompanies = Array.from({ length: 75 }, (_, i) => ({
    ID: String(i + 1),
    TITLE: `Компания ${i + 1}`,
    ASSIGNED_BY_ID: "5",
    REVENUE: "100000",
  }));

  beforeEach(() => {
    useDashboardStore.setState({
      companyBrowserItems: mockCompanies,
      companyBrowserLoading: false,
      companyBrowserError: null,
      companyBrowserTotal: 75,
      companyBrowserFetched: 75,
      companyBrowserTruncated: false,
      companyBrowserPartial: false,
      companyBrowserResponsibleId: "all",
      userNames: { "5": "Сергей Смирнов" },
      companyResponsibleCounts: { "5": 75 },
      fetchCompanyBrowser: vi.fn(),
      fetchCompanyResponsibleCounts: vi.fn(),
      fields: [
        { id: "TITLE", title: "Название компании", type: "string", isMultiple: false, isSortable: true },
        { id: "ASSIGNED_BY_ID", title: "Ответственный", type: "user", isMultiple: false, isSortable: true },
        { id: "REVENUE", title: "Выручка", type: "money", isMultiple: false, isSortable: true },
      ],
      selectedColumns: [],
      companyColumnWidths: {},
    });
  });

  it("PARITY-1: Companies page root shell enforces viewport containment (h-dvh flex flex-col overflow-hidden) with shrink-0 header/footer", () => {
    const pagePath = path.resolve(process.cwd(), "src/app/companies/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    // Root shell
    expect(content).toMatch(/<div\s+className=["'][^"']*h-dvh[^"']*flex\s+flex-col[^"']*overflow-hidden/);
    // Header shrink-0
    expect(content).toMatch(/<header\s+className=["'][^"']*shrink-0/);
    // Main min-h-0
    expect(content).toMatch(/<main\s+className=["'][^"']*flex-1\s+flex\s+flex-col\s+min-h-0/);
    // Footer shrink-0
    expect(content).toMatch(/<ProductFooter\s+className=["'][^"']*shrink-0/);
  });

  it("PARITY-2: Table scroll mechanics — internal container with data-testid='companies-table-scroll', h-full, overflow-auto", async () => {
    await act(async () => {
      render(<CompanyBrowser />);
    });
    const scrollContainer = screen.getByTestId("companies-table-scroll");
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollContainer.className).toContain("overflow-auto");
    expect(scrollContainer.className).toContain("h-full");
  });

  it("PARITY-3: Table density class (.data-table) and sticky row numbering header & column", async () => {
    let container: HTMLElement;
    await act(async () => {
      const res = render(<CompanyBrowser />);
      container = res.container;
    });

    // Table element has data-table class with border-separate border-spacing-0
    const table = container!.querySelector("table.data-table");
    expect(table).toBeInTheDocument();
    expect(table?.className).toContain("border-separate");
    expect(table?.className).toContain("border-spacing-0");

    // Header index (№)
    const headerIndex = screen.getByTestId("companies-header-index");
    expect(headerIndex).toBeInTheDocument();
    expect(headerIndex.textContent?.trim()).toBe("№");
    expect(headerIndex.className).toContain("sticky");
    expect(headerIndex.className).toContain("top-0");
    expect(headerIndex.className).toContain("left-0");
    expect(headerIndex.className).toContain("z-30");
    expect(headerIndex.className).toContain("bg-card");

    // Header columns
    const headerColumns = screen.getAllByTestId("companies-header-column");
    expect(headerColumns.length).toBeGreaterThan(0);
    for (const th of headerColumns) {
      expect(th.className).toContain("sticky");
      expect(th.className).toContain("top-0");
      expect(th.className).toContain("z-20");
      expect(th.className).toContain("bg-card");
    }

    // Body sticky index cells (default pageSize = 50)
    const bodyRows = container!.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(50);
    const firstRowIndexCell = bodyRows[0].querySelector("td:first-child");
    expect(firstRowIndexCell?.className).toContain("sticky");
    expect(firstRowIndexCell?.className).toContain("left-0");
    expect(firstRowIndexCell?.className).toContain("z-10");
    expect(firstRowIndexCell?.textContent?.trim()).toBe("1");

    const secondRowIndexCell = bodyRows[1].querySelector("td:first-child");
    expect(secondRowIndexCell?.textContent?.trim()).toBe("2");
  });

  it("PARITY-4: Data cells have title attribute for hover tooltips", async () => {
    let container: HTMLElement;
    await act(async () => {
      const res = render(<CompanyBrowser />);
      container = res.container;
    });
    const bodyRows = container!.querySelectorAll("tbody tr");
    const dataCells = bodyRows[0].querySelectorAll("td:not(:first-child)");
    expect(dataCells.length).toBeGreaterThan(0);
    for (const cell of dataCells) {
      expect(cell).toHaveAttribute("title");
    }
  });

  it("PARITY-5: Pagination bar parity with Deals table — range count, page sizes (25, 50, 100, 250), nav chevrons", async () => {
    await act(async () => {
      render(<CompanyBrowser />);
    });
    // Item range text: 1–50 из 75
    expect(screen.getByText("1–50 из 75")).toBeInTheDocument();

    // Page size selector with all standard sizes
    const sizeSelect = screen.getByLabelText("Строк на странице") as HTMLSelectElement;
    expect(sizeSelect).toBeInTheDocument();
    expect(sizeSelect.className).toContain("h-7");
    const optionValues = Array.from(sizeSelect.options).map((o) => Number(o.value));
    expect(optionValues).toEqual([25, 50, 100, 250]);

    // Page indicator
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    // Prev / Next buttons
    const prevBtn = screen.getByRole("button", { name: "Предыдущая страница" });
    const nextBtn = screen.getByRole("button", { name: "Следующая страница" });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();
  });
});
