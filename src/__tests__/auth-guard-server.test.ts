import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requireAuth, requireAdmin } from "@/lib/auth-guard";
import { DEV_USER } from "@/lib/auth-mode";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import * as nextHeaders from "next/headers";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/db", () => ({
  db: {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

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

describe("Server Auth Guards with Request-Scoped Bypass", () => {
  const originalEnv = { ...process.env };
  const approvedHost = "rs-bi-git-main-constantinejozefowicz-8563s-projects.vercel.app";
  const approvedIp = "86.220.30.74";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    setEnv("AUTH_MODE", "bypass");
    setEnv("VERCEL", "1");
    setEnv("VERCEL_ENV", "production");
    setEnv("NODE_ENV", "production");
    setEnv("DEV_BYPASS_HOSTS", approvedHost);
    setEnv("DEV_BYPASS_ALLOWED_IPS", approvedIp);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function mockHeaders(host: string, clientIp?: string) {
    const map = new Map<string, string>();
    map.set("host", host);
    if (clientIp) {
      map.set("x-real-ip", clientIp);
    }
    const headerObj = {
      get: (key: string) => map.get(key.toLowerCase()) || null,
    };
    vi.mocked(nextHeaders.headers).mockResolvedValue(headerObj as any);
  }

  describe("requireAuth", () => {
    it("allowed host + allowed IP -> returns DEV_USER without calling getServerSession", async () => {
      mockHeaders(approvedHost, approvedIp);

      const result = await requireAuth();
      expect(result).toEqual({
        userId: DEV_USER.id,
        email: DEV_USER.email,
        name: DEV_USER.name,
        role: DEV_USER.role,
      });
      expect(getServerSession).not.toHaveBeenCalled();
    });

    it("allowed host + wrong IP -> calls getServerSession and returns 401 when no session", async () => {
      mockHeaders(approvedHost, "198.51.100.99");
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const result = await requireAuth();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
      expect(getServerSession).toHaveBeenCalledTimes(1);
    });

    it("production custom domain (bi.russilica.com) + approved IP -> requires real session", async () => {
      mockHeaders("bi.russilica.com", approvedIp);
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const result = await requireAuth();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
      expect(getServerSession).toHaveBeenCalledTimes(1);
    });
  });

  describe("requireAdmin", () => {
    it("allowed host + allowed IP -> returns DEV_USER admin without calling getServerSession", async () => {
      mockHeaders(approvedHost, approvedIp);

      const result = await requireAdmin();
      expect(result).toEqual({
        userId: DEV_USER.id,
        email: DEV_USER.email,
        name: DEV_USER.name,
        role: DEV_USER.role,
      });
      expect(getServerSession).not.toHaveBeenCalled();
    });

    it("allowed host + wrong IP -> requires real session and rejects unauthenticated", async () => {
      mockHeaders(approvedHost, "1.2.3.4");
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const result = await requireAdmin();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
      expect(getServerSession).toHaveBeenCalledTimes(1);
    });

    it("production custom domain + approved IP -> requires real session and rejects non-admin with 403", async () => {
      mockHeaders("bi-terminal.rus-silica.com", approvedIp);
      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: "user@russilica.ru", email: "user@russilica.ru", name: "User", role: "user" },
        expires: "2099-01-01",
      });

      const result = await requireAdmin();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(403);
    });
  });
});
