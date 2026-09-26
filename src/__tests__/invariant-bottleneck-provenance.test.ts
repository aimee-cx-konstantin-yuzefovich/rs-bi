// src/__tests__/invariant-bottleneck-provenance.test.ts
// ─────────────────────────────────────────────────────────────────────
// Invariant Test Suite: Bottleneck Date Provenance & Inactivity Aging (Finding C)
// Enforces temporal provenance, no company date fallback, and truth in labeling.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { computeBottlenecks } from "@/lib/commercial-funnel/engine";
import { evaluateStalledDeal } from "@/lib/commercial-funnel/bottlenecks";
import { normalizeCompanies } from "@/lib/commercial-funnel/normalize";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

describe("Invariant Bottleneck Provenance Contract (Finding C)", () => {
  const fixedNow = new Date("2026-03-25T12:00:00Z");

  const makeCompany = (
    id: string,
    sampleStatus: string,
    sampleShipmentDate: string | undefined,
    deals: Partial<CommercialDeal>[] = [],
    companyDateCreate = "2025-01-01"
  ): CommercialCompany => ({
    id,
    title: `Company ${id}`,
    responsibleId: "1",
    responsibleName: "Manager 1",
    dateCreate: companyDateCreate,
    direction: [],
    productType: [],
    gradeGel: [],
    gradeSol: [],
    sampleStatus,
    sampleStatusSource: "DEAL",
    sampleStatuses: [sampleStatus],
    sampleStatusRawValues: [sampleStatus],
    sampleStatusEntries: [],
    sampleShipmentDate,
    sampleDealSentDates: sampleShipmentDate ? [sampleShipmentDate] : [],
    sampleCompanyTransferDates: [],
    sampleEventDatesForPeriodMetrics: sampleShipmentDate ? [sampleShipmentDate] : [],
    sampleAllDates: sampleShipmentDate ? [sampleShipmentDate] : [],
    hasAttention: false,
    attentionReasons: [],
    deals: deals.map((d, idx) => ({
      id: d.id || `${id}-D${idx + 1}`,
      companyId: id,
      responsibleId: "1",
      title: d.title || `Deal ${idx + 1}`,
      stageId: d.stageId || "EXECUTING",
      currencyId: "RUB",
      dateCreate: d.dateCreate || "2026-01-01",
      sampleTestingStatus: [],
      ...d,
    } as CommercialDeal)),
  });

  describe("C1: Sample Success Without Commercial Progression", () => {
    it("sets daysWaiting to null and relevantDate to undefined when sample shipment date is absent (NO fallback to dateCreate)", () => {
      // Company created 1 year ago, sample succeeded, but no shipment date recorded
      const company = makeCompany("C1", "Подошли", undefined, [], "2025-01-01");
      const bottlenecks = computeBottlenecks([company], fixedNow);

      const b = bottlenecks.find((item) => item.type === "sample_success_no_deal");
      expect(b).toBeDefined();
      expect(b!.companyId).toBe("C1");
      // Critical invariant: must NOT fall back to company dateCreate (which would be ~448 days)!
      expect(b!.relevantDate).toBeUndefined();
      expect(b!.daysWaiting).toBeNull();
      expect(b!.issueLabel).toBe("Образец подошел, нет коммерческой сделки");
    });

    it("calculates daysWaiting truthfully when authoritative sample shipment date exists", () => {
      // Sample shipment date was 2026-03-05 (20 days before 2026-03-25)
      const company = makeCompany("C2", "Подошли", "2026-03-05", [], "2025-01-01");
      const bottlenecks = computeBottlenecks([company], fixedNow);

      const b = bottlenecks.find((item) => item.type === "sample_success_no_deal");
      expect(b).toBeDefined();
      expect(b!.relevantDate).toBe("2026-03-05");
      expect(b!.daysWaiting).toBe(20);
    });
  });

  describe("C2: Stalled Deal vs Old Deal", () => {
    it("does NOT classify a 100-day-old active deal as stalled if it had activity yesterday", () => {
      const deal = {
        id: "D100",
        companyId: "C1",
        responsibleId: "1",
        title: "Deal with Recent Activity",
        stageId: "EXECUTING",
        currencyId: "RUB",
        dateCreate: "2025-12-15", // 100 days old
        activityLast: "2026-03-24", // yesterday!
        activityDataKnown: true,
        sampleTestingStatus: [],
      } as unknown as CommercialDeal;

      const stalledInfo = evaluateStalledDeal(deal, fixedNow);
      expect(stalledInfo).toBeNull(); // NOT stalled!
    });

    it("classifies active deal with activity 45 days ago as stalled with truthful label", () => {
      const deal = {
        id: "D101",
        companyId: "C1",
        responsibleId: "1",
        title: "Deal Inactive 45 Days",
        stageId: "EXECUTING",
        currencyId: "RUB",
        dateCreate: "2025-12-15",
        activityLast: "2026-02-08", // 45 days before fixedNow
        activityNext: "Перезвонить клиенту",
        activityDataKnown: true,
        sampleTestingStatus: [],
      } as unknown as CommercialDeal;

      const stalledInfo = evaluateStalledDeal(deal, fixedNow);
      expect(stalledInfo).not.toBeNull();
      expect(stalledInfo!.isStalled).toBe(true);
      expect(stalledInfo!.daysWaiting).toBe(45);
      expect(stalledInfo!.issueLabel).toBe("Сделка без движения (45 дн.)");
      expect(stalledInfo!.nextAction).toBe("Перезвонить клиенту");
    });

    it("labels old deal without activity data truthfully without fabricating movement claims", () => {
      const deal = {
        id: "D102",
        companyId: "C1",
        responsibleId: "1",
        title: "Old Deal with Unknown Activity",
        stageId: "EXECUTING",
        currencyId: "RUB",
        dateCreate: "2026-01-24", // 60 days before fixedNow
        activityDataKnown: false, // activities API could not confirm activities
        sampleTestingStatus: [],
      } as unknown as CommercialDeal;

      const stalledInfo = evaluateStalledDeal(deal, fixedNow);
      expect(stalledInfo).not.toBeNull();
      expect(stalledInfo!.isStalled).toBe(true);
      expect(stalledInfo!.daysWaiting).toBe(60);
      expect(stalledInfo!.issueLabel).toBe("Старая активная сделка (60 дн., данные активности недоступны)");
      expect(stalledInfo!.nextAction).toBeUndefined(); // No fabricated action!
    });
  });

  describe("Alignment Between normalizeCompanies and computeBottlenecks", () => {
    it("produces identical stalled deal attention reasoning across both normalization and engine", () => {
      const rawCompany = { ID: "C99", TITLE: "Test Corp", DATE_CREATE: "2026-01-01" };
      const rawDeal = {
        id: "D99",
        companyId: "C99",
        responsibleId: "1",
        title: "Stalled Deal 99",
        stageId: "EXECUTING",
        currencyId: "RUB",
        dateCreate: "2026-01-14", // 70 days
        activityDataKnown: false,
        sampleTestingStatus: [],
      } as unknown as CommercialDeal;

      const normalized = normalizeCompanies([rawCompany], [rawDeal], { now: fixedNow });
      const bottlenecks = computeBottlenecks(normalized, fixedNow);

      expect(normalized[0].hasAttention).toBe(true);
      expect(normalized[0].attentionReasons[0]).toContain("Старая активная сделка 70 дн. (данные активности недоступны)");

      const b = bottlenecks.find((item) => item.dealId === "D99")!;
      expect(b).toBeDefined();
      expect(b.issueLabel).toBe("Старая активная сделка (70 дн., данные активности недоступны)");
    });
  });
});
