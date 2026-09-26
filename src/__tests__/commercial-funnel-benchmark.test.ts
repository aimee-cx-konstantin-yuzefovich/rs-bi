// src/__tests__/commercial-funnel-benchmark.test.ts
// ─────────────────────────────────────────────────────────────────────
// RusSilica Commercial Funnel Production-Scale Benchmark Matrix.
// Evaluates performance and memory across three production scale profiles:
// - Profile S: 1,000 companies / 3,000 deals (current baseline)
// - Profile M: 5,000 companies / 15,000 deals (mid-market scale)
// - Profile L: 10,000 companies / 50,000 deals (upper stress boundary)
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

interface BenchmarkResult {
  profile: string;
  companies: number;
  deals: number;
  fixtureGenMs: number;
  dealNormMs: number;
  compNormMs: number;
  analyticsMs: number;
  managersMs: number;
  bottlenecksMs: number;
  samplesMs: number;
  excelMs: number | null;
  totalTimeMs: number;
  heapDeltaMb: number;
}

const benchmarkMatrixResults: BenchmarkResult[] = [];

function generateSyntheticDataset(companyCount: number, dealCount: number) {
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
  const USERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const CURRENCIES = ["RUB", "RUB", "RUB", "USD", "EUR", ""];

  const rawCompanies: Array<Record<string, any>> = [];
  for (let i = 1; i <= companyCount; i++) {
    rawCompanies.push({
      ID: String(i),
      TITLE: `Предприятие №${i}`,
      ASSIGNED_BY_ID: USERS[i % USERS.length],
      DATE_CREATE: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      [COMPANY_SAMPLES_FIELD_ID]: i % 3 === 0 ? ["Образец передан клиенту"] : undefined,
    });
  }

  const rawDeals: Array<Record<string, any>> = [];
  for (let i = 1; i <= dealCount; i++) {
    const companyId = String((i % companyCount) + 1);
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
    "6": "Менеджер 6",
    "7": "Менеджер 7",
    "8": "Менеджер 8",
    "9": "Менеджер 9",
    "10": "Менеджер 10",
  };

  return { rawCompanies, rawDeals, userNames };
}

async function executeProfileBenchmark(
  profileName: string,
  companyCount: number,
  dealCount: number,
  runExcel: boolean
): Promise<BenchmarkResult> {
  const fixedNow = new Date("2026-03-25T12:00:00Z");

  if (global.gc) {
    global.gc();
  }
  const memBefore = process.memoryUsage().heapUsed;
  const tSuiteStart = performance.now();

  // Phase 1: Fixture generation
  const tGenStart = performance.now();
  const { rawCompanies, rawDeals, userNames } = generateSyntheticDataset(companyCount, dealCount);
  const fixtureGenMs = performance.now() - tGenStart;

  // Phase 2: Deal normalization
  const tDealsStart = performance.now();
  const deals = normalizeDeals(rawDeals, { userNames });
  const dealNormMs = performance.now() - tDealsStart;

  // Phase 3: Company normalization
  const tCompStart = performance.now();
  const companies = normalizeCompanies(rawCompanies, deals, { userNames, now: fixedNow });
  const compNormMs = performance.now() - tCompStart;

  // Phase 4: Analytics engine (period & WIP metrics)
  const filters: CommercialFilters = { periodPreset: "90days" };
  const boundaries = computePeriodBoundaries(filters, fixedNow);

  const tAnalyticsStart = performance.now();
  const datedKpis = computePeriodMetrics(companies, boundaries);
  const wipKpis = computeWipMetrics(companies);
  const analyticsMs = performance.now() - tAnalyticsStart;

  // Phase 5: Manager scorecard
  const tManagersStart = performance.now();
  const bottlenecks = computeBottlenecks(companies, fixedNow);
  const scorecard = computeManagerScorecard(companies, boundaries, bottlenecks, userNames);
  const managersMs = performance.now() - tManagersStart;

  // Phase 6: Bottlenecks evaluation
  const tBotStart = performance.now();
  const verifiedBottlenecks = computeBottlenecks(companies, fixedNow);
  const bottlenecksMs = performance.now() - tBotStart;

  // Phase 7: Sample register building
  const tSamplesStart = performance.now();
  const sampleRegister = buildSampleRegister(companies, fixedNow);
  const samplesMs = performance.now() - tSamplesStart;

  // Phase 8: Excel workbook generation
  let excelMs: number | null = null;
  if (runExcel) {
    const tExcelStart = performance.now();
    const workbook = await createCommercialFunnelWorkbook({
      companies,
      deals,
      filters,
      userNames,
      now: fixedNow,
    });
    await workbook.xlsx.writeBuffer();
    excelMs = performance.now() - tExcelStart;
  }

  const totalTimeMs = performance.now() - tSuiteStart;
  const memAfter = process.memoryUsage().heapUsed;
  const heapDeltaMb = Math.max(0, (memAfter - memBefore) / (1024 * 1024));

  // Sanity assertions
  expect(deals).toHaveLength(dealCount);
  expect(companies).toHaveLength(companyCount);
  expect(datedKpis.length).toBeGreaterThan(0);
  expect(wipKpis.length).toBeGreaterThan(0);
  expect(verifiedBottlenecks.length).toBeGreaterThan(0);
  expect(scorecard.length).toBe(10);
  expect(sampleRegister.length).toBeGreaterThan(0);

  const result: BenchmarkResult = {
    profile: profileName,
    companies: companyCount,
    deals: dealCount,
    fixtureGenMs,
    dealNormMs,
    compNormMs,
    analyticsMs,
    managersMs,
    bottlenecksMs,
    samplesMs,
    excelMs,
    totalTimeMs,
    heapDeltaMb,
  };

  console.log(
    `[${profileName}] Gen: ${fixtureGenMs.toFixed(1)}ms | DealNorm: ${dealNormMs.toFixed(1)}ms | CompNorm: ${compNormMs.toFixed(1)}ms | Analytics: ${analyticsMs.toFixed(1)}ms | Mgrs: ${managersMs.toFixed(1)}ms | Bot: ${bottlenecksMs.toFixed(1)}ms | Samples: ${samplesMs.toFixed(1)}ms | Excel: ${excelMs?.toFixed(1)}ms | Total: ${totalTimeMs.toFixed(1)}ms`
  );

  benchmarkMatrixResults.push(result);
  return result;
}

function printMatrixTable(results: BenchmarkResult[]) {
  console.log("\n======================== PRODUCTION SCALE BENCHMARK MATRIX ========================");
  console.log(
    "| Profile | Companies | Deals | Deal Norm | Comp Norm | Analytics | Managers | Bottlenecks | Samples | Excel | Total Time | Heap Delta |"
  );
  console.log(
    "|---|---|---|---|---|---|---|---|---|---|---|---|"
  );
  for (const r of results) {
    const excelStr = r.excelMs !== null ? `${r.excelMs.toFixed(1)} ms` : "Omitted (Memory)";
    console.log(
      `| ${r.profile} | ${r.companies.toLocaleString("ru-RU")} | ${r.deals.toLocaleString("ru-RU")} | ${r.dealNormMs.toFixed(1)} ms | ${r.compNormMs.toFixed(1)} ms | ${r.analyticsMs.toFixed(1)} ms | ${r.managersMs.toFixed(1)} ms | ${r.bottlenecksMs.toFixed(1)} ms | ${r.samplesMs.toFixed(1)} ms | ${excelStr} | ${r.totalTimeMs.toFixed(1)} ms | +${r.heapDeltaMb.toFixed(1)} MB |`
    );
  }
  console.log("====================================================================================\n");
}

describe("Commercial Funnel Scale Benchmark Matrix", () => {
  it(
    "Profile S: 1,000 companies / 3,000 deals (baseline production scale)",
    { timeout: 15000 },
    async () => {
      const res = await executeProfileBenchmark("Profile S", 1000, 3000, true);

      const analyticalComputeMs =
        res.dealNormMs + res.compNormMs + res.analyticsMs + res.managersMs + res.bottlenecksMs + res.samplesMs;

      // Invariant: Analytical pipeline must complete in < 500 ms
      expect(analyticalComputeMs).toBeLessThan(500);

      // Invariant: Total time including Excel must complete in < 3,000 ms
      expect(res.totalTimeMs).toBeLessThan(3000);
      expect(res.excelMs).not.toBeNull();
    }
  );

  it(
    "Profile M: 5,000 companies / 15,000 deals (mid-market production scale)",
    { timeout: 30000 },
    async () => {
      const res = await executeProfileBenchmark("Profile M", 5000, 15000, true);

      const analyticalComputeMs =
        res.dealNormMs + res.compNormMs + res.analyticsMs + res.managersMs + res.bottlenecksMs + res.samplesMs;

      // Invariant: Analytical pipeline completes without OOM and under 2,500 ms
      expect(analyticalComputeMs).toBeLessThan(2500);
      expect(res.excelMs).not.toBeNull();
    }
  );

  it(
    "Profile L: 10,000 companies / 50,000 deals (upper stress boundary)",
    { timeout: 45000 },
    async () => {
      // For Profile L: Excel is omitted as permitted by Section 10 to ensure memory boundaries
      const res = await executeProfileBenchmark("Profile L", 10000, 50000, false);

      const analyticalComputeMs =
        res.dealNormMs + res.compNormMs + res.analyticsMs + res.managersMs + res.bottlenecksMs + res.samplesMs;

      // Invariant: Upper stress boundary completes analytical pipeline without crashing
      expect(analyticalComputeMs).toBeLessThan(6000);
      expect(res.excelMs).toBeNull();

      // Print full summary table at completion of all profiles
      printMatrixTable(benchmarkMatrixResults);
    }
  );
});
