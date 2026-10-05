import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SamplesPage from "@/app/samples/page";
import { PRODUCT_BRAND_NAME, PRODUCT_UI_DESCRIPTOR } from "@/lib/product-identity";

// Mock next-auth
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "user-1", name: "Константин", email: "k@russilica.ru" } },
    status: "authenticated",
  }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/samples",
}));

import type { SampleSummary, SamplesResponseMeta } from "@/lib/samples/types";

const mockSamplesData = vi.hoisted(() => ({
  samples: [] as SampleSummary[],
  meta: null as SamplesResponseMeta | null,
  orphanDealCount: 0,
  loading: false,
  refreshing: false,
  error: null as string | null,
  refreshError: null as string | null,
  reload: vi.fn(),
}));

vi.mock("@/components/dashboard/samples/use-samples-data", () => ({
  useSamplesData: () => mockSamplesData,
}));

vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: () => ({
    userNames: {},
    fetchUserNames: vi.fn(),
    usersCoverage: { status: "COMPLETE", fetched: 0, total: 0 },
    isDemoMode: false,
    checkConfig: vi.fn(),
  }),
}));

describe("Samples Viewport & Loading Parity", () => {
  beforeEach(() => {
    mockSamplesData.samples = [];
    mockSamplesData.meta = null;
    mockSamplesData.orphanDealCount = 0;
    mockSamplesData.loading = false;
    mockSamplesData.refreshing = false;
    mockSamplesData.error = null;
    mockSamplesData.refreshError = null;
  });

  it("renders consistent TerminalBrand with brand name and UI descriptor", () => {
    const { container } = render(<SamplesPage />);

    expect(screen.getByText(PRODUCT_BRAND_NAME)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_UI_DESCRIPTOR)).toBeInTheDocument();

    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("h-dvh");
    expect(root).toHaveClass("flex");
    expect(root).toHaveClass("flex-col");
    expect(root).toHaveClass("overflow-hidden");
  });

  it("renders cold loading spinner and concise text when loading is true", () => {
    mockSamplesData.loading = true;
    render(<SamplesPage />);

    expect(screen.getByText("Загрузка данных по образцам...")).toBeInTheDocument();
  });

  it("renders compact 'Обновление...' indicator during warm background refresh", () => {
    mockSamplesData.loading = false;
    mockSamplesData.refreshing = true;
    mockSamplesData.samples = [
      {
        companyId: "1",
        companyTitle: "Тест Ко",
        productFamilies: [],
        grades: [],
        quantities: [],
        sentDates: [new Date().toISOString().slice(0, 10)],
        sampleIndicators: [],
        processStatuses: [],
        currentStatusSource: "NONE",
        currentStatusValues: [],
        normalizedResult: "unknown",
        relatedDeals: [],
        sourceQuality: "structured",
        dataIssues: [],
      },
    ];

    render(<SamplesPage />);

    expect(screen.getByText("Обновление...")).toBeInTheDocument();
    expect(screen.getByText("Тест Ко")).toBeInTheDocument();
  });

  it("displays refresh error banner truthfully while preserving cached data", () => {
    mockSamplesData.loading = false;
    mockSamplesData.refreshing = false;
    mockSamplesData.refreshError = "Ошибка подключения к Bitrix24";
    mockSamplesData.samples = [
      {
        companyId: "1",
        companyTitle: "Тест Ко",
        productFamilies: [],
        grades: [],
        quantities: [],
        sentDates: [new Date().toISOString().slice(0, 10)],
        sampleIndicators: [],
        processStatuses: [],
        currentStatusSource: "NONE",
        currentStatusValues: [],
        normalizedResult: "unknown",
        relatedDeals: [],
        sourceQuality: "structured",
        dataIssues: [],
      },
    ];

    render(<SamplesPage />);

    expect(
      screen.getByText(/Не удалось обновить данные: Ошибка подключения к Bitrix24/)
    ).toBeInTheDocument();
    expect(screen.getByText("Тест Ко")).toBeInTheDocument();
  });
});
