// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const config = vi.hoisted(() => ({ BITRIX_PORTAL_URL: "https://portal.bitrix24.ru" }));
const auth = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/config.server", () => config);
vi.mock("@/lib/auth-guard", () => ({ ...auth, isAuthError: (value: unknown) => value instanceof NextResponse }));
import { GET } from "@/app/api/bitrix/companies/[id]/deals/route";

const webhook = "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN";
const fetchMock = vi.fn();
const request = (id = "42") =>
  GET(new NextRequest(`http://localhost/api/bitrix/companies/${id}/deals`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", webhook);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  auth.requireAuth.mockResolvedValue({ userId: "user" });
  config.BITRIX_PORTAL_URL = "https://portal.bitrix24.ru";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("company deals authoritative endpoint (crm.item.list)", () => {
  it("uses crm.item.list with entityTypeId=2, filter.companyId, useOriginalUfNames=Y and select fields", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            items: [
              {
                id: 101,
                title: "Сделка №1",
                stageId: "NEW",
                opportunity: 350000,
                currencyId: "RUB",
                companyId: 42,
              },
            ],
          },
        }),
        { status: 200 }
      )
    );

    const response = await request("42");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${webhook}/crm.item.list`);
    expect(JSON.parse(options.body)).toEqual({
      entityTypeId: 2,
      filter: { companyId: 42 },
      select: ["id", "title", "stageId", "opportunity", "currencyId", "companyId"],
      useOriginalUfNames: "Y",
      start: 0,
    });

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.deals).toHaveLength(1);
    expect(body.deals[0]).toEqual({
      ID: "101",
      TITLE: "Сделка №1",
      STAGE_ID: "NEW",
      OPPORTUNITY: 350000,
      CURRENCY_ID: "RUB",
      COMPANY_ID: "42",
      bitrixUrl: "https://portal.bitrix24.ru/crm/deal/details/101/",
    });
  });

  it("handles zero deals returned from Bitrix", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: { items: [] } }), { status: 200 })
    );

    const response = await request("42");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.deals).toEqual([]);
  });

  it("handles multiple deals and correctly normalizes them", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            items: [
              { id: 101, title: "Сделка 101", stageId: "WON", opportunity: 1000, currencyId: "RUB" },
              { id: 102, title: "Сделка 102", stageId: "LOSE", opportunity: 2000, currencyId: "USD" },
            ],
          },
        }),
        { status: 200 }
      )
    );

    const response = await request("42");
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.deals).toHaveLength(2);
    expect(body.deals.map((d: any) => d.ID)).toEqual(["101", "102"]);
  });

  it("paginates beyond one Bitrix page until all matching deals are retrieved", async () => {
    // Generate 50 deals for page 1
    const page1Items = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      title: `Сделка ${i + 1}`,
      stageId: "PROCESS",
      opportunity: 10000,
      currencyId: "RUB",
    }));

    // Generate 20 deals for page 2
    const page2Items = Array.from({ length: 20 }, (_, i) => ({
      id: 51 + i,
      title: `Сделка ${51 + i}`,
      stageId: "WON",
      opportunity: 20000,
      currencyId: "RUB",
    }));

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: { items: page1Items },
            total: 70,
            next: 50,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: { items: page2Items },
            total: 70,
          }),
          { status: 200 }
        )
      );

    const response = await request("42");
    expect(response.status).toBe(200);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).start).toBe(0);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).start).toBe(50);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.deals).toHaveLength(70);
    expect(body.deals[0].ID).toBe("1");
    expect(body.deals[69].ID).toBe("70");
  });

  it("deduplicates Deal IDs across pages", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              items: [
                { id: 101, title: "Сделка 101" },
                { id: 102, title: "Сделка 102" },
              ],
            },
            next: 2,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              items: [
                { id: 102, title: "Сделка 102 дубликат" }, // duplicate id
                { id: 103, title: "Сделка 103" },
              ],
            },
          }),
          { status: 200 }
        )
      );

    const response = await request("42");
    const body = await response.json();
    expect(body.deals).toHaveLength(3);
    expect(body.deals.map((d: any) => d.ID)).toEqual(["101", "102", "103"]);
  });

  it("never falls back to Deal ID when deal TITLE is empty -> uses 'Без названия'", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            items: [
              { id: 105, title: "" },
              { id: 106, title: "   " },
            ],
          },
        }),
        { status: 200 }
      )
    );

    const response = await request("42");
    const body = await response.json();
    expect(body.deals[0].TITLE).toBe("Без названия");
    expect(body.deals[0].TITLE).not.toContain("105");
    expect(body.deals[0].TITLE).not.toContain("Сделка");

    expect(body.deals[1].TITLE).toBe("Без названия");
    expect(body.deals[1].TITLE).not.toContain("106");
  });

  it.each(["0", "00", "01", "-1", "1.5", "1e2", " 42", "42/foo", "9007199254740992"])(
    "rejects invalid company ID %s before CRM access",
    async (id) => {
      const res = await request(id);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("requires authentication", async () => {
    auth.requireAuth.mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    const res = await request("42");
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sanitizes transport errors and does not leak tokens", async () => {
    fetchMock.mockRejectedValue(new Error(`Network failure ${webhook}`));
    const response = await request("42");
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("SECRET_TOKEN");
  });
});
