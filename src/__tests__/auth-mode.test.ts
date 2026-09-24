import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getAuthMode, isAuthBypassEnabled, DEV_USER, DEV_SESSION } from "@/lib/auth-mode";
import { requireAuth, requireAdmin } from "@/lib/auth-guard";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

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

function setEnv(key: string, value?: string) {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>)[key];
  } else {
    (process.env as Record<string, string | undefined>)[key] = value;
  }
}

describe("Authentication Mode & Bypass Helper", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("getAuthMode", () => {
    it("Test A: returns 'wordpress' when AUTH_MODE is missing", () => {
      setEnv("AUTH_MODE", undefined);
      expect(getAuthMode()).toBe("wordpress");
    });

    it("Test B: returns 'bypass' when AUTH_MODE is 'bypass'", () => {
      setEnv("AUTH_MODE", "bypass");
      expect(getAuthMode()).toBe("bypass");
    });

    it("Test E: returns 'wordpress' when AUTH_MODE is 'wordpress'", () => {
      setEnv("AUTH_MODE", "wordpress");
      expect(getAuthMode()).toBe("wordpress");
    });

    it("Test F: returns 'wordpress' when AUTH_MODE has an invalid value", () => {
      setEnv("AUTH_MODE", "invalid-value");
      expect(getAuthMode()).toBe("wordpress");
    });
  });

  describe("isAuthBypassEnabled", () => {
    it("Test A: AUTH_MODE missing, NODE_ENV=production -> bypass=false", () => {
      setEnv("AUTH_MODE", undefined);
      setEnv("NODE_ENV", "production");
      expect(isAuthBypassEnabled()).toBe(false);
    });

    it("Test B: AUTH_MODE=bypass, NODE_ENV=development -> bypass=true", () => {
      setEnv("AUTH_MODE", "bypass");
      setEnv("NODE_ENV", "development");
      expect(isAuthBypassEnabled()).toBe(true);
    });

    it("Test C: AUTH_MODE=bypass, VERCEL=1, VERCEL_ENV=preview, NODE_ENV=production -> bypass=true", () => {
      setEnv("AUTH_MODE", "bypass");
      setEnv("VERCEL", "1");
      setEnv("VERCEL_ENV", "preview");
      setEnv("NODE_ENV", "production");
      expect(isAuthBypassEnabled()).toBe(true);
    });

    it("Test D — CRITICAL: AUTH_MODE=bypass, VERCEL=1, VERCEL_ENV=production, NODE_ENV=production -> bypass=false", () => {
      setEnv("AUTH_MODE", "bypass");
      setEnv("VERCEL", "1");
      setEnv("VERCEL_ENV", "production");
      setEnv("NODE_ENV", "production");
      expect(isAuthBypassEnabled()).toBe(false);
    });

    it("Test E: AUTH_MODE=wordpress, VERCEL_ENV=preview -> bypass=false", () => {
      setEnv("AUTH_MODE", "wordpress");
      setEnv("VERCEL", "1");
      setEnv("VERCEL_ENV", "preview");
      expect(isAuthBypassEnabled()).toBe(false);
    });

    it("Test F: AUTH_MODE=invalid-value, NODE_ENV=development -> bypass=false", () => {
      setEnv("AUTH_MODE", "invalid-value");
      setEnv("NODE_ENV", "development");
      expect(isAuthBypassEnabled()).toBe(false);
    });

    it("Defense-in-depth: AUTH_MODE missing in development -> bypass=false", () => {
      setEnv("AUTH_MODE", undefined);
      setEnv("NODE_ENV", "development");
      expect(isAuthBypassEnabled()).toBe(false);
    });

    it("Defense-in-depth: AUTH_MODE=bypass, VERCEL=0, VERCEL_ENV=preview -> bypass=false", () => {
      setEnv("AUTH_MODE", "bypass");
      setEnv("VERCEL", "0");
      setEnv("VERCEL_ENV", "preview");
      setEnv("NODE_ENV", "production");
      expect(isAuthBypassEnabled()).toBe(false);
    });

    it("Defense-in-depth: AUTH_MODE=bypass on non-Vercel production host -> bypass=false", () => {
      setEnv("AUTH_MODE", "bypass");
      setEnv("VERCEL", undefined);
      setEnv("VERCEL_ENV", undefined);
      setEnv("NODE_ENV", "production");
      expect(isAuthBypassEnabled()).toBe(false);
    });

    it("Adversarial: AUTH_MODE=bypass, VERCEL_ENV=production even if NODE_ENV=development -> MUST BE FALSE", () => {
      setEnv("AUTH_MODE", "bypass");
      setEnv("VERCEL_ENV", "production");
      setEnv("NODE_ENV", "development");
      expect(isAuthBypassEnabled()).toBe(false);
    });

    it("Adversarial: AUTH_MODE=bypass, VERCEL=1, non-preview VERCEL_ENV even if NODE_ENV=development -> MUST BE FALSE", () => {
      setEnv("AUTH_MODE", "bypass");
      setEnv("VERCEL", "1");
      setEnv("VERCEL_ENV", "development");
      setEnv("NODE_ENV", "development");
      expect(isAuthBypassEnabled()).toBe(false);
    });
  });

  describe("Server Auth Guards (requireAuth & requireAdmin)", () => {
    it("bypass enabled -> requireAuth succeeds with synthetic development user", async () => {
      setEnv("AUTH_MODE", "bypass");
      setEnv("NODE_ENV", "development");

      const authResult = await requireAuth();
      expect(authResult).toEqual({
        userId: DEV_USER.id,
        email: DEV_USER.email,
        name: DEV_USER.name,
        role: DEV_USER.role,
      });
      // Ensure getServerSession was NOT called
      expect(getServerSession).not.toHaveBeenCalled();
    });

    it("bypass enabled -> requireAdmin succeeds with admin role", async () => {
      setEnv("AUTH_MODE", "bypass");
      setEnv("NODE_ENV", "development");

      const authResult = await requireAdmin();
      expect(authResult).toEqual({
        userId: DEV_USER.id,
        email: DEV_USER.email,
        name: DEV_USER.name,
        role: DEV_USER.role,
      });
      expect(getServerSession).not.toHaveBeenCalled();
    });

    it("bypass disabled -> requireAuth requires real NextAuth session", async () => {
      setEnv("AUTH_MODE", undefined);
      setEnv("NODE_ENV", "development");

      // Mock unauthenticated session
      vi.mocked(getServerSession).mockResolvedValueOnce(null);

      const result = await requireAuth();
      expect(result).toBeInstanceOf(NextResponse);
      const res = result as NextResponse;
      expect(res.status).toBe(401);
      expect(getServerSession).toHaveBeenCalledTimes(1);
    });

    it("bypass disabled -> requireAuth succeeds with real valid session", async () => {
      setEnv("AUTH_MODE", undefined);
      setEnv("NODE_ENV", "development");

      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: "real@russilica.ru", email: "real@russilica.ru", name: "Real User", role: "user" },
        expires: "2099-01-01",
      });

      const result = await requireAuth();
      expect(result).toEqual({
        userId: "real@russilica.ru",
        email: "real@russilica.ru",
        name: "Real User",
        role: "user",
      });
    });

    it("bypass disabled -> requireAdmin rejects non-admin users with 403", async () => {
      setEnv("AUTH_MODE", undefined);
      setEnv("NODE_ENV", "development");

      vi.mocked(getServerSession).mockResolvedValueOnce({
        user: { id: "user@russilica.ru", email: "user@russilica.ru", name: "Regular User", role: "user" },
        expires: "2099-01-01",
      });

      const result = await requireAdmin();
      expect(result).toBeInstanceOf(NextResponse);
      const res = result as NextResponse;
      expect(res.status).toBe(403);
    });
  });

  describe("Section 18 Mandatory Regression Test: Production Cannot Bypass", () => {
    it("CRITICAL: NODE_ENV=production, VERCEL=1, VERCEL_ENV=production, AUTH_MODE=bypass MUST remain locked down", async () => {
      setEnv("NODE_ENV", "production");
      setEnv("VERCEL", "1");
      setEnv("VERCEL_ENV", "production");
      setEnv("AUTH_MODE", "bypass");

      // 1. Invariant: bypass helper MUST be false
      expect(isAuthBypassEnabled()).toBe(false);

      // 2. Invariant: requireAuth MUST require a real session and fail with 401 when no session exists
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      const result = await requireAuth();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
      expect(getServerSession).toHaveBeenCalled();
    });
  });
});
