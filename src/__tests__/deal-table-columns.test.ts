import { describe, it, expect } from "vitest";
import {
  splitDealTableColumns,
  isClientOnlyDealColumn,
  SMART_PROCESS_VIRTUAL_COLUMNS,
  ACTIVITY_VIRTUAL_COLUMNS,
} from "@/lib/deal-table-columns";

describe("splitDealTableColumns — virtual column isolation (§8.13)", () => {
  it("SP_* and activity virtual columns NEVER enter the Bitrix select", () => {
    const selected = [
      "TITLE",
      "SP_STAGE",
      "STAGE_ID",
      "ACTIVITY_LAST",
      "SP_SENT_DATE",
      "COMPANY_TITLE",
      "ACTIVITY_NEXT",
      "SP_RESULT",
      "SP_SAMPLES",
      "OPPORTUNITY",
    ];
    const { bitrixSelect, clientOnlyColumns } = splitDealTableColumns(selected);

    expect(bitrixSelect).toEqual(["TITLE", "STAGE_ID", "COMPANY_TITLE", "OPPORTUNITY"]);
    expect(clientOnlyColumns).toEqual([
      "SP_STAGE",
      "ACTIVITY_LAST",
      "SP_SENT_DATE",
      "ACTIVITY_NEXT",
      "SP_RESULT",
      "SP_SAMPLES",
    ]);

    for (const col of [...SMART_PROCESS_VIRTUAL_COLUMNS, ...ACTIVITY_VIRTUAL_COLUMNS]) {
      expect(bitrixSelect).not.toContain(col);
      expect(isClientOnlyDealColumn(col)).toBe(true);
    }
  });

  it("COMPANY_* prefixed selects remain upstream (Bitrix-supported)", () => {
    const { bitrixSelect } = splitDealTableColumns([
      "COMPANY_INDUSTRY",
      "COMPANY_ASSIGNED_BY_ID",
      "SP_STAGE",
    ]);
    expect(bitrixSelect).toEqual(["COMPANY_INDUSTRY", "COMPANY_ASSIGNED_BY_ID"]);
  });

  it("empty/pure-virtual selection → upstream falls back to ['*', 'UF_*'] semantics (bitrixSelect empty)", () => {
    const { bitrixSelect, clientOnlyColumns } = splitDealTableColumns(["SP_STAGE", "SP_RESULT"]);
    expect(bitrixSelect).toEqual([]);
    expect(clientOnlyColumns).toEqual(["SP_STAGE", "SP_RESULT"]);
  });

  it("order is preserved; duplicates are not introduced", () => {
    const { bitrixSelect, clientOnlyColumns } = splitDealTableColumns([
      "B",
      "SP_STAGE",
      "A",
      "SP_STAGE",
      "B",
    ]);
    expect(bitrixSelect).toEqual(["B", "A"]);
    expect(clientOnlyColumns).toEqual(["SP_STAGE"]);
  });
});
