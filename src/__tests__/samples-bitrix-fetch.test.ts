import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllPages, fetchSmartProcessSampleItems } from "@/lib/samples/bitrix-fetch";
import { bitrixPost } from "@/lib/bitrix";

vi.mock("@/lib/bitrix", () => ({
  bitrixPost: vi.fn(),
}));

// Contract discovered/verified in tests (production constants stay real
// constants; these tests rely on the real committed field IDs).
vi.mock("@/lib/samples/smart-process-contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/samples/smart-process-contract")>();
  return {
    ...actual,
    SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
    assertSmartProcessContractReady: () => {},
  };
});

describe("Fix B: Ingress Completeness and Entity Identity (fetchAllPages)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed when an authoritative row is missing the ID field (Case 1)", async () => {
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      total: 2,
      result: [
        { ID: "1", TITLE: "Valid Company" },
        { TITLE: "Broken Company without ID" },
      ],
      next: undefined,
    });

    await expect(
      fetchAllPages("crm.company.list", {}, "ID")
    ).rejects.toThrow(/Authoritative entity row missing required 'ID'/);
  });

  it("fails closed when Bitrix reports total > 0 but returns empty result without next (Case 2)", async () => {
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      total: 100,
      result: [],
      next: undefined,
    });

    await expect(
      fetchAllPages("crm.company.list", {}, "ID")
    ).rejects.toThrow(/Total reconciliation failed: Bitrix reported total 100 but returned 0 rows/);
  });

  it("deduplicates entity IDs across pages and reconciles total (Case 3)", async () => {
    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        total: 3,
        result: [{ ID: "10" }, { ID: "20" }],
        next: 2,
      })
      .mockResolvedValueOnce({
        total: 3,
        result: [{ ID: "20" }, { ID: "30" }], // Duplicate ID "20"
        next: undefined,
      });

    const rows = await fetchAllPages("crm.company.list", {}, "ID");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.ID)).toEqual(["10", "20", "30"]);
  });

  it("fails closed when total count does not match received unique rows", async () => {
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      total: 5,
      result: [{ ID: "1" }, { ID: "2" }],
      next: undefined,
    });

    await expect(
      fetchAllPages("crm.company.list", {}, "ID")
    ).rejects.toThrow(/Pagination count mismatch: expected 5 total rows, received 2/);
  });

  it("succeeds when pagination and total count reconcile completely", async () => {
    vi.mocked(bitrixPost)
      .mockResolvedValueOnce({
        total: 3,
        result: [{ ID: "1" }, { ID: "2" }],
        next: 2,
      })
      .mockResolvedValueOnce({
        total: 3,
        result: [{ ID: "3" }],
        next: undefined,
      });

    const rows = await fetchAllPages("crm.company.list", {}, "ID");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.ID)).toEqual(["1", "2", "3"]);
  });

  it("fails closed on non-advancing pagination cursor", async () => {
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      result: [{ ID: "1" }],
      next: 0, // non-advancing
    });

    await expect(
      fetchAllPages("crm.company.list", {}, "ID")
    ).rejects.toThrow(/Invalid pagination next token/);
  });
});

describe("Smart Process crm.item.list request contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends ONLY official Universal CRM parameters — no uppercase SELECT/FILTER/ORDER aliases", async () => {
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      result: [{ id: "1", stageId: "DT1032_15:NEW" }],
    });

    const rows = await fetchSmartProcessSampleItems({ companyId: "42" });

    expect(rows).toHaveLength(1);
    expect(bitrixPost).toHaveBeenCalledTimes(1);
    const [method, params] = vi.mocked(bitrixPost).mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(method).toBe("crm.item.list");
    // Exact key set: only official lowercase parameters (+ pagination `start`).
    expect(Object.keys(params).sort()).toEqual([
      "entityTypeId",
      "filter",
      "order",
      "select",
      "start",
      "useOriginalUfNames",
    ]);
    // No duplicate uppercase aliases anywhere in the request.
    for (const key of ["SELECT", "FILTER", "ORDER"]) {
      expect(Object.keys(params)).not.toContain(key);
    }
    // Verified contract values preserved.
    expect(params.entityTypeId).toBe(1032);
    expect(params.useOriginalUfNames).toBe("Y");
    expect(params.start).toBe(0);
    expect(params.filter).toEqual({ categoryId: 15, companyId: "42" });
    expect(params.order).toEqual({ id: "ASC" });
    expect(params.select).toContain("stageId");
    expect(params.select).toContain("id");
  });

  it("SMART_PROCESS_ITEM_SELECT includes BOTH quantity fields (Gel kg + Sol l)", async () => {
    const { SMART_PROCESS_ITEM_SELECT } = await import("@/lib/samples/bitrix-fetch");
    const { SMART_PROCESS_QTY_GEL_FIELD_ID, SMART_PROCESS_QTY_SOL_FIELD_ID } =
      await import("@/lib/samples/smart-process-contract");

    expect(SMART_PROCESS_QTY_GEL_FIELD_ID).toBe("UF_CRM_7_1766136470");
    expect(SMART_PROCESS_QTY_SOL_FIELD_ID).toBe("UF_CRM_7_1766136546");
    expect(SMART_PROCESS_ITEM_SELECT).toContain(SMART_PROCESS_QTY_GEL_FIELD_ID);
    expect(SMART_PROCESS_ITEM_SELECT).toContain(SMART_PROCESS_QTY_SOL_FIELD_ID);
  });

  it("production crm.item.list shape remains: entityTypeId top-level, useOriginalUfNames top-level, categoryId INSIDE filter, lowercase keys", async () => {
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      result: [],
    });

    await fetchSmartProcessSampleItems();

    const [method, params] = vi.mocked(bitrixPost).mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];

    expect(method).toBe("crm.item.list");
    // Top-level official parameters only.
    expect(params).toHaveProperty("entityTypeId", 1032);
    expect(params).toHaveProperty("useOriginalUfNames", "Y");
    // categoryId strictly INSIDE filter — never a top-level parameter.
    const filter = params.filter as Record<string, unknown>;
    expect(filter).toHaveProperty("categoryId", 15);
    expect(params).not.toHaveProperty("categoryId");
    // Lowercase select/filter/order keys.
    expect(params).toHaveProperty("select");
    expect(params).toHaveProperty("filter");
    expect(params).toHaveProperty("order");
    expect(params).not.toHaveProperty("SELECT");
    expect(params).not.toHaveProperty("FILTER");
    expect(params).not.toHaveProperty("ORDER");
  });

  it("fetchSmartProcessStageDirectory prefers live NAMEs for known committed stage IDs and keeps static fallback on failure", async () => {
    const { fetchSmartProcessStageDirectory } = await import("@/lib/samples/bitrix-fetch");
    const { SMART_PROCESS_STAGE_LABELS } = await import("@/lib/samples/smart-process-contract");

    // Live directory returns a DIFFERENT NAME for CLIENT than the static label.
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      result: [
        { STATUS_ID: "DT1032_15:NEW", NAME: "Подготовка к отправке" },
        { STATUS_ID: "DT1032_15:CLIENT", NAME: "Образцы на испытании" },
      ],
    });
    const live = await fetchSmartProcessStageDirectory();
    expect(live.available).toBe(true);
    expect(live.labels["DT1032_15:CLIENT"]).toBe("Образцы на испытании");
    // Live NAME overrides the committed static label for the same stage ID.
    expect(live.labels["DT1032_15:CLIENT"]).not.toBe(SMART_PROCESS_STAGE_LABELS["DT1032_15:CLIENT"]);

    // Unknown live stage IDs never receive a fabricated label.
    vi.mocked(bitrixPost).mockResolvedValueOnce({
      result: [{ STATUS_ID: "DT1032_15:TOTALLY_UNKNOWN", NAME: "Какой-то новый этап" }],
    });
    const unknownStage = await fetchSmartProcessStageDirectory();
    expect(
      Object.prototype.hasOwnProperty.call(unknownStage.labels, "DT1032_15:TOTALLY_UNKNOWN")
    ).toBe(false);

    // Directory failure → static fallback, disclosed as unavailable.
    vi.mocked(bitrixPost).mockRejectedValueOnce(new Error("transport down"));
    const fallback = await fetchSmartProcessStageDirectory();
    expect(fallback.available).toBe(false);
    expect(fallback.labels).toEqual(SMART_PROCESS_STAGE_LABELS);
  });
});
