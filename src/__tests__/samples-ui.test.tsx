// src/__tests__/samples-ui.test.tsx
// ─────────────────────────────────────────────────────────────────────
// SMP-UI-1 to SMP-UI-7 verification suite:
// - SMP-UI-1: First column is № with 1..N order
// - SMP-UI-2: No "Качество данных" column in registry table
// - SMP-UI-3: No "Качество данных" in filter dropdowns
// - SMP-UI-4: Popup drawer contains no technical top badges
// - SMP-UI-5: Popup drawer contains no "Качество данных" section
// - SMP-UI-6: Popup raw test-result field is preserved
// - SMP-UI-7: Excel export button exists
// - SMP-UI-RESP: Responsible person shows employee name or incomplete notice, never raw ID
// ─────────────────────────────────────────────────────────────────────

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SamplesRegistry } from "@/components/dashboard/samples/samples-registry";
import { SamplePreview } from "@/components/dashboard/samples/sample-preview";
import { SamplesFilterBar, DEFAULT_SAMPLES_FILTERS } from "@/components/dashboard/samples/samples-filters";
import SamplesPage from "@/app/samples/page";
import type { SampleSummary } from "@/lib/samples/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { email: "admin@russilica.ru", role: "admin" } },
    status: "authenticated",
  }),
}));

vi.mock("@/components/dashboard/section-nav", () => ({
  SectionNav: () => <div data-testid="section-nav" />,
}));

vi.mock("@/components/dashboard/footer", () => ({
  ProductFooter: () => <div data-testid="product-footer" />,
}));

vi.mock("@/components/dashboard/samples/samples-kpi-cards", () => ({
  SamplesKpiCards: () => <div data-testid="samples-kpi-cards" />,
}));

vi.mock("@/components/dashboard/samples/use-samples-data", () => ({
  useSamplesData: () => ({
    samples: MOCK_SUMMARIES,
    meta: { statusLabels: {} },
    orphanDealCount: 0,
    loading: false,
    error: null,
    isDemoMode: false,
    reload: vi.fn(),
  }),
}));

vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: (selector?: (s: any) => any) => {
    const state = {
      userNames: { "1": "Иван Иванов", "2": "Петр Петров" },
      usersCoverage: { status: "COMPLETE", fetched: 2, total: 2 },
      isDemoMode: false,
      checkConfig: vi.fn(),
      fetchUserNames: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

const MOCK_SUMMARIES: SampleSummary[] = [
  {
    companyId: "101",
    companyTitle: "ООО ХимПром",
    responsibleId: "1",
    companyResponsibleId: "1",
    companyResponsibleName: "Иван Иванов",
    productFamilies: ["Гель"],
    grades: [{ productFamily: "Гель", value: "КСМГ-5" }],
    quantities: [{ productFamily: "Гель", value: 10, unit: "кг" }],
    sentDates: ["2026-02-15"],
    sampleIndicators: ["Переданы"],
    processStatuses: ["В работе"],
    currentStatusSource: "COMPANY_LEGACY",
    currentStatusValues: ["В работе"],
    rawTestResult: "Образцы соответствуют ТУ 123",
    normalizedResult: "positive",
    industry: "Химия",
    application: "Катализаторы",
    relatedDeals: [{ id: "501", title: "Сделка 501", sampleTestingStatus: [] }],
    sourceQuality: "structured",
    dataIssues: [],
  },
  {
    companyId: "102",
    companyTitle: "ЗАО ТехноСинтез",
    responsibleId: "45", // Unmapped ID
    companyResponsibleId: "45", // Unmapped company responsible (never raw in UI)
    productFamilies: ["Золь"],
    grades: [{ productFamily: "Золь", value: "СКСГ-2" }],
    quantities: [{ productFamily: "Золь", value: "25", unit: "л" }],
    sentDates: ["2026-03-01"],
    sampleIndicators: ["Тестируются"],
    processStatuses: [],
    currentStatusSource: "NONE",
    currentStatusValues: [],
    rawTestResult: "Требуется доработка рецептуры",
    normalizedResult: "rework",
    industry: "Нефтегаз",
    application: "Осушка",
    relatedDeals: [],
    sourceQuality: "partial",
    dataIssues: [],
  },
];

describe("Samples UI Remediation (SMP-UI-1 .. SMP-UI-7)", () => {
  it("SMP-UI-1: First column in registry is '№' with 1-based sequential row numbers", () => {
    render(<SamplesRegistry summaries={MOCK_SUMMARIES} onSelect={vi.fn()} />);

    // Header has №
    const headers = screen.getAllByRole("columnheader");
    expect(headers[0].textContent).toBe("№");
    expect(screen.getByTestId("samples-header-index")).toHaveTextContent("№");

    // Table has data-table class and scroll container
    const tableScroll = screen.getByTestId("samples-table-scroll");
    expect(tableScroll).toBeInTheDocument();
    expect(tableScroll.querySelector("table.data-table")).not.toBeNull();

    // Rows show 1 and 2 (NOT company IDs 101/102)
    const rows = screen.getAllByRole("row");
    // Row 0 is header, Row 1 is first item, Row 2 is second item
    expect(rows[1].children[0].textContent).toBe("1");
    expect(rows[2].children[0].textContent).toBe("2");
  });

  it("SMP-UI-2: Registry table has NO 'Качество данных' column or badges", () => {
    render(<SamplesRegistry summaries={MOCK_SUMMARIES} onSelect={vi.fn()} />);

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).not.toContain("Качество данных");
    expect(screen.queryByText("Структурированные")).toBeNull();
    expect(screen.queryByText("Неполные")).toBeNull();
    expect(screen.queryByText("Устаревшие")).toBeNull();
  });

  it("SMP-UI-3: SamplesFilterBar has NO 'Качество данных', NO 'Применение', and NO 'Сделки: любые' filters", () => {
    render(
      <SamplesFilterBar
        filters={DEFAULT_SAMPLES_FILTERS}
        onChange={vi.fn()}
        responsibleOptions={[{ value: "1", label: "Иван Иванов" }]}
        productFamilyOptions={["Гель", "Золь"]}
        gradeOptions={["КСМГ-5"]}
        industryOptions={["Химия"]}
        statusOptions={["Переданы"]}
      />
    );

    expect(screen.queryByText("Качество данных")).toBeNull();
    expect(screen.queryByText("Любое качество")).toBeNull();
    expect(screen.queryByText("Все применения")).toBeNull();
    expect(screen.queryByText("Применение")).toBeNull();
    expect(screen.queryByText("Сделки: любые")).toBeNull();
    expect(screen.queryByText("Связанные сделки")).toBeNull();
  });

  it("SMP-UI-4: Top popup result/quality badges ('Доработка', 'Структурированные') are removed", () => {
    render(
      <SamplePreview
        summary={MOCK_SUMMARIES[1]} // rework + partial
        onClose={vi.fn()}
        onOpenCompanyPreview={vi.fn()}
        onOpenDealPreview={vi.fn()}
      />
    );

    expect(screen.queryByText("Доработка")).toBeNull();
    expect(screen.queryByText("Структурированные")).toBeNull();
    expect(screen.queryByText("Неполные")).toBeNull();
  });

  it("SMP-UI-5: Popup 'КАЧЕСТВО ДАННЫХ' section is removed", () => {
    render(
      <SamplePreview
        summary={MOCK_SUMMARIES[0]}
        onClose={vi.fn()}
        onOpenCompanyPreview={vi.fn()}
        onOpenDealPreview={vi.fn()}
      />
    );

    expect(screen.queryByText("КАЧЕСТВО ДАННЫХ")).toBeNull();
    expect(screen.queryByText("Качество данных")).toBeNull();
    expect(screen.queryByText(/Существенных проблем в данных не обнаружено/)).toBeNull();
    expect(screen.queryByText(/автоматическая оценка полноты/)).toBeNull();
  });

  it("SMP-UI-6: Popup drawer preserves raw test-result field verbatim", () => {
    render(
      <SamplePreview
        summary={MOCK_SUMMARIES[0]}
        onClose={vi.fn()}
        onOpenCompanyPreview={vi.fn()}
        onOpenDealPreview={vi.fn()}
      />
    );

    expect(screen.getByText("Результат испытаний (исходное значение)")).toBeDefined();
    expect(screen.getByText(/Образцы соответствуют ТУ 123/)).toBeDefined();
  });

  it("SMP-UI-7: Excel export button exists", () => {
    render(<SamplesPage />);

    const exportBtn = screen.getByRole("button", { name: /Экспорт/i });
    expect(exportBtn).toBeDefined();
    expect(exportBtn.textContent).toContain("Экспорт");
  });

  it("SMP-UI-RESP: Responsible person renders employee name or incomplete notice, never raw ID in registry and popup", () => {
    // Registry with known employee
    const { unmount } = render(
      <SamplesRegistry summaries={MOCK_SUMMARIES} onSelect={vi.fn()} />
    );
    expect(screen.getByText("Иван Иванов")).toBeDefined();
    // For ID 45 when usersCoverage is COMPLETE, it renders "Сотрудник не найден"
    expect(screen.getByText("Сотрудник не найден")).toBeDefined();
    expect(screen.queryByText(/^45$/)).toBeNull();
    unmount();

    // Popup preview with known employee
    render(
      <SamplePreview
        summary={MOCK_SUMMARIES[0]}
        onClose={vi.fn()}
        onOpenCompanyPreview={vi.fn()}
        onOpenDealPreview={vi.fn()}
      />
    );
    expect(screen.getByText("Иван Иванов")).toBeDefined();
  });
});
