// @vitest-environment node
// src/__tests__/marker-isolation-repository.test.ts
// ─────────────────────────────────────────────────────────────────────
// Phase C §45: repository-wide marker isolation.
//
// UF_CRM_1779394379 («Тестирование образцов», Deal) is MARKER_ONLY.
// This suite proves:
// A. (grep contract) the field ID appears only in sanctioned
//    marker/preview/display paths — never as an analytical input;
// B. (behavior) a marker value cannot independently affect sampleStatus,
//    inTesting, sampleSuccess, sampleFail, sampleRework, samplesSent,
//    current contour membership, or manager attribution.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

vi.mock("@/lib/samples/smart-process-contract", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/samples/smart-process-contract")>();
  return {
    ...real,
    SMART_PROCESS_HAS_DISCOVERED_CONTRACT: true,
    SMART_PROCESS_SENT_DATE_FIELD_ID: "UF_CRM_SP_SENT",
    SMART_PROCESS_DEAL_FIELD_ID: "UF_CRM_SP_DEAL",
    SMART_PROCESS_GRADE_GEL_FIELD_ID: "UF_CRM_SP_GEL",
    SMART_PROCESS_GRADE_SOL_FIELD_ID: "UF_CRM_SP_SOL",
    SMART_PROCESS_TEST_RESULT_FIELD_ID: "UF_CRM_SP_RESULT",
  };
});

import { buildCanonicalSampleDomain } from "@/lib/samples/aggregate";
import {
  applyCanonicalSampleDomain,
  normalizeCompanies,
  normalizeDeals,
} from "@/lib/commercial-funnel/normalize";
import {
  computeManagerScorecard,
  computePeriodMetrics,
  computeWipMetrics,
} from "@/lib/commercial-funnel/engine";
import { isActivePortfolioCompany } from "@/lib/commercial-funnel/analytics";
import { computePeriodBoundaries } from "@/lib/commercial-funnel/date-utils";
import { DEAL_SAMPLE_TESTING_FIELD_ID, DEAL_SAMPLE_TRANSFER_FIELD_ID, DEAL_SAMPLE_SENT_DATE_FIELD_ID } from "@/lib/crm-constants";

const ROOT = path.resolve(__dirname, "..");

describe("Phase C — Marker isolation (§45)", () => {
  it("A. grep contract: UF_CRM_1779394379 appears only in sanctioned paths", () => {
    let output = "";
    try {
      output = execSync(
        `grep -rn "UF_CRM_1779394379" src scripts --include="*.ts" --include="*.tsx" --include="*.mjs" -l`,
        { encoding: "utf-8", cwd: ROOT }
      );
    } catch {
      output = ""; // no matches is also acceptable (constant imported instead)
    }
    // Also check the constant name usage.
    let constantFiles = "";
    try {
      constantFiles = execSync(
        `grep -rln "DEAL_SAMPLE_TESTING_FIELD_ID" src scripts --include="*.ts" --include="*.tsx" --include="*.mjs"`,
        { encoding: "utf-8", cwd: ROOT }
      );
    } catch {
      constantFiles = "";
    }

    const files = new Set(
      [...output.split("\n"), ...constantFiles.split("\n")].map((f) => f.trim()).filter(Boolean)
    );

    const sanctioned = new Set(
      [
        "src/lib/crm-constants.ts", // central ID definition
        "src/lib/samples/constants.ts", // re-export
        "src/lib/samples/adapters/deal-legacy.ts", // MARKER_ONLY classification
        "src/lib/samples/bitrix-fetch.ts", // SELECT (raw fetch for preview)
        "src/lib/commercial-funnel/normalize.ts", // raw preview payload on CommercialDeal
        "src/app/api/bitrix/samples/route.ts", // fixed SELECT
        "src/app/api/bitrix/commercial-funnel/route.ts", // fixed SELECT
        "src/__tests__/marker-isolation-repository.test.ts",
        "src/__tests__/samples-smart-process.test.ts",
        "src/__tests__/samples-canonical-model.test.ts",
        "src/__tests__/samples-api.test.ts",
        "src/__tests__/commercial-funnel-engine.test.ts",
        "src/__tests__/commercial-funnel-sample-cycle.test.ts",
        "scripts/verify-bitrix-contract.mjs",
        "scripts/verify-samples-field-map.mjs",
      ]
    );

    for (const file of files) {
      expect(
        sanctioned.has(file),
        `UF_CRM_1779394379 / DEAL_SAMPLE_TESTING_FIELD_ID used outside sanctioned paths: ${file}`
      ).toBe(true);
    }
  });

  it("B. behavior: marker alone cannot create sampleStatus / KPI / contour / manager effects", () => {
    // Company with NO sample evidence anywhere; one TERMINAL deal with
    // ONLY the marker (no active commercial deal either — so contour
    // membership can only come from sample state, which must not exist).
    const rawCompany = { ID: "100", TITLE: "C", ASSIGNED_BY_ID: "mgr-1" };
    const rawDeals = [
      {
        ID: "50",
        COMPANY_ID: "100",
        ASSIGNED_BY_ID: "mgr-1",
        STAGE_ID: "C4:WON", // terminal commercial stage
        [DEAL_SAMPLE_TESTING_FIELD_ID]: ["Подошло"], // marker only
      },
    ];
    const deals = normalizeDeals(rawDeals as any, {});
    const companies = normalizeCompanies([rawCompany], deals, {});
    const domain = buildCanonicalSampleDomain([rawCompany], rawDeals as any, []);
    const projected = applyCanonicalSampleDomain(companies, domain, {});

    // No current sample state.
    expect(projected[0].sampleStatus).toBe("—");
    expect(projected[0].sampleStatusSource).toBe("NONE");

    // No WIP KPI in any sample bucket.
    const wip = computeWipMetrics(projected);
    for (const key of ["На испытании", "Подошли", "Не подошли", "Требуется доработка"]) {
      expect(wip.find((w) => w.id === key)!.companyCount).toBe(0);
    }

    // No samples_sent events (marker has no date).
    const bounds = computePeriodBoundaries({
      periodPreset: "custom",
      customFrom: "2026-01-01",
      customTo: "2026-12-31",
    });
    const kpis = computePeriodMetrics(projected, bounds);
    expect(kpis.find((k) => k.id === "samples_sent")!.currentValue).toBe(0);

    // No manager sample attribution.
    const scorecard = computeManagerScorecard(projected, bounds, [], { "mgr-1": "М1" });
    const row = scorecard.find((r) => r.responsibleId === "mgr-1");
    expect(row?.inTesting ?? 0).toBe(0);
    expect(row?.sampleSuccess ?? 0).toBe(0);
    expect(row?.sampleFail ?? 0).toBe(0);
    expect(row?.sampleRework ?? 0).toBe(0);
    expect(row?.samplesSent ?? 0).toBe(0);

    // No current-contour membership from the marker alone.
    expect(isActivePortfolioCompany(projected[0])).toBe(false);
  });

  it("B2. behavior: a real transfer status DOES create state — isolation is about the marker only", () => {
    const rawCompany = { ID: "100", TITLE: "C", ASSIGNED_BY_ID: "mgr-1" };
    const rawDeals = [
      {
        ID: "50",
        COMPANY_ID: "100",
        ASSIGNED_BY_ID: "mgr-1",
        STAGE_ID: "EXECUTING",
        [DEAL_SAMPLE_TRANSFER_FIELD_ID]: "DT1032_15:SUCCESS",
        [DEAL_SAMPLE_SENT_DATE_FIELD_ID]: "2026-06-01",
      },
    ];
    const deals = normalizeDeals(rawDeals as any, {});
    const companies = normalizeCompanies([rawCompany], deals, {});
    const domain = buildCanonicalSampleDomain([rawCompany], rawDeals as any, []);
    const projected = applyCanonicalSampleDomain(companies, domain, {});
    expect(projected[0].sampleStatus).toBe("Подошли");
    expect(projected[0].sampleStatusSource).toBe("DEAL");
  });
});
