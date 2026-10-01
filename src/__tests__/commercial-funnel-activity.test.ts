// src/__tests__/commercial-funnel-activity.test.ts
// ─────────────────────────────────────────────────────────────────────
// Regression tests for activity authority and non-fabrication of next actions.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { normalizeDeals, normalizeCompanies } from "../lib/commercial-funnel/normalize";
import { computeBottlenecks } from "../lib/commercial-funnel/engine";
import { selectAuthoritativeActivities, fetchDealsActivities } from "../lib/bitrix-activities";
import { POST as commercialFunnelPost } from "../app/api/bitrix/commercial-funnel/route";
import * as bitrix from "../lib/bitrix";
import * as bitrixFetch from "../lib/samples/bitrix-fetch";
import * as authGuard from "../lib/auth-guard";

// Phase C: the CF route fail-closes when the Smart Process contract is
// undiscovered. For API-level tests the contract is mocked as discovered
// (the real gate is covered by its own fail-closed test).
vi.mock("../lib/samples/smart-process-contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/samples/smart-process-contract")>();
  return { ...actual, SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true };
});

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
    expect(stalled?.nextAction).toBeUndefined();
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

describe("Authoritative Activities & Selection Semantics (ACT-1 to ACT-7)", () => {
  const fixedNow = new Date("2026-03-25T12:00:00Z");

  it("ACT-1: old deal, activity yesterday -> NOT stalled by inactivity", () => {
    const rawDeal = {
      ID: "101",
      COMPANY_ID: "C1",
      TITLE: "Old Deal With Recent Activity",
      STAGE_ID: "EXECUTING",
      DATE_CREATE: "2026-01-01",
    };
    const yesterdayActivity = {
      ID: "A1",
      OWNER_ID: "101",
      OWNER_TYPE_ID: "2",
      SUBJECT: "Звонок клиенту",
      COMPLETED: "Y",
      DESCRIPTION: "Успешный контакт",
      DEADLINE: "",
      CREATED: "2026-03-24T10:00:00Z", // yesterday!
      AUTHOR_ID: "1",
      RESPONSIBLE_ID: "1",
      TYPE_ID: "1",
      PROVIDER_ID: "CALL",
      PROVIDER_TYPE_ID: "CALL",
    };
    const { last, next } = selectAuthoritativeActivities([yesterdayActivity]);
    const deals = normalizeDeals([rawDeal], {
      activities: {
        "101": {
          last,
          next,
          all: [yesterdayActivity],
          dataKnown: true,
        },
      },
    });
    const companies = normalizeCompanies(
      [{ ID: "C1", TITLE: "Company 1" }],
      deals,
      { now: fixedNow }
    );
    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const stalled = bottlenecks.find((b) => b.dealId === "101");
    // Activity yesterday means inactivity is 1 day, which is <= 60 days stalled threshold
    expect(stalled).toBeUndefined();
  });

  it("ACT-2: old deal, complete activity fetch, no activity ever -> creation fallback used with truthful (нет след. шага)", () => {
    const rawDeal = {
      ID: "102",
      COMPANY_ID: "C2",
      TITLE: "Old Deal Without Activities",
      STAGE_ID: "EXECUTING",
      DATE_CREATE: "2026-01-01",
    };
    const deals = normalizeDeals([rawDeal], {
      activities: {
        "102": {
          last: undefined,
          next: undefined,
          all: [],
          dataKnown: true,
        },
      },
    });
    const companies = normalizeCompanies(
      [{ ID: "C2", TITLE: "Company 2" }],
      deals,
      { now: fixedNow }
    );
    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const stalled = bottlenecks.find((b) => b.dealId === "102");
    expect(stalled).toBeDefined();
    expect(stalled?.issueLabel).toBe("Сделка без движения (83 дн., нет след. шага)");
    expect(stalled?.nextAction).toBeUndefined();
  });

  it("ACT-3: old deal, activity fetch failed -> activityDataKnown=false and no confirmed (нет след. шага)", () => {
    const rawDeal = {
      ID: "103",
      COMPANY_ID: "C3",
      TITLE: "Old Deal Fetch Failed",
      STAGE_ID: "EXECUTING",
      DATE_CREATE: "2026-01-01",
    };
    const deals = normalizeDeals([rawDeal], {
      activities: {
        "103": {
          last: undefined,
          next: undefined,
          all: [],
          dataKnown: false, // failed or incomplete fetch
        },
      },
    });
    const companies = normalizeCompanies(
      [{ ID: "C3", TITLE: "Company 3" }],
      deals,
      { now: fixedNow }
    );
    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const stalled = bottlenecks.find((b) => b.dealId === "103");
    expect(stalled).toBeDefined();
    expect(stalled?.issueLabel).not.toContain("нет след. шага");
    expect(stalled?.issueLabel).toBe("Старая активная сделка (83 дн., данные активности недоступны)");
    expect(stalled?.nextAction).toBeUndefined();
  });

  it("ACT-4: invalid-only completed activity date must not become activityLast", () => {
    const brokenCompleted = {
      ID: "B1",
      OWNER_ID: "104",
      OWNER_TYPE_ID: "2",
      SUBJECT: "Встреча",
      COMPLETED: "Y",
      DESCRIPTION: "",
      DEADLINE: "",
      CREATED: "invalid-timestamp-format",
      AUTHOR_ID: "1",
      RESPONSIBLE_ID: "1",
      TYPE_ID: "1",
      PROVIDER_ID: "MEETING",
      PROVIDER_TYPE_ID: "MEETING",
    };
    const { last } = selectAuthoritativeActivities([brokenCompleted]);
    expect(last).toBeUndefined();

    const deals = normalizeDeals(
      [{ ID: "104", TITLE: "Deal 104" }],
      {
        activities: {
          "104": {
            last,
            next: undefined,
            all: [brokenCompleted],
            dataKnown: true,
          },
        },
      }
    );
    expect(deals[0].activityLast).toBeUndefined();
  });

  it("ACT-5: invalid-only planned deadline must not become authoritative activityNext", () => {
    const brokenPlanned = {
      ID: "B2",
      OWNER_ID: "105",
      OWNER_TYPE_ID: "2",
      SUBJECT: "Звонок клиенту",
      COMPLETED: "N",
      DESCRIPTION: "",
      DEADLINE: "9999-99-99 99:99:99",
      CREATED: "2026-03-01T00:00:00Z",
      AUTHOR_ID: "1",
      RESPONSIBLE_ID: "1",
      TYPE_ID: "1",
      PROVIDER_ID: "CALL",
      PROVIDER_TYPE_ID: "CALL",
    };
    const { next } = selectAuthoritativeActivities([brokenPlanned]);
    expect(next).toBeUndefined();

    const deals = normalizeDeals(
      [{ ID: "105", TITLE: "Deal 105" }],
      {
        activities: {
          "105": {
            last: undefined,
            next,
            all: [brokenPlanned],
            dataKnown: true,
          },
        },
      }
    );
    expect(deals[0].activityNext).toBeUndefined();
  });

  it("ACT-6: mixed valid + invalid activities -> valid authoritative candidate wins", () => {
    const mixedActivities = [
      {
        ID: "A_BAD_COMPLETED",
        OWNER_ID: "106",
        OWNER_TYPE_ID: "2",
        SUBJECT: "Broken Done",
        COMPLETED: "Y",
        DESCRIPTION: "",
        DEADLINE: "",
        CREATED: "garbage-date",
        AUTHOR_ID: "1",
        RESPONSIBLE_ID: "1",
        TYPE_ID: "1",
        PROVIDER_ID: "CALL",
        PROVIDER_TYPE_ID: "CALL",
      },
      {
        ID: "A_VALID_COMPLETED",
        OWNER_ID: "106",
        OWNER_TYPE_ID: "2",
        SUBJECT: "Valid Done",
        COMPLETED: "Y",
        DESCRIPTION: "",
        DEADLINE: "",
        CREATED: "2026-03-20T10:00:00Z",
        AUTHOR_ID: "1",
        RESPONSIBLE_ID: "1",
        TYPE_ID: "1",
        PROVIDER_ID: "CALL",
        PROVIDER_TYPE_ID: "CALL",
      },
      {
        ID: "A_BAD_PLANNED",
        OWNER_ID: "106",
        OWNER_TYPE_ID: "2",
        SUBJECT: "Broken Planned",
        COMPLETED: "N",
        DESCRIPTION: "",
        DEADLINE: "not-a-valid-date",
        CREATED: "2026-03-21T10:00:00Z",
        AUTHOR_ID: "1",
        RESPONSIBLE_ID: "1",
        TYPE_ID: "1",
        PROVIDER_ID: "CALL",
        PROVIDER_TYPE_ID: "CALL",
      },
      {
        ID: "A_VALID_PLANNED",
        OWNER_ID: "106",
        OWNER_TYPE_ID: "2",
        SUBJECT: "Authoritative Planned Next Action",
        COMPLETED: "N",
        DESCRIPTION: "",
        DEADLINE: "2026-04-01T15:00:00Z",
        CREATED: "2026-03-22T10:00:00Z",
        AUTHOR_ID: "1",
        RESPONSIBLE_ID: "1",
        TYPE_ID: "1",
        PROVIDER_ID: "CALL",
        PROVIDER_TYPE_ID: "CALL",
      },
    ];

    const { last, next } = selectAuthoritativeActivities(mixedActivities);
    expect(last?.ID).toBe("A_VALID_COMPLETED");
    expect(next?.ID).toBe("A_VALID_PLANNED");

    const deals = normalizeDeals(
      [{ ID: "106", TITLE: "Deal 106" }],
      {
        activities: {
          "106": {
            last,
            next,
            all: mixedActivities,
            dataKnown: true,
          },
        },
      }
    );
    expect(deals[0].activityLast).toBe("2026-03-20T10:00:00Z");
    expect(deals[0].activityNext).toBe("Authoritative Planned Next Action");
    expect(deals[0].activityNextDate).toBe("2026-04-01T15:00:00Z");
  });

  it("ACT-7: Commercial Funnel API route invokes shared activity pipeline and propagates partial state", async () => {
    const origWebhook = process.env.BITRIX_WEBHOOK_URL;
    process.env.BITRIX_WEBHOOK_URL = "https://test.bitrix24.ru/rest/1/secret/";

    try {
      vi.spyOn(authGuard, "requireAuth").mockResolvedValue({
        user: { id: "1", email: "test@russilica.ru", role: "admin" },
      } as any);

      vi.spyOn(bitrixFetch, "fetchFieldLabelMaps").mockResolvedValue({
        labels: {},
      } as any);

      // Phase C: stub the SP fetcher (route calls it in the parallel fetch).
      vi.spyOn(bitrixFetch, "fetchSmartProcessSampleItems").mockResolvedValue([]);

      vi.spyOn(bitrixFetch, "fetchAllPages").mockImplementation(async (method: string) => {
        if (method === "crm.company.list") {
          return [{ ID: "C1", TITLE: "Company 1" }];
        }
        if (method === "crm.deal.list") {
          return [
            { ID: "101", TITLE: "Deal 101", COMPANY_ID: "C1" },
            { ID: "102", TITLE: "Deal 102", COMPANY_ID: "C1" },
          ];
        }
        return [];
      });

      const bitrixPostSpy = vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method: string) => {
        if (method === "user.get") {
          return { result: [{ ID: "1", NAME: "Admin" }] } as any;
        }
        if (method === "crm.activity.list") {
          // Simulate partial / incomplete batch pagination error (cursor repeat)
          return {
            result: [{ ID: "ACT1", OWNER_ID: "101", COMPLETED: "Y", CREATED: "2026-03-01T00:00:00Z" }],
            next: 0, // repeats cursor start=0 -> triggers batch incomplete
          } as any;
        }
        return { result: [] } as any;
      });

      const res = await commercialFunnelPost();
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.partial).toBe(true);
      expect(data.activityPartial).toBe(true);
      expect(data.activityWarning).toBeDefined();
      expect(data.incompleteActivityDealIds).toEqual(expect.arrayContaining(["101", "102"]));

      // Authorized deals for failed/incomplete activity fetch must have activityDataKnown=false
      const deal101 = data.deals.find((d: any) => d.id === "101");
      const deal102 = data.deals.find((d: any) => d.id === "102");
      expect(deal101.activityDataKnown).toBe(false);
      expect(deal102.activityDataKnown).toBe(false);

      // Verify that crm.activity.list was actually called
      expect(bitrixPostSpy).toHaveBeenCalledWith(
        "crm.activity.list",
        expect.objectContaining({
          FILTER: expect.objectContaining({ "@OWNER_ID": ["101", "102"] }),
        })
      );
    } finally {
      if (origWebhook !== undefined) {
        process.env.BITRIX_WEBHOOK_URL = origWebhook;
      } else {
        delete process.env.BITRIX_WEBHOOK_URL;
      }
    }
  });
});
