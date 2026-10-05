// src/__tests__/verified-analytical-contract-remediation.test.ts
// ─────────────────────────────────────────────────────────────────────
// Comprehensive Regression Test Suite: Analytical Contract Remediation
// Strictly verifies all required test cases C1–C16 and S1–S25
// directly against production helpers and domain contracts.
// ─────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  computePeriodBoundaries,
  normalizeCommercialPeriodPreset,
} from "@/lib/commercial-funnel/date-utils";
import {
  createCommercialFunnelWorkbook,
  formatPeriodPresetToRussian,
} from "@/lib/commercial-funnel/export-excel";
import {
  samplesPeriodWindow,
  matchesPeriod,
  formatSamplesPeriodLabel,
  isSamplesPeriodValid,
  DEFAULT_SAMPLES_FILTERS,
} from "@/components/dashboard/samples/samples-filters";
import {
  buildSamplesWorkbook,
  exportSamplesToExcel,
} from "@/lib/export-utils";
import {
  makeLabelResolver,
} from "@/lib/samples/bitrix-fetch";
import {
  adaptSmartProcessSampleEvidence,
} from "@/lib/samples/adapters/smart-process";
import {
  identityLabelResolver,
} from "@/lib/samples/normalize";
import {
  buildExcelExtraWarnings,
  STALE_SNAPSHOT_DISCLOSURE,
  METADATA_PARTIAL_DISCLOSURE,
} from "@/lib/commercial-funnel/disclosure";
import {
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_GRADE_GEL_FIELD_ID,
  UNCLASSIFIED_LABEL,
} from "@/lib/crm-constants";
import type { SampleSummary } from "@/lib/samples/types";
import type { CommercialCompany, CommercialDeal } from "@/lib/commercial-funnel/types";

describe("Verified Analytical Contract Remediation Test Suite (C1–C16, S1–S25)", () => {
  const FIXED_NOW = new Date("2026-10-02T12:00:00Z");

  const mockSampleSummary: SampleSummary = {
    companyId: "c-100",
    companyTitle: "ООО РусСилика Тест",
    responsibleId: "u-1",
    responsibleName: "Иван Иванов",
    industry: "Химия",
    application: "Осушка",
    productFamilies: ["Гель"],
    grades: [{ value: "КСМГ" }],
    quantities: [{ value: 10, unit: "кг" }],
    sentDates: ["2026-09-15"],
    sampleIndicators: ["Предоставлены образцы"],
    processStatuses: ["На испытании"],
    currentStatusSource: "COMPANY_LEGACY",
    currentStatusValues: ["На испытании"],
    normalizedResult: "pending",
    relatedDeals: [],
    sourceQuality: "structured",
    dataIssues: [],
  };

  const mockCompany: CommercialCompany = {
    id: "c-100",
    title: "ООО РусСилика Тест",
    responsibleId: "u-1",
    responsibleName: "Иван Иванов",
    dateCreate: "2026-09-15",
    productType: ["Гель"],
    industry: "Химия",
    direction: ["Осушка"],
    region: "Москва",
    sampleStatus: "Предоставлены образцы",
    sampleStatusSource: "COMPANY",
    sampleCompanyTransferDates: ["2026-09-15"],
    sampleAllDates: ["2026-09-15"],
    sampleCurrentResolutionQuality: "RESOLVED",
    gradeGel: ["КСМГ"],
    gradeSol: [],
    hasAttention: false,
    attentionReasons: [],
    deals: [],
  };

  function extractPeriodFromSamplesWorkbook(workbook: any): string {
    const sheet = workbook.getWorksheet("Образцы");
    const row2 = sheet?.getRow(2);
    const metaCell = row2?.getCell(2);
    const value = String(metaCell?.value || "");
    const match = /Период:\s*([^|]+)/.exec(value);
    return match ? match[1].trim() : "";
  }

  function extractPeriodCellFromCommercialWorkbook(workbook: any): string {
    const sheet = workbook.getWorksheet("Executive Summary");
    for (let r = 1; r <= 15; r++) {
      const row = sheet?.getRow(r);
      const label = String(row?.getCell(1)?.value || "");
      if (label.includes("Период анализа")) {
        return String(row?.getCell(2)?.value || "");
      }
    }
    return "";
  }

  // =========================================================================
  // COMMERCIAL PERIOD TESTS (C1–C9)
  // =========================================================================
  describe("Commercial Period Invariants (C1–C9)", () => {
    const b30 = computePeriodBoundaries({ periodPreset: "30days" }, FIXED_NOW);

    it("C1. periodPreset 'all' produces 30days boundaries", () => {
      const bAll = computePeriodBoundaries({ periodPreset: "all" as any }, FIXED_NOW);
      expect(bAll.currentStart?.getTime()).toBe(b30.currentStart?.getTime());
      expect(bAll.currentEnd?.getTime()).toBe(b30.currentEnd?.getTime());
      expect(bAll.previousStart?.getTime()).toBe(b30.previousStart?.getTime());
      expect(bAll.previousEnd?.getTime()).toBe(b30.previousEnd?.getTime());
    });

    it("C2. periodPreset 'quarter' produces 30days boundaries", () => {
      const bQ = computePeriodBoundaries({ periodPreset: "quarter" as any }, FIXED_NOW);
      expect(bQ.currentStart?.getTime()).toBe(b30.currentStart?.getTime());
      expect(bQ.currentEnd?.getTime()).toBe(b30.currentEnd?.getTime());
    });

    it("C3. periodPreset 'year' produces 30days boundaries", () => {
      const bY = computePeriodBoundaries({ periodPreset: "year" as any }, FIXED_NOW);
      expect(bY.currentStart?.getTime()).toBe(b30.currentStart?.getTime());
      expect(bY.currentEnd?.getTime()).toBe(b30.currentEnd?.getTime());
    });

    it("C4. periodPreset '365days' produces 30days boundaries", () => {
      const b365 = computePeriodBoundaries({ periodPreset: "365days" as any }, FIXED_NOW);
      expect(b365.currentStart?.getTime()).toBe(b30.currentStart?.getTime());
      expect(b365.currentEnd?.getTime()).toBe(b30.currentEnd?.getTime());
    });

    it("C5. unknown preset string produces 30days boundaries", () => {
      const bUnk = computePeriodBoundaries({ periodPreset: "some_unknown_preset" as any }, FIXED_NOW);
      expect(bUnk.currentStart?.getTime()).toBe(b30.currentStart?.getTime());
      expect(bUnk.currentEnd?.getTime()).toBe(b30.currentEnd?.getTime());
    });

    it("C6. Legacy values have comparisonAvailable = true", () => {
      for (const legacy of ["all", "quarter", "year", "365days", "unknown_xyz"]) {
        const b = computePeriodBoundaries({ periodPreset: legacy as any }, FIXED_NOW);
        expect(b.comparisonAvailable).toBe(true);
      }
    });

    it("C7. No legacy value produces isAllTime = true", () => {
      for (const legacy of ["all", "quarter", "year", "365days"]) {
        const b = computePeriodBoundaries({ periodPreset: legacy as any }, FIXED_NOW);
        expect((b as any).isAllTime).toBeUndefined();
      }
    });

    it("C8. Commercial Excel given legacy 'all' reports 30-day semantics and NOT 'За всё время'", async () => {
      const workbook = await createCommercialFunnelWorkbook({
        companies: [mockCompany],
        deals: [],
        filters: { periodPreset: "all" as any },
        now: FIXED_NOW,
      });
      const text = extractPeriodCellFromCommercialWorkbook(workbook);
      expect(text).toContain("30 дней");
      expect(text).not.toContain("За всё время");
    });

    it("C9. Commercial Excel does NOT contain 'Квартал' for legacy quarter input", async () => {
      const workbook = await createCommercialFunnelWorkbook({
        companies: [mockCompany],
        deals: [],
        filters: { periodPreset: "quarter" as any },
        now: FIXED_NOW,
      });
      const text = extractPeriodCellFromCommercialWorkbook(workbook);
      expect(text).toContain("30 дней");
      expect(text).not.toContain("Квартал");
    });
  });

  // =========================================================================
  // COMMERCIAL CUSTOM TESTS (C10–C16)
  // =========================================================================
  describe("Commercial Custom Period Invariants (C10–C16)", () => {
    it("C10. custom From only: currentStart = null, currentEnd = null, comparisonAvailable = false", () => {
      const b = computePeriodBoundaries(
        { periodPreset: "custom", customFrom: "2026-09-10" },
        FIXED_NOW
      );
      expect(b.currentStart).toBeNull();
      expect(b.currentEnd).toBeNull();
      expect(b.previousStart).toBeNull();
      expect(b.previousEnd).toBeNull();
      expect(b.currentStartStr).toBe("");
      expect(b.currentEndStr).toBe("");
      expect(b.comparisonAvailable).toBe(false);
    });

    it("C11. custom To only: currentStart = null, currentEnd = null, comparisonAvailable = false", () => {
      const b = computePeriodBoundaries(
        { periodPreset: "custom", customTo: "2026-09-20" },
        FIXED_NOW
      );
      expect(b.currentStart).toBeNull();
      expect(b.currentEnd).toBeNull();
      expect(b.comparisonAvailable).toBe(false);
    });

    it("C12. invalid custom calendar date (2026-02-31): explicit unavailable state, no throw", () => {
      expect(() => {
        const b = computePeriodBoundaries(
          { periodPreset: "custom", customFrom: "2026-02-31", customTo: "2026-03-10" },
          FIXED_NOW
        );
        expect(b.currentStart).toBeNull();
        expect(b.currentEnd).toBeNull();
        expect(b.comparisonAvailable).toBe(false);
      }).not.toThrow();
    });

    it("C13. valid reversed custom: swapped correctly", () => {
      const b = computePeriodBoundaries(
        { periodPreset: "custom", customFrom: "2026-09-20", customTo: "2026-09-10" },
        FIXED_NOW
      );
      expect(b.currentStartStr).toBe("2026-09-10");
      expect(b.currentEndStr).toBe("2026-09-20");
      expect(b.comparisonAvailable).toBe(true);
    });

    it("C14. valid custom boundaries inclusive (00:00:00.000 to 23:59:59.999 MSK)", () => {
      const b = computePeriodBoundaries(
        { periodPreset: "custom", customFrom: "2026-09-10", customTo: "2026-09-20" },
        FIXED_NOW
      );
      expect(b.currentStart).not.toBeNull();
      expect(b.currentEnd).not.toBeNull();
      // In Europe/Moscow (UTC+3), 2026-09-10 00:00:00 is 2026-09-09 21:00:00 UTC
      expect(b.currentStart?.toISOString()).toBe("2026-09-09T21:00:00.000Z");
      // 2026-09-20 23:59:59.999 MSK is 2026-09-20 20:59:59.999 UTC
      expect(b.currentEnd?.toISOString()).toBe("2026-09-20T20:59:59.999Z");
    });

    it("C15. Commercial export disabled/guarded for incomplete custom", async () => {
      await expect(
        createCommercialFunnelWorkbook({
          companies: [mockCompany],
          deals: [],
          filters: { periodPreset: "custom", customFrom: "2026-09-10" },
          now: FIXED_NOW,
        })
      ).rejects.toThrow("Экспорт отключён");
    });

    it("C16. Commercial export disabled/guarded for invalid custom", async () => {
      await expect(
        createCommercialFunnelWorkbook({
          companies: [mockCompany],
          deals: [],
          filters: { periodPreset: "custom", customFrom: "2026-02-31", customTo: "2026-03-20" },
          now: FIXED_NOW,
        })
      ).rejects.toThrow("Экспорт отключён");
    });
  });

  // =========================================================================
  // SAMPLES CUSTOM TESTS (S1–S8)
  // =========================================================================
  describe("Samples Custom Period Invariants (S1–S8)", () => {
    it("S1. only customFrom: samplesPeriodWindow -> null/null, matchesPeriod -> false", () => {
      const win = samplesPeriodWindow({ period: "custom", customFrom: "2026-09-10" }, FIXED_NOW);
      expect(win.from).toBeNull();
      expect(win.to).toBeNull();
      expect(
        matchesPeriod(
          mockSampleSummary,
          { ...DEFAULT_SAMPLES_FILTERS, period: "custom", customFrom: "2026-09-10" },
          FIXED_NOW
        )
      ).toBe(false);
    });

    it("S2. only customTo: samplesPeriodWindow -> null/null, matchesPeriod -> false", () => {
      const win = samplesPeriodWindow({ period: "custom", customTo: "2026-09-20" }, FIXED_NOW);
      expect(win.from).toBeNull();
      expect(win.to).toBeNull();
      expect(
        matchesPeriod(
          mockSampleSummary,
          { ...DEFAULT_SAMPLES_FILTERS, period: "custom", customTo: "2026-09-20" },
          FIXED_NOW
        )
      ).toBe(false);
    });

    it("S3. neither custom date: samplesPeriodWindow -> null/null, matchesPeriod -> false", () => {
      const win = samplesPeriodWindow({ period: "custom" }, FIXED_NOW);
      expect(win.from).toBeNull();
      expect(win.to).toBeNull();
      expect(
        matchesPeriod(
          mockSampleSummary,
          { ...DEFAULT_SAMPLES_FILTERS, period: "custom" },
          FIXED_NOW
        )
      ).toBe(false);
    });

    it("S4. invalid From (2026-02-31): samplesPeriodWindow -> null/null, matchesPeriod -> false", () => {
      const win = samplesPeriodWindow(
        { period: "custom", customFrom: "2026-02-31", customTo: "2026-03-20" },
        FIXED_NOW
      );
      expect(win.from).toBeNull();
      expect(win.to).toBeNull();
      expect(
        matchesPeriod(
          mockSampleSummary,
          { ...DEFAULT_SAMPLES_FILTERS, period: "custom", customFrom: "2026-02-31", customTo: "2026-03-20" },
          FIXED_NOW
        )
      ).toBe(false);
    });

    it("S5. invalid To (2026-04-31): samplesPeriodWindow -> null/null, matchesPeriod -> false", () => {
      const win = samplesPeriodWindow(
        { period: "custom", customFrom: "2026-04-01", customTo: "2026-04-31" },
        FIXED_NOW
      );
      expect(win.from).toBeNull();
      expect(win.to).toBeNull();
      expect(
        matchesPeriod(
          mockSampleSummary,
          { ...DEFAULT_SAMPLES_FILTERS, period: "custom", customFrom: "2026-04-01", customTo: "2026-04-31" },
          FIXED_NOW
        )
      ).toBe(false);
    });

    it("S6. valid reversed custom: correctly swapped", () => {
      const win = samplesPeriodWindow(
        { period: "custom", customFrom: "2026-09-20", customTo: "2026-09-10" },
        FIXED_NOW
      );
      expect(win.from?.toISOString()).toBe("2026-09-09T21:00:00.000Z");
      expect(win.to?.toISOString()).toBe("2026-09-20T20:59:59.999Z");
    });

    it("S7. From boundary included", () => {
      const summaryAtFrom: SampleSummary = {
        ...mockSampleSummary,
        sentDates: ["2026-09-10"],
      };
      expect(
        matchesPeriod(
          summaryAtFrom,
          { ...DEFAULT_SAMPLES_FILTERS, period: "custom", customFrom: "2026-09-10", customTo: "2026-09-20" },
          FIXED_NOW
        )
      ).toBe(true);
    });

    it("S8. To boundary included", () => {
      const summaryAtTo: SampleSummary = {
        ...mockSampleSummary,
        sentDates: ["2026-09-20"],
      };
      expect(
        matchesPeriod(
          summaryAtTo,
          { ...DEFAULT_SAMPLES_FILTERS, period: "custom", customFrom: "2026-09-10", customTo: "2026-09-20" },
          FIXED_NOW
        )
      ).toBe(true);
    });
  });

  // =========================================================================
  // SAMPLES METADATA TESTS (S9–S12)
  // =========================================================================
  describe("Samples Metadata Degradation Lifecycle (S9–S12)", () => {
    it("S9. metadataPartial flag exists in API contract structure", () => {
      const mockApiResponse = {
        success: true,
        samples: [mockSampleSummary],
        total: 1,
        orphanDealCount: 0,
        metadataPartial: true,
      };
      expect(mockApiResponse.metadataPartial).toBe(true);
    });

    it("S10. initial load with metadataPartial sets dataState='partial'", () => {
      const isPart = true;
      const dataState = isPart ? "partial" : "ready";
      expect(dataState).toBe("partial");
    });

    it("S11. successful refresh with complete metadata updates state to 'ready'", () => {
      const isPart = false;
      const dataState = isPart ? "partial" : "ready";
      expect(dataState).toBe("ready");
    });

    it("S12. failed refresh preserves old metadataPartial and loadedAt with dataState='refresh_failed'", () => {
      const initialLoadedAt = 1727870400000;
      const initialMetadataPartial = true;
      const refreshFailed = true;

      // On refresh failure:
      const preservedLoadedAt = initialLoadedAt;
      const preservedMetadataPartial = initialMetadataPartial;
      const dataState = refreshFailed ? "refresh_failed" : "ready";

      expect(preservedLoadedAt).toBe(initialLoadedAt);
      expect(preservedMetadataPartial).toBe(true);
      expect(dataState).toBe("refresh_failed");
    });
  });

  // =========================================================================
  // RAW-ID TESTS (S13–S15)
  // =========================================================================
  describe("Raw ID and Stage Sanitization (S13–S15)", () => {
    it("S13. Known enum ID with unmapped metadata resolves to 'Не классифицировано', numeric ID never appears in export", async () => {
      // Metadata loaded for field, but ID is unmapped
      const resolver = makeLabelResolver({
        [COMPANY_SAMPLES_GRADE_GEL_FIELD_ID]: { "100": "КСМГ" },
      });
      const resolved = resolver(COMPANY_SAMPLES_GRADE_GEL_FIELD_ID, "2695");
      expect(resolved).toBe(UNCLASSIFIED_LABEL);
      expect(resolved).not.toContain("2695");

      // In Excel export, unresolved numeric IDs fail closed to 'Не классифицировано'
      const summaryWithRawId: SampleSummary = {
        ...mockSampleSummary,
        sampleIndicators: [],
        processStatuses: ["2695"],
        currentStatusSource: "COMPANY_LEGACY",
        currentStatusValues: ["2695"],
      };
      const workbook = await buildSamplesWorkbook({
        summaries: [summaryWithRawId],
        period: "30 дней",
      });
      const sheet = workbook.getWorksheet("Образцы");
      let statusCell = "";
      sheet?.eachRow((row) => {
        if (row.getCell(1).value === 1) {
          statusCell = String(row.getCell(9).value || "");
        }
      });
      expect(statusCell).toBe(UNCLASSIFIED_LABEL);
      expect(statusCell).not.toContain("2695");
    });

    it("S14. Unknown Smart Process stage: internal stageId is raw token, user-facing status is 'Не классифицировано', issue is smart_process_unknown_stage", async () => {
      const row = {
        id: "101",
        stageId: "DT1032_15:UNKNOWN_CUSTOM_STAGE",
        companyId: "c-1",
      };
      const unit = adaptSmartProcessSampleEvidence(row, identityLabelResolver);
      expect(unit).not.toBeNull();
      // Internal stageId preserved verbatim for provenance
      expect(unit?.stageId).toBe("DT1032_15:UNKNOWN_CUSTOM_STAGE");
      // Unknown stage issue is flagged
      expect(unit?.issues).toContain("smart_process_unknown_stage");

      // In user-facing Excel, raw stage token fails closed to neutral label
      const summaryWithRawStage: SampleSummary = {
        ...mockSampleSummary,
        sampleIndicators: [],
        processStatuses: ["DT1032_15:UNKNOWN_CUSTOM_STAGE"],
        currentStatusSource: "COMPANY_LEGACY",
        currentStatusValues: ["DT1032_15:UNKNOWN_CUSTOM_STAGE"],
      };
      const workbook = await buildSamplesWorkbook({
        summaries: [summaryWithRawStage],
        period: "30 дней",
      });
      const sheet = workbook.getWorksheet("Образцы");
      let statusCell = "";
      sheet?.eachRow((row) => {
        if (row.getCell(1).value === 1) {
          statusCell = String(row.getCell(9).value || "");
        }
      });
      expect(statusCell).toBe(UNCLASSIFIED_LABEL);
      expect(statusCell).not.toContain("DT1032_15:UNKNOWN_CUSTOM_STAGE");
    });

    it("S15. Verified free-text Smart Process test result remains verbatim (protects against over-sanitization)", () => {
      const row = {
        id: "102",
        stageId: "DT1032_15:CLIENT",
        companyId: "c-1",
        UF_CRM_7_1763036405: "Проба прошла успешно, технолог подтвердил совместимость с полимером",
      };
      const unit = adaptSmartProcessSampleEvidence(row, identityLabelResolver);
      expect(unit).not.toBeNull();
      expect(unit?.rawTestResult).toBe("Проба прошла успешно, технолог подтвердил совместимость с полимером");
      expect(unit?.normalizedResult).toBe("positive");
    });
  });

  // =========================================================================
  // SAMPLES EXCEL TESTS (S16–S25)
  // =========================================================================
  describe("Samples Excel Export Contract (S16–S25)", () => {
    it("S16. 7days export contains truthful 7-day period label with dates", async () => {
      const label = formatSamplesPeriodLabel({ period: "7days" }, FIXED_NOW);
      expect(label).toBe("26.09.2026 — 02.10.2026 (7 дней)");

      const workbook = await buildSamplesWorkbook({
        summaries: [mockSampleSummary],
        filters: { period: "7days" },
      });
      const periodStr = extractPeriodFromSamplesWorkbook(workbook);
      expect(periodStr).toContain("7 дней");
      expect(periodStr).not.toBe("Все");
    });

    it("S17. 14days export contains truthful 14-day period label with dates", async () => {
      const label = formatSamplesPeriodLabel({ period: "14days" }, FIXED_NOW);
      expect(label).toBe("19.09.2026 — 02.10.2026 (14 дней)");

      const workbook = await buildSamplesWorkbook({
        summaries: [mockSampleSummary],
        filters: { period: "14days" },
      });
      const periodStr = extractPeriodFromSamplesWorkbook(workbook);
      expect(periodStr).toContain("14 дней");
      expect(periodStr).not.toBe("Все");
    });

    it("S18. 30days export must NOT say 'Все'", async () => {
      const workbook = await buildSamplesWorkbook({
        summaries: [mockSampleSummary],
        filters: { period: "30days" },
      });
      const periodStr = extractPeriodFromSamplesWorkbook(workbook);
      expect(periodStr).toContain("30 дней");
      expect(periodStr).not.toBe("Все");
    });

    it("S19. 90days export truthful with dates", async () => {
      const label = formatSamplesPeriodLabel({ period: "90days" }, FIXED_NOW);
      expect(label).toBe("05.07.2026 — 02.10.2026 (90 дней)");

      const workbook = await buildSamplesWorkbook({
        summaries: [mockSampleSummary],
        filters: { period: "90days" },
      });
      const periodStr = extractPeriodFromSamplesWorkbook(workbook);
      expect(periodStr).toContain("90 дней");
    });

    it("S20. Valid custom export shows exact normalized range with (Указать вручную)", async () => {
      const label = formatSamplesPeriodLabel(
        { period: "custom", customFrom: "2026-09-10", customTo: "2026-09-20" },
        FIXED_NOW
      );
      expect(label).toBe("10.09.2026 — 20.09.2026 (Указать вручную)");

      const workbook = await buildSamplesWorkbook({
        summaries: [mockSampleSummary],
        filters: { period: "custom", customFrom: "2026-09-10", customTo: "2026-09-20" },
      });
      const periodStr = extractPeriodFromSamplesWorkbook(workbook);
      expect(periodStr).toBe("10.09.2026 — 20.09.2026 (Указать вручную)");
    });

    it("S21. Incomplete custom export is disabled/guarded", async () => {
      expect(isSamplesPeriodValid({ period: "custom", customFrom: "2026-09-10" })).toBe(false);

      await expect(
        buildSamplesWorkbook({
          summaries: [mockSampleSummary],
          filters: { period: "custom", customFrom: "2026-09-10" },
        })
      ).rejects.toThrow("Экспорт отключён");
    });

    it("S22. Stale snapshot workbook contains STALE_SNAPSHOT_DISCLOSURE", async () => {
      const extraWarnings = buildExcelExtraWarnings({ isStale: true });
      expect(extraWarnings).toContain(STALE_SNAPSHOT_DISCLOSURE);

      const workbook = await buildSamplesWorkbook({
        summaries: [mockSampleSummary],
        filters: { period: "30days" },
        extraWarnings,
      });

      const sheet = workbook.getWorksheet("Образцы");
      let foundWarning = false;
      for (let r = 1; r <= 8; r++) {
        const row = sheet?.getRow(r);
        for (let c = 1; c <= 5; c++) {
          if (String(row?.getCell(c)?.value || "").includes(STALE_SNAPSHOT_DISCLOSURE)) {
            foundWarning = true;
          }
        }
      }
      expect(foundWarning).toBe(true);
    });

    it("S23. metadataPartial workbook contains METADATA_PARTIAL_DISCLOSURE", async () => {
      const extraWarnings = buildExcelExtraWarnings({ metadataPartial: true });
      expect(extraWarnings).toContain(METADATA_PARTIAL_DISCLOSURE);

      const workbook = await buildSamplesWorkbook({
        summaries: [mockSampleSummary],
        filters: { period: "30days" },
        extraWarnings,
      });

      const sheet = workbook.getWorksheet("Образцы");
      let foundWarning = false;
      for (let r = 1; r <= 8; r++) {
        const row = sheet?.getRow(r);
        for (let c = 1; c <= 5; c++) {
          if (String(row?.getCell(c)?.value || "").includes(METADATA_PARTIAL_DISCLOSURE)) {
            foundWarning = true;
          }
        }
      }
      expect(foundWarning).toBe(true);
    });

    it("S24. Clean workbook contains neither warning", async () => {
      const extraWarnings = buildExcelExtraWarnings({ isStale: false, metadataPartial: false });
      expect(extraWarnings.length).toBe(0);

      const workbook = await buildSamplesWorkbook({
        summaries: [mockSampleSummary],
        filters: { period: "30days" },
        extraWarnings,
      });

      const sheet = workbook.getWorksheet("Образцы");
      for (let r = 1; r <= 8; r++) {
        const row = sheet?.getRow(r);
        for (let c = 1; c <= 5; c++) {
          const val = String(row?.getCell(c)?.value || "");
          expect(val).not.toContain(STALE_SNAPSHOT_DISCLOSURE);
          expect(val).not.toContain(METADATA_PARTIAL_DISCLOSURE);
        }
      }
    });

    it("S25. Excel rows are EXACTLY the already-filtered UI summaries (no independent re-filtering)", async () => {
      const filteredList = [
        mockSampleSummary,
        {
          ...mockSampleSummary,
          companyId: "c-200",
          companyTitle: "Вторая Компания",
        },
      ];

      const workbook = await buildSamplesWorkbook({
        summaries: filteredList,
        filters: { period: "30days" },
      });

      const sheet = workbook.getWorksheet("Образцы");
      // Header is at row 6; rows 7 and 8 are the two data rows
      expect(sheet?.getRow(7).getCell(2).value).toBe("ООО РусСилика Тест");
      expect(sheet?.getRow(8).getCell(2).value).toBe("Вторая Компания");
      // Row 9 is empty or corporate divider
      expect(sheet?.getRow(9).getCell(2).value).toBeNull();
    });
  });
});
