import { describe, it, expect } from "vitest";
import {
  applyCanonicalSampleDomain,
  normalizeCompanies,
} from "@/lib/commercial-funnel/normalize";
import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { CommercialDeal, CommercialFilters } from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Adversarial Responsibility Provenance (Section 8)", () => {
  const fixedNow = new Date("2026-09-24T12:00:00Z");

  const rawCompany = {
    ID: "comp-mixed-1",
    TITLE: "Компания Альфа (Владелец А)",
    ASSIGNED_BY_ID: "mgr-A",
    DATE_CREATE: "2026-08-01",
    UF_CRM_69257BBAB86F6: ["Гель", "Золь"], // Company product types
  };

  const dealGel: CommercialDeal = {
    id: "deal-gel-B",
    title: "Сделка Гель (Владелец Б)",
    companyId: "comp-mixed-1",
    responsibleId: "mgr-B",
    responsibleName: "Менеджер Б",
    stageId: "C4:EXECUTING",
    categoryId: "0",
    opportunity: 300000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    dateCreate: "2026-08-02",
    sampleTransferStatus: "На испытании",
    sampleSentDate: "2026-08-05", // Sent in August 2026
    productType: ["Гель"],
    direction: [],
    industry: [],
  };

  const dealSol: CommercialDeal = {
    id: "deal-sol-C",
    title: "Сделка Золь (Владелец В)",
    companyId: "comp-mixed-1",
    responsibleId: "mgr-C",
    responsibleName: "Менеджер В",
    stageId: "C4:FINAL_INVOICE",
    categoryId: "0",
    opportunity: 500000,
    opportunityQuality: "VALID",
    currencyId: "RUB",
    dateCreate: "2026-08-03",
    sampleTransferStatus: "Подошли",
    sampleSentDate: undefined,
    productType: ["Золь"],
    direction: [],
    industry: [],
  };

  const userNames: Record<string, string> = {
    "mgr-A": "Менеджер А",
    "mgr-B": "Менеджер Б",
    "mgr-C": "Менеджер В",
  };

  const augBoundaries = computePeriodBoundaries({
    periodPreset: "custom",
    customFrom: "2026-08-01",
    customTo: "2026-08-31",
  });

  // Phase C: build the canonical sample domain from raw rows (the same
  // engine as production), then project onto normalized companies.
  // Manager attribution flows from per-event provenance: Deal sent event →
  // Deal responsible (mgr-B); current state → winning Deal responsible.
  const rawDeals = [
    {
      ID: "deal-gel-B",
      COMPANY_ID: "comp-mixed-1",
      ASSIGNED_BY_ID: "mgr-B",
      STAGE_ID: "C4:EXECUTING",
      DATE_CREATE: "2026-08-02",
      UF_CRM_1779386185: "DT1032_15:CLIENT", // На испытании
      UF_CRM_1774879952785: "2026-08-05",
      UF_CRM_69257BBACD471: ["Гель"],
    },
    {
      ID: "deal-sol-C",
      COMPANY_ID: "comp-mixed-1",
      ASSIGNED_BY_ID: "mgr-C",
      STAGE_ID: "C4:FINAL_INVOICE",
      DATE_CREATE: "2026-08-03",
      UF_CRM_1779386185: "DT1032_15:SUCCESS", // Подошли
      UF_CRM_69257BBACD471: ["Золь"],
    },
  ];
  const sampleDomain = buildCanonicalSampleDomain([rawCompany], rawDeals, []);
  const baseCompanies = applyCanonicalSampleDomain(
    normalizeCompanies([rawCompany], [dealGel, dealSol], {
      userNames,
      now: fixedNow,
    }),
    sampleDomain,
    { userNames, now: fixedNow }
  );

  it("Scenario 1: No responsible filter (All Managers)", () => {
    const filters: CommercialFilters = {
      periodPreset: "custom",
      customFrom: "2026-08-01",
      customTo: "2026-08-31",
      responsibleId: "all",
    };

    const filtered = filterCompaniesByDimensions(baseCompanies, filters);
    expect(filtered).toHaveLength(1);
    const comp = filtered[0];

    // Factual owner is A
    expect(comp.responsibleId).toBe("mgr-A");
    expect(comp.companyFactsIncluded).toBe(true);

    const bottlenecks = computeBottlenecks(filtered, fixedNow);
    const scorecard = computeManagerScorecard(filtered, augBoundaries, bottlenecks, userNames);

    // Scorecard contains managers with attributable metrics
    const rowA = scorecard.find((r) => r.responsibleId === "mgr-A");
    const rowB = scorecard.find((r) => r.responsibleId === "mgr-B");
    const rowC = scorecard.find((r) => r.responsibleId === "mgr-C");

    // Manager A: owns company creation
    expect(rowA).toBeDefined();
    expect(rowA?.newCompanies).toBe(1);

    // Manager B: owns deal Gel and sample testing
    expect(rowB).toBeDefined();
    expect(rowB?.samplesSent).toBe(1);
    expect(rowB?.dealsCreated).toBe(1);

    // Manager C: owns deal Sol
    expect(rowC).toBeDefined();
    expect(rowC?.dealsCreated).toBe(1);
  });

  it("Scenario 2: Responsible = Manager B (Adversarial isolation)", () => {
    const filters: CommercialFilters = {
      periodPreset: "custom",
      customFrom: "2026-08-01",
      customTo: "2026-08-31",
      responsibleId: "mgr-B",
    };

    const filtered = filterCompaniesByDimensions(baseCompanies, filters);
    expect(filtered).toHaveLength(1);
    const comp = filtered[0];

    // Invariant: Company factual owner remains A, NOT overwritten by Deal owner B
    expect(comp.responsibleId).toBe("mgr-A");
    expect(comp.companyFactsIncluded).toBe(false);

    // Deal Gel remains, Deal Sol pruned
    expect(comp.deals).toHaveLength(1);
    expect(comp.deals[0].id).toBe("deal-gel-B");
    expect(comp.deals[0].responsibleId).toBe("mgr-B");

    // Projected sample state is Deal-derived from B
    expect(comp.sampleStatus).toBe("На испытании");
    expect(comp.sampleStatusSource).toBe("DEAL");
    expect(comp.sampleResponsibleId).toBe("mgr-B");

    const bottlenecks = computeBottlenecks(filtered, fixedNow);
    // Sample bottleneck attributed to B
    const sampleBot = bottlenecks.find((b) => b.type === "sample_testing_stalled");
    if (sampleBot) {
      expect(sampleBot.responsibleId).toBe("mgr-B");
    }

    const scorecard = computeManagerScorecard(filtered, augBoundaries, bottlenecks, userNames);

    // Manager B row exists and has Deal/sample-derived metrics
    const rowB = scorecard.find((r) => r.responsibleId === "mgr-B");
    expect(rowB).toBeDefined();
    expect(rowB?.inTesting).toBe(1);
    expect(rowB?.samplesSent).toBe(1);
    expect(rowB?.dealsCreated).toBe(1);
    // Invariant: new-company Company-owned metric is NOT attributed to B merely because B's deal matched!
    expect(rowB?.newCompanies).toBe(0);

    // Invariant: Manager A must NOT appear as an empty/ghost manager
    const rowA = scorecard.find((r) => r.responsibleId === "mgr-A");
    expect(rowA).toBeUndefined();

    // Invariant: Manager C must NOT appear
    const rowC = scorecard.find((r) => r.responsibleId === "mgr-C");
    expect(rowC).toBeUndefined();

    expect(scorecard).toHaveLength(1);
  });

  it("Scenario 3: Responsible = Manager C (Adversarial isolation)", () => {
    const filters: CommercialFilters = {
      periodPreset: "custom",
      customFrom: "2026-08-01",
      customTo: "2026-08-31",
      responsibleId: "mgr-C",
    };

    const filtered = filterCompaniesByDimensions(baseCompanies, filters);
    expect(filtered).toHaveLength(1);
    const comp = filtered[0];

    // Invariant: Company factual owner remains A
    expect(comp.responsibleId).toBe("mgr-A");
    expect(comp.companyFactsIncluded).toBe(false);

    // Deal Sol remains, Deal Gel pruned
    expect(comp.deals).toHaveLength(1);
    expect(comp.deals[0].id).toBe("deal-sol-C");
    expect(comp.deals[0].responsibleId).toBe("mgr-C");

    // Projected sample state under mgr-C's slice:
    // Phase C — the canonical current cycle is Deal Gel (mgr-B, newest
    // dated cycle). The current sample state belongs to mgr-B and does
    // NOT surface under mgr-C's slice (truthful NONE, no recomputation
    // from the filtered deal subset). mgr-C's Deal Sol remains a
    // historical sample-evidence row via sampleStatusEntries.
    expect(comp.sampleStatus).toBe("—");
    expect(comp.sampleStatusSource).toBe("NONE");
    expect(comp.sampleResponsibleId).toBeUndefined();
    expect(
      (comp.sampleStatusEntries ?? []).some(
        (e) => e.dealId === "deal-sol-C" && e.label === "Подошли"
      )
    ).toBe(true);

    const bottlenecks = computeBottlenecks(filtered, fixedNow);
    const successBot = bottlenecks.find((b) => b.type === "sample_success_no_deal");
    if (successBot) {
      expect(successBot.responsibleId).toBe("mgr-C");
    }

    const scorecard = computeManagerScorecard(filtered, augBoundaries, bottlenecks, userNames);

    // Manager C row exists (Deal Sol remains a matching commercial deal)
    const rowC = scorecard.find((r) => r.responsibleId === "mgr-C");
    expect(rowC).toBeDefined();
    // Phase C: current-sample WIP attribution follows the canonical
    // current cycle (mgr-B's Deal Gel) — mgr-C's slice shows no current
    // sample state, so sampleSuccess is 0 here.
    expect(rowC?.sampleSuccess).toBe(0);
    expect(rowC?.dealsCreated).toBe(1);
    // Company DATE_CREATE not leaked to C
    expect(rowC?.newCompanies).toBe(0);

    // Ghost manager A and manager B do not appear
    expect(scorecard.find((r) => r.responsibleId === "mgr-A")).toBeUndefined();
    expect(scorecard.find((r) => r.responsibleId === "mgr-B")).toBeUndefined();
    expect(scorecard).toHaveLength(1);
  });
});
