// src/__tests__/bitrix-transient-retry.test.ts
// Shared bounded transient-retry strategy for Bitrix transport.
// Tests run through the real transport helpers (bitrixGet/bitrixPost +
// fetchAllPages middleware-path pagination), not synthetic wrappers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("BITRIX_WEBHOOK_URL", "https://portal.bitrix24.ru/rest/1/SECRET_TOKEN");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const status = (code: number) => new Response(JSON.stringify({ error: `http ${code}` }), { status: code });

describe("bitrixPost transient retry", () => {
  it("HTTP 429 then success -> retried and succeeds", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok({ result: [{ ID: "1" }] }));

    const data = await bitrixPost<{ result: Array<{ ID: string }> }>("crm.company.list", { start: 0 });
    expect(data.result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("HTTP 503 then success -> retried and succeeds", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(ok({ result: [] }));

    const data = await bitrixPost("crm.company.list", {});
    expect(data).toEqual({ result: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retry exhaustion (429 x3) -> truthful failure with sanitized error", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(status(429));

    await expect(bitrixPost("crm.company.list", {})).rejects.toThrow(
      "Failed to crm.company.list. Please try again later."
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("deterministic auth failure (401) is NOT retried", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(status(401));

    await expect(bitrixPost("crm.company.list", {})).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("BitrixItemError (NOT_FOUND) is NOT retried and keeps its class", async () => {
    const { bitrixPost, BitrixItemError } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 400 })
    );

    await expect(bitrixPost("crm.item.get", { id: "42", entityTypeId: 1032 })).rejects.toBeInstanceOf(
      BitrixItemError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("credentials never leak through retry logs", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(status(429));
    await expect(bitrixPost("crm.company.list", {})).rejects.toThrow();
    for (const call of (console.warn as any).mock.calls.concat((console.error as any).mock.calls)) {
      expect(JSON.stringify(call)).not.toContain("SECRET_TOKEN");
    }
  });
});

describe("middleware pagination pages get bounded retry", () => {
  it("transient middle-page failure -> whole pagination succeeds", async () => {
    const { fetchAllPages } = await import("@/lib/samples/bitrix-fetch");
    fetchMock
      // Page 1
      .mockResolvedValueOnce(
        ok({ result: [{ ID: "10" }, { ID: "20" }], total: 3, next: 2 })
      )
      // Page 2 transient failure
      .mockResolvedValueOnce(status(503))
      // Page 2 retry
      .mockResolvedValueOnce(
        ok({ result: [{ ID: "30" }], total: 3 })
      );

    const rows = await fetchAllPages("crm.company.list", {}, "ID");
    expect(rows.map((r) => r.ID)).toEqual(["10", "20", "30"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retry exhaustion mid-page preserves fail-closed pagination failure", async () => {
    const { fetchAllPages } = await import("@/lib/samples/bitrix-fetch");
    fetchMock
      .mockResolvedValueOnce(
        ok({ result: [{ ID: "10" }], total: 5, next: 1 })
      )
      .mockResolvedValue(status(429));

    await expect(fetchAllPages("crm.company.list", {}, "ID")).rejects.toThrow();
    // Bounded: full-pagination restart (max 2) × transport retries (max 3).
    // Attempt 1: page1 (1) + page2 transport retries (3) = 4.
    // Attempt 2 (restart): page1 (1) + page2 transport retries (3) = 7.
    // Not a storm, and never a partial dataset.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(8);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe("bitrixGet transient retry", () => {
  it("503 then success -> retried and succeeds", async () => {
    const { bitrixGet } = await import("@/lib/bitrix");
    fetchMock
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(ok({ result: [] }));
    const data = await bitrixGet("crm.status.list");
    expect(data).toEqual({ result: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("native transport failures reach the shared retry layer", () => {
  it("fetch network failure (TypeError with ECONNRESET cause) -> retried and succeeds", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    const networkError = new TypeError("fetch failed") as TypeError & { cause?: Error };
    networkError.cause = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    fetchMock
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(ok({ result: [] }));

    const data = await bitrixPost("crm.company.list", {});
    expect(data).toEqual({ result: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("timeout exception (AbortError) -> retried and succeeds", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    const abortError = new Error("This operation was aborted");
    abortError.name = "TimeoutError";
    fetchMock
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(ok({ result: [{ ID: "5" }] }));

    const data = await bitrixPost<{ result: Array<{ ID: string }> }>("crm.company.get", { ID: "5" });
    expect(data.result).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ECONNREFUSED / ETIMEDOUT style transport errors -> retried", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:443"), { code: "ECONNREFUSED" }))
      .mockRejectedValueOnce(Object.assign(new Error("connection timed out"), { code: "ETIMEDOUT" }))
      .mockResolvedValueOnce(ok({ result: [] }));

    const data = await bitrixPost("crm.company.list", {});
    expect(data).toEqual({ result: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("transport retry exhaustion -> sanitized, truthful, credential-safe failure", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockRejectedValue(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));

    await expect(bitrixPost("crm.company.list", {})).rejects.toThrow(
      "Failed to crm.company.list. Please try again later."
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Credentials never surface in logs across the retry lifecycle.
    for (const call of (console.warn as any).mock.calls.concat((console.error as any).mock.calls)) {
      expect(JSON.stringify(call)).not.toContain("SECRET_TOKEN");
    }
  });
});

describe("crm.item.get shares the shared transient retry path", () => {
  it("429 then success -> retried and succeeds", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock
      .mockResolvedValueOnce(status(429))
      .mockResolvedValueOnce(ok({ result: { item: { id: 1032, title: "Sample" } } }));

    const data = await bitrixPost<{ result: { item: { id: number } } }>("crm.item.get", {
      entityTypeId: 1032,
      id: 1032,
    });
    expect(data.result.item.id).toBe(1032);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("503 then success -> retried and succeeds", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock
      .mockResolvedValueOnce(status(503))
      .mockResolvedValueOnce(ok({ result: { item: { id: 7 } } }));

    const data = await bitrixPost("crm.item.get", { entityTypeId: 4, id: 7 });
    expect((data as { result: { item: { id: number } } }).result.item.id).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("NOT_FOUND (HTTP 400 item-level) -> NOT retried", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 400 }));

    await expect(bitrixPost("crm.item.get", { entityTypeId: 2, id: 42 })).rejects.toThrow("Company not found.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ACCESS_DENIED (HTTP 400 item-level) -> NOT retried", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "ACCESS_DENIED" }), { status: 400 }));

    await expect(bitrixPost("crm.item.get", { entityTypeId: 2, id: 43 })).rejects.toThrow("Company access denied.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("transport retry exhaustion on crm.item.get -> sanitized truthful failure", async () => {
    const { bitrixPost } = await import("@/lib/bitrix");
    fetchMock.mockResolvedValue(status(429));

    await expect(bitrixPost("crm.item.get", { entityTypeId: 4, id: 9 })).rejects.toThrow(
      "Failed to crm.item.get. Please try again later."
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
