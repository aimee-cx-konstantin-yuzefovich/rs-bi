// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const config = vi.hoisted(() => ({ BITRIX_PORTAL_URL: "https://portal.bitrix24.ru" }));
const auth = vi.hoisted(() => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/config.server", () => config);
vi.mock("@/lib/auth-guard", () => ({ ...auth, isAuthError: (value: unknown) => value instanceof NextResponse }));
import { GET } from "@/app/api/bitrix/companies/[id]/route";
import { bitrixPost } from "@/lib/bitrix";

const webhook = "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN";
const fetchMock = vi.fn();
const request = (id = "42") => GET(new NextRequest(`http://localhost/api/bitrix/companies/${id}`), {
  params: Promise.resolve({ id }),
});
const upstream = (body: unknown, status = 200) => fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", webhook);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.requireAuth.mockResolvedValue({ userId: "user" });
  config.BITRIX_PORTAL_URL = "https://portal.bitrix24.ru";
  upstream({ result: { item: { id: 42, title: "Компания", assignedById: 7,
    UF_CRM_1753187313314: "Образцы отправлены", createdTime: "2026-01-01T10:00:00Z",
    fm: [{ typeId: "PHONE", value: "+70000000000" }, { typeId: "EMAIL", value: "sales@example.com" }],
  } } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

describe("company detail endpoint through the real Bitrix client", () => {
  it("uses universal company get, preserves UF names and returns the exact safe URL", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${webhook}/crm.item.get`);
    expect(JSON.parse(options.body)).toEqual({ entityTypeId: 4, id: 42, useOriginalUfNames: "Y" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = await response.json();
    expect(body.bitrixUrl).toBe("https://portal.bitrix24.ru/crm/company/details/42/");
    expect(body.company).toMatchObject({ ID: "42", TITLE: "Компания", ASSIGNED_BY_ID: 7,
      UF_CRM_1753187313314: "Образцы отправлены", PHONE: "+70000000000", EMAIL: "sales@example.com" });
    expect(JSON.stringify(body)).not.toContain("SECRET_TOKEN");
  });
  it.each(["0", "00", "01", "-1", "1.5", "1e2", " 42", "42/foo", "9007199254740992"])("rejects invalid ID %s before CRM access", async (id) => {
    expect((await request(id)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    auth.requireAuth.mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    expect((await request()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["", "http://portal.example", "https://user:secret@portal.example", "https://portal.example/rest/1/token", "https://portal.example/?token=secret", "https://portal.example/#secret", "bad url"])("omits unsafe/unconfigured portal %s", async (portal) => {
    config.BITRIX_PORTAL_URL = portal;
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).bitrixUrl).toBeNull();
  });
  it.each([["NOT_FOUND", 400, 404], ["NOT_FOUND", 200, 404], ["ACCESS_DENIED", 400, 403], ["ACCESS_DENIED", 403, 403], ["INVALID_CREDENTIALS", 403, 502]])("maps %s HTTP %s safely", async (error, upstreamStatus, status) => {
    upstream({ error, error_description: webhook }, Number(upstreamStatus));
    const response = await request();
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain(webhook);
  });
  it("sanitizes transport errors", async () => {
    fetchMock.mockRejectedValue(new Error(`Network failure ${webhook}`));
    const response = await request();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("SECRET_TOKEN");
  });
  it("treats malformed successful responses as upstream errors", async () => {
    upstream({ result: { item: { id: 43 } } });
    expect((await request()).status).toBe(502);
  });
  it("does not allow additional universal methods", async () => {
    await expect(bitrixPost("crm.item.list")).rejects.toThrow("Invalid request parameters");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("retains HTTPS validation", async () => {
    vi.stubEnv("BITRIX_WEBHOOK_URL", "http://portal.example/rest/1/token");
    expect((await request()).status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
