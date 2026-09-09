// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const config = vi.hoisted(() => ({ BITRIX_PORTAL_URL: "https://portal.bitrix24.ru" }));
const auth = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/config.server", () => config);
vi.mock("@/lib/auth-guard", () => ({ ...auth, isAuthError: (value: unknown) => value instanceof NextResponse }));
import { GET } from "@/app/api/bitrix/deals/[id]/route";

const webhook = "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN";
const fetchMock = vi.fn();
const request = (id = "42") =>
  GET(new NextRequest(`http://localhost/api/bitrix/deals/${id}`), {
    params: Promise.resolve({ id }),
  });
const upstream = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", webhook);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  auth.requireAuth.mockResolvedValue({ userId: "user" });
  config.BITRIX_PORTAL_URL = "https://portal.bitrix24.ru";
  upstream({
    result: {
      item: {
        id: 42,
        title: "Поставка диоксида кремния",
        stageId: "PREPARATION",
        opportunity: 1500000,
        currencyId: "RUB",
        assignedById: 7,
        companyId: 99,
        createdTime: "2026-01-01T10:00:00Z",
        UF_CRM_1753187313314: "Отгрузка запланирована",
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("deal detail endpoint through Bitrix universal CRM client", () => {
  it("uses crm.item.get with entityTypeId=2, correct deal ID, useOriginalUfNames=Y and fetches company title", async () => {
    // Deal response followed by Company response
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              item: {
                id: 42,
                title: "Поставка диоксида кремния",
                stageId: "PREPARATION",
                opportunity: 1500000,
                currencyId: "RUB",
                assignedById: 7,
                companyId: 99,
              },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              item: {
                id: 99,
                title: "АО РусСилика",
              },
            },
          }),
          { status: 200 }
        )
      );

    const response = await request("42");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    // First call: deal lookup
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [dealUrl, dealOptions] = fetchMock.mock.calls[0];
    expect(dealUrl).toBe(`${webhook}/crm.item.get`);
    expect(JSON.parse(dealOptions.body)).toEqual({
      entityTypeId: 2,
      id: 42,
      useOriginalUfNames: "Y",
    });

    // Second call: company lookup
    const [companyUrl, companyOptions] = fetchMock.mock.calls[1];
    expect(companyUrl).toBe(`${webhook}/crm.item.get`);
    expect(JSON.parse(companyOptions.body)).toEqual({
      entityTypeId: 4,
      id: 99,
      useOriginalUfNames: "Y",
    });

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.bitrixUrl).toBe("https://portal.bitrix24.ru/crm/deal/details/42/");
    expect(body.companyBitrixUrl).toBe("https://portal.bitrix24.ru/crm/company/details/99/");
    expect(body.deal).toMatchObject({
      ID: "42",
      TITLE: "Поставка диоксида кремния",
      STAGE_ID: "PREPARATION",
      OPPORTUNITY: 1500000,
      CURRENCY_ID: "RUB",
      ASSIGNED_BY_ID: 7,
      COMPANY_ID: "99",
      COMPANY_TITLE: "АО РусСилика",
    });
    expect(JSON.stringify(body)).not.toContain("SECRET_TOKEN");
  });

  it.each(["0", "00", "01", "-1", "1.5", "1e2", "abc", " 42", "42/foo", "9007199254740992"])(
    "rejects invalid ID %s before CRM access",
    async (id) => {
      const res = await request(id);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("fails safely when Bitrix returns a different deal ID than requested", async () => {
    upstream({
      result: {
        item: {
          id: 43, // mismatch: request was for 42
          title: "Чужая сделка",
        },
      },
    });
    const res = await request("42");
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toContain("Чужая сделка");
  });

  it("requires authentication", async () => {
    auth.requireAuth.mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    const res = await request("42");
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("naming invariants", () => {
    it("uses 'Без названия' when Deal TITLE is empty and never uses deal ID", async () => {
      upstream({
        result: {
          item: {
            id: 42,
            title: "   ",
            stageId: "NEW",
          },
        },
      });
      const res = await request("42");
      const body = await res.json();
      expect(body.deal.TITLE).toBe("Без названия");
      expect(body.deal.TITLE).not.toContain("42");
      expect(body.deal.TITLE).not.toContain("Сделка");
    });

    it("uses associated company's real TITLE and never uses company ID or COMPANY_ID fallback", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: {
                item: { id: 42, title: "Сделка", companyId: 105 },
              },
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: {
                item: { id: 105, title: "Компания Партнёр" },
              },
            }),
            { status: 200 }
          )
        );

      const res = await request("42");
      const body = await res.json();
      expect(body.deal.COMPANY_TITLE).toBe("Компания Партнёр");
      expect(body.deal.COMPANY_TITLE).not.toBe("105");
      expect(body.deal.COMPANY_TITLE).not.toBe("ID 105");
      expect(body.deal.COMPANY_TITLE).not.toBe("Компания 105");
    });

    it("uses 'Без названия' for company when company TITLE is empty and never uses company ID", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: {
                item: { id: 42, title: "Сделка", companyId: 105 },
              },
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: {
                item: { id: 105, title: "" },
              },
            }),
            { status: 200 }
          )
        );

      const res = await request("42");
      const body = await res.json();
      expect(body.deal.COMPANY_TITLE).toBe("Без названия");
      expect(body.deal.COMPANY_TITLE).not.toBe("105");
      expect(body.deal.COMPANY_TITLE).not.toBe("ID 105");
    });

    it("handles company enrichment failure gracefully without failing deal request or claiming title is empty", async () => {
      fetchMock
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: {
                item: { id: 42, title: "Сделка РусСилика", companyId: 99 },
              },
            }),
            { status: 200 }
          )
        )
        .mockRejectedValueOnce(new Error(`Upstream API failed ${webhook}`));

      const res = await request("42");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deal.ID).toBe("42");
      expect(body.deal.COMPANY_ID).toBe("99");
      expect(body.deal.COMPANY_TITLE).toBe("Название компании не удалось загрузить");
      expect(body.deal.COMPANY_TITLE).not.toBe("Без названия");
      expect(body.deal.COMPANY_TITLE).not.toContain("99");
      expect(JSON.stringify(body)).not.toContain("SECRET_TOKEN");
    });
  });

  describe("security and error handling", () => {
    it.each([
      ["NOT_FOUND", 400, 404],
      ["ACCESS_DENIED", 400, 403],
      ["ACCESS_DENIED", 403, 502],
      ["INVALID_CREDENTIALS", 403, 502],
    ])("maps %s HTTP %s safely without leaking tokens", async (error, upstreamStatus, status) => {
      upstream({ error, error_description: webhook }, Number(upstreamStatus));
      const response = await request("42");
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain(webhook);
    });

    it("sanitizes transport errors", async () => {
      fetchMock.mockRejectedValue(new Error(`Network failure ${webhook}`));
      const response = await request("42");
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("SECRET_TOKEN");
    });

    it.each([
      "",
      "http://portal.example",
      "https://user:secret@portal.example",
      "https://portal.example/rest/1/token",
      "https://portal.example/?token=secret",
      "https://your-portal.bitrix24.ru",
    ])("omits unsafe/unconfigured portal %s", async (portal) => {
      config.BITRIX_PORTAL_URL = portal;
      const response = await request("42");
      expect(response.status).toBe(200);
      expect((await response.json()).bitrixUrl).toBeNull();
    });
  });
});
