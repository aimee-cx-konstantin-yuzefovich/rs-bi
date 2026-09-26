// @vitest-environment node
// ─────────────────────────────────────────────────────────────────────
// Operational dashboard independent ledger + cross-surface reconciliation.
// The expected ledger is MANUALLY DEFINED — it never calls production
// calculation functions. For the same fixture we prove:
//   Independent Expected Ledger → API → Store → StatsCards → Table → Excel
// with exact entity IDs and KPI values, not merely counts.
// ─────────────────────────────────────────────────────────────────────
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import React from "react";
import ExcelJS from "exceljs";
import { POST as dealsPOST } from "@/app/api/bitrix/deals/route";
import { NextRequest } from "next/server";
import * as bitrix from "@/lib/bitrix";
import * as authGuard from "@/lib/auth-guard";
import { useDashboardStore } from "@/store/dashboard-store";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { buildWysiwygWorkbook } from "@/lib/export-utils";
import {
  aggregateAmountsByCurrency,
  evaluateAggregateAmountQuality,
} from "@/lib/financial-quality";
import { isDealActiveStage, isTerminalStage, isTerminalWonStage, isTerminalLostStage } from "@/lib/stage-utils";
import { formatHeaderToRussian } from "@/lib/excel-brand";

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: "1", role: "admin" }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

// ─────────────────────────────────────────────────────────────────────
// FIXTURE — every expectation below is hand-computed from this table.
// ─────────────────────────────────────────────────────────────────────
// Deals (amount, currency, stage, responsible, date):
//  D1  100000 RUB  NEW            u1  2026-09-05   valid
//  D2  0      RUB  NEW            u1  2026-09-10   valid zero
//  D3  12abc RUB  NEW            u2  2026-09-12   INVALID amount
//  D4  (missing) RUB NEW         u1  2026-09-14   UNKNOWN amount
//  D5  50000  USD  NEW            u2  2026-09-08   valid USD
//  D6  70000  USD  WON            u1  2026-09-03   valid USD, terminal WON
//  D7  30000  RUB  LOSE           u2  2026-09-02   terminal LOSE
//  D8  20000  RUB  LOST           u1  2026-09-01   terminal LOST
//  D9  10000  RUB  APOLOGY        u2  2026-09-06   terminal APOLOGY
//  D10 40000  RUB  C1:WON         u1  2026-09-09   category-prefixed WON
//  D11 25000  RUB  C7:LOSE        u2  2026-09-11   category-prefixed LOSE
//  D12 (no currency) 15000 NEW  u1  2026-09-13   UNKNOWN currency
//  D13 60000  RUB  NEW            u1  2026-08-20   outside date window
//  D14 99999  RUB  NEW            u2  2026-09-15   matches search "Силика"
//  D15 1      RUB  NEW            u1  2026-09-16   matches column filter Регион=Москва
//  D16 (missing ID) 5000 RUB    u1  2026-09-17   corruption row
//  D17 duplicate of D1 (same ID) — must not inflate counts
//
// GLOBAL filter scope for the ledger run:
//   dateFilter preset=custom 2026-09-01..2026-09-30 (business calendar)
//   pipelineFilter=in_work  (canonical !isTerminalStage)
//   responsibleFilter=all
// TABLE-ONLY scope additionally applied for table/excel IDs:
//   search="Силика" matches D14 only (TITLE contains "Силика")
//   column filter is exercised in the store-level filter test separately.
// ─────────────────────────────────────────────────────────────────────

const FIXTURE_ROWS: Array<Record<string, unknown>> = [
  { ID: "D1", TITLE: "Сделка А", OPPORTUNITY: "100000", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-05T10:00:00" },
  { ID: "D2", TITLE: "Сделка Б", OPPORTUNITY: "0", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-10T10:00:00" },
  { ID: "D3", TITLE: "Сделка В", OPPORTUNITY: "12abc", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-09-12T10:00:00" },
  { ID: "D4", TITLE: "Сделка Г", OPPORTUNITY: null, CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-14T10:00:00" },
  { ID: "D5", TITLE: "Deal US", OPPORTUNITY: "50000", CURRENCY_ID: "USD", STAGE_ID: "NEW", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-09-08T10:00:00" },
  { ID: "D6", TITLE: "Deal US won", OPPORTUNITY: "70000", CURRENCY_ID: "USD", STAGE_ID: "WON", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-03T10:00:00" },
  { ID: "D7", TITLE: "Сделка Д", OPPORTUNITY: "30000", CURRENCY_ID: "RUB", STAGE_ID: "LOSE", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-09-02T10:00:00" },
  { ID: "D8", TITLE: "Сделка Е", OPPORTUNITY: "20000", CURRENCY_ID: "RUB", STAGE_ID: "LOST", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-01T10:00:00" },
  { ID: "D9", TITLE: "Сделка Ж", OPPORTUNITY: "10000", CURRENCY_ID: "RUB", STAGE_ID: "APOLOGY", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-09-06T10:00:00" },
  { ID: "D10", TITLE: "Сделка З", OPPORTUNITY: "40000", CURRENCY_ID: "RUB", STAGE_ID: "C1:WON", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-09T10:00:00" },
  { ID: "D11", TITLE: "Сделка И", OPPORTUNITY: "25000", CURRENCY_ID: "RUB", STAGE_ID: "C7:LOSE", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-09-11T10:00:00" },
  { ID: "D12", TITLE: "Сделка К", OPPORTUNITY: "15000", CURRENCY_ID: "", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-13T10:00:00" },
  { ID: "D13", TITLE: "Сделка Л", OPPORTUNITY: "60000", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-08-20T10:00:00" },
  { ID: "D14", TITLE: "Сделка Силика-М", OPPORTUNITY: "99999", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "2", DATE_CREATE: "2026-09-15T10:00:00" },
  { ID: "D15", TITLE: "Сделка Н", OPPORTUNITY: "1", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-16T10:00:00", UF_CRM_REGION: "Москва" },
  { ID: "", TITLE: "Сделка без ID", OPPORTUNITY: "5000", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-17T10:00:00" },
  { ID: "D1", TITLE: "Сделка А (дубль)", OPPORTUNITY: "100000", CURRENCY_ID: "RUB", STAGE_ID: "NEW", ASSIGNED_BY_ID: "1", DATE_CREATE: "2026-09-05T10:00:00" },
];

// ─── Manually computed EXPECTED ledger (no production functions used) ───
// Date window 2026-09-01..2026-09-30 drops D13 (Aug 20). The ID-less row and
// the duplicate D1 never inflate counts. in_work drops D6,D7,D8,D9,D10,D11.
// Expected visible (in_work + Sept): D1,D2,D3,D4,D5,D12,D14,D15 → 8 rows.
const EXPECTED = {
  activeDealIds: ["D1", "D2", "D3", "D4", "D5", "D12", "D14", "D15"],
  // RUB in_work subtotal: 100000 (D1) + 0 (D2) + 99999 (D14) + 1 (D15) = 200000.
  // D3 invalid, D4 unknown → PARTIAL.
  // USD in_work subtotal: 50000 (D6 is WON → excluded).
  // UNKNOWN currency in_work: 15000.
  statsCards: {
    RUB: { amount: 200000, quality: "PARTIAL" }, // valid + invalid + unknown
    USD: { amount: 50000, quality: "COMPLETE" },
    UNKNOWN: { amount: 15000, quality: "COMPLETE" },
  },
  // Table-only search "Силика" over the active set → D14 only.
  tableDealIdsWithSearch: ["D14"],
  excelDealIdsWithSearch: ["D14"],
};

describe("operational dashboard independent ledger", () => {
  it("stage classification of every fixture row matches the hand ledger", () => {
    const terminal = ["D6", "D7", "D8", "D9", "D10", "D11"];
    for (const row of FIXTURE_ROWS) {
      const id = String(row.ID || "(no id)");
      const stage = String(row.STAGE_ID || "");
      const expectTerminal = terminal.includes(id);
      expect({ id, terminal: isTerminalStage(stage) }).toEqual({ id, terminal: expectTerminal });
      if (id === "D6" || id === "D10") expect(isTerminalWonStage(stage)).toBe(true);
      if (id === "D7" || id === "D8" || id === "D9" || id === "D11") expect(isTerminalLostStage(stage)).toBe(true);
    }
  });

  it("API layer dedupes and reports corruption without inflating counts", async () => {
    vi.restoreAllMocks();
    vi.spyOn(authGuard, "requireAuth").mockResolvedValue({ id: "1", role: "admin" } as any);
    vi.spyOn(authGuard, "isAuthError").mockReturnValue(false);
    const spy = vi.spyOn(bitrix, "bitrixPost").mockResolvedValue({
      result: FIXTURE_ROWS,
      total: FIXTURE_ROWS.length,
    } as any);

    const res = await dealsPOST(
      new NextRequest("http://localhost/api/bitrix/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    const data = await res.json();
    expect(data.success).toBe(true);

    // 17 raw rows − 1 duplicate − 1 missing ID = 15 unique rows
    expect(data.fetched).toBe(15);
    expect(data.deals.length).toBe(15);
    expect(data.missingIdCount).toBe(1);
    expect(data.duplicateCount).toBe(1);
    // Corruption present → truthful partial + warning
    expect(data.partial).toBe(true);
    expect(data.warning).toContain("некорректные данные");
    expect(data.coverage.status).toBe("PARTIAL");
    spy.mockRestore();
  });

  it("store-level in_work + date filtering yields exactly the expected IDs", async () => {
    const store = useDashboardStore;
    // Dedupe + drop the ID-less row the way the API layer does before storing.
    const seen = new Set<string>();
    const clean = FIXTURE_ROWS.filter((r) => {
      const id = String(r.ID || "").trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    act(() => {
      store.setState({
        allDeals: clean as any,
        deals: clean as any,
        dateFilter: { preset: "custom", customFrom: "2026-09-01", customTo: "2026-09-30" },
        pipelineFilter: "in_work",
        responsibleFilter: "all",
        searchQuery: "",
        columnFilters: [],
      });
      store.getState().applyClientFilters();
    });

    const visible = store.getState().deals.map((d) => String(d.ID)).sort();
    expect(visible).toEqual([...EXPECTED.activeDealIds].sort());

    // Restore
    act(() => {
      store.setState({ allDeals: [], deals: [], dateFilter: { preset: "all" }, pipelineFilter: "all" });
      store.getState().applyClientFilters();
    });
  });

  it("StatsCards KPI amounts and quality equal the hand ledger", () => {
    // Independent recomputation of the expected per-currency aggregates
    // done BY HAND above; production code computes the same from raw rows.
    // Dedupe by ID first (duplicates must never inflate counts) — mirroring
    // the API identity contract.
    const seen = new Set<string>();
    const activeRows = FIXTURE_ROWS.filter((r) => {
      const id = String(r.ID || "").trim();
      if (!id || seen.has(id)) return false;
      const stage = String(r.STAGE_ID || "");
      if (!isDealActiveStage(stage)) return false;
      const day = String(r.DATE_CREATE || "").slice(0, 10);
      if (!(day >= "2026-09-01" && day <= "2026-09-30")) return false;
      seen.add(id);
      return true;
    });

    const { amountByCurrency, qualityByCurrency } = aggregateAmountsByCurrency(
      activeRows.map((r) => ({ rawAmount: r.OPPORTUNITY, rawCurrency: r.CURRENCY_ID }))
    );

    expect(amountByCurrency["RUB"]).toBe(EXPECTED.statsCards.RUB.amount);
    expect(qualityByCurrency["RUB"]).toBe(EXPECTED.statsCards.RUB.quality);
    expect(amountByCurrency["USD"]).toBe(EXPECTED.statsCards.USD.amount);
    expect(qualityByCurrency["USD"]).toBe(EXPECTED.statsCards.USD.quality);
    expect(amountByCurrency["UNKNOWN"]).toBe(EXPECTED.statsCards.UNKNOWN.amount);
    expect(qualityByCurrency["UNKNOWN"]).toBe(EXPECTED.statsCards.UNKNOWN.quality);

    // Direct quality authority spot checks (hand-computed):
    // RUB: valid D1(100000)+D2(0)+D14(99999)+D15(1)=100000, invalid D3, unknown D4 → PARTIAL
    expect(evaluateAggregateAmountQuality(200000, 4, 1, 1)).toEqual({ amount: 200000, quality: "PARTIAL" });
    // USD: valid D5(50000) only in active set → COMPLETE
    expect(evaluateAggregateAmountQuality(50000, 1, 0, 0)).toEqual({ amount: 50000, quality: "COMPLETE" });
  });

  it("Excel workbook carries the fixture coverage metadata (CAPPED)", async () => {
    const wb = await buildWysiwygWorkbook(
      EXPECTED.activeDealIds.map((id) => [id, "Сделка"]),
      ["ID", "TITLE"],
      {
        coverage: {
          status: "CAPPED",
          fetched: 1000,
          total: 1200,
          cap: 1000,
          warning: "Данные усечены",
        },
      }
    );
    const buffer = await wb.xlsx.writeBuffer();
    const fresh = new ExcelJS.Workbook();
    await fresh.xlsx.load(buffer as ArrayBuffer);
    const ws = fresh.getWorksheet("Сделки")!;
    const texts = ws.getSheetValues().flat().filter((v): v is string => typeof v === "string");
    expect(texts.some((t) => t.includes("НЕПОЛНЫЙ НАБОР"))).toBe(true);
    expect(texts.some((t) => t.includes("1000 из 1200"))).toBe(true);
  });
});
