import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/bitrix/activities/route";
import { bitrixPost } from "@/lib/bitrix";
import { requireAuth } from "@/lib/auth-guard";
import { NextRequest } from "next/server";

vi.mock("@/lib/bitrix", () => ({
  bitrixPost: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn(),
  isAuthError: vi.fn().mockReturnValue(false),
}));

describe("Fix C: Activities Route Batch Completeness and Incomplete Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      user: { email: "test@russilica.ru", role: "admin" },
    } as any);
  });

  const createRequest = (body: unknown) => {
    return new NextRequest("http://localhost:3000/api/bitrix/activities", {
      method: "POST",
      body: JSON.stringify(body),
    });
  };

  it("marks deals as incomplete and leaves them out of fetchedDealIds when cursor repeats", async () => {
    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        result: [{ ID: "A1", OWNER_ID: "101", SUBJECT: "Test", COMPLETED: "Y", CREATED: "2026-03-01" }],
        next: 0, // repeated cursor start=0
      });

    const res = await POST(createRequest({ dealIds: ["101"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.partial).toBe(true);
    expect(json.incompleteDealIds).toEqual(["101"]);
    expect(json.fetchedDealIds).toEqual([]);
    expect(json.activities["101"]).toBeUndefined();
  });

  it("marks deals as incomplete when pagination reaches safety limit", async () => {
    // Return 20 pages with next
    let callCount = 0;
    vi.mocked(bitrixPost).mockImplementation(async () => {
      callCount++;
      return {
        result: [{ ID: String(callCount), OWNER_ID: "201", SUBJECT: "Note", COMPLETED: "N", CREATED: "2026-03-01" }],
        next: callCount * 50,
      };
    });

    const res = await POST(createRequest({ dealIds: ["201"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.partial).toBe(true);
    expect(json.incompleteDealIds).toEqual(["201"]);
    expect(json.fetchedDealIds).toEqual([]);
    expect(json.activities["201"]).toBeUndefined();
  });

  it("marks deals as fetchedDealIds and populates activities when pagination completes cleanly", async () => {
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      result: [
        { ID: "1", OWNER_ID: "301", SUBJECT: "Call", COMPLETED: "Y", CREATED: "2026-03-01" },
        { ID: "2", OWNER_ID: "301", SUBJECT: "Meeting", COMPLETED: "N", DEADLINE: "2026-04-01", CREATED: "2026-03-02" },
      ],
      next: undefined, // completed
    });

    const res = await POST(createRequest({ dealIds: ["301"] }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.partial).toBe(false);
    expect(json.fetchedDealIds).toEqual(["301"]);
    expect(json.incompleteDealIds).toEqual([]);
    expect(json.failedDealIds).toEqual([]);
    expect(json.activities["301"]).toBeDefined();
    expect(json.activities["301"].last?.ID).toBe("1");
    expect(json.activities["301"].next?.ID).toBe("2");
  });
});
