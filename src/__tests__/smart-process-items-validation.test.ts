// @vitest-environment node
// src/__tests__/smart-process-items-validation.test.ts
// ─────────────────────────────────────────────────────────────────────
// Strict request contract for POST /api/bitrix/smart-process-items:
//   {} → full scope; { companyId: "<positive int>" } → company scope;
//   everything else is HTTP 400 BEFORE any Bitrix work — an invalid scope
//   must NEVER degrade into an unscoped/full population query.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const auth = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  isAuthError: (value: unknown) => value instanceof Response,
}));
vi.mock("@/lib/auth-guard", () => auth);

const configServer = vi.hoisted(() => ({
  BITRIX_WEBHOOK_URL: "https://portal.example/rest/1/SECRET/",
  IS_PRODUCTION: false,
  BITRIX_PORTAL_URL: "https://portal.example",
}));
vi.mock("@/lib/config.server", () => configServer);

const loadSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/samples/smart-process-service", () => ({
  loadSmartProcessItemViews: loadSpy,
}));

const contractReady = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/crm-constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-constants")>();
  return {
    ...actual,
    get SMART_PROCESS_HAS_DISCOVERED_CONTRACT() {
      return contractReady.value;
    },
  };
});

import { POST } from "@/app/api/bitrix/smart-process-items/route";

const request = (rawBody?: string) =>
  POST(
    new NextRequest("http://localhost/api/bitrix/smart-process-items", {
      method: "POST",
      body: rawBody,
      headers: rawBody === undefined ? undefined : { "content-type": "application/json" },
    })
  );

const SP_OK = {
  success: true,
  items: [],
  byDealId: {},
  byCompanyId: {},
  stageDirectoryAvailable: true,
  total: 0,
};

beforeEach(() => {
  auth.requireAuth.mockResolvedValue({ userId: "user" });
  contractReady.value = true;
  loadSpy.mockReset();
  loadSpy.mockResolvedValue({
    views: [],
    indexes: { byDealId: new Map(), byCompanyId: new Map() },
    stageDirectoryAvailable: true,
    total: 0,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/bitrix/smart-process-items — strict body contract", () => {
  it("auth is required before anything else", async () => {
    auth.requireAuth.mockResolvedValue(
      NextResponse.json({ success: false }, { status: 401 })
    );
    const response = await request("{}");
    expect(response.status).toBe(401);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("case 18: {} → valid full scope", async () => {
    const response = await request("{}");
    expect(response.status).toBe(200);
    expect(loadSpy).toHaveBeenCalledWith({});
  });

  it("missing body → valid full scope", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(loadSpy).toHaveBeenCalledWith({});
  });

  it("case 19: valid positive companyId → scoped query", async () => {
    const response = await request(JSON.stringify({ companyId: "42" }));
    expect(response.status).toBe(200);
    expect(loadSpy).toHaveBeenCalledWith({ companyId: "42" });
  });

  it.each([
    ['""', "empty string"],
    ['"0"', "zero"],
    ['"-5"', "negative"],
    ['"12.5"', "decimal"],
    ['"abc"', "alpha"],
    ['"12abc"', "mixed"],
    ["42", "non-string number"],
    ["true", "non-string boolean"],
    ["null", "null"],
    ["[]", "array body"],
  ])("case 20: invalid companyId %s (%s) → HTTP 400", async (raw) => {
    const body = raw.startsWith("{") || raw.startsWith("[") ? raw : `{"companyId": ${raw}}`;
    const response = await request(body);
    expect(response.status).toBe(400);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("case 21: unknown body key → HTTP 400", async () => {
    const response = await request(JSON.stringify({ companyId: "42", extra: "1" }));
    expect(response.status).toBe(400);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("non-object body → HTTP 400", async () => {
    expect((await request('"just a string"')).status).toBe(400);
    expect((await request("42")).status).toBe(400);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("malformed JSON → HTTP 400", async () => {
    expect((await request("{not json")).status).toBe(400);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("oversized body → HTTP 413", async () => {
    const big = "x".repeat(11_000);
    const response = await request(big);
    expect(response.status).toBe(413);
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("case 22: invalid companyId NEVER executes an unscoped/full load", async () => {
    for (const raw of ['{"companyId": "0"}', '{"companyId": ""}', '{"companyId": 42}', '{"companyId": "-1"}']) {
      const response = await request(raw);
      expect(response.status).toBe(400);
    }
    // Not a single load call of any shape happened.
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it("successful empty data remains truthful HTTP 200 (no failure masquerade)", async () => {
    const response = await request("{}");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("upstream authoritative failure remains explicit/fail-closed", async () => {
    loadSpy.mockRejectedValue(new Error("bitrix down"));
    const response = await request("{}");
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});
