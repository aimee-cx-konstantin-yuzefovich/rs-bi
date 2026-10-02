// src/__tests__/auth-bypass-server-canonical.test.ts
// Server-authoritative bypass for the canonical Vercel development host.
// Exercises the REAL production helper `isRequestAuthBypassEnabled` (next/headers
// mocked at the boundary only — the auth contract itself is unmocked).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isRequestAuthBypassEnabled } from "@/lib/auth-bypass-server";
import * as nextHeaders from "next/headers";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

function setEnv(key: string, value?: string) {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>)[key];
  } else {
    (process.env as Record<string, string | undefined>)[key] = value;
  }
}

function mockHeaders(host: string | null) {
  const map = new Map<string, string>();
  if (host) map.set("host", host);
  const headerObj = {
    get: (key: string) => map.get(key.toLowerCase()) || null,
  };
  vi.mocked(nextHeaders.headers).mockResolvedValue(headerObj as any);
}

describe("isRequestAuthBypassEnabled — canonical Vercel dev host (rs-bi.vercel.app)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Vercel runtime WITHOUT any manual bypass configuration:
    // no AUTH_MODE, no DEV_BYPASS_HOSTS, no DEV_BYPASS_ALLOWED_IPS.
    setEnv("VERCEL", "1");
    setEnv("VERCEL_ENV", "production");
    setEnv("NODE_ENV", "production");
    setEnv("AUTH_MODE", undefined);
    setEnv("DEV_BYPASS_HOSTS", undefined);
    setEnv("DEV_BYPASS_ALLOWED_IPS", undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("canonical host -> bypass TRUE (no WordPress, no IP, no bypass env)", async () => {
    mockHeaders("rs-bi.vercel.app");
    expect(await isRequestAuthBypassEnabled()).toBe(true);
  });

  it("canonical host with :443 -> TRUE after normalization", async () => {
    mockHeaders("rs-bi.vercel.app:443");
    expect(await isRequestAuthBypassEnabled()).toBe(true);
  });

  it("uppercase canonical host -> TRUE after normalization", async () => {
    mockHeaders("RS-BI.VERCEL.APP");
    expect(await isRequestAuthBypassEnabled()).toBe(true);
  });

  it("custom production domains -> FALSE", async () => {
    mockHeaders("bi.russilica.com");
    expect(await isRequestAuthBypassEnabled()).toBe(false);
    mockHeaders("bi-terminal.rus-silica.com");
    expect(await isRequestAuthBypassEnabled()).toBe(false);
  });

  it("arbitrary Vercel preview/branch hosts -> FALSE", async () => {
    mockHeaders("rs-bi-git-feature-xyz.vercel.app");
    expect(await isRequestAuthBypassEnabled()).toBe(false);
    mockHeaders("rs-bi-git-main-constantinejozefowicz-8563s-projects.vercel.app");
    expect(await isRequestAuthBypassEnabled()).toBe(false);
  });

  it("deceptive prefix/suffix hosts -> FALSE", async () => {
    mockHeaders("evil-rs-bi.vercel.app");
    expect(await isRequestAuthBypassEnabled()).toBe(false);
    mockHeaders("rs-bi.vercel.app.evil.com");
    expect(await isRequestAuthBypassEnabled()).toBe(false);
  });

  it("canonical host without VERCEL=1 (e.g. self-hosted spoof) -> FALSE", async () => {
    setEnv("VERCEL", undefined);
    mockHeaders("rs-bi.vercel.app");
    expect(await isRequestAuthBypassEnabled()).toBe(false);
  });

  it("missing host header -> FALSE", async () => {
    mockHeaders(null);
    expect(await isRequestAuthBypassEnabled()).toBe(false);
  });
});
