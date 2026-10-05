import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CommercialSegmentsTab } from "@/components/commercial-funnel/segments-tab";
import { CommercialManagersTab } from "@/components/commercial-funnel/managers-tab";
import type { SegmentBreakdown, SegmentRow, ManagerScorecardRow } from "@/lib/commercial-funnel/types";

function makeSegmentRow(
  label: string,
  currentSamplesSent: number,
  periodSamplesSent: number
): SegmentRow {
  const pop = (count: number) => ({ count, companyIds: count > 0 ? ["1"] : [] });
  return {
    label,
    isMissingValue: false,
    current: {
      activeCompanies: pop(0),
      requireSamples: pop(0),
      samplesSent: pop(currentSamplesSent),
      inTesting: pop(0),
      passed: pop(0),
      failed: pop(0),
      rework: pop(0),
      activeDeals: pop(0),
      awaitingPayment: pop(0),
      requireAttention: pop(0),
    },
    period: {
      newCompanies: pop(0),
      samplesSent: pop(periodSamplesSent),
      dealsCreated: pop(0),
      paymentsReceived: pop(0),
      shipments: pop(0),
    },
  };
}

describe("Table Sorting Remediation (Section 4)", () => {
  describe("4A & 4B: Segments Table Sorting", () => {
    const rowA = makeSegmentRow("Сегмент А", 10, 1);
    const rowB = makeSegmentRow("Сегмент Б", 2, 20);

    const breakdown: SegmentBreakdown = {
      dimension: "industry",
      rows: [rowA, rowB],
      totalUniqueCompanyIds: ["1", "2"],
      isMultiValueDimension: false,
    };

    it("4A: current:samplesSent vs period:samplesSent have distinct sort identities and sort independently", () => {
      render(
        <CommercialSegmentsTab
          industryBreakdown={breakdown}
          directionBreakdown={breakdown}
          regionBreakdown={breakdown}
          productBreakdown={breakdown}
          onOpenDrillDown={vi.fn()}
        />
      );

      const currentBtn = screen.getByRole("button", { name: /^Отправлены/ });
      const periodBtn = screen.getByRole("button", { name: /^Компании с отправл\. образцами/ });

      // 1. Sort by CURRENT samplesSent (asc): B (2) comes before A (10)
      fireEvent.click(currentBtn);
      let cells = screen.getAllByRole("cell").filter((c) => c.textContent?.startsWith("Сегмент"));
      expect(cells.map((c) => c.textContent)).toEqual(["Сегмент Б", "Сегмент А"]);

      // Verify aria-sort on th containing currentBtn
      const currentTh = currentBtn.closest("th");
      const periodTh = periodBtn.closest("th");
      expect(currentTh).toHaveAttribute("aria-sort", "ascending");
      expect(periodTh).not.toHaveAttribute("aria-sort");

      // 2. Sort by PERIOD samplesSent (asc): A (1) comes before B (20)
      fireEvent.click(periodBtn);
      cells = screen.getAllByRole("cell").filter((c) => c.textContent?.startsWith("Сегмент"));
      expect(cells.map((c) => c.textContent)).toEqual(["Сегмент А", "Сегмент Б"]);

      expect(currentTh).not.toHaveAttribute("aria-sort");
      expect(periodTh).toHaveAttribute("aria-sort", "ascending");
    });

    it("4B: 'Сегмент' header button sorts by label with asc, desc, and tri-state reset", () => {
      render(
        <CommercialSegmentsTab
          industryBreakdown={breakdown}
          directionBreakdown={breakdown}
          regionBreakdown={breakdown}
          productBreakdown={breakdown}
          onOpenDrillDown={vi.fn()}
        />
      );

      const segmentBtn = screen.getByRole("button", { name: /^Сегмент/ });
      const segmentTh = segmentBtn.closest("th");

      // Initially no sort
      expect(segmentTh).not.toHaveAttribute("aria-sort");

      // Click 1: asc ("Сегмент А", "Сегмент Б")
      fireEvent.click(segmentBtn);
      expect(segmentTh).toHaveAttribute("aria-sort", "ascending");
      let cells = screen.getAllByRole("cell").filter((c) => c.textContent?.startsWith("Сегмент"));
      expect(cells.map((c) => c.textContent)).toEqual(["Сегмент А", "Сегмент Б"]);

      // Click 2: desc ("Сегмент Б", "Сегмент А")
      fireEvent.click(segmentBtn);
      expect(segmentTh).toHaveAttribute("aria-sort", "descending");
      cells = screen.getAllByRole("cell").filter((c) => c.textContent?.startsWith("Сегмент"));
      expect(cells.map((c) => c.textContent)).toEqual(["Сегмент Б", "Сегмент А"]);

      // Click 3: reset to default
      fireEvent.click(segmentBtn);
      expect(segmentTh).not.toHaveAttribute("aria-sort");
    });
  });

  describe("4C: Managers Table 'Внимание' Column Sorting", () => {
    const mgrA: ManagerScorecardRow = {
      responsibleId: "1",
      name: "Иванов",
      newCompanies: 0,
      samplesSent: 0,
      inTesting: 0,
      sampleSuccess: 0,
      sampleFail: 0,
      sampleRework: 0,
      dealsCreated: 0,
      paymentsReceived: 0,
      paymentAmount: 0,
      paymentAmountsByCurrency: {},
      bottlenecksCount: 15,
      companyIds: [],
      activeCompanies: 0,
      activeCompaniesIds: [],
      awaitingPayment: 0,
      awaitingPaymentIds: [],
      noNextStep: 0,
      noNextStepIds: [],
    };

    const mgrB: ManagerScorecardRow = {
      responsibleId: "2",
      name: "Петров",
      newCompanies: 0,
      samplesSent: 0,
      inTesting: 0,
      sampleSuccess: 0,
      sampleFail: 0,
      sampleRework: 0,
      dealsCreated: 0,
      paymentsReceived: 0,
      paymentAmount: 0,
      paymentAmountsByCurrency: {},
      bottlenecksCount: 3,
      companyIds: [],
      activeCompanies: 0,
      activeCompaniesIds: [],
      awaitingPayment: 0,
      awaitingPaymentIds: [],
      noNextStep: 0,
      noNextStepIds: [],
    };

    it("sorts by row.bottlenecksCount on 'Внимание' header click", () => {
      render(
        <CommercialManagersTab
          scorecard={[mgrA, mgrB]}
          onOpenDrillDown={vi.fn()}
        />
      );

      const attentionBtn = screen.getByRole("button", { name: /^Внимание/ });
      const attentionTh = attentionBtn.closest("th");

      // Click 1: asc -> Петров (3), Иванов (15)
      fireEvent.click(attentionBtn);
      expect(attentionTh).toHaveAttribute("aria-sort", "ascending");
      let names = screen.getAllByRole("row").slice(2, 4).map((r) => within(r).getAllByRole("cell")[0].textContent);
      expect(names).toEqual(["Петров", "Иванов"]);

      // Click 2: desc -> Иванов (15), Петров (3)
      fireEvent.click(attentionBtn);
      expect(attentionTh).toHaveAttribute("aria-sort", "descending");
      names = screen.getAllByRole("row").slice(2, 4).map((r) => within(r).getAllByRole("cell")[0].textContent);
      expect(names).toEqual(["Иванов", "Петров"]);
    });
  });
});
