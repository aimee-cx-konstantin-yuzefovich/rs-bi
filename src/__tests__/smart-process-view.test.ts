import { describe, it, expect } from "vitest";
import {
  buildSmartProcessItemView,
  buildSmartProcessItemViews,
  indexSmartProcessItemViews,
  buildSmartProcessDealStageCell,
  buildSmartProcessDealSentDateCell,
  buildSmartProcessDealResultCell,
  buildSmartProcessDealSamplesCell,
} from "@/lib/samples/smart-process-view";
import { adaptSmartProcessSampleEvidence } from "@/lib/samples/adapters/smart-process";
import { identityLabelResolver } from "@/lib/samples/normalize";
import type { BitrixRow, LabelResolver } from "@/lib/samples/types";

const resolve: LabelResolver = identityLabelResolver;
const STAGE_ACTIVE = "DT1032_15:CLIENT";
const STAGE_PREP = "DT1032_15:NEW";
const STAGE_SUCCESS = "DT1032_15:SUCCESS";
const STAGE_FAIL = "DT1032_15:FAIL";

function adapt(row: BitrixRow, dealCompanyById?: Map<string, string>) {
  return adaptSmartProcessSampleEvidence(row, resolve, { dealCompanyById });
}

describe("SmartProcessItemView — canonical display projection (§8.5–8.7)", () => {
  it("5. known committed stage + live NAME → live display NAME preferred", () => {
    const unit = adapt({
      id: "1",
      title: "SP 1",
      stageId: STAGE_ACTIVE,
      assignedById: "15",
      companyId: "10",
    });
    expect(unit).not.toBeNull();
    const view = buildSmartProcessItemView(unit!, {
      liveStageLabels: { [STAGE_ACTIVE]: "Образцы на испытании (LIVE)" },
    });
    expect(view).not.toBeNull();
    expect(view!.stageLabel).toBe("Образцы на испытании (LIVE)");
    // Semantics remain stage-ID based.
    expect(view!.stageSemantic).toBe("TESTING_IN_PROGRESS");
    expect(view!.isActive).toBe(true);
    expect(view!.isTerminal).toBe(false);
  });

  it("5b. without live directory, committed static label is the fallback for a known stage", () => {
    const unit = adapt({
      id: "2",
      stageId: STAGE_SUCCESS,
      companyId: "10",
    });
    const view = buildSmartProcessItemView(unit!);
    expect(view!.stageLabel).not.toBe("Не классифицировано");
    expect(view!.stageLabel.length).toBeGreaterThan(0);
  });

  it("6. unknown stage ID → user-facing Не классифицировано; raw ID only in provenance", () => {
    const unit = adapt({
      id: "3",
      stageId: "DT1032_15:SOMETHING_NEW",
      companyId: "10",
    });
    const view = buildSmartProcessItemView(unit!);
    expect(view).not.toBeNull();
    expect(view!.stageLabel).toBe("Не классифицировано");
    expect(view!.isActive).toBe(false);
    expect(view!.isTerminal).toBe(false);
    // Raw DT1032_* preserved ONLY in internal provenance.
    expect(view!.provenance.rawStageId).toBe("DT1032_15:SOMETHING_NEW");
    // Never leaked to user-facing fields.
    expect(JSON.stringify({ stageLabel: view!.stageLabel, title: view!.title })).not.toContain(
      "DT1032_15:SOMETHING_NEW"
    );
    // Never classified by matching Russian wording.
    const unit2 = adapt({
      id: "4",
      stageId: "DT1032_15:ZZZ",
      companyId: "10",
    });
    const view2 = buildSmartProcessItemView(unit2!);
    expect(view2!.stageLabel).toBe("Не классифицировано");
    expect(view2!.isActive).toBe(false);
  });

  it("7. views come from canonical ADAPTED evidence — no raw parsing; manual sent dates only", () => {
    const row: BitrixRow = {
      id: "5",
      title: "Цикл А",
      stageId: STAGE_ACTIVE,
      assignedById: "77",
      companyId: "100",
      [SMART_PROCESS_SENT_DATE]: "2026-03-10",
      createdTime: "2026-03-01T10:00:00+03:00",
    };
    const unit = adapt(row);
    expect(unit).not.toBeNull();
    const view = buildSmartProcessItemView(unit!);
    // Manual sent date flows through; createdTime never becomes a sent date.
    expect(view!.sentDates).toEqual(["2026-03-10"]);
    expect(view!.createdTime).toBe("2026-03-01T10:00:00+03:00");
    expect(view!.responsibleId).toBe("77");
    expect(view!.companyId).toBe("100");
  });

  it("7b. non-SP evidence units never produce views", () => {
    const view = buildSmartProcessItemView({
      id: "deal-1-record",
      source: "DEAL_LEGACY",
      sourceGranularity: "DEAL_RECORD",
      sourceEntityId: "1",
      companyId: "10",
      productFamilies: [],
      grades: [],
      quantities: [],
      sentDates: [],
      statusEvidence: [],
      issues: [],
    });
    expect(view).toBeNull();
  });
});

describe("SmartProcessItemView attribution & indexing (§8.8–8.12)", () => {
  it("8. exact parentId2 → byDealId membership", () => {
    const unit = adapt({
      id: "10",
      stageId: STAGE_ACTIVE,
      companyId: "10",
      parentId2: "505",
    });
    const view = buildSmartProcessItemView(unit!)!;
    const indexes = indexSmartProcessItemViews([view]);
    expect(indexes.byDealId.get("505")).toContainEqual(view);
    expect(indexes.byDealId.size).toBe(1);
    expect(indexes.byDealId.has("999")).toBe(false);
  });

  it("9. company-only item is NOT assigned to any Deal", () => {
    const unit = adapt({
      id: "11",
      stageId: STAGE_ACTIVE,
      companyId: "10",
    });
    const view = buildSmartProcessItemView(unit!)!;
    expect(view.linkedDealId).toBeUndefined();
    const indexes = indexSmartProcessItemViews([view]);
    expect(indexes.byCompanyId.get("10")).toContainEqual(view);
    expect(indexes.byDealId.size).toBe(0);
  });

  it("10. direct Company vs linked Deal Company conflict: excluded from company index, kept under exact linked Deal with issue", () => {
    const unit = adapt(
      {
        id: "12",
        stageId: STAGE_ACTIVE,
        companyId: "C10",
        parentId2: "D1",
      },
      new Map([["D1", "C20"]])
    );
    expect(unit).not.toBeNull();
    expect(unit!.companyId).toBe(""); // fail-closed adapter
    expect(unit!.issues).toContain("smart_process_relation_conflict");

    const view = buildSmartProcessItemView(unit!)!;
    expect(view.companyId).toBe("");
    expect(view.linkedDealId).toBe("D1");
    expect(view.dataIssues).toContain("smart_process_relation_conflict");

    const indexes = indexSmartProcessItemViews([view]);
    // Company aggregation excludes the conflicted item.
    expect(indexes.byCompanyId.size).toBe(0);
    expect(indexes.byCompanyId.has("C10")).toBe(false);
    expect(indexes.byCompanyId.has("C20")).toBe(false);
    // Exact linked Deal relation is factual — item stays visible there.
    expect(indexes.byDealId.get("D1")).toContainEqual(view);
  });

  it("11. orphan remains unattributed in both indexes", () => {
    const unit = adapt({
      id: "13",
      stageId: STAGE_ACTIVE,
      companyId: "0",
      // no parentId2 → adapter emits orphan issue
    });
    expect(unit).not.toBeNull();
    expect(unit!.issues).toContain("smart_process_orphan_item");
    const view = buildSmartProcessItemView(unit!)!;
    expect(view.companyId).toBe("");
    const indexes = indexSmartProcessItemViews([view]);
    expect(indexes.byCompanyId.size).toBe(0);
    expect(indexes.byDealId.size).toBe(0);
    // Still discoverable by item ID (diagnostics).
    expect(indexes.byItemId.get("13")).toBeDefined();
  });

  it("12. multiple active items remain multiple; no fabricated winner; ordering active→terminal→other", () => {
    const u1 = adapt({ id: "20", stageId: STAGE_ACTIVE, companyId: "10", createdTime: "2026-03-02T10:00:00+03:00" })!;
    const u2 = adapt({ id: "21", stageId: STAGE_ACTIVE, companyId: "10", createdTime: "2026-03-05T10:00:00+03:00" })!;
    const u3 = adapt({ id: "22", stageId: STAGE_SUCCESS, companyId: "10" })!;
    const u4 = adapt({ id: "23", stageId: "DT1032_15:UNKNOWN_X", companyId: "10" })!;

    const views = buildSmartProcessItemViews([u3, u4, u1, u2]);
    // Active first (newest createdTime first within group), then terminal, then other.
    expect(views.map((v) => v.processItemId)).toEqual(["21", "20", "22", "23"]);
    expect(views.filter((v) => v.isActive)).toHaveLength(2);
    expect(views.filter((v) => v.isTerminal)).toHaveLength(1);

    // Company index keeps ALL active items (multiplicity preserved).
    const indexes = indexSmartProcessItemViews(views);
    const companyItems = indexes.byCompanyId.get("10") ?? [];
    expect(companyItems.filter((v) => v.isActive)).toHaveLength(2);
    // Stable processItemId tie-break when createdTime is equal.
    const u5 = adapt({ id: "30", stageId: STAGE_ACTIVE, companyId: "11", createdTime: "2026-03-02T10:00:00+03:00" })!;
    const u6 = adapt({ id: "31", stageId: STAGE_ACTIVE, companyId: "11", createdTime: "2026-03-02T10:00:00+03:00" })!;
    const tied = buildSmartProcessItemViews([u6, u5]);
    expect(tied.map((v) => v.processItemId)).toEqual(["30", "31"]);
  });
});

describe("Smart Process Deals-table compact cells", () => {
  const active = buildSmartProcessItemView(
    adapt({ id: "40", stageId: STAGE_ACTIVE, companyId: "10", [SMART_PROCESS_SENT_DATE]: "2026-03-10", [SMART_PROCESS_RESULT]: "Подошло" })!
  )!;
  const active2 = buildSmartProcessItemView(
    adapt({ id: "41", stageId: STAGE_PREP, companyId: "10", [SMART_PROCESS_SENT_DATE]: "2026-03-12", [SMART_PROCESS_RESULT]: "Не подошло" })!
  )!;
  const gelGrade = {
    ...active,
    grades: [{ productFamily: "Гель", value: "Г10" }],
    quantities: [{ productFamily: "Гель", value: 5, unit: "кг" }],
  };

  it("0 items → —", () => {
    expect(buildSmartProcessDealStageCell(undefined).text).toBe("—");
    expect(buildSmartProcessDealSentDateCell([])).toBe("—");
    expect(buildSmartProcessDealResultCell(undefined)).toBe("—");
    expect(buildSmartProcessDealSamplesCell([])).toBe("—");
  });

  it("1 item → its factual compact value", () => {
    expect(buildSmartProcessDealStageCell([active]).text).toBe(active.stageLabel);
    expect(buildSmartProcessDealSentDateCell([active])).toBe("2026-03-10");
    expect(buildSmartProcessDealResultCell([active])).toBe("Подошло");
    expect(buildSmartProcessDealSamplesCell([gelGrade])).toContain("Г10");
  });

  it("multiple items → multiplicity disclosure, never a silent single pick", () => {
    const stage = buildSmartProcessDealStageCell([active, active2]);
    expect(stage.text).toMatch(/2 процесса · 2 активный/);

    const dates = buildSmartProcessDealSentDateCell([active, active2]);
    expect(dates).toContain("2 даты отправки");
    expect(dates).toContain("2026-03-10");
    expect(dates).toContain("2026-03-12");

    const result = buildSmartProcessDealResultCell([active, active2]);
    expect(result).toBe("Несколько результатов");
  });

  it("unknown/unclassified result stays neutral — never guessed", () => {
    const unknown = buildSmartProcessItemView(
      adapt({ id: "42", stageId: STAGE_ACTIVE, companyId: "10" })!
    )!;
    expect(buildSmartProcessDealResultCell([unknown])).toBe("—");
  });
});

// Field-ID import used above; keeps the test tied to the committed contract.
import { SMART_PROCESS_SENT_DATE_FIELD_ID as SMART_PROCESS_SENT_DATE } from "@/lib/samples/smart-process-contract";
import { SMART_PROCESS_TEST_RESULT_FIELD_ID as SMART_PROCESS_RESULT } from "@/lib/samples/smart-process-contract";
