// src/__tests__/commercial-funnel-activity.test.ts
// ─────────────────────────────────────────────────────────────────────
// Regression tests for activity authority and non-fabrication of next actions.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { normalizeDeals, normalizeCompanies } from "../lib/commercial-funnel/normalize";
import { computeBottlenecks } from "../lib/commercial-funnel/engine";

describe("Commercial Funnel Activity Authority", () => {
  const fixedNow = new Date("2026-03-25T12:00:00Z");

  it("TC-ACTIVITY-01: normalizeDeals sets activityDataKnown=false when activity fields are absent", () => {
    const deals = normalizeDeals([
      {
        ID: "10",
        TITLE: "Deal Without Activity Fields",
        STAGE_ID: "EXECUTING",
        DATE_CREATE: "2026-01-01",
      },
    ]);
    expect(deals[0].activityDataKnown).toBe(false);
    expect(deals[0].activityNext).toBeUndefined();
    expect(deals[0].activityLast).toBeUndefined();
  });

  it("TC-ACTIVITY-02: normalizeDeals sets activityDataKnown=true when activity fields are present", () => {
    const deals = normalizeDeals([
      {
        ID: "11",
        TITLE: "Deal With Activity Next",
        STAGE_ID: "EXECUTING",
        DATE_CREATE: "2026-01-01",
        ACTIVITY_NEXT: "2026-04-01",
      },
      {
        ID: "12",
        TITLE: "Deal With Empty Activity Next",
        STAGE_ID: "EXECUTING",
        DATE_CREATE: "2026-01-01",
        ACTIVITY_NEXT: "",
      },
    ]);
    expect(deals[0].activityDataKnown).toBe(true);
    expect(deals[0].activityNext).toBe("2026-04-01");
    expect(deals[1].activityDataKnown).toBe(true);
    expect(deals[1].activityNext).toBeUndefined();
  });

  it("TC-ACTIVITY-03: stalled deal with unknown activity data does NOT fabricate '(нет след. шага)'", () => {
    // Deal is 83 days old (> STALLED_DEAL_DAYS of 60)
    const rawDeal = {
      ID: "101",
      COMPANY_ID: "C1",
      TITLE: "Stalled Deal Unknown Activity",
      STAGE_ID: "EXECUTING", // Active stage
      DATE_CREATE: "2026-01-01",
    };
    const deals = normalizeDeals([rawDeal]);
    const companies = normalizeCompanies(
      [{ ID: "C1", TITLE: "Company 1" }],
      deals,
      { now: fixedNow }
    );

    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const stalled = bottlenecks.find((b) => b.dealId === "101");

    expect(stalled).toBeDefined();
    // Must NOT say "(нет след. шага)" and must explicitly state activity data is unavailable
    expect(stalled?.issueLabel).not.toContain("нет след. шага");
    expect(stalled?.issueLabel).toBe("Старая активная сделка (83 дн., данные активности недоступны)");
    // nextAction should be undefined (not fabricated)
    expect(stalled?.nextAction).toBeUndefined();

    // Company attention reason must truthfully state activity is unavailable
    expect(companies[0].attentionReasons[0]).toBe("Старая активная сделка 83 дн. (данные активности недоступны) «Stalled Deal Unknown Activity»");
  });

  it("TC-ACTIVITY-04: stalled deal with known activity data and no next action states '(нет след. шага)' truthfully", () => {
    const rawDeal = {
      ID: "102",
      COMPANY_ID: "C2",
      TITLE: "Stalled Deal Known Empty Activity",
      STAGE_ID: "EXECUTING",
      DATE_CREATE: "2026-01-01",
      ACTIVITY_NEXT: "", // Explicitly known to have no next activity
    };
    const deals = normalizeDeals([rawDeal]);
    const companies = normalizeCompanies(
      [{ ID: "C2", TITLE: "Company 2" }],
      deals,
      { now: fixedNow }
    );

    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const stalled = bottlenecks.find((b) => b.dealId === "102");

    expect(stalled).toBeDefined();
    expect(stalled?.issueLabel).toBe("Сделка без движения (83 дн., нет след. шага)");
    expect(stalled?.nextAction).toBe("Запланировать звонок / встречу с клиентом");
    expect(companies[0].attentionReasons[0]).toBe("Сделка без движения 83 дн. (нет следующего шага) «Stalled Deal Known Empty Activity»");
  });

  it("TC-ACTIVITY-05: stalled deal with known scheduled next action shows next action", () => {
    const rawDeal = {
      ID: "103",
      COMPANY_ID: "C3",
      TITLE: "Stalled Deal With Scheduled Action",
      STAGE_ID: "EXECUTING",
      DATE_CREATE: "2026-01-01",
      ACTIVITY_NEXT: "Звонок 28.03.2026",
    };
    const deals = normalizeDeals([rawDeal]);
    const companies = normalizeCompanies(
      [{ ID: "C3", TITLE: "Company 3" }],
      deals,
      { now: fixedNow }
    );

    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const stalled = bottlenecks.find((b) => b.dealId === "103");

    expect(stalled).toBeDefined();
    expect(stalled?.issueLabel).toBe("Сделка без движения (83 дн.)");
    expect(stalled?.nextAction).toBe("Звонок 28.03.2026");
  });
});
