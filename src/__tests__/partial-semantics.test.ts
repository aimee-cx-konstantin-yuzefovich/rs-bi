// src/__tests__/partial-semantics.test.ts
// ─────────────────────────────────────────────────────────────────────
// Regression tests for truthful partial response semantics across Bitrix API routes.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getFields } from "@/app/api/bitrix/fields/route";
import { GET as getUsers } from "@/app/api/bitrix/users/route";
import { GET as getResponsibleCounts } from "@/app/api/bitrix/companies/responsible-counts/route";
import { NextRequest } from "next/server";
import * as bitrix from "@/lib/bitrix";
import * as authGuard from "@/lib/auth-guard";

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: "1", email: "test@russilica.ru", role: "admin" }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

describe("Truthful Partial Response Semantics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authGuard, "requireAuth").mockResolvedValue({ id: "1", email: "test@russilica.ru", role: "admin" } as any);
    vi.spyOn(authGuard, "isAuthError").mockReturnValue(false);
  });

  describe("GET /api/bitrix/fields", () => {
    it("TC-PARTIAL-FIELDS-01: reports partial=true and missingSources when crm.company.fields fails", async () => {
      vi.spyOn(bitrix, "bitrixGet").mockImplementation(async (method: string) => {
        if (method === "crm.deal.fields") {
          return {
            result: {
              OPPORTUNITY: { type: "double", title: "Сумма" },
            },
          } as any;
        }
        if (method === "crm.company.fields") {
          throw new Error("Bitrix company fields timeout");
        }
        return { result: {} } as any;
      });

      const res = await getFields();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.partial).toBe(true);
      expect(data.missingSources).toEqual(["crm.company.fields"]);
      // Still includes the deal fields
      expect(data.fields.some((f: any) => f.id === "OPPORTUNITY")).toBe(true);
    });

    it("TC-PARTIAL-FIELDS-02: reports partial=false when all metadata endpoints succeed", async () => {
      vi.spyOn(bitrix, "bitrixGet").mockImplementation(async (method: string) => {
        if (method === "crm.deal.fields") {
          return {
            result: {
              OPPORTUNITY: { type: "double", title: "Сумма" },
            },
          } as any;
        }
        if (method === "crm.company.fields") {
          return {
            result: {
              TITLE: { type: "string", title: "Company Title" },
            },
          } as any;
        }
        return { result: {} } as any;
      });

      const res = await getFields();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.partial).toBe(false);
      expect(data.missingSources).toBeUndefined();
    });
  });

  describe("GET /api/bitrix/users", () => {
    it("TC-PARTIAL-USERS-01: reports partial=true and failedBatches count when batch fails", async () => {
      vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method: string, params: any) => {
        const start = params?.start || 0;
        if (start === 0) {
          return {
            result: Array.from({ length: 50 }, (_, i) => ({
              ID: String(i + 1),
              NAME: `User${i + 1}`,
              LAST_NAME: "Test",
              SECOND_NAME: "",
            })),
            total: 100,
          } as any;
        }
        if (start === 50) {
          throw new Error("Page 2 fetch error");
        }
        return { result: [] } as any;
      });

      const req = new NextRequest("http://localhost:3000/api/bitrix/users");
      const res = await getUsers(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.partial).toBe(true);
      expect(data.failedBatches).toBe(1);
      expect(data.fetched).toBe(50);
      expect(data.total).toBe(100);
      expect(data.truncated).toBe(true);
    });

    it("TC-PARTIAL-USERS-02: reports partial=false when all user pages succeed", async () => {
      vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method: string, params: any) => {
        const start = params?.start || 0;
        return {
          result: Array.from({ length: 25 }, (_, i) => ({
            ID: String(start + i + 1),
            NAME: `User${start + i + 1}`,
            LAST_NAME: "Test",
            SECOND_NAME: "",
          })),
          total: 25,
        } as any;
      });

      const req = new NextRequest("http://localhost:3000/api/bitrix/users");
      const res = await getUsers(req);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.partial).toBe(false);
      expect(data.failedBatches).toBe(0);
      expect(data.fetched).toBe(25);
      expect(data.truncated).toBe(false);
    });
  });

  describe("GET /api/bitrix/companies/responsible-counts", () => {
    it("TC-PARTIAL-COUNTS-01: reports partial=true and failedPages when middle page fails", async () => {
      vi.spyOn(bitrix, "bitrixPost").mockImplementation(async (method: string, params: any) => {
        const start = params?.start || 0;
        if (start === 0) {
          return {
            result: Array.from({ length: 50 }, () => ({ ASSIGNED_BY_ID: "1" })),
            total: 100,
            next: 50,
          } as any;
        }
        if (start === 50) {
          throw new Error("Page 2 failure");
        }
        return { result: [] } as any;
      });

      const res = await getResponsibleCounts();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.partial).toBe(true);
      expect(data.failedPages).toBe(1);
      expect(data.scannedCompanies).toBe(50);
      expect(data.total).toBe(100);
      expect(data.truncated).toBe(true);
      expect(data.counts["1"]).toBe(50);
    });

    it("TC-PARTIAL-COUNTS-02: reports cappedByLimit=true when total exceeds MAX_COMPANIES_TO_SCAN", async () => {
      vi.spyOn(bitrix, "bitrixPost").mockImplementation(async () => {
        return {
          result: Array.from({ length: 50 }, () => ({ ASSIGNED_BY_ID: "1" })),
          total: 25_000, // Exceeds 20,000 cap
          next: 50,
        } as any;
      });

      const res = await getResponsibleCounts();
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.cappedByLimit).toBe(true);
      expect(data.truncated).toBe(true);
      expect(data.total).toBe(25_000);
    });
  });
});
