// src/__tests__/commercial-funnel-awaiting-payment-reconciliation.test.ts
// Tests A through G, Direct Reconciliation, and Surface Parity for Manager Awaiting-Payment Attribution.

import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import {
  computeManagerScorecard,
  computeWipMetrics,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { createCommercialFunnelWorkbook } from "@/lib/commercial-funnel/export-excel";
import { CommercialManagersTab } from "@/components/commercial-funnel/managers-tab";
import { INVOICE_SENT_STATUS_CODES } from "@/lib/commercial-funnel/constants";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

const FIXED_NOW = new Date(2026, 8, 29, 12, 0, 0);
const bounds = computePeriodBoundaries({ periodPreset: "30days" }, FIXED_NOW);

function buildDeal(p: Partial<CommercialDeal> & { id: string }): CommercialDeal {
  return {
    title: `Сделка ${p.id}`,
    companyId: "1",
    responsibleId: "M1",
    stageId: "NEW",
    categoryId: "0",
    opportunity: 100000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    dateCreate: "2026-09-20",
    productType: [],
    direction: [],
    industry: [],
    ...p,
  } as CommercialDeal;
}

function buildCompany(p: Partial<CommercialCompany> & { id: string }): CommercialCompany {
  return {
    title: `Компания ${p.id}`,
    responsibleId: "M1",
    dateCreate: "2026-09-20",
    direction: [],
    productType: [],
    gradeGel: [],
    gradeSol: [],
    deals: [],
    hasAttention: false,
    attentionReasons: [],
    ...p,
  } as CommercialCompany;
}

describe("Commercial Funnel — Awaiting Payment Manager Reconciliation", () => {
  it("TEST A — Non-active deal still awaiting payment (primary regression)", () => {
    // Deal D1: responsible M1, terminal stage WON, paymentStatus 105
    const c1 = buildCompany({
      id: "C1",
      responsibleId: "M1",
      deals: [
        buildDeal({
          id: "D1",
          companyId: "C1",
          responsibleId: "M1",
          stageId: "WON", // Terminal / non-active stage
          paymentStatus: "105",
        }),
      ],
    });

    const wip = computeWipMetrics([c1]);
    const awaitingWip = wip.find((w) => w.id === "awaiting_payment")!;
    expect(awaitingWip.companyCount).toBe(1);
    expect(awaitingWip.companyIds).toContain("C1");

    const scorecard = computeManagerScorecard([c1], bounds);
    const m1 = scorecard.find((m) => m.responsibleId === "M1")!;
    expect(m1).toBeDefined();
    expect(m1.awaitingPayment).toBe(1);
    expect(m1.awaitingPaymentIds).toEqual(["C1"]);
  });

  it("TEST B — Status 107", () => {
    // Deal D1: responsible M1, terminal stage LOST, paymentStatus 107
    const c1 = buildCompany({
      id: "C1",
      responsibleId: "M1",
      deals: [
        buildDeal({
          id: "D1",
          companyId: "C1",
          responsibleId: "M1",
          stageId: "C1:LOSE", // Terminal / non-active stage
          paymentStatus: "107",
        }),
      ],
    });

    const wip = computeWipMetrics([c1]);
    const awaitingWip = wip.find((w) => w.id === "awaiting_payment")!;
    expect(awaitingWip.companyCount).toBe(1);
    expect(awaitingWip.companyIds).toContain("C1");

    const scorecard = computeManagerScorecard([c1], bounds);
    const m1 = scorecard.find((m) => m.responsibleId === "M1")!;
    expect(m1).toBeDefined();
    expect(m1.awaitingPayment).toBe(1);
    expect(m1.awaitingPaymentIds).toEqual(["C1"]);
  });

  it("TEST C — Status outside waiting set (status 103 excluded)", () => {
    // Deal with paymentStatus 103 (pre-payment / not in INVOICE_SENT_STATUS_CODES)
    const c1 = buildCompany({
      id: "C1",
      responsibleId: "M1",
      deals: [
        buildDeal({
          id: "D1",
          companyId: "C1",
          responsibleId: "M1",
          stageId: "WON",
          paymentStatus: "103",
        }),
      ],
    });

    const wip = computeWipMetrics([c1]);
    const awaitingWip = wip.find((w) => w.id === "awaiting_payment")!;
    expect(awaitingWip.companyCount).toBe(0);
    expect(awaitingWip.companyIds).not.toContain("C1");

    const scorecard = computeManagerScorecard([c1], bounds);
    const m1 = scorecard.find((m) => m.responsibleId === "M1");
    // Either row does not exist or awaitingPayment is 0
    if (m1) {
      expect(m1.awaitingPayment).toBe(0);
      expect(m1.awaitingPaymentIds).toEqual([]);
    }
  });

  it("TEST D — Same manager deduplication", () => {
    // Company C2 has Deal D21 (105) and Deal D22 (107), both owned by M2
    const c2 = buildCompany({
      id: "C2",
      responsibleId: "M2",
      deals: [
        buildDeal({
          id: "D21",
          companyId: "C2",
          responsibleId: "M2",
          stageId: "WON",
          paymentStatus: "105",
        }),
        buildDeal({
          id: "D22",
          companyId: "C2",
          responsibleId: "M2",
          stageId: "EXECUTING",
          paymentStatus: "107",
        }),
      ],
    });

    const scorecard = computeManagerScorecard([c2], bounds);
    const m2 = scorecard.find((m) => m.responsibleId === "M2")!;
    expect(m2).toBeDefined();
    expect(m2.awaitingPayment).toBe(1);
    expect(m2.awaitingPaymentIds).toEqual(["C2"]);
  });

  it("TEST E — Cross-manager attribution", () => {
    // Company C3: Deal D31 (105, manager M3) and Deal D32 (107, manager M4)
    const c3 = buildCompany({
      id: "C3",
      responsibleId: "M3",
      deals: [
        buildDeal({
          id: "D31",
          companyId: "C3",
          responsibleId: "M3",
          stageId: "WON",
          paymentStatus: "105",
        }),
        buildDeal({
          id: "D32",
          companyId: "C3",
          responsibleId: "M4",
          stageId: "C7:LOSE",
          paymentStatus: "107",
        }),
      ],
    });

    const scorecard = computeManagerScorecard([c3], bounds);
    const m3 = scorecard.find((m) => m.responsibleId === "M3")!;
    const m4 = scorecard.find((m) => m.responsibleId === "M4")!;
    expect(m3).toBeDefined();
    expect(m4).toBeDefined();
    expect(m3.awaitingPayment).toBe(1);
    expect(m3.awaitingPaymentIds).toEqual(["C3"]);
    expect(m4.awaitingPayment).toBe(1);
    expect(m4.awaitingPaymentIds).toEqual(["C3"]);
  });

  it("TEST F — Active portfolio must not change", () => {
    // Non-active Deal with paymentStatus 105:
    // awaitingPayment = 1, but activeCompanies must NOT increase
    const c1 = buildCompany({
      id: "C1",
      responsibleId: "M1",
      sampleStatus: undefined,
      deals: [
        buildDeal({
          id: "D1",
          companyId: "C1",
          responsibleId: "M1",
          stageId: "WON", // Terminal stage: isDealActiveStage is false
          paymentStatus: "105",
        }),
      ],
    });

    const scorecard = computeManagerScorecard([c1], bounds);
    const m1 = scorecard.find((m) => m.responsibleId === "M1")!;
    expect(m1).toBeDefined();
    expect(m1.awaitingPayment).toBe(1);
    expect(m1.awaitingPaymentIds).toEqual(["C1"]);
    expect(m1.activeCompanies).toBe(0);
    expect(m1.activeCompaniesIds).toEqual([]);
  });

  it("TEST G — No-next-step must not change", () => {
    // Non-active Deal with paymentStatus 105, activityDataKnown = true, activityNext missing
    // awaitingPayment = 1, but noNextStep must NOT increase because noNextStep requires active deal
    const c1 = buildCompany({
      id: "C1",
      responsibleId: "M1",
      deals: [
        buildDeal({
          id: "D1",
          companyId: "C1",
          responsibleId: "M1",
          stageId: "LOST", // Terminal stage
          paymentStatus: "105",
          activityDataKnown: true,
          activityNext: undefined,
        }),
      ],
    });

    const scorecard = computeManagerScorecard([c1], bounds);
    const m1 = scorecard.find((m) => m.responsibleId === "M1")!;
    expect(m1).toBeDefined();
    expect(m1.awaitingPayment).toBe(1);
    expect(m1.awaitingPaymentIds).toEqual(["C1"]);
    expect(m1.noNextStep).toBe(0);
    expect(m1.noNextStepIds).toEqual([]);
  });

  it("RECONCILIATION — Direct reconciliation assertion between canonical WIP and manager scorecard", () => {
    // Multi-company, multi-manager fixture with active and terminal deals
    const companies: CommercialCompany[] = [
      buildCompany({
        id: "C10",
        responsibleId: "M1",
        deals: [
          buildDeal({ id: "D101", companyId: "C10", responsibleId: "M1", stageId: "WON", paymentStatus: "105" }),
          buildDeal({ id: "D102", companyId: "C10", responsibleId: "M2", stageId: "EXECUTING", paymentStatus: "107" }),
        ],
      }),
      buildCompany({
        id: "C20",
        responsibleId: "M2",
        deals: [
          buildDeal({ id: "D201", companyId: "C20", responsibleId: "M2", stageId: "LOST", paymentStatus: "105" }),
        ],
      }),
      buildCompany({
        id: "C30",
        responsibleId: "M1",
        deals: [
          buildDeal({ id: "D301", companyId: "C30", responsibleId: "M1", stageId: "EXECUTING", paymentStatus: "103" }), // Not in INVOICE_SENT
        ],
      }),
      buildCompany({
        id: "C40",
        responsibleId: "M3",
        deals: [
          buildDeal({ id: "D401", companyId: "C40", responsibleId: "M3", stageId: "EXECUTING", paymentStatus: "105" }),
        ],
      }),
    ];

    const wip = computeWipMetrics(companies);
    const awaitingWip = wip.find((w) => w.id === "awaiting_payment")!;
    const canonicalSet = new Set(awaitingWip.companyIds);

    const scorecard = computeManagerScorecard(companies, bounds);

    // 1. For each manager: manager.awaitingPaymentIds must equal attributable company IDs
    for (const row of scorecard) {
      const expectedManagerCompanyIds = new Set<string>();
      for (const c of companies) {
        for (const d of c.deals) {
          const respId = d.responsibleId || c.responsibleId;
          if (respId === row.responsibleId && d.paymentStatus && INVOICE_SENT_STATUS_CODES.has(d.paymentStatus)) {
            expectedManagerCompanyIds.add(c.id);
          }
        }
      }
      expect(new Set(row.awaitingPaymentIds)).toEqual(expectedManagerCompanyIds);
      expect(row.awaitingPayment).toBe(expectedManagerCompanyIds.size);
    }

    // 2. Global union of manager awaiting-payment IDs equals canonical WIP company IDs
    const unionManagerAwaitingIds = new Set(scorecard.flatMap((m) => m.awaitingPaymentIds));
    expect(unionManagerAwaitingIds).toEqual(canonicalSet);
  });

  it("SURFACE RECONCILIATION — Excel workbook exports updated awaiting-payment manager count", async () => {
    const c1 = buildCompany({
      id: "C1",
      responsibleId: "M1",
      deals: [
        buildDeal({
          id: "D1",
          companyId: "C1",
          responsibleId: "M1",
          stageId: "WON",
          paymentStatus: "105",
        }),
      ],
    });

    const userNames = { M1: "Иван Менеджер" };
    const workbook = await createCommercialFunnelWorkbook({
      companies: [c1],
      deals: c1.deals,
      filters: {
        periodPreset: "30days",
        responsibleId: "all",
        productType: "all",
        industry: "all",
        direction: "all",
        region: "all",
      },
      userNames,
      now: FIXED_NOW,
    });

    const managersSheet = workbook.getWorksheet("Managers")!;
    expect(managersSheet).toBeDefined();

    let foundManagerRow = false;
    managersSheet.eachRow((row) => {
      const name = String(row.getCell(1).value || "");
      if (name === "Иван Менеджер") {
        foundManagerRow = true;
        // In export-excel.ts: [m.name, m.activeCompanies, m.inTesting, m.awaitingPayment, ...]
        // Cell 1: Name, Cell 2: activeCompanies (0), Cell 3: inTesting (0), Cell 4: awaitingPayment (1)
        expect(row.getCell(4).value).toBe(1);
      }
    });

    expect(foundManagerRow).toBe(true);
  });

  it("SURFACE RECONCILIATION — CommercialManagersTab UI renders updated awaiting-payment in table row and footer", () => {
    const c1 = buildCompany({
      id: "C1",
      responsibleId: "M1",
      deals: [
        buildDeal({
          id: "D1",
          companyId: "C1",
          responsibleId: "M1",
          stageId: "WON",
          paymentStatus: "105",
        }),
      ],
    });

    const userNames = { M1: "Иван Менеджер" };
    const scorecard = computeManagerScorecard([c1], bounds, [], userNames);

    render(
      React.createElement(CommercialManagersTab, {
        scorecard,
        onOpenDrillDown: vi.fn(),
      })
    );

    // Verify manager name is in document
    expect(screen.getByText("Иван Менеджер")).toBeInTheDocument();

    // Verify column header exists
    expect(screen.getByText("Ожидают оплаты")).toBeInTheDocument();

    // Verify manager row cell for awaitingPayment
    const managerRow = screen.getByText("Иван Менеджер").closest("tr")!;
    const cells = managerRow.querySelectorAll("td");
    // Column 9: awaitingPayment
    expect(cells[9].textContent).toBe("1");

    // Verify footer row uniqueCompanyCount for awaitingPaymentIds
    const footer = screen.getByText("ИТОГО").closest("tr")!;
    const footerCells = footer.querySelectorAll("td");
    expect(footerCells[9].textContent).toBe("1");

    cleanup();
  });
});
