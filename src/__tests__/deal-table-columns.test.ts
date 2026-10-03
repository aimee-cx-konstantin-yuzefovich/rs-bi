import { describe, it, expect } from "vitest";
import {
  splitDealTableColumns,
  isClientOnlyDealColumn,
  SMART_PROCESS_VIRTUAL_COLUMNS,
  ACTIVITY_VIRTUAL_COLUMNS,
  UPSTREAM_COMPANY_DEAL_COLUMNS,
} from "@/lib/deal-table-columns";

describe("splitDealTableColumns — virtual column isolation (§8.13)", () => {
  it("SP_*, ACTIVITY_* and synthetic COMPANY_* virtual columns NEVER enter the Bitrix select", () => {
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

    expect(bitrixSelect).toEqual(["TITLE", "STAGE_ID", "OPPORTUNITY"]);
    expect(clientOnlyColumns).toEqual([
      "SP_STAGE",
      "ACTIVITY_LAST",
      "SP_SENT_DATE",
      "COMPANY_TITLE",
      "ACTIVITY_NEXT",
      "SP_RESULT",
      "SP_SAMPLES",
    ]);

    for (const col of [...SMART_PROCESS_VIRTUAL_COLUMNS, ...ACTIVITY_VIRTUAL_COLUMNS]) {
      expect(bitrixSelect).not.toContain(col);
      expect(isClientOnlyDealColumn(col)).toBe(true);
    }
  });

  it("synthetic Company enrichment columns (COMPANY_*, except COMPANY_ID) are client-only", () => {
    const synthetic = [
      "COMPANY_TITLE",
      "COMPANY_ASSIGNED_BY_ID",
      "COMPANY_INDUSTRY",
      "COMPANY_DATE_CREATE",
      "COMPANY_LAST_ACTIVITY_TIME",
      "COMPANY_COMMENTS",
      "COMPANY_REVENUE",
      "COMPANY_UF_CRM_69257BBAB86F6",
      "COMPANY_UF_CRM_1753187313314",
    ];
    for (const col of synthetic) {
      expect(isClientOnlyDealColumn(col)).toBe(true);
      const { bitrixSelect } = splitDealTableColumns([col]);
      expect(bitrixSelect).toEqual([]);
      expect(clientOnlyOf(col)).toEqual([col]);
    }
  });

  it("COMPANY_ID remains a real upstream Deal field (single whitelisted exception)", () => {
    expect(UPSTREAM_COMPANY_DEAL_COLUMNS).toEqual(["COMPANY_ID"]);
    expect(isClientOnlyDealColumn("COMPANY_ID")).toBe(false);
    const { bitrixSelect, clientOnlyColumns } = splitDealTableColumns([
      "COMPANY_ID",
      "COMPANY_INDUSTRY",
      "SP_STAGE",
    ]);
    expect(bitrixSelect).toEqual(["COMPANY_ID"]);
    expect(clientOnlyColumns).toEqual(["COMPANY_INDUSTRY", "SP_STAGE"]);
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

function clientOnlyOf(col: string): string[] {
  return splitDealTableColumns([col]).clientOnlyColumns;
}
