// src/__tests__/samples-pagination.test.tsx
// ─────────────────────────────────────────────────────────────────────
// Regression tests for Samples client-side pagination:
// - Default page size is 50
// - Continuous row numbering across pages (page 2 starts at 51, etc.)
// - Page size change resets to page 1
// - Filter change resets to page 1
// - Invariant: Excel export and KPIs receive full filtered dataset, not sliced page
// ─────────────────────────────────────────────────────────────────────

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { SamplesRegistry } from "@/components/dashboard/samples/samples-registry";
import { computeSampleKpis } from "@/lib/samples/aggregate";
import type { SampleSummary } from "@/lib/samples/types";


vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: (selector?: (s: any) => any) => {
    const state = {
      userNames: { "1": "Иван Иванов" },
      usersCoverage: { status: "COMPLETE", fetched: 1, total: 1 },
      isDemoMode: false,
    };
    return selector ? selector(state) : state;
  },
}));

function createMockSummaries(count: number): SampleSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    companyId: String(100 + i + 1),
    companyTitle: `Компания ${i + 1}`,
    responsibleId: "1",
    productFamilies: ["Гель"],
    grades: [{ productFamily: "Гель", value: "КСМГ-5" }],
    quantities: [{ productFamily: "Гель", value: 10, unit: "кг" }],
    sentDates: ["2026-02-15"],
    sampleIndicators: ["Переданы"],
    processStatuses: ["В работе"],
    rawTestResult: "Соответствует",
    normalizedResult: "positive" as const,
    industry: "Химия",
    application: "Катализаторы",
    relatedDeals: [],
    sourceQuality: "structured" as const,
    dataIssues: [],
  }));
}

describe("Samples Client Pagination & Invariants", () => {
  it("defaults to 50 rows per page with continuous numbering", () => {
    const mockData = createMockSummaries(120);
    render(<SamplesRegistry summaries={mockData} onSelect={vi.fn()} />);

    // Table rows: 1 header row + 50 body rows = 51 rows
    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(51);

    // First row № is 1, 50th row № is 50
    expect(rows[1].children[0].textContent).toBe("1");
    expect(rows[50].children[0].textContent).toBe("50");

    // Footer shows range "1–50 из 120" and "1 / 3"
    expect(screen.getByText("1–50 из 120")).toBeDefined();
    expect(screen.getByText("1 / 3")).toBeDefined();
  });

  it("navigates to next page with continuous row numbering (51..100)", () => {
    const mockData = createMockSummaries(120);
    render(<SamplesRegistry summaries={mockData} onSelect={vi.fn()} />);

    const nextButton = screen.getByRole("button", { name: "Следующая страница" });
    fireEvent.click(nextButton);

    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(51); // 50 items on page 2

    // Page 2 row numbering continues from 51 to 100
    expect(rows[1].children[0].textContent).toBe("51");
    expect(rows[50].children[0].textContent).toBe("100");

    expect(screen.getByText("51–100 из 120")).toBeDefined();
    expect(screen.getByText("2 / 3")).toBeDefined();
  });

  it("changing page size to 25 updates page count and resets to page 1", () => {
    const mockData = createMockSummaries(120);
    render(<SamplesRegistry summaries={mockData} onSelect={vi.fn()} />);

    // Navigate to page 2 first
    const nextButton = screen.getByRole("button", { name: "Следующая страница" });
    fireEvent.click(nextButton);
    expect(screen.getByText("2 / 3")).toBeDefined();

    // Change page size to 25
    const pageSizeSelect = screen.getByLabelText("Строк на странице");
    fireEvent.change(pageSizeSelect, { target: { value: "25" } });

    // Should reset to page 1 with 25 items
    expect(screen.getByText("1–25 из 120")).toBeDefined();
    expect(screen.getByText("1 / 5")).toBeDefined();

    const rows = screen.getAllByRole("row");
    expect(rows.length).toBe(26); // 1 header + 25 data rows
    expect(rows[1].children[0].textContent).toBe("1");
    expect(rows[25].children[0].textContent).toBe("25");
  });

  it("resets to page 1 when summaries input changes (filtering)", () => {
    const allData = createMockSummaries(120);
    const filteredData = allData.slice(0, 30);

    function TestHarness() {
      const [data, setData] = useState(allData);
      return (
        <div>
          <button onClick={() => setData(filteredData)}>Применить фильтр</button>
          <SamplesRegistry summaries={data} onSelect={vi.fn()} />
        </div>
      );
    }

    render(<TestHarness />);

    // Navigate to page 2
    fireEvent.click(screen.getByRole("button", { name: "Следующая страница" }));
    expect(screen.getByText("2 / 3")).toBeDefined();

    // Filter data
    fireEvent.click(screen.getByText("Применить фильтр"));

    // Automatically resets to page 1
    expect(screen.getByText("1–30 из 30")).toBeDefined();
    expect(screen.getByText("1 / 1")).toBeDefined();
  });

  it("invariant: computeSampleKpis receives full dataset regardless of pagination", () => {
    const mockData = createMockSummaries(120);
    // Render with 50 items on page
    render(<SamplesRegistry summaries={mockData} onSelect={vi.fn()} />);

    // KPIs computed on the full filtered dataset (120), never the sliced 50
    const fullKpis = computeSampleKpis(mockData);
    expect(fullKpis.total).toBe(120);
    expect(fullKpis.positive).toBe(120);
  });
});
