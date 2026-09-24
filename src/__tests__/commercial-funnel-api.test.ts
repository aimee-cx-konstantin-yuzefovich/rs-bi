// @vitest-environment node
// src/__tests__/commercial-funnel-api.test.ts
// Tests for POST /api/bitrix/commercial-funnel endpoint.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/bitrix/commercial-funnel/route";
import * as authGuard from "@/lib/auth-guard";
import { NextResponse } from "next/server";

describe("Commercial Funnel API Route Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires authentication: returns 401 when user is not authenticated", async () => {
    vi.spyOn(authGuard, "requireAuth").mockResolvedValue(
      NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    );

    const res = await POST();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it("falls back to demo mode when BITRIX_WEBHOOK_URL is not set", async () => {
    vi.spyOn(authGuard, "requireAuth").mockResolvedValue({
      user: { id: "1", email: "test@example.com", role: "admin" },
    } as any);

    // Ensure BITRIX_WEBHOOK_URL is undefined
    const origWebhook = process.env.BITRIX_WEBHOOK_URL;
    delete process.env.BITRIX_WEBHOOK_URL;

    try {
      const res = await POST();
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.isDemoMode).toBe(true);
      expect(Array.isArray(data.companies)).toBe(true);
      expect(data.companies.length).toBeGreaterThan(0);
      expect(Array.isArray(data.deals)).toBe(true);
      expect(data.deals.length).toBeGreaterThan(0);
      expect(typeof data.userNames).toBe("object");
    } finally {
      if (origWebhook !== undefined) {
        process.env.BITRIX_WEBHOOK_URL = origWebhook;
      }
    }
  });
});
