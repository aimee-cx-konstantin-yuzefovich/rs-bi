import { describe, it, expect } from "vitest";
import {
  buildCanonicalSampleDomain,
} from "@/lib/samples/aggregate";
import {
  applyCanonicalSampleDomain,
  normalizeCompanies,
  normalizeDeals,
} from "@/lib/commercial-funnel/normalize";
import { buildSampleRegister } from "@/lib/commercial-funnel/engine";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";
import {
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_SENT_DATE_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID,
  SMART_PROCESS_ENTITY_TYPE_ID,
} from "@/lib/crm-constants";

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
    productType: [],
    industry: [],
    direction: [],
    ...overrides,
  };
}

/**
 * Phase C re-contract: current sample state is resolved by the ONE
 * canonical sample engine (SMART_PROCESS → DEAL → COMPANY → NONE), not by
 * re-selecting deals inside normalizeCompanies. These tests exercise the
 * canonical pipeline end-to-end:
 * raw companies + raw deals + SP items → buildCanonicalSampleDomain →
 * applyCanonicalSampleDomain → CommercialCompany sample facts.
 *
 * The original deterministic-selection intent is preserved:
 * - newest authoritative state wins without array-order dependency;
 * - date provenance is never fabricated from another cycle;
 * - Company fallback works when no Deal/SP evidence exists.
 */

/** Canonical pipeline helper over raw rows. */
function canonicalCompanies(
  rawCompanies: Array<Record<string, unknown>>,
  rawDeals: Array<Record<string, unknown>>,
  spItems: Array<Record<string, unknown>> = [],
  options: { userNames?: Record<string, string>; now?: Date } = {}
): CommercialCompany[] {
  const deals = normalizeDeals(rawDeals as any, { userNames: options.userNames ?? {} });
  const companies = normalizeCompanies(rawCompanies as any, deals, {
    userNames: options.userNames ?? {},
    now: options.now,
  });
  const domain = buildCanonicalSampleDomain(
    rawCompanies as any,
    rawDeals as any,
    spItems as any
  );
  return applyCanonicalSampleDomain(companies, domain, {
    userNames: options.userNames ?? {},
    now: options.now,
  });
}

describe("Commercial Funnel Canonical Sample Cycle (TC-SAMPLE-CYCLE-01 to TC-SAMPLE-CYCLE-11)", () => {
  it("TC-SAMPLE-CYCLE-01: selects newer deal state and shipment date", () => {
    const dealA = {
      ID: "10",
      COMPANY_ID: "comp-1",
      ASSIGNED_BY_ID: "user-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2025-10-01",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:CLIENT",
    };

    const dealB = {
      ID: "20",
      COMPANY_ID: "comp-1",
      ASSIGNED_BY_ID: "user-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-09-10",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:SUCCESS",
    };

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const companies = canonicalCompanies([rawCompany], [dealA, dealB]);

    expect(companies).toHaveLength(1);
    expect(companies[0].sampleStatus).toBe("Подошли");
    expect(companies[0].sampleShipmentDate).toBe("2026-09-10");
    expect(companies[0].sampleStatusSource).toBe("DEAL");
  });

  it("TC-SAMPLE-CYCLE-02: reverse input array order yields identical result (no array-order dependency)", () => {
    const dealA = {
      ID: "10",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2025-10-01",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:CLIENT",
    };

    const dealB = {
      ID: "20",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-09-10",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:SUCCESS",
    };

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    // Pass in reverse order: [dealB, dealA]
    const companies = canonicalCompanies([rawCompany], [dealB, dealA]);

    expect(companies).toHaveLength(1);
    expect(companies[0].sampleStatus).toBe("Подошли");
    expect(companies[0].sampleShipmentDate).toBe("2026-09-10");
    expect(companies[0].sampleStatusSource).toBe("DEAL");
  });

  it("TC-SAMPLE-CYCLE-03: newer 'На испытании' overrides older 'Подошли'", () => {
    const oldDeal = {
      ID: "1",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2025-05-15",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:SUCCESS",
    };

    const newDeal = {
      ID: "2",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-09-10",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:CLIENT",
    };

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const companies = canonicalCompanies([rawCompany], [oldDeal, newDeal]);

    expect(companies[0].sampleStatus).toBe("На испытании");
    expect(companies[0].sampleShipmentDate).toBe("2026-09-10");
  });

  it("TC-SAMPLE-CYCLE-04: two deals with evidence (marker-only deal is isolated) — transfer evidence wins", () => {
    // Phase C marker isolation: the old test asserted that a marker-only
    // testing status (UF_CRM_1779394379) selects the newer deal. The marker
    // is MARKER_ONLY — it cannot create current state. The transfer status
    // on the older deal is the only state evidence → DEAL source.
    const oldDeal = {
      ID: "10",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2025-10-01",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:CLIENT",
    };

    const newDeal = {
      ID: "20",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_TESTING_FIELD_ID]: ["Подошли"], // marker only — no analytical state
    };

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const companies = canonicalCompanies([rawCompany], [oldDeal, newDeal]);

    expect(companies[0].sampleStatus).toBe("На испытании");
    expect(companies[0].sampleShipmentDate).toBe("2025-10-01");
    expect(companies[0].sampleStatusSource).toBe("DEAL");
  });

  it("TC-SAMPLE-CYCLE-05: identical timestamps use numeric Deal ID tie-break deterministically", () => {
    const deal1 = {
      ID: "10",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-09-10",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:CLIENT",
    };

    const deal2 = {
      ID: "20",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-09-10",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:SUCCESS",
    };

    // Canonical dated-cycle selection: exact sent-date equality → stable
    // numeric Deal ID tie-break (higher ID wins), regardless of input order.
    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const forward = canonicalCompanies([rawCompany], [deal1, deal2]);
    const reverse = canonicalCompanies([rawCompany], [deal2, deal1]);

    expect(forward[0].sampleCurrentResolutionQuality).toBe("RESOLVED");
    expect(reverse[0].sampleCurrentResolutionQuality).toBe("RESOLVED");
    expect(forward[0].sampleStatusSource).toBe("DEAL");
    expect(reverse[0].sampleStatusSource).toBe("DEAL");
    // Deterministic winner: Deal 20 in both orders.
    expect(forward[0].sampleStatus).toBe(reverse[0].sampleStatus);
    expect(forward[0].sampleStatus).toBe("Подошли");
    // Conflicting-status deals WITHOUT dates stay AMBIGUOUS (C3 contract).
    const undated1 = {
      ID: "10",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Переданы",
    };
    const undated2 = {
      ID: "20",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "Не переданы",
    };
    const undated = canonicalCompanies([rawCompany], [undated1, undated2]);
    expect(undated[0].sampleCurrentResolutionQuality).toBe("AMBIGUOUS");
  });

  it("TC-SAMPLE-CYCLE-06: company fallback works normally when no deal sample evidence exists", () => {
    const nonSampleDeal = {
      ID: "99",
      COMPANY_ID: "comp-1",
      DATE_CREATE: "2026-08-01",
    };

    const rawCompany = {
      ID: "comp-1",
      TITLE: "Company 1",
      [COMPANY_SAMPLES_FIELD_ID]: ["261"], // Образцы отправлены
      [COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]: "2026-08-05", // Дата передачи (single)
    };

    const companies = canonicalCompanies([rawCompany], [nonSampleDeal]);
    expect(companies[0].sampleStatus).toBe("Образцы отправлены");
    expect(companies[0].sampleStatusSource).toBe("COMPANY");
    expect(companies[0].sampleShipmentDate).toBe("2026-08-05");
  });

  it("TC-SAMPLE-CYCLE-07: historical evidence arrays preserve all dates and statuses with deal provenance", () => {
    const dealA = {
      ID: "10",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2025-10-01",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:CLIENT",
    };

    const dealB = {
      ID: "20",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-09-10",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:SUCCESS",
    };

    const rawCompany = {
      ID: "comp-1",
      TITLE: "Company 1",
      [COMPANY_SAMPLES_FIELD_ID]: ["261"], // Образцы отправлены
      [COMPANY_SAMPLES_DATE_SINGLE_FIELD_ID]: "2025-09-01",
    };

    const companies = canonicalCompanies([rawCompany], [dealA, dealB]);
    const comp = companies[0];

    // Current state is latest deal B
    expect(comp.sampleStatus).toBe("Подошли");
    expect(comp.sampleShipmentDate).toBe("2026-09-10");

    // Historical arrays preserve all distinct dates
    expect(comp.sampleDealSentDates).toEqual(["2025-10-01", "2026-09-10"]);
    expect(comp.sampleCompanyTransferDates).toEqual(["2025-09-01"]);
    expect(comp.sampleAllDates).toEqual(["2025-09-01", "2025-10-01", "2026-09-10"]);

    // Canonical sent events carry per-event provenance
    const eventDates = (comp.sampleSentEvents ?? []).map((e) => e.date).sort();
    expect(eventDates).toEqual(["2025-09-01", "2025-10-01", "2026-09-10"]);
    const dealBEvent = comp.sampleSentEvents?.find((e) => e.dealId === "20");
    expect(dealBEvent).toBeDefined();
    expect(dealBEvent?.date).toBe("2026-09-10");
  });

  it("TC-SAMPLE-CYCLE-08: older Deal with shipment date does NOT fabricate date for newer Deal without date", () => {
    // Deal A: older cycle with shipment date, closed won
    const dealA = {
      ID: "10",
      COMPANY_ID: "comp-1",
      STAGE_ID: "WON",
      DATE_CREATE: "2025-01-01",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2025-01-01",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:UC_ZARRMX",
    };

    // Deal B: newer cycle with testing status, but no shipment date (young active deal)
    const dealB = {
      ID: "20",
      COMPANY_ID: "comp-1",
      STAGE_ID: "EXECUTING",
      DATE_CREATE: "2026-03-20",
      [DEAL_SAMPLE_TESTING_FIELD_ID]: ["На испытании"], // marker only
    };

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const fixedNow = new Date("2026-03-25T12:00:00Z");

    const companies = canonicalCompanies([rawCompany], [dealA, dealB], [], { now: fixedNow });
    const comp = companies[0];

    // Marker cannot create current state; the only state evidence is Deal
    // A (Образцы отправлены, dated 2025-01-01). No date fabrication for B.
    expect(comp.sampleStatus).toBe("Образцы отправлены");
    expect(comp.sampleStatusSource).toBe("DEAL");
    expect(comp.sampleShipmentDate).toBe("2025-01-01");

    // Historical date from Deal A must still be preserved in array
    expect(comp.sampleDealSentDates).toEqual(["2025-01-01"]);
  });

  it("TC-SAMPLE-CYCLE-09: reverse input order preserves strict date provenance", () => {
    const dealA = {
      ID: "10",
      COMPANY_ID: "comp-1",
      STAGE_ID: "WON",
      DATE_CREATE: "2025-01-01",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2025-01-01",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:UC_ZARRMX",
    };

    const dealB = {
      ID: "20",
      COMPANY_ID: "comp-1",
      STAGE_ID: "EXECUTING",
      DATE_CREATE: "2026-03-20",
      [DEAL_SAMPLE_TESTING_FIELD_ID]: ["На испытании"], // marker only
    };

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    // Pass in reverse order [dealB, dealA]
    const companies = canonicalCompanies([rawCompany], [dealB, dealA]);
    const comp = companies[0];

    expect(comp.sampleStatus).toBe("Образцы отправлены");
    expect(comp.sampleShipmentDate).toBe("2025-01-01");
  });

  it("TC-SAMPLE-CYCLE-10: current Deal with its own shipment date populates shipment date and evaluates bottleneck", () => {
    const fixedNow = new Date("2026-03-25T12:00:00Z"); // 23 days later > 14 days threshold
    const dealA = {
      ID: "10",
      COMPANY_ID: "comp-1",
      STAGE_ID: "WON",
      DATE_CREATE: "2025-01-01",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2025-01-01",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:UC_ZARRMX",
    };

    const dealB = {
      ID: "20",
      COMPANY_ID: "comp-1",
      STAGE_ID: "EXECUTING",
      DATE_CREATE: "2026-03-20", // Young deal (< 30 days) so only sample bottleneck triggers
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-03-02",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:CLIENT",
    };

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };

    const companies = canonicalCompanies([rawCompany], [dealA, dealB], [], { now: fixedNow });
    const comp = companies[0];

    expect(comp.sampleStatus).toBe("На испытании");
    expect(comp.sampleShipmentDate).toBe("2026-03-02");
    expect(comp.attentionReasons).toEqual([
      "Образцы на испытании 23 дн. (порог 14 дн.)",
    ]);
    expect(comp.hasAttention).toBe(true);
  });

  it("TC-SAMPLE-CYCLE-11: buildSampleRegister enforces strict deal provenance without borrowing another deal's date or next action", () => {
    const fixedNow = new Date("2026-09-20T12:00:00Z");
    const dealA = {
      ID: "101",
      COMPANY_ID: "comp-1",
      TITLE: "Deal A",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:UC_ZARRMX",
    };

    const dealB = {
      ID: "102",
      COMPANY_ID: "comp-1",
      TITLE: "Deal B",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:UC_ZARRMX",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-09-10",
    };

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };

    // 1. Order [dealA, dealB]
    const companiesForward = canonicalCompanies([rawCompany], [dealA, dealB], [], { now: fixedNow });
    const registerForward = buildSampleRegister(companiesForward, fixedNow);

    expect(registerForward).toHaveLength(2);
    const rowAForward = registerForward.find((r: any) => r.dealId === "101")!;
    const rowBForward = registerForward.find((r: any) => r.dealId === "102")!;

    expect(rowAForward.shipmentDate).toBeUndefined();
    expect(rowAForward.nextAction).toBeUndefined();
    expect(rowBForward.shipmentDate).toBe("2026-09-10");

    // 2. Reverse order [dealB, dealA]
    const companiesReverse = canonicalCompanies([rawCompany], [dealB, dealA], [], { now: fixedNow });
    const registerReverse = buildSampleRegister(companiesReverse, fixedNow);

    expect(registerReverse).toHaveLength(2);
    const rowAReverse = registerReverse.find((r: any) => r.dealId === "101")!;
    const rowBReverse = registerReverse.find((r: any) => r.dealId === "102")!;

    expect(rowAReverse.shipmentDate).toBeUndefined();
    expect(rowAReverse.nextAction).toBeUndefined();
    expect(rowBReverse.shipmentDate).toBe("2026-09-10");

    // Exact equality of generated registers regardless of input order
    expect(registerForward).toEqual(registerReverse);
  });

  it("TC-SAMPLE-CYCLE-12: SMART_PROCESS current item wins over legacy deal evidence", () => {
    const dealLegacy = {
      ID: "10",
      COMPANY_ID: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2025-10-01",
      [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:SUCCESS", // Подошли (terminal legacy)
    };

    const spActive = {
      id: "9001",
      title: "Тестирование 9001",
      stageId: "DT1032_15:CLIENT",
      assignedById: "user-7",
      createdTime: "2026-09-01T10:00:00+03:00",
      companyId: "comp-1",
      [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: undefined,
    };

    const rawCompany = { ID: "comp-1", TITLE: "Company 1" };
    const companies = canonicalCompanies([rawCompany], [dealLegacy], [spActive]);

    expect(companies[0].sampleStatus).toBe("На испытании");
    expect(companies[0].sampleStatusSource).toBe("SMART_PROCESS");
    expect(companies[0].sampleResponsibleProcessItemId).toBe("9001");
    expect(companies[0].sampleResponsibleId).toBe("user-7");
    // Legacy history preserved: Deal sent date still an event
    expect((companies[0].sampleSentEvents ?? []).some((e) => e.date === "2025-10-01")).toBe(true);
  });
});
