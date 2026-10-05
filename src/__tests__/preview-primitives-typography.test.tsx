import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanyPreview } from "@/components/dashboard/company-preview";
import { DealPreview } from "@/components/dashboard/deal-preview";
import { PREVIEW_EMPTY_VALUE } from "@/components/dashboard/preview-primitives";

const mockStore = vi.hoisted(() => ({
  fields: [],
  userNames: { "1": "Иван Иванов" },
  usersCoverage: { status: "COMPLETE", fetched: 1, total: 1 },
  selectedColumns: [],
  companyColumnWidths: {},
  allDeals: [],
  dealsCoverage: null,
  isDemoMode: false,
  activitiesData: {},
  dealTypeRegistry: {},
  fetchFields: vi.fn(),
  fetchUserNames: vi.fn(),
  fetchDealActivities: vi.fn(),
}));

vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: () => mockStore,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "user-1", email: "u@example.com" } },
    status: "authenticated",
  }),
}));

vi.mock("@/components/dashboard/samples/use-smart-process-data", () => ({
  useSmartProcessData: () => ({
    smartProcessViews: [],
    byDealId: {},
    byCompanyId: {},
    dataState: "ready",
    loading: false,
    error: null,
  }),
}));

describe("Preview Typography & Primitives (Section 6)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/api/bitrix/deals/500")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            deal: {
              ID: "500",
              TITLE: "Сделка на поставку",
              OPPORTUNITY: "1500000",
              CURRENCY_ID: "RUB",
              ASSIGNED_BY_ID: "1",
              STAGE_ID: "WON",
            },
            bitrixUrl: "https://portal.example/crm/deal/details/500/",
            companyBitrixUrl: null,
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          company: {
            ID: "100",
            TITLE: "ООО «Тест»",
            ASSIGNED_BY_ID: "1",
            PHONE: "+7 999 000-00-00",
            EMAIL: "test@example.com",
          },
          deals: [],
          bitrixUrl: "https://portal.example/crm/company/details/100/",
        }),
      };
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("CompanyPreview uses PreviewFieldLabel, PreviewFieldValue, and corporate blue link styling", async () => {
    const { container } = render(
      <CompanyPreview
        id="100"
        onClose={() => {}}
      />
    );

    // Wait for data load
    expect(await screen.findByRole("heading", { name: "ООО «Тест»" })).toBeInTheDocument();

    // Verify phone/email corporate-blue links
    const phoneLink = screen.getByRole("link", { name: "+7 999 000-00-00" });
    expect(phoneLink).toHaveClass("text-primary");
    expect(phoneLink).toHaveClass("hover:underline");

    const emailLink = screen.getByRole("link", { name: "test@example.com" });
    expect(emailLink).toHaveClass("text-primary");
    expect(emailLink).toHaveClass("hover:underline");

    // Verify empty fields render PREVIEW_EMPTY_VALUE
    expect(screen.getAllByText(PREVIEW_EMPTY_VALUE).length).toBeGreaterThan(0);

    // Verify no unexpected font-mono in ordinary preview content
    expect(container.querySelector(".font-mono")).toBeNull();
  });

  it("DealPreview uses shared primitives, PREVIEW_EMPTY_VALUE, and tabular-nums without font-mono for amount", async () => {
    const { container } = render(
      <DealPreview
        id="500"
        onClose={() => {}}
      />
    );

    // Wait for data load
    expect(await screen.findByRole("heading", { name: "Сделка на поставку" })).toBeInTheDocument();

    // Verify opportunity amount uses tabular-nums and NOT font-mono
    const amountSpan = screen.getByText(/1\s*500\s*000/);
    expect(amountSpan).toBeInTheDocument();
    expect(amountSpan.className).toContain("tabular-nums");
    expect(amountSpan.className).not.toContain("font-mono");

    // Empty fields render PREVIEW_EMPTY_VALUE
    expect(screen.getAllByText(PREVIEW_EMPTY_VALUE).length).toBeGreaterThan(0);

    // Verify entire DealPreview has no font-mono
    expect(container.querySelector(".font-mono")).toBeNull();
  });
});
