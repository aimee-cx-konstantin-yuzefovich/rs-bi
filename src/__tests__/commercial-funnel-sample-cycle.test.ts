// src/__tests__/commercial-funnel-sample-cycle.test.ts
import { describe, it, expect } from "vitest";
import { normalizeCompanies, selectCurrentSampleDeal } from "@/lib/commercial-funnel/normalize";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

function createMockDeal(overrides: Partial<CommercialDeal>): CommercialDeal {
  return {
    id: "deal-1",
    title: "Test Deal",
    companyId: "comp-1",
    responsibleId: "user-1",
    stageId: "NEW",
    categoryId: "0",
    opportunity: 0,
    currencyId: "RUB",
    sampleTestingStatus: [],
    productType: [],
    industry: [],
    direction: [],
    ...overrides,
  };
}

describe("Commercial Funnel Sample Cycle Selection (TC-SAMPLE-CYCLE-01 to TC-SAMPLE-CYCLE-07)", () => {
  it("TC-SAMPLE-CYCLE-01: selects newer deal state and shipment date", () => {
    const dealA = createMockDeal({
      id: "10",
      sampleSentDate: "2025-10-01",
      sampleTransferStatus: "На испытании",
      sampleTransferStatusRaw: "DT1032_15:CLIENT",
    });

    const dealB = createMockDeal({
      id: "20",
      sampleSentDate: "2026-09-10",
      sampleTransferStatus: "Подошли",
      sampleTransferStatusRaw: "DT1032_15:SUCCESS",
    });

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const companies = normalizeCompanies([rawCompany], [dealA, dealB]);

    expect(companies).toHaveLength(1);
    expect(companies[0].sampleStatus).toBe("Подошли");
    expect(companies[0].sampleShipmentDate).toBe("2026-09-10");
    expect(companies[0].sampleStatusSource).toBe("DEAL");
  });

  it("TC-SAMPLE-CYCLE-02: reverse input array order yields identical result (no array-order dependency)", () => {
    const dealA = createMockDeal({
      id: "10",
      sampleSentDate: "2025-10-01",
      sampleTransferStatus: "На испытании",
      sampleTransferStatusRaw: "DT1032_15:CLIENT",
    });

    const dealB = createMockDeal({
      id: "20",
      sampleSentDate: "2026-09-10",
      sampleTransferStatus: "Подошли",
      sampleTransferStatusRaw: "DT1032_15:SUCCESS",
    });

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    // Pass in reverse order: [dealB, dealA]
    const companies = normalizeCompanies([rawCompany], [dealB, dealA]);

    expect(companies).toHaveLength(1);
    expect(companies[0].sampleStatus).toBe("Подошли");
    expect(companies[0].sampleShipmentDate).toBe("2026-09-10");
    expect(companies[0].sampleStatusSource).toBe("DEAL");
  });

  it("TC-SAMPLE-CYCLE-03: newer 'На испытании' overrides older 'Подошли'", () => {
    const oldDeal = createMockDeal({
      id: "1",
      sampleSentDate: "2025-05-15",
      sampleTransferStatus: "Подошли",
      sampleTransferStatusRaw: "DT1032_15:SUCCESS",
    });

    const newDeal = createMockDeal({
      id: "2",
      sampleSentDate: "2026-09-10",
      sampleTransferStatus: "На испытании",
      sampleTransferStatusRaw: "DT1032_15:CLIENT",
    });

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const companies = normalizeCompanies([rawCompany], [oldDeal, newDeal]);

    expect(companies[0].sampleStatus).toBe("На испытании");
    expect(companies[0].sampleShipmentDate).toBe("2026-09-10");
  });

  it("TC-SAMPLE-CYCLE-04: new deal with testing status overrides older deal with transfer status", () => {
    const oldDeal = createMockDeal({
      id: "10",
      sampleSentDate: "2025-10-01",
      sampleTransferStatus: "На испытании",
      sampleTransferStatusRaw: "DT1032_15:CLIENT",
    });

    const newDeal = createMockDeal({
      id: "20",
      sampleSentDate: "2026-09-10",
      sampleTestingStatus: ["Подошли"],
      sampleTestingStatusRaw: ["2695"],
    });

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const companies = normalizeCompanies([rawCompany], [oldDeal, newDeal]);

    expect(companies[0].sampleStatus).toBe("Подошли");
    expect(companies[0].sampleShipmentDate).toBe("2026-09-10");
  });

  it("TC-SAMPLE-CYCLE-05: identical timestamps use numeric Deal ID tie-break deterministically", () => {
    const deal1 = createMockDeal({
      id: "10",
      sampleSentDate: "2026-09-10",
      sampleTransferStatus: "Статус 10",
    });

    const deal2 = createMockDeal({
      id: "20",
      sampleSentDate: "2026-09-10",
      sampleTransferStatus: "Статус 20",
    });

    // Regardless of order, highest numeric ID (20) wins tie-break
    const selected1 = selectCurrentSampleDeal([deal1, deal2]);
    const selected2 = selectCurrentSampleDeal([deal2, deal1]);

    expect(selected1?.id).toBe("20");
    expect(selected2?.id).toBe("20");
  });

  it("TC-SAMPLE-CYCLE-06: company fallback works normally when no deal sample evidence exists", () => {
    const nonSampleDeal = createMockDeal({
      id: "99",
      dateCreate: "2026-08-01",
    });

    const rawCompany = {
      ID: "comp-1",
      TITLE: "Company 1",
      UF_CRM_1753187313314: ["261"], // Образцы отправлены
      UF_CRM_1783429999269: "2026-08-05", // Дата передачи (single)
    };

    const companies = normalizeCompanies([rawCompany], [nonSampleDeal]);
    expect(companies[0].sampleStatus).toBe("Образцы отправлены");
    expect(companies[0].sampleStatusSource).toBe("COMPANY");
    expect(companies[0].sampleShipmentDate).toBe("2026-08-05");
  });

  it("TC-SAMPLE-CYCLE-07: historical evidence arrays preserve all dates and statuses with deal provenance", () => {
    const dealA = createMockDeal({
      id: "10",
      sampleSentDate: "2025-10-01",
      sampleTransferStatus: "На испытании",
    });

    const dealB = createMockDeal({
      id: "20",
      sampleSentDate: "2026-09-10",
      sampleTransferStatus: "Подошли",
    });

    const rawCompany = {
      ID: "comp-1",
      TITLE: "Company 1",
      UF_CRM_1753187313314: ["261"], // Образцы отправлены
      UF_CRM_1783429999269: "2025-09-01",
    };

    const companies = normalizeCompanies([rawCompany], [dealA, dealB]);
    const comp = companies[0];

    // Current state is latest deal B
    expect(comp.sampleStatus).toBe("Подошли");
    expect(comp.sampleShipmentDate).toBe("2026-09-10");

    // Historical arrays preserve all distinct dates
    expect(comp.sampleDealSentDates).toEqual(["2025-10-01", "2026-09-10"]);
    expect(comp.sampleCompanyTransferDates).toEqual(["2025-09-01"]);
    expect(comp.sampleAllDates).toEqual(["2025-09-01", "2025-10-01", "2026-09-10"]);

    // sampleStatusEntries contains deal provenance
    const dealAEntry = comp.sampleStatusEntries?.find((e) => e.dealId === "10");
    const dealBEntry = comp.sampleStatusEntries?.find((e) => e.dealId === "20");
    expect(dealAEntry).toBeDefined();
    expect(dealAEntry?.label).toBe("На испытании");
    expect(dealAEntry?.eventDate).toBe("2025-10-01");

    expect(dealBEntry).toBeDefined();
    expect(dealBEntry?.label).toBe("Подошли");
    expect(dealBEntry?.eventDate).toBe("2026-09-10");
  });

  it("TC-SAMPLE-CYCLE-08: older Deal with shipment date does NOT fabricate date for newer Deal without date", () => {
    // Deal A: older cycle with shipment date, closed won
    const dealA = createMockDeal({
      id: "10",
      stageId: "WON",
      dateCreate: "2025-01-01",
      sampleSentDate: "2025-01-01",
      sampleTransferStatus: "Образцы отправлены",
    });

    // Deal B: newer cycle with testing status, but no shipment date (young active deal)
    const dealB = createMockDeal({
      id: "20",
      stageId: "EXECUTING",
      dateCreate: "2026-03-20",
      sampleTestingStatus: ["На испытании"],
    });

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const fixedNow = new Date("2026-03-25T12:00:00Z");

    const companies = normalizeCompanies([rawCompany], [dealA, dealB], { now: fixedNow });
    const comp = companies[0];

    // Current sample cycle must reflect Deal B
    expect(comp.sampleStatus).toBe("На испытании");
    expect(comp.sampleStatusSource).toBe("DEAL");
    // Date provenance MUST NOT be fabricated from Deal A
    expect(comp.sampleShipmentDate).toBeUndefined();

    // Bottleneck age logic MUST NOT trigger using Deal A's historical date
    expect(comp.attentionReasons).toEqual([]);
    expect(comp.hasAttention).toBe(false);

    // Historical date from Deal A must still be preserved in array
    expect(comp.sampleDealSentDates).toEqual(["2025-01-01"]);
  });

  it("TC-SAMPLE-CYCLE-09: reverse input order preserves strict date provenance", () => {
    const fixedNow = new Date("2026-03-25T12:00:00Z");
    const dealA = createMockDeal({
      id: "10",
      stageId: "WON",
      dateCreate: "2025-01-01",
      sampleSentDate: "2025-01-01",
      sampleTransferStatus: "Образцы отправлены",
    });

    const dealB = createMockDeal({
      id: "20",
      stageId: "EXECUTING",
      dateCreate: "2026-03-20",
      sampleTestingStatus: ["На испытании"],
    });

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    // Pass in reverse order [dealB, dealA]
    const companies = normalizeCompanies([rawCompany], [dealB, dealA], { now: fixedNow });
    const comp = companies[0];

    expect(comp.sampleStatus).toBe("На испытании");
    expect(comp.sampleShipmentDate).toBeUndefined();
    expect(comp.attentionReasons).toEqual([]);
  });

  it("TC-SAMPLE-CYCLE-10: current Deal with its own shipment date populates shipment date and evaluates bottleneck", () => {
    const fixedNow = new Date("2026-03-25T12:00:00Z"); // 23 days later > 14 days threshold
    const dealA = createMockDeal({
      id: "10",
      stageId: "WON",
      dateCreate: "2025-01-01",
      sampleSentDate: "2025-01-01",
      sampleTransferStatus: "Образцы отправлены",
    });

    const dealB = createMockDeal({
      id: "20",
      stageId: "EXECUTING",
      dateCreate: "2026-03-20", // Young deal (< 30 days) so only sample bottleneck triggers
      sampleSentDate: "2026-03-02",
      sampleTestingStatus: ["На испытании"],
    });

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };

    const companies = normalizeCompanies([rawCompany], [dealA, dealB], { now: fixedNow });
    const comp = companies[0];

    expect(comp.sampleStatus).toBe("На испытании");
    expect(comp.sampleShipmentDate).toBe("2026-03-02");
    expect(comp.attentionReasons).toEqual([
      "Образцы на испытании 23 дн. (порог 14 дн.)",
    ]);
    expect(comp.hasAttention).toBe(true);
  });
});
