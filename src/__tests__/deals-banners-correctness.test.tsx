import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { CoverageBanner } from "@/components/dashboard/coverage-banner";
import { EnrichmentCoverageBanner } from "@/components/dashboard/enrichment-coverage-banner";
import {
  buildEnrichmentUiWarnings,
  buildEnrichmentExtraWarnings,
  WARNING_COMPANIES_PARTIAL,
} from "@/lib/enrichment-disclosure";

describe("Deals Status Banners Correctness Suite", () => {
  beforeEach(() => {
    cleanup();
    useDashboardStore.setState({
      isConfigured: null,
      isDemoMode: false,
      dealsCoverage: null,
      usersCoverage: null,
      activitiesCoverage: null,
      companiesDataCoverage: null,
      fieldsCoverage: null,
      selectedColumns: ["TITLE", "COMPANY_TITLE"],
      dismissedBannerIds: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe("ConfigBanner (Tests A, B, C)", () => {
    it("TEST A: isConfigured = true -> renders nothing; 'Подключение к CRM активно' is NOT present", () => {
      useDashboardStore.setState({ isConfigured: true, isDemoMode: false });
      const { container } = render(<ConfigBanner />);
      expect(container.firstChild).toBeNull();
      expect(screen.queryByText(/Подключение к CRM активно/i)).toBeNull();
    });

    it("TEST B: isConfigured = false -> CRM connection error banner is visible", () => {
      useDashboardStore.setState({ isConfigured: false, isDemoMode: false });
      render(<ConfigBanner />);
      expect(screen.getByText("CRM не подключено — обратитесь к администратору")).toBeInTheDocument();
      expect(screen.getByTestId("config-banner")).toBeInTheDocument();
    });

    it("TEST C: isConfigured = null -> renders nothing (no premature banner)", () => {
      useDashboardStore.setState({ isConfigured: null, isDemoMode: false });
      const { container } = render(<ConfigBanner />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Company Enrichment Disclosure & Zero-Failure Prevention (Tests D, E, F, G)", () => {
    it("TEST D: total = 526, fetched = 526, zero failures -> buildEnrichmentUiWarnings and Excel extraWarnings contain NO company failure warning", () => {
      const cov = {
        status: "PARTIAL" as const,
        fetched: 526,
        total: 526,
        warning: "Не удалось получить данные 0 из 526 компаний из CRM.",
      };

      const uiWarnings = buildEnrichmentUiWarnings({
        selectedColumns: ["COMPANY_TITLE"],
        companiesDataCoverage: cov,
      });
      expect(uiWarnings).toEqual([]);

      const excelWarnings = buildEnrichmentExtraWarnings({
        selectedColumns: ["COMPANY_TITLE"],
        companiesDataCoverage: cov,
      });
      expect(excelWarnings).toEqual([]);
    });

    it("TEST E: total = 526, fetched = 520, actual partial failure -> warning contains '6 из 526', never zero", () => {
      const cov = {
        status: "PARTIAL" as const,
        fetched: 520,
        total: 526,
        warning: "Не удалось получить данные 6 из 526 компаний из CRM.",
      };

      const uiWarnings = buildEnrichmentUiWarnings({
        selectedColumns: ["COMPANY_TITLE"],
        companiesDataCoverage: cov,
      });
      expect(uiWarnings).toHaveLength(1);
      expect(uiWarnings[0]).toBe("Не удалось получить данные 6 из 526 компаний из CRM.");
      expect(uiWarnings[0]).not.toContain("0 из");

      const excelWarnings = buildEnrichmentExtraWarnings({
        selectedColumns: ["COMPANY_TITLE"],
        companiesDataCoverage: cov,
      });
      expect(excelWarnings).toHaveLength(1);
      expect(excelWarnings[0]).toContain("6 из 526");
      expect(excelWarnings[0]).not.toContain("0 из");
    });

    it("TEST F: genuine PARTIAL without known total -> truthful generic partial warning remains", () => {
      const cov = {
        status: "PARTIAL" as const,
        fetched: 0,
        warning: "Ошибка сети",
      };

      const excelWarnings = buildEnrichmentExtraWarnings({
        selectedColumns: ["COMPANY_TITLE"],
        companiesDataCoverage: cov,
      });
      expect(excelWarnings).toHaveLength(1);
      expect(excelWarnings[0]).toBe(WARNING_COMPANIES_PARTIAL);

      const uiWarnings = buildEnrichmentUiWarnings({
        selectedColumns: ["COMPANY_TITLE"],
        companiesDataCoverage: cov,
      });
      expect(uiWarnings).toHaveLength(1);
      expect(uiWarnings[0]).toContain("Не удалось получить данные части компаний из CRM.");
    });

    it("TEST G: CAPPED data with real truncation -> appropriate incomplete-data disclosure remains", () => {
      const cov = {
        status: "CAPPED" as const,
        fetched: 500,
        total: 1000,
        cap: 500,
        warning: "Данные усечены. Загружено 500 из 1000 (лимит 500).",
      };

      const excelWarnings = buildEnrichmentExtraWarnings({
        selectedColumns: ["COMPANY_TITLE"],
        companiesDataCoverage: cov,
      });
      expect(excelWarnings).toHaveLength(1);
      expect(excelWarnings[0]).toContain("Данные усечены");
      expect(excelWarnings[0]).not.toMatch(/\b0 из\b/);
    });
  });

  describe("Session-Scoped Dismissal Across Component Remount (Test H)", () => {
    it("ConfigBanner: dismissal survives unmount/remount in current session and resets on fresh session", () => {
      useDashboardStore.setState({ isConfigured: false });

      // 1. Initial render: banner visible
      const { unmount } = render(<ConfigBanner />);
      expect(screen.getByTestId("config-banner")).toBeInTheDocument();

      // 2. Click dismiss
      fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
      expect(screen.queryByTestId("config-banner")).toBeNull();

      // 3. Unmount (simulates navigating away to /companies)
      unmount();

      // 4. Remount (simulates navigating back to Deals /)
      const { unmount: unmount2 } = render(<ConfigBanner />);
      expect(screen.queryByTestId("config-banner")).toBeNull();
      unmount2();

      // 5. Fresh session / reload: reset dismissed banners restores visibility
      useDashboardStore.getState().resetDismissedBanners();
      render(<ConfigBanner />);
      expect(screen.getByTestId("config-banner")).toBeInTheDocument();
    });

    it("CoverageBanner: dismissal survives unmount/remount in current session", () => {
      useDashboardStore.setState({
        dealsCoverage: {
          status: "PARTIAL",
          fetched: 100,
          total: 200,
          warning: "Часть сделок не загружена",
        },
      });

      // 1. Initial render
      const { unmount } = render(<CoverageBanner />);
      expect(screen.getByTestId("coverage-banner")).toBeInTheDocument();

      // 2. Click dismiss
      fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
      expect(screen.queryByTestId("coverage-banner")).toBeNull();

      // 3. Unmount and remount
      unmount();
      const { unmount: unmount2 } = render(<CoverageBanner />);
      expect(screen.queryByTestId("coverage-banner")).toBeNull();
      unmount2();

      // 4. Reset dismissed banners restores visibility
      useDashboardStore.getState().resetDismissedBanners();
      render(<CoverageBanner />);
      expect(screen.getByTestId("coverage-banner")).toBeInTheDocument();
    });

    it("EnrichmentCoverageBanner: dismissal survives unmount/remount in current session", () => {
      useDashboardStore.setState({
        selectedColumns: ["COMPANY_TITLE"],
        companiesDataCoverage: {
          status: "PARTIAL",
          fetched: 520,
          total: 526,
          warning: "Не удалось загрузить данные для 6 компаний.",
        },
      });

      // 1. Initial render
      const { unmount } = render(<EnrichmentCoverageBanner />);
      expect(screen.getByTestId("enrichment-coverage-banner")).toBeInTheDocument();

      // 2. Click dismiss
      fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
      expect(screen.queryByTestId("enrichment-coverage-banner")).toBeNull();

      // 3. Unmount and remount
      unmount();
      const { unmount: unmount2 } = render(<EnrichmentCoverageBanner />);
      expect(screen.queryByTestId("enrichment-coverage-banner")).toBeNull();
      unmount2();

      // 4. Reset dismissed banners restores visibility
      useDashboardStore.getState().resetDismissedBanners();
      render(<EnrichmentCoverageBanner />);
      expect(screen.getByTestId("enrichment-coverage-banner")).toBeInTheDocument();
    });
  });
});
