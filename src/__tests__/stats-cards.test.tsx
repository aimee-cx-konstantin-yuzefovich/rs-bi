// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { useDashboardStore } from "@/store/dashboard-store";
import { isDealActive, selectRepresentativeDeal } from "@/lib/commercial-funnel/normalize";
import type { CommercialDeal } from "@/lib/commercial-funnel/types";

describe("StatsCards — Truthful Multi-Currency Dashboard Presentation", () => {
  beforeEach(() => {
    act(() => {
      useDashboardStore.setState({
        deals: [],
        allDeals: [],
        dealsLoading: false,
        dateFilter: { preset: "all" },
      });
    });
  });

  it("CASE 1: RUB only deals display single sum with ₽ symbol and no other currencies", () => {
    act(() => {
      useDashboardStore.setState({
        deals: [
          { ID: "1", TITLE: "Сделка 1", OPPORTUNITY: "100000", CURRENCY_ID: "RUB" } as any,
          { ID: "2", TITLE: "Сделка 2", OPPORTUNITY: "200000", CURRENCY_ID: "RUB" } as any,
        ],
        dealsLoading: false,
      });
    });

    render(<StatsCards />);

    expect(screen.getByText("Сумма сделок")).toBeInTheDocument();
    expect(screen.getByText(/300\s?000\s?₽/)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByText(/валюта не указана/)).not.toBeInTheDocument();
  });

  it("CASE 2: USD only deals display single sum with $ symbol and never ₽", () => {
    act(() => {
      useDashboardStore.setState({
        deals: [
          { ID: "10", TITLE: "Deal US 1", OPPORTUNITY: "10000", CURRENCY_ID: "USD" } as any,
          { ID: "11", TITLE: "Deal US 2", OPPORTUNITY: "20000", CURRENCY_ID: "USD" } as any,
        ],
        dealsLoading: false,
      });
    });

    render(<StatsCards />);

    expect(screen.getByText(/30\s?000\s?\$/)).toBeInTheDocument();
    expect(screen.queryByText(/₽/)).not.toBeInTheDocument();
    expect(screen.queryByText(/валюта не указана/)).not.toBeInTheDocument();
  });

  it("CASE 3: Mixed currencies display separate lines without cross-currency scalar summation", () => {
    act(() => {
      useDashboardStore.setState({
        deals: [
          { ID: "101", TITLE: "Deal RUB", OPPORTUNITY: "1000000", CURRENCY_ID: "RUB" } as any,
          { ID: "102", TITLE: "Deal USD", OPPORTUNITY: "20000", CURRENCY_ID: "USD" } as any,
          { ID: "103", TITLE: "Deal EUR", OPPORTUNITY: "10000", CURRENCY_ID: "EUR" } as any,
        ],
        dealsLoading: false,
      });
    });

    render(<StatsCards />);

    // Separate per-currency lines
    expect(screen.getByText(/1\s?000\s?000/)).toBeInTheDocument();
    expect(screen.getByText("₽")).toBeInTheDocument();

    expect(screen.getByText(/20\s?000/)).toBeInTheDocument();
    expect(screen.getByText("$")).toBeInTheDocument();

    expect(screen.getByText(/10\s?000/)).toBeInTheDocument();
    expect(screen.getByText("€")).toBeInTheDocument();

    // Invariant: NEVER cross-sum different currencies into a single 1 030 000 number
    expect(screen.queryByText(/1\s?030\s?000/)).not.toBeInTheDocument();
  });

  it("CASE 4: UNKNOWN currency is labeled explicitly as 'валюта не указана' and never RUB", () => {
    act(() => {
      useDashboardStore.setState({
        deals: [
          { ID: "201", TITLE: "Deal Missing Currency", OPPORTUNITY: "100000", CURRENCY_ID: "" } as any,
        ],
        dealsLoading: false,
      });
    });

    render(<StatsCards />);

    expect(screen.getByText(/100\s?000/)).toBeInTheDocument();
    expect(screen.getByText(/— валюта не указана/)).toBeInTheDocument();
    expect(screen.queryByText(/₽/)).not.toBeInTheDocument();
  });

  it("CASE 5: Zero monetary value renders 0 without any currency symbol", () => {
    act(() => {
      useDashboardStore.setState({
        deals: [
          { ID: "301", TITLE: "Deal Zero 1", OPPORTUNITY: "0", CURRENCY_ID: "RUB" } as any,
          { ID: "302", TITLE: "Deal Zero 2", OPPORTUNITY: null, CURRENCY_ID: "USD" } as any,
        ],
        dealsLoading: false,
      });
    });

    render(<StatsCards />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText(/₽/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/валюта не указана/)).not.toBeInTheDocument();
  });

  it("CASE 6: RUR currency code is normalized to RUB and displayed with ₽", () => {
    act(() => {
      useDashboardStore.setState({
        deals: [
          { ID: "401", TITLE: "Legacy RUR Deal", OPPORTUNITY: "250000", CURRENCY_ID: "RUR" } as any,
        ],
        dealsLoading: false,
      });
    });

    render(<StatsCards />);

    expect(screen.getByText(/250\s?000\s?₽/)).toBeInTheDocument();
    expect(screen.queryByText(/RUR/)).not.toBeInTheDocument();
  });

  it("CASE 7: Mixed RUB + UNKNOWN keeps both currencies strictly separated", () => {
    act(() => {
      useDashboardStore.setState({
        deals: [
          { ID: "501", TITLE: "RUB Deal", OPPORTUNITY: "500000", CURRENCY_ID: "RUB" } as any,
          { ID: "502", TITLE: "Unknown Deal", OPPORTUNITY: "150000", CURRENCY_ID: undefined } as any,
        ],
        dealsLoading: false,
      });
    });

    render(<StatsCards />);

    expect(screen.getByText(/500\s?000/)).toBeInTheDocument();
    expect(screen.getByText("₽")).toBeInTheDocument();

    expect(screen.getByText(/150\s?000/)).toBeInTheDocument();
    expect(screen.getByText(/— валюта не указана/)).toBeInTheDocument();

    // No cross-sum 650 000
    expect(screen.queryByText(/650\s?000/)).not.toBeInTheDocument();
  });

  it("renders second card with correct deal count and label", () => {
    act(() => {
      useDashboardStore.setState({
        deals: [
          { ID: "1", OPPORTUNITY: "100", CURRENCY_ID: "RUB" } as any,
          { ID: "2", OPPORTUNITY: "200", CURRENCY_ID: "RUB" } as any,
          { ID: "3", OPPORTUNITY: "300", CURRENCY_ID: "RUB" } as any,
        ],
        dealsLoading: false,
        dateFilter: { preset: "all" },
      });
    });

    render(<StatsCards />);

    expect(screen.getByText("За всё время")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("новые")).toBeInTheDocument();
  });
});

describe("Commercial Funnel — Category-Prefixed Stage Hardening", () => {
  it("treats category-prefixed terminal stages (:WON, :LOSE) as closed", () => {
    const activeDeal = {
      id: "1",
      title: "Active",
      stageId: "C1:PREPARATION",
    } as unknown as CommercialDeal;
    const wonDealCategory = {
      id: "2",
      title: "Won in Category 1",
      stageId: "C1:WON",
    } as unknown as CommercialDeal;
    const loseDealCategory = {
      id: "3",
      title: "Lost in Category 2",
      stageId: "C2:LOSE",
    } as unknown as CommercialDeal;
    const standardWonDeal = {
      id: "4",
      title: "Standard Won",
      stageId: "WON",
    } as unknown as CommercialDeal;

    // Active deal is active
    expect(isDealActive(activeDeal)).toBe(true);

    // Terminal category-prefixed stages are NOT active
    expect(isDealActive(wonDealCategory)).toBe(false);
    expect(isDealActive(loseDealCategory)).toBe(false);
    expect(isDealActive(standardWonDeal)).toBe(false);

    // selectRepresentativeDeal prioritizes active deals over category-prefixed closed deals
    const rep = selectRepresentativeDeal([wonDealCategory, activeDeal]);
    expect(rep?.id).toBe("1"); // activeDeal chosen over C1:WON
  });
});
