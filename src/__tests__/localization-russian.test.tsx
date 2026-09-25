import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "@/components/dashboard/header";
import { PipelineFilter } from "@/components/dashboard/pipeline-filter";
import { ActiveFilters } from "@/components/dashboard/active-filters";
import { DealPreview } from "@/components/dashboard/deal-preview";
import { DataTable } from "@/components/dashboard/data-table";
import {
  PRODUCT_BRAND_NAME,
  PRODUCT_UI_DESCRIPTOR,
  PRODUCT_UI_TITLE,
  PRODUCT_NAME,
} from "@/lib/product-identity";
import { getDealStageDisplayLabel } from "@/lib/crm-constants";
import { formatStageToRussian, translateCrmValueToRussian } from "@/lib/excel-brand/status";
import { useDashboardStore } from "@/store/dashboard-store";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next-auth/react
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { name: "Тестовый Пользователь", email: "test@russilica.ru", role: "admin" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

// Mock nuqs
vi.mock("nuqs", () => ({
  useQueryState: (key: string) => {
    if (key === "date") return [{ preset: "all" }, vi.fn()];
    if (key === "pipeline") return ["all", vi.fn()];
    if (key === "search") return ["", vi.fn()];
    if (key === "responsible") return ["all", vi.fn()];
    if (key === "page") return [1, vi.fn()];
    if (key === "size") return [25, vi.fn()];
    if (key === "filters") return [[], vi.fn()];
    return [null, vi.fn()];
  },
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

describe("Russian UI Localization Consistency", () => {
  beforeEach(() => {
    useDashboardStore.setState({
      allDeals: [],
      deals: [],
      fields: [],
      selectedColumns: ["TITLE", "STAGE_ID"],
      pipelineFilter: "all",
      dateFilter: { preset: "all" },
      responsibleFilter: "all",
      searchQuery: "",
      columnFilters: [],
      columnSort: { columnId: "", direction: null },
      userNames: {},
      companiesData: {},
      activitiesData: {},
    });
  });

  describe("Product Identity & Header Branding", () => {
    it("exports canonical Russian UI descriptor and brand constants", () => {
      expect(PRODUCT_BRAND_NAME).toBe("RusSilica");
      expect(PRODUCT_UI_DESCRIPTOR).toBe("Аналитический терминал");
      expect(PRODUCT_UI_TITLE).toBe("RusSilica · Аналитический терминал");
      expect(PRODUCT_NAME).toBe("RusSilica BI Terminal");
    });

    it("renders 'Аналитический терминал' in Header and does not render 'BI Terminal'", () => {
      render(<Header />);
      expect(screen.getByText("RusSilica")).toBeInTheDocument();
      expect(screen.getByText("Аналитический терминал")).toBeInTheDocument();
      expect(screen.queryByText("BI Terminal")).not.toBeInTheDocument();
    });
  });

  describe("Pipeline Filter Russian Labels", () => {
    it("renders 'Успешные' and 'Проиграны' tab buttons and does NOT render raw 'WON' or 'LOSE' as labels", () => {
      const deals = [
        { ID: "1", TITLE: "Сделка 1", STAGE_ID: "WON" },
        { ID: "2", TITLE: "Сделка 2", STAGE_ID: "C1:WON" },
        { ID: "3", TITLE: "Сделка 3", STAGE_ID: "LOSE" },
        { ID: "4", TITLE: "Сделка 4", STAGE_ID: "C2:LOSE" },
        { ID: "5", TITLE: "Сделка 5", STAGE_ID: "EXECUTING" },
      ];

      useDashboardStore.setState({ allDeals: deals as any, pipelineFilter: "all" });

      render(<PipelineFilter />);

      // Check buttons
      expect(screen.getByRole("button", { name: /Все/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /В работе/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Успешные/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Проиграны/ })).toBeInTheDocument();

      // Ensure raw WON and LOSE buttons do not exist
      expect(screen.queryByRole("button", { name: /^WON/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^LOSE/ })).not.toBeInTheDocument();

      // Check badge counts: 2 won (WON + C1:WON), 2 lose (LOSE + C2:LOSE), 1 in work (EXECUTING)
      expect(screen.getByRole("button", { name: /Успешные/ })).toHaveTextContent("2");
      expect(screen.getByRole("button", { name: /Проиграны/ })).toHaveTextContent("2");
      expect(screen.getByRole("button", { name: /В работе/ })).toHaveTextContent("1");
    });
  });

  describe("Active Filters Russian Badges", () => {
    it("renders 'Воронка' and 'Успешные' for WON pipeline filter", () => {
      useDashboardStore.setState({ pipelineFilter: "WON" });
      render(<ActiveFilters />);

      // Click popover trigger to reveal items
      const trigger = screen.getByRole("button");
      fireEvent.click(trigger);

      expect(screen.getByText("Воронка")).toBeInTheDocument();
      expect(screen.getByText("Успешные")).toBeInTheDocument();
      expect(screen.queryByText("WON")).not.toBeInTheDocument();
    });

    it("renders 'Воронка' and 'Проиграны' for LOSE pipeline filter", () => {
      useDashboardStore.setState({ pipelineFilter: "LOSE" });
      render(<ActiveFilters />);

      // Click popover trigger to reveal items
      const trigger = screen.getByRole("button");
      fireEvent.click(trigger);

      expect(screen.getByText("Воронка")).toBeInTheDocument();
      expect(screen.getByText("Проиграны")).toBeInTheDocument();
      expect(screen.queryByText("LOSE")).not.toBeInTheDocument();
    });
  });

  describe("Stage Display Normalization (getDealStageDisplayLabel)", () => {
    it("correctly translates raw stages and category-prefixed stages to Russian", () => {
      expect(getDealStageDisplayLabel("WON")).toBe("Успешные");
      expect(getDealStageDisplayLabel("C1:WON")).toBe("Успешные");
      expect(getDealStageDisplayLabel("LOSE")).toBe("Проиграны");
      expect(getDealStageDisplayLabel("LOST")).toBe("Проиграны");
      expect(getDealStageDisplayLabel("C2:LOSE")).toBe("Проиграны");
      expect(getDealStageDisplayLabel("C2:LOST")).toBe("Проиграны");
      expect(getDealStageDisplayLabel("NEW")).toBe("Новые");
      expect(getDealStageDisplayLabel("C1:NEW")).toBe("Новые");
      expect(getDealStageDisplayLabel("PREPARATION")).toBe("Подготовка");
      expect(getDealStageDisplayLabel("EXECUTING")).toBe("В работе");
      expect(getDealStageDisplayLabel("PREPAYMENT_INVOICE")).toBe("Счёт на предоплату");
      expect(getDealStageDisplayLabel("FINAL_INVOICE")).toBe("Финальный счёт");
      expect(getDealStageDisplayLabel("INVOICE_SENT")).toBe("Счёт выставлен");
      expect(getDealStageDisplayLabel(null)).toBe("—");
      expect(getDealStageDisplayLabel("")).toBe("—");
    });
  });

  describe("Excel Stage Normalization", () => {
    it("translates category-prefixed stages to formal Russian for Excel reports", () => {
      expect(formatStageToRussian("WON")).toBe("Успешно завершена");
      expect(formatStageToRussian("C1:WON")).toBe("Успешно завершена");
      expect(formatStageToRussian("LOSE")).toBe("Провалена");
      expect(formatStageToRussian("C2:LOSE")).toBe("Провалена");
      expect(formatStageToRussian("NEW")).toBe("Новая сделка");
      expect(formatStageToRussian("EXECUTING")).toBe("В работе");

      expect(translateCrmValueToRussian("WON")).toBe("Успешно завершена");
      expect(translateCrmValueToRussian("C1:WON")).toBe("Успешно завершена");
      expect(translateCrmValueToRussian("LOSE")).toBe("Провалена");
      expect(translateCrmValueToRussian("C2:LOSE")).toBe("Провалена");
    });
  });

  describe("DataTable Stage Localization", () => {
    it("renders 'Успешные' and 'Проиграны' badges in table cells for raw and category-prefixed stages", () => {
      const deals = [
        { ID: "101", TITLE: "Сделка 101", STAGE_ID: "WON" },
        { ID: "102", TITLE: "Сделка 102", STAGE_ID: "C1:WON" },
        { ID: "103", TITLE: "Сделка 103", STAGE_ID: "LOSE" },
        { ID: "104", TITLE: "Сделка 104", STAGE_ID: "C2:LOSE" },
      ];
      const fields = [
        { id: "TITLE", title: "Название сделки", type: "string" },
        { id: "STAGE_ID", title: "Стадия", type: "enumeration" },
      ];

      useDashboardStore.setState({
        deals: deals as any,
        allDeals: deals as any,
        fields: fields as any,
        selectedColumns: ["TITLE", "STAGE_ID"],
        dealsLoading: false,
        dealsError: null,
      });

      render(<DataTable />);

      const wonBadges = screen.getAllByText("Успешные");
      expect(wonBadges).toHaveLength(2);

      const loseBadges = screen.getAllByText("Проиграны");
      expect(loseBadges).toHaveLength(2);

      expect(screen.queryByText("WON")).not.toBeInTheDocument();
      expect(screen.queryByText("LOSE")).not.toBeInTheDocument();
      expect(screen.queryByText("C1:WON")).not.toBeInTheDocument();
      expect(screen.queryByText("C2:LOSE")).not.toBeInTheDocument();
    });
  });

  describe("Deal Preview Localization", () => {
    it("renders Russian stage label and 'валюта не указана' for UNKNOWN currency", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          deal: {
            ID: "101",
            TITLE: "Тестовая сделка",
            STAGE_ID: "C1:WON",
            OPPORTUNITY: 250000,
            CURRENCY_ID: "UNKNOWN",
            COMPANY_ID: "42",
            UF_BOOLEAN_TEST: true,
          },
          bitrixUrl: "https://russilica.bitrix24.ru/crm/deal/details/101/",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<DealPreview id="101" onClose={() => {}} />);

      expect(await screen.findByText("Тестовая сделка")).toBeInTheDocument();
      // Stage badge should be Успешные
      expect(screen.getByText("Успешные")).toBeInTheDocument();
      expect(screen.queryByText("C1:WON")).not.toBeInTheDocument();
      // Currency should be "валюта не указана"
      expect(screen.getByText("валюта не указана")).toBeInTheDocument();

      vi.unstubAllGlobals();
    });
  });
});
