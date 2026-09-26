// src/__tests__/commercial-funnel-benchmark.test.ts
// ─────────────────────────────────────────────────────────────────────
// Scale benchmark for Commercial Funnel analytics engine and Excel export.
// Benchmarks 1,000 deals and 500 companies under realistic RusSilica data shapes.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { performance } from "node:perf_hooks";
import { normalizeDeals, normalizeCompanies } from "../lib/commercial-funnel/normalize";
import {
  computeBottlenecks,
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
  buildSampleRegister,
} from "../lib/commercial-funnel/engine";
import { computePeriodBoundaries } from "../lib/commercial-funnel/date-utils";
import { createCommercialFunnelWorkbook } from "../lib/commercial-funnel/export-excel";
import {
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
  COMPANY_SAMPLES_FIELD_ID,
} from "../lib/crm-constants";
import type { CommercialFilters } from "../lib/commercial-funnel/types";

describe("Commercial Funnel Scale Benchmark", () => {
  const DEAL_COUNT = 1000;
  const COMPANY_COUNT = 500;
  const fixedNow = new Date("2026-03-25T12:00:00Z");

  const STAGES = [
    "NEW",
    "PREPARATION",
    "EXECUTING",
    "FINAL_INVOICE",
    "WON",
    "LOSE",
    "APOLOGY",
    "C1:WON",
    "C7:LOSE",
  ];
  const USERS = ["1", "2", "3", "4", "5"];
  const CURRENCIES = ["RUB", "RUB", "RUB", "USD", "EUR", ""];

  it(`benchmarks ${DEAL_COUNT} deals and ${COMPANY_COUNT} companies`, async () => {
    // 1. Generate synthetic dataset
    const rawCompanies: Array<Record<string, any>> = [];
    for (let i = 1; i <= COMPANY_COUNT; i++) {
      rawCompanies.push({
        ID: String(i),
        TITLE: `Предприятие №${i}`,
        ASSIGNED_BY_ID: USERS[i % USERS.length],
        DATE_CREATE: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        [COMPANY_SAMPLES_FIELD_ID]: i % 3 === 0 ? ["Образец передан клиенту"] : undefined,
      });
    }

    const rawDeals: Array<Record<string, any>> = [];
    for (let i = 1; i <= DEAL_COUNT; i++) {
      const companyId = String((i % COMPANY_COUNT) + 1);
      const stageId = STAGES[i % STAGES.length];
      const currencyId = CURRENCIES[i % CURRENCIES.length];
      const rawOpp = i % 5 === 0 ? `${(i * 1000).toLocaleString("ru-RU")},50` : String(i * 1000);

      rawDeals.push({
        ID: String(i),
        TITLE: `Сделка на поставку ${i}`,
        COMPANY_ID: companyId,
        STAGE_ID: stageId,
        OPPORTUNITY: rawOpp,
        CURRENCY_ID: currencyId,
        ASSIGNED_BY_ID: USERS[i % USERS.length],
        DATE_CREATE: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        BEGINDATE: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        ACTIVITY_NEXT: i % 2 === 0 ? "Созвон с клиентом" : undefined,
        activityDataKnown: true,
        [DEAL_SAMPLE_TESTING_FIELD_ID]: i % 4 === 0 ? ["Тестирование успешно"] : undefined,
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: i % 6 === 0 ? "Передано на склад" : undefined,
      });
    }

    const userNames: Record<string, string> = {
      "1": "Менеджер 1",
      "2": "Менеджер 2",
      "3": "Менеджер 3",
      "4": "Менеджер 4",
      "5": "Менеджер 5",
    };

    const memBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();

    // 2. Normalize Deals
    const tDealsStart = performance.now();
    const deals = normalizeDeals(rawDeals, { userNames });
    const tDealsMs = performance.now() - tDealsStart;

    // 3. Normalize Companies
    const tCompaniesStart = performance.now();
    const companies = normalizeCompanies(rawCompanies, deals, { userNames, now: fixedNow });
    const tCompaniesMs = performance.now() - tCompaniesStart;

    // 4. Analytics Engine
    const tEngineStart = performance.now();
    const filters: CommercialFilters = { periodPreset: "90days" };
    const boundaries = computePeriodBoundaries(filters, fixedNow);
    const datedKpis = computePeriodMetrics(companies, boundaries);
    const wipKpis = computeWipMetrics(companies);
    const bottlenecks = computeBottlenecks(companies, fixedNow);
    const scorecard = computeManagerScorecard(companies, boundaries, bottlenecks, userNames);
    const sampleRegister = buildSampleRegister(companies, fixedNow);
    const tEngineMs = performance.now() - tEngineStart;

    const tTotalComputeMs = performance.now() - t0;

    // 5. Excel Generation
    const tExcelStart = performance.now();
    const workbook = await createCommercialFunnelWorkbook({
      companies,
      deals,
      filters,
      userNames,
      now: fixedNow,
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const tExcelMs = performance.now() - tExcelStart;

    const memAfter = process.memoryUsage().heapUsed;
    const heapGrowthMb = (memAfter - memBefore) / (1024 * 1024);

    console.log("------------------------------------------------------------");
    console.log(`[BENCHMARK] Dataset: ${DEAL_COUNT} deals, ${COMPANY_COUNT} companies`);
    console.log(`[BENCHMARK] normalizeDeals:         ${tDealsMs.toFixed(2)} ms`);
    console.log(`[BENCHMARK] normalizeCompanies:     ${tCompaniesMs.toFixed(2)} ms`);
    console.log(`[BENCHMARK] computeAllMetrics:      ${tEngineMs.toFixed(2)} ms`);
    console.log(`[BENCHMARK] Total Computation:      ${tTotalComputeMs.toFixed(2)} ms`);
    console.log(`[BENCHMARK] Excel Generation:       ${tExcelMs.toFixed(2)} ms`);
    console.log(`[BENCHMARK] Excel Output Size:      ${(buffer.byteLength / 1024).toFixed(1)} KB`);
    console.log(`[BENCHMARK] Heap Delta:             ${heapGrowthMb.toFixed(2)} MB`);
    console.log("------------------------------------------------------------");

    // Performance Invariants:
    // Total compute must be well under 1,000ms for 1,000 deals (typically 30-80ms)
    expect(tTotalComputeMs).toBeLessThan(1000);
    // Excel generation must complete under 5,000ms (typically 300-800ms)
    expect(tExcelMs).toBeLessThan(5000);
    // Buffer must be non-empty
    expect(buffer.byteLength).toBeGreaterThan(10000);
    // Sanity checks on output
    expect(datedKpis.length).toBeGreaterThan(0);
    expect(wipKpis.length).toBeGreaterThan(0);
    expect(bottlenecks.length).toBeGreaterThan(0);
    expect(scorecard.length).toBe(5);
    expect(sampleRegister.length).toBeGreaterThan(0);
  });
});
