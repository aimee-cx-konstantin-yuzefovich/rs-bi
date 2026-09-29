import { describe, it, expect } from "vitest";
import { evaluateStalledDeal } from "@/lib/commercial-funnel/bottlenecks";
import { computeBottlenecks } from "@/lib/commercial-funnel/engine";
import { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

describe("Commercial Funnel — Next Action Truthfulness", () => {
  const fixedNow = new Date("2026-09-24T12:00:00Z");

  it("1. activityNext exists -> Bottleneck.nextAction equals exact CRM activity value", () => {
    const deal: CommercialDeal = {
      id: "deal-1",
      title: "Сделка 1",
      companyId: "c-1",
      responsibleId: "u-1",
      stageId: "C4:EXECUTING",
      categoryId: "0",
      opportunity: 100000,
      currencyId: "RUB",
      dateCreate: "2026-01-01",
      activityLast: "2026-01-05",
      activityDataKnown: true,
      activityNext: "Встреча с директором по закупкам 30.09",
      sampleTestingStatus: [],
      productType: [],
      direction: [],
      industry: [],
    };

    const res = evaluateStalledDeal(deal, fixedNow);
    expect(res).not.toBeNull();
    expect(res?.isStalled).toBe(true);
    expect(res?.nextAction).toBe("Встреча с директором по закупкам 30.09");
  });

  it("2. activity data known but no next action -> nextAction undefined", () => {
    const deal: CommercialDeal = {
      id: "deal-2",
      title: "Сделка 2",
      companyId: "c-2",
      responsibleId: "u-1",
      stageId: "C4:EXECUTING",
      categoryId: "0",
      opportunity: 100000,
      currencyId: "RUB",
      dateCreate: "2026-01-01",
      activityLast: "2026-01-05",
      activityDataKnown: true,
      activityNext: undefined,
      sampleTestingStatus: [],
      productType: [],
      direction: [],
      industry: [],
    };

    const res = evaluateStalledDeal(deal, fixedNow);
    expect(res).not.toBeNull();
    expect(res?.isStalled).toBe(true);
    expect(res?.nextAction).toBeUndefined();
  });

  it("3. activity data unavailable -> nextAction undefined", () => {
    const deal: CommercialDeal = {
      id: "deal-3",
      title: "Сделка 3",
      companyId: "c-3",
      responsibleId: "u-1",
      stageId: "C4:EXECUTING",
      categoryId: "0",
      opportunity: 100000,
      currencyId: "RUB",
      dateCreate: "2026-01-01",
      activityDataKnown: false,
      sampleTestingStatus: [],
      productType: [],
      direction: [],
      industry: [],
    };

    const res = evaluateStalledDeal(deal, fixedNow);
    expect(res).not.toBeNull();
    expect(res?.isStalled).toBe(true);
    expect(res?.nextAction).toBeUndefined();
  });

  it("4. sample testing stalled with no authoritative activityNext -> no fabricated string", () => {
    const comp: CommercialCompany = {
      id: "c-4",
      title: "Компания 4",
      responsibleId: "u-1",
      sampleStatus: "На испытании",
      sampleStatusSource: "COMPANY",
      sampleShipmentDate: "2026-08-01",
      deals: [],
      gradeGel: [],
      gradeSol: [],
      productType: [],
      direction: [],
      sampleAllDates: ["2026-08-01"],
      hasAttention: true,
      attentionReasons: [],
    };

    const bottlenecks = computeBottlenecks([comp], fixedNow);
    const item = bottlenecks.find((b) => b.type === "sample_testing_stalled");
    expect(item).toBeDefined();
    expect(item?.nextAction).toBeUndefined();
    expect(item?.nextAction).not.toBe("Уточнить результаты испытаний у технолога клиента");
  });

  it("5. sample success with no authoritative activityNext -> no fabricated string", () => {
    const comp: CommercialCompany = {
      id: "c-5",
      title: "Компания 5",
      responsibleId: "u-1",
      sampleStatus: "Подошли",
      sampleStatusSource: "COMPANY",
      sampleShipmentDate: "2026-08-01",
      deals: [],
      gradeGel: [],
      gradeSol: [],
      productType: [],
      direction: [],
      sampleAllDates: ["2026-08-01"],
      hasAttention: true,
      attentionReasons: [],
    };

    const bottlenecks = computeBottlenecks([comp], fixedNow);
    const item = bottlenecks.find((b) => b.type === "sample_success_no_deal");
    expect(item).toBeDefined();
    expect(item?.nextAction).toBeUndefined();
    expect(item?.nextAction).not.toBe("Выставить коммерческое предложение / подготовить договор");
  });
});
