// @vitest-environment node
// src/__tests__/samples-api.test.ts
// API behavior: auth, pagination completeness, fail-closed failures,
// body validation, no webhook leakage, no arbitrary methods, no 1032.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const auth = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({
  ...auth,
  isAuthError: (value: unknown) => value instanceof NextResponse,
}));

import { POST } from "@/app/api/bitrix/samples/route";
import { bitrixPost } from "@/lib/bitrix";

const webhook = "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN";
const fetchMock = vi.fn();

const request = (body?: unknown) =>
  POST(
    new NextRequest("http://localhost/api/bitrix/samples", {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? undefined : { "content-type": "application/json" },
    })
  );

const listPage = (rows: unknown[], extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ result: rows, ...extra }), { status: 200 });

const emptyFieldsMeta = () =>
  new Response(JSON.stringify({ result: {} }), { status: 200 });

beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", webhook);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  auth.requireAuth.mockResolvedValue({ userId: "user" });
  // Field metadata endpoints (company.fields, deal.fields) return empty.
  fetchMock.mockImplementation((url: string) =>
    url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")
      ? Promise.resolve(emptyFieldsMeta())
      : Promise.resolve(listPage([], { total: 0 }))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("POST /api/bitrix/samples — auth and body validation", () => {
  it("requires authentication and never touches Bitrix otherwise", async () => {
    auth.requireAuth.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );
    const response = await request({});
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown parameters (no arbitrary field/method surface)", async () => {
    const response = await request({ entityTypeId: 1032 });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs and oversized bodies", async () => {
    expect((await request({ companyId: "-5" })).status).toBe(400);
    expect((await request({ responsibleId: "abc" })).status).toBe(400);
    const big = "x".repeat(11_000);
    const response = await POST(
      new NextRequest("http://localhost/api/bitrix/samples", {
        method: "POST",
        body: big,
      })
    );
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts an empty body and returns an empty dataset on empty CRM", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.samples).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe("POST /api/bitrix/samples — fixed Bitrix calls", () => {
  it("calls only allowlisted methods with fixed SELECT and scope filters", async () => {
    await request({ companyId: "42" });

    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls).toContain(`${webhook}/crm.company.fields`);
    expect(calledUrls).toContain(`${webhook}/crm.deal.fields`);
    expect(calledUrls).toContain(`${webhook}/crm.company.list`);
    expect(calledUrls).toContain(`${webhook}/crm.deal.list`);
    for (const url of calledUrls) {
      // Method path itself is clean (token lives in the webhook base only).
      expect(url.startsWith(`${webhook}/`)).toBe(true);
      expect(url.slice(webhook.length)).toMatch(/^\/crm\.[a-z.]+$/);
      expect(url).not.toContain("1032");
    }

    const companyCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("crm.company.list")
    );
    const companyBody = JSON.parse(companyCall[1].body);
    expect(companyBody.FILTER).toEqual({ ID: "42" });
    expect(companyBody.SELECT).toContain("UF_CRM_1753187313314");
    expect(companyBody.SELECT).not.toContain("*");

    const dealCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).endsWith("crm.deal.list")
    );
    const dealBody = JSON.parse(dealCall[1].body);
    expect(dealBody.FILTER).toEqual({ COMPANY_ID: "42" });
    expect(dealBody.SELECT).toContain("UF_CRM_1779394379");
  });

  it("joins by company ID and returns one summary per company with nested deals", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              result: {
                UF_CRM_1753187313314: {
                  items: [
                    { ID: "1", VALUE: "Образцы отправлены" },
                    { ID: "2", VALUE: "Испытание образцов" },
                  ],
                },
              },
            }),
            { status: 200 }
          )
        );
      }
      if (url.endsWith("crm.company.list")) {
        return Promise.resolve(
          listPage(
            [
              { ID: "42", TITLE: "ООО «А»", ASSIGNED_BY_ID: "7", UF_CRM_1753187313314: ["1"] },
              { ID: "43", TITLE: "ООО «Б»", UF_CRM_1764156593: "Положительный" },
            ],
            { total: 2 }
          )
        );
      }
      if (url.endsWith("crm.deal.list")) {
        return Promise.resolve(
          listPage(
            [
              {
                ID: "101",
                TITLE: "Сделка 1",
                COMPANY_ID: "42",
                STAGE_ID: "NEW",
                UF_CRM_1779386185: "Переданы",
              },
              {
                ID: "102",
                TITLE: "Сделка 2",
                COMPANY_ID: "42",
                UF_CRM_1779394379: ["Испытание образцов"],
              },
            ],
            { total: 2 }
          )
        );
      }
      return Promise.resolve(listPage([], { total: 0 }));
    });

    const response = await request();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.total).toBe(2);
    expect(body.samples).toHaveLength(2);

    const a = body.samples.find((s: { companyId: string }) => s.companyId === "42");
    expect(a.companyTitle).toBe("ООО «А»");
    expect(a.sampleIndicators).toEqual(["Образцы отправлены"]);
    expect(a.relatedDeals.map((d: { id: string }) => d.id)).toEqual(["101", "102"]);
    expect(a.relatedDeals[0].sampleTransferStatus).toBe("Переданы");

    const meta = body.meta.statusLabels.UF_CRM_1753187313314;
    expect(meta["1"]).toBe("Образцы отправлены");
  });

  it("responds 200 with degraded labels when metadata fetch fails", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")) {
        return Promise.reject(new Error("metadata down"));
      }
      if (url.endsWith("crm.company.list")) {
        return Promise.resolve(
          listPage([{ ID: "42", TITLE: "ООО «А»", UF_CRM_1753187313314: ["99"] }], { total: 1 })
        );
      }
      return Promise.resolve(listPage([], { total: 0 }));
    });

    const response = await request();
    expect(response.status).toBe(200);
    const body = await response.json();
    // Raw enum value passes through unresolved — visible, not hidden
    // (unrecognized ID is a processStatus entry; metadata empty).
    expect(body.samples).toHaveLength(1);
    expect(body.samples[0].processStatuses).toEqual(["99"]);
    expect(body.meta.statusLabels).toEqual({});
  });
});

describe("POST /api/bitrix/samples — fail-closed pagination", () => {
  const mkCompany = (i: number) => ({
    ID: String(i),
    TITLE: `Компания ${i}`,
    UF_CRM_1764156593: "Положительный",
  });

  it("fetches ALL pages: 120 companies across 3 pages are complete", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")) {
        return Promise.resolve(emptyFieldsMeta());
      }
      if (url.endsWith("crm.company.list")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              result: Array.from({ length: 50 }, (_, i) => mkCompany(i + 1)),
              total: 120,
              next: 50,
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(listPage([], { total: 0 }));
    });
    // Pages 2 and 3 for the SECOND and THIRD sequential company.list calls.
    let companyListCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")) {
        return Promise.resolve(emptyFieldsMeta());
      }
      if (url.endsWith("crm.company.list")) {
        companyListCalls++;
        if (companyListCalls === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                result: Array.from({ length: 50 }, (_, i) => mkCompany(i + 1)),
                total: 120,
                next: 50,
              }),
              { status: 200 }
            )
          );
        }
        if (companyListCalls === 2) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                result: Array.from({ length: 50 }, (_, i) => mkCompany(i + 51)),
                total: 120,
                next: 100,
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              result: Array.from({ length: 20 }, (_, i) => mkCompany(i + 101)),
              total: 120,
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(listPage([], { total: 0 }));
    });

    const response = await request();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.total).toBe(120);
    const companyCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("crm.company.list")
    );
    expect(companyCalls).toHaveLength(3);
    expect(JSON.parse(companyCalls[1][1].body).start).toBe(50);
    expect(JSON.parse(companyCalls[2][1].body).start).toBe(100);
    const ids = body.samples.map((s: { companyId: string }) => Number(s.companyId));
    expect(Math.min(...ids)).toBe(1);
    expect(Math.max(...ids)).toBe(120);
  });

  it.each([
    ["repeated next", { next: 50 }],
    ["decreasing next", { next: 0 }],
    ["boolean next", { next: true }],
    ["object next", { next: { page: 2 } }],
    ["string next", { next: "50" }],
  ])("fails closed on %s instead of returning a partial dataset", async (_name, extra) => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")) {
        return Promise.resolve(emptyFieldsMeta());
      }
      if (url.endsWith("crm.company.list")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              result: [mkCompany(1), mkCompany(2)],
              total: 70,
              ...extra,
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(listPage([], { total: 0 }));
    });

    const response = await request();
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.samples).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("SECRET_TOKEN");
  });

  it("fails closed on malformed envelope instead of claiming zero samples", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")) {
        return Promise.resolve(emptyFieldsMeta());
      }
      if (url.endsWith("crm.company.list")) {
        return Promise.resolve(new Response(JSON.stringify({ result: null }), { status: 200 }));
      }
      return Promise.resolve(listPage([], { total: 0 }));
    });

    const response = await request();
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.samples).toBeUndefined();
  });

  it("deduplicates entities across pages by ID", async () => {
    let companyListCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("crm.company.fields") || url.endsWith("crm.deal.fields")) {
        return Promise.resolve(emptyFieldsMeta());
      }
      if (url.endsWith("crm.company.list")) {
        companyListCalls++;
        if (companyListCalls === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                result: [mkCompany(1), mkCompany(2)],
                next: 2,
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              result: [{ ...mkCompany(2), TITLE: "дубль" }, mkCompany(3)],
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(listPage([], { total: 0 }));
    });

    const response = await request();
    const body = await response.json();
    expect(body.total).toBe(3);
    expect(body.samples.map((s: { companyId: string }) => s.companyId)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("treats a valid empty envelope as a legitimate zero, not an error", async () => {
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.samples).toEqual([]);
  });
});

describe("POST /api/bitrix/samples — security invariants", () => {
  it("never leaks webhook credentials in responses", async () => {
    fetchMock.mockRejectedValue(new Error(`Network failure ${webhook}`));
    const response = await request();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("SECRET_TOKEN");
  });

  it("transport-level allowlist still rejects write methods", async () => {
    await expect(bitrixPost("crm.item.delete")).rejects.toThrow(
      "Invalid request parameters"
    );
    await expect(bitrixPost("crm.deal.update")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds no-store cache headers", async () => {
    const response = await request();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
