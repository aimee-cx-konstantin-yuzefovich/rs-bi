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
  computeWipMetrics,
  filterCompaniesByDimensions,
} from "@/lib/commercial-funnel/engine";
import { computeSegmentBreakdown } from "@/lib/commercial-funnel/analytics";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import type {
  CommercialCompany,
  CommercialDeal,
  CommercialFilters,
} from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Closure Patch Verification", () => {
  const boundariesSept = computePeriodBoundaries({
    periodPreset: "custom",
    customFrom: "2026-09-01",
    customTo: "2026-09-30",
  });
  const now = new Date("2026-09-20T12:00:00Z");

  // ──────────────────────────────────────────────────────────────────────────
  // P1-1: Responsible Filter for Historical Smart Process Sent Events
  // ──────────────────────────────────────────────────────────────────────────
  describe("P1-1: Responsible filter for historical Smart Process sent events", () => {
    it("Mandatory adversarial test: historical SP event owned by manager-A, current SP cycle owned by manager-B", () => {
      const rawCompany = {
        ID: "comp-c1",
        TITLE: "Компания C1",
        ASSIGNED_BY_ID: "owner-X",
        DATE_CREATE: "2026-08-01",
      };

      // Raw SP items:
      // Item 101: Historical sent event in period (2026-09-10) assigned to manager-A (terminal lose/success or past cycle)
      // Item 102: Current active testing cycle assigned to manager-B with no sent date in period
      const rawSpItems = [
        {
          id: "101",
          companyId: "comp-c1",
          assignedById: "manager-A",
          stageId: "DT1032_15:SUCCESS",
          UF_CRM_7_1766059943: "2026-09-10", // Sent date in Sept 2026
          createdTime: "2026-09-10T10:00:00Z",
          updatedTime: "2026-09-10T10:00:00Z",
        },
        {
          id: "102",
          companyId: "comp-c1",
          assignedById: "manager-B",
          stageId: "DT1032_15:CLIENT", // "На испытании"
          createdTime: "2026-09-15T10:00:00Z",
          updatedTime: "2026-09-15T10:00:00Z",
        },
      ];

      const userNames: Record<string, string> = {
        "owner-X": "Владелец X",
        "manager-A": "Менеджер А",
        "manager-B": "Менеджер Б",
      };

      const domain = buildCanonicalSampleDomain([rawCompany], [], rawSpItems);
      const baseCompanies = applyCanonicalSampleDomain(
        normalizeCompanies([rawCompany], [], { userNames, now }),
        domain,
        { userNames, now }
      );

      // Verify base company facts
      expect(baseCompanies).toHaveLength(1);
      const c = baseCompanies[0];
      expect(c.sampleStatus).toBe("На испытании");
      expect(c.sampleResponsibleId).toBe("manager-B");
      expect(c.sampleSentEvents).toHaveLength(1);
      expect(c.sampleSentEvents![0].responsibleId).toBe("manager-A");
      expect(c.sampleSentEvents![0].date).toBe("2026-09-10");

      // Filter: manager-A
      const filterA: CommercialFilters = {
        periodPreset: "custom",
        customFrom: "2026-09-01",
        customTo: "2026-09-30",
        responsibleId: "manager-A",
      };
      const filteredA = filterCompaniesByDimensions(baseCompanies, filterA);
      expect(filteredA).toHaveLength(1); // company retained due to historical sent event!
      expect(filteredA[0].companyFactsIncluded).toBe(false);
      expect(filteredA[0].sampleStatus).toBe("—"); // current sample WIP is manager-B, not manager-A
      expect(filteredA[0].sampleSentEvents).toHaveLength(1);
      expect(filteredA[0].sampleSentEvents![0].responsibleId).toBe("manager-A");

      const periodMetricsA = computePeriodMetrics(filteredA, boundariesSept);
      const samplesSentKpiA = periodMetricsA.find((k) => k.id === "samples_sent")!;
      expect(samplesSentKpiA.currentValue).toBe(1);

      const wipMetricsA = computeWipMetrics(filteredA);
      const inTestingWipA = wipMetricsA.find((k) => k.id === "На испытании")!;
      expect(inTestingWipA.companyCount).toBe(0);

      // Filter: manager-B
      const filterB: CommercialFilters = {
        periodPreset: "custom",
        customFrom: "2026-09-01",
        customTo: "2026-09-30",
        responsibleId: "manager-B",
      };
      const filteredB = filterCompaniesByDimensions(baseCompanies, filterB);
      expect(filteredB).toHaveLength(1); // company retained due to current sample cycle
      expect(filteredB[0].companyFactsIncluded).toBe(false);
      expect(filteredB[0].sampleStatus).toBe("На испытании"); // current sample WIP belongs to manager-B
      expect(filteredB[0].sampleSentEvents).toHaveLength(0); // manager-A's sent event filtered out!

      const periodMetricsB = computePeriodMetrics(filteredB, boundariesSept);
      const samplesSentKpiB = periodMetricsB.find((k) => k.id === "samples_sent")!;
      expect(samplesSentKpiB.currentValue).toBe(0);

      const wipMetricsB = computeWipMetrics(filteredB);
      const inTestingWipB = wipMetricsB.find((k) => k.id === "На испытании")!;
      expect(inTestingWipB.companyCount).toBe(1);
    });

    it("Two SP sent events in period: manager-A and manager-B each see only their own event", () => {
      const rawCompany = {
        ID: "comp-c2",
        TITLE: "Компания C2",
        ASSIGNED_BY_ID: "owner-X",
        DATE_CREATE: "2026-08-01",
      };

      const rawSpItems = [
        {
          id: "201",
          companyId: "comp-c2",
          assignedById: "manager-A",
          stageId: "DT1032_15:SUCCESS",
          UF_CRM_7_1766059943: "2026-09-05",
          createdTime: "2026-09-05T10:00:00Z",
          updatedTime: "2026-09-05T10:00:00Z",
        },
        {
          id: "202",
          companyId: "comp-c2",
          assignedById: "manager-B",
          stageId: "DT1032_15:SUCCESS",
          UF_CRM_7_1766059943: "2026-09-20",
          createdTime: "2026-09-20T10:00:00Z",
          updatedTime: "2026-09-20T10:00:00Z",
        },
      ];

      const domain = buildCanonicalSampleDomain([rawCompany], [], rawSpItems);
      const baseCompanies = applyCanonicalSampleDomain(
        normalizeCompanies([rawCompany], [], { now }),
        domain,
        { now }
      );

      // Filter manager-A
      const filteredA = filterCompaniesByDimensions(baseCompanies, {
        periodPreset: "custom",
        customFrom: "2026-09-01",
        customTo: "2026-09-30",
        responsibleId: "manager-A",
      });
      expect(filteredA[0].sampleSentEvents).toHaveLength(1);
      expect(filteredA[0].sampleSentEvents![0].responsibleId).toBe("manager-A");
      expect(filteredA[0].sampleSentEvents![0].date).toBe("2026-09-05");
      const kpiA = computePeriodMetrics(filteredA, boundariesSept).find((k) => k.id === "samples_sent")!;
      expect(kpiA.currentValue).toBe(1);

      // Filter manager-B
      const filteredB = filterCompaniesByDimensions(baseCompanies, {
        periodPreset: "custom",
        customFrom: "2026-09-01",
        customTo: "2026-09-30",
        responsibleId: "manager-B",
      });
      expect(filteredB[0].sampleSentEvents).toHaveLength(1);
      expect(filteredB[0].sampleSentEvents![0].responsibleId).toBe("manager-B");
      expect(filteredB[0].sampleSentEvents![0].date).toBe("2026-09-20");
      const kpiB = computePeriodMetrics(filteredB, boundariesSept).find((k) => k.id === "samples_sent")!;
      expect(kpiB.currentValue).toBe(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P1-2: Smart Process Responsible Name Provenance
  // ──────────────────────────────────────────────────────────────────────────
  describe("P1-2: Smart Process responsible name provenance", () => {
    it("Mandatory test: Company owner A (Alice), Smart Process manager B (Bob), no deals owned by B", () => {
      const rawCompany = {
        ID: "comp-p12",
        TITLE: "ООО Ромашка",
        ASSIGNED_BY_ID: "A",
        DATE_CREATE: "2026-08-01",
      };

      const rawSpItems = [
        {
          id: "301",
          companyId: "comp-p12",
          assignedById: "B",
          stageId: "DT1032_15:CLIENT",
          createdTime: "2026-09-01T10:00:00Z",
          updatedTime: "2026-09-01T10:00:00Z",
        },
      ];

      const userNames = {
        A: "Alice",
        B: "Bob",
      };

      const domain = buildCanonicalSampleDomain([rawCompany], [], rawSpItems);
      const companies = applyCanonicalSampleDomain(
        normalizeCompanies([rawCompany], [], { userNames, now }),
        domain,
        { userNames, now }
      );

      expect(companies).toHaveLength(1);
      const c = companies[0];
      expect(c.responsibleId).toBe("A");
      expect(c.responsibleName).toBe("Alice");
      expect(c.sampleResponsibleId).toBe("B");
      // Must be Bob, NEVER Alice!
      expect(c.sampleResponsibleName).toBe("Bob");
      expect(c.sampleResponsibleName).not.toBe("Alice");

      // Verify bottlenecks
      const bottlenecks = computeBottlenecks(companies, now);
      // If testing stalled bottleneck exists, its responsibleName must be Bob, not Alice
      for (const b of bottlenecks) {
        if (b.type === "sample_testing_stalled") {
          expect(b.responsibleId).toBe("B");
          expect(b.responsibleName).toBe("Bob");
        }
      }
    });

    it("Resolves fallback to ID when userNames does not contain manager ID", () => {
      const rawCompany = {
        ID: "comp-p12-id",
        TITLE: "ООО Василек",
        ASSIGNED_BY_ID: "A",
        DATE_CREATE: "2026-08-01",
      };

      const rawSpItems = [
        {
          id: "302",
          companyId: "comp-p12-id",
          assignedById: "9999",
          stageId: "DT1032_15:CLIENT",
          createdTime: "2026-09-01T10:00:00Z",
          updatedTime: "2026-09-01T10:00:00Z",
        },
      ];

      const domain = buildCanonicalSampleDomain([rawCompany], [], rawSpItems);
      const companies = applyCanonicalSampleDomain(
        normalizeCompanies([rawCompany], [], { userNames: { A: "Alice" }, now }),
        domain,
        { userNames: { A: "Alice" }, now }
      );

      const c = companies[0];
      expect(c.sampleResponsibleId).toBe("9999");
      expect(c.sampleResponsibleName).toBe("ID 9999");
      expect(c.sampleResponsibleName).not.toBe("Alice");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P1-3: Complete Defect F: Remove DEAL_LEGACY Sibling Fallback
  // ──────────────────────────────────────────────────────────────────────────
  describe("P1-3: Complete Defect F: Remove DEAL_LEGACY sibling fallback", () => {
    it("Case 1: sampleStatusSource = DEAL, sampleResponsibleDealId = D2, D1 and D2 have same sample status", () => {
      const c: CommercialCompany = {
        id: "c-f1",
        title: "Компания Case 1",
        responsibleId: "u1",
        direction: [],
        productType: [],
        sampleStatus: "На испытании",
        sampleStatusSource: "DEAL",
        sampleResponsibleDealId: "D2",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [
          {
            id: "D1",
            title: "Сделка D1",
            companyId: "c-f1",
            responsibleId: "u1",
            stageId: "EXECUTING",
            categoryId: "0",
            sampleTransferStatus: "На испытании",
            opportunity: 100_000,
            currencyId: "RUB",
            productType: [],
            industry: [],
            direction: [],
          },
          {
            id: "D2",
            title: "Сделка D2",
            companyId: "c-f1",
            responsibleId: "u1",
            stageId: "EXECUTING",
            categoryId: "0",
            sampleTransferStatus: "На испытании",
            opportunity: 200_000,
            currencyId: "RUB",
            productType: [],
            industry: [],
            direction: [],
          },
        ],
        hasAttention: false,
        attentionReasons: [],
      };

      const wip = computeWipMetrics([c]);
      const inTesting = wip.find((w) => w.id === "На испытании")!;
      expect(inTesting.companyCount).toBe(1);
      // Exactly 1 deal counted, bound to D2
      expect(inTesting.dealCount).toBe(1);
    });

    it("Case 2: sampleStatusSource = DEAL, sampleResponsibleDealId = undefined, Deals have matching status", () => {
      const c: CommercialCompany = {
        id: "c-f2",
        title: "Компания Case 2",
        responsibleId: "u1",
        direction: [],
        productType: [],
        sampleStatus: "На испытании",
        sampleStatusSource: "DEAL",
        sampleResponsibleDealId: undefined, // absent
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [
          {
            id: "D1",
            title: "Сделка D1",
            companyId: "c-f2",
            responsibleId: "u1",
            stageId: "EXECUTING",
            categoryId: "0",
            sampleTransferStatus: "На испытании",
            opportunity: 100_000,
            currencyId: "RUB",
            productType: [],
            industry: [],
            direction: [],
          },
          {
            id: "D2",
            title: "Сделка D2",
            companyId: "c-f2",
            responsibleId: "u1",
            stageId: "EXECUTING",
            categoryId: "0",
            sampleTransferStatus: "На испытании",
            opportunity: 200_000,
            currencyId: "RUB",
            productType: [],
            industry: [],
            direction: [],
          },
        ],
        hasAttention: false,
        attentionReasons: [],
      };

      const wip = computeWipMetrics([c]);
      const inTesting = wip.find((w) => w.id === "На испытании")!;
      expect(inTesting.companyCount).toBe(1);
      // No sibling inference: dealCount must be 0
      expect(inTesting.dealCount).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // P2-1: Direction Multiplicity Disclosure
  // ──────────────────────────────────────────────────────────────────────────
  describe("P2-1: Direction multiplicity disclosure", () => {
    it("Asserts industry and direction are single-value, product is multi-value", () => {
      const c: CommercialCompany = {
        id: "c-dim",
        title: "Компания Размеры",
        responsibleId: "u1",
        industry: "Строительство",
        direction: ["Бетон"],
        productType: ["Гель", "Золь"],
        sampleStatus: "—",
        sampleStatusSource: "NONE",
        sampleAllDates: [],
        gradeGel: [],
        gradeSol: [],
        deals: [],
        hasAttention: false,
        attentionReasons: [],
      };

      const bdIndustry = computeSegmentBreakdown([c], boundariesSept, "industry");
      expect(bdIndustry.isMultiValueDimension).toBe(false);

      const bdDirection = computeSegmentBreakdown([c], boundariesSept, "direction");
      expect(bdDirection.isMultiValueDimension).toBe(false);

      const bdProduct = computeSegmentBreakdown([c], boundariesSept, "product");
      expect(bdProduct.isMultiValueDimension).toBe(true);
    });
  });
});
