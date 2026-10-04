// @vitest-environment jsdom
// src/__tests__/samples-company-responsible.test.tsx
// ─────────────────────────────────────────────────────────────────────
// Samples responsible display grain (company grain) verification:
//  R.13 SampleSummary.companyResponsibleId === "7" (Company owner grain);
//  R.14 existing SampleSummary.responsibleId === "55" unchanged (current
//      SP/legacy process responsibility — semantics preserved);
//  R.15 responsible filter options are populated from COMPANY responsible
//      (7) — never from the SP assignee (55);
//  R.16 filtering by Company responsible 7 INCLUDES Company 42;
//  R.17 filtering by SP assignee 55 does NOT include Company 42 merely
//      due to the SP assignment;
//  R.18 the Samples registry column «Ответственный компании» displays
//      the company owner's display name (user 7);
//  R.19 the physical Smart Process cycle card still displays its own
//      process responsible (user 55) — never erased/replaced;
//  R.20 Samples Excel «Ответственный компании» exports user 7's display
//      name — never the process responsible;
//  R.21 Commercial Funnel regression: funnel suites remain green without
//      modification (covered by the full-suite run; no funnel code
//      touched by this patch).
// ─────────────────────────────────────────────────────────────────────
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adaptLegacyCompanySampleEvidence } from "@/lib/samples/adapters/company-legacy";
import { adaptSmartProcessSampleEvidence } from "@/lib/samples/adapters/smart-process";
import { reconcileCompanySample } from "@/lib/samples/reconcile";
import { projectCanonicalCompanyToSummary } from "@/lib/samples/project";
import { identityLabelResolver } from "@/lib/samples/normalize";
import {
  buildCompanyResponsibleOptions,
  matchesCompanyResponsibleFilter,
  DEFAULT_SAMPLES_FILTERS,
} from "@/components/dashboard/samples/samples-filters";
import { SamplesRegistry } from "@/components/dashboard/samples/samples-registry";
import { SmartProcessItemCard } from "@/components/dashboard/samples/smart-process-item-card";
import { buildSamplesWorkbook } from "@/lib/export-utils";
import ExcelJS from "exceljs";
import type { SampleSummary } from "@/lib/samples/types";
import type { BitrixRow } from "@/lib/samples/types";

vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: (selector?: (s: any) => any) => {
    const state = {
      userNames: USER_NAMES,
      usersCoverage: COVERAGE,
    };
    return selector ? selector(state) : state;
  },
}));

const USER_NAMES: Record<string, string> = {
  "7": "Владелец Компании",
  "55": "Процессный Ответственный",
};
const COVERAGE = { status: "COMPLETE" as const, fetched: 2, total: 2 };

// ─── Canonical fixture: Company 42, owner 7, one ACTIVE SP cycle owned by 55 ───

function buildCompany42Summary(userNames?: Record<string, string>): SampleSummary {
  const companyRow: BitrixRow = {
    ID: "42",
    TITLE: "ООО Зернистость",
    ASSIGNED_BY_ID: "7",
  };
  const companyEvidence = adaptLegacyCompanySampleEvidence(companyRow, identityLabelResolver)!;
  const spRow: BitrixRow = {
    id: "9001",
    title: "Цикл 9001",
    companyId: "42",
    assignedById: "55",
    stageId: "DT1032_15:CLIENT", // active (TESTING_IN_PROGRESS)
  };
  const spEvidence = adaptSmartProcessSampleEvidence(spRow, identityLabelResolver)!;

  const canonical = reconcileCompanySample({
    companyId: "42",
    companyTitle: "ООО Зернистость",
    companyResponsibleId: "7",
    companyEvidence,
    dealEvidences: [],
    smartProcessEvidences: [spEvidence],
  });

  return projectCanonicalCompanyToSummary(canonical, userNames);
}

const summary42 = buildCompany42Summary(USER_NAMES);

describe("Samples company responsible grain — canonical projector", () => {
  it("R.13: companyResponsibleId is the explicit Company owner (7)", () => {
    expect(summary42.companyResponsibleId).toBe("7");
  });

  it("R.14: existing responsibleId keeps CURRENT-process semantics (SP assignee 55, unchanged)", () => {
    // SP current item's own ASSIGNED_BY_ID wins — SP attribution never
    // goes to the Company owner. The projector's existing meaning is
    // byte-identical to the pre-patch behavior.
    expect(summary42.responsibleId).toBe("55");
  });

  it("companyResponsibleName resolves through the same userNames map", () => {
    expect(summary42.companyResponsibleName).toBe("Владелец Компании");
  });

  it("without SP evidence the current responsible falls back to the Company owner (both grains align)", () => {
    const companyRow: BitrixRow = { ID: "43", TITLE: "ООО Фоллбэк", ASSIGNED_BY_ID: "7" };
    const companyEvidence = adaptLegacyCompanySampleEvidence(companyRow, identityLabelResolver)!;
    const canonical = reconcileCompanySample({
      companyId: "43",
      companyTitle: "ООО Фоллбэк",
      companyResponsibleId: "7",
      companyEvidence,
      dealEvidences: [],
    });
    const summary = projectCanonicalCompanyToSummary(canonical, USER_NAMES);
    expect(summary.responsibleId).toBe("7");
    expect(summary.companyResponsibleId).toBe("7");
  });
});

describe("Samples company responsible grain — filter options + predicate", () => {
  it("R.15: options come from companyResponsibleId (owner 7), never the SP assignee (55)", () => {
    const options = buildCompanyResponsibleOptions([summary42], USER_NAMES, COVERAGE);
    const values = options.map((o) => o.value);
    expect(values).toContain("7");
    expect(values).not.toContain("55");
    expect(options.find((o) => o.value === "7")?.label).toBe("Владелец Компании");
  });

  it("R.16: filtering by Company responsible 7 INCLUDES Company 42", () => {
    expect(matchesCompanyResponsibleFilter(summary42, "7")).toBe(true);
  });

  it("R.17: filtering by SP assignee 55 does NOT include Company 42 (SP assignee never matches the company filter)", () => {
    expect(matchesCompanyResponsibleFilter(summary42, "55")).toBe(false);
  });

  it("filter 'all' includes every company", () => {
    expect(matchesCompanyResponsibleFilter(summary42, DEFAULT_SAMPLES_FILTERS.responsibleId)).toBe(true);
  });
});

describe("Samples company responsible grain — registry + physical SP cycle", () => {
  it("R.18: registry column «Ответственный компании» displays the COMPANY owner (user 7)", () => {
    render(<SamplesRegistry summaries={[summary42]} onSelect={vi.fn()} />);

    // Renamed column header removes the ambiguity.
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("Ответственный компании");
    expect(headers).not.toContain("Ответственный");

    // The owner's display name renders in the company row.
    const row = screen.getByTestId("samples-table-scroll").querySelector('[data-company-id="42"]')!;
    expect(within(row as HTMLElement).getByText("Владелец Компании")).toBeInTheDocument();
    // The SP assignee's name must not appear as the company responsible.
    expect(within(row as HTMLElement).queryByText("Процессный Ответственный")).toBeNull();
  });

  it("R.19: the physical Smart Process cycle card still displays its OWN process responsible (user 55)", () => {
    const lite = summary42.smartProcessItems![0];
    render(<SmartProcessItemCard view={lite} />);

    expect(screen.getByText(/Ответственный:/)).toHaveTextContent("Процессный Ответственный");
    expect(screen.queryByText("Владелец Компании")).toBeNull();
  });
});

describe("Samples company responsible grain — Excel", () => {
  it("R.20: Samples Excel «Ответственный компании» exports the COMPANY owner (user 7), binary round-trip", async () => {
    const workbook = await buildSamplesWorkbook({
      summaries: [summary42],
      userNames: USER_NAMES,
      usersCoverage: COVERAGE,
    });

    // Serialize + reload the binary before asserting (ExcelJS round-trip).
    const buffer = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer as ArrayBuffer);
    const ws = reloaded.getWorksheet("Образцы")!;

    const headerRow = ws.getRow(6);
    const headers: string[] = [];
    headerRow.eachCell((cell) => headers.push(String(cell.value || "")));
    expect(headers[2]).toBe("Ответственный компании");

    const row = ws.getRow(7);
    expect(row.getCell(2).value).toBe("ООО Зернистость");
    // Company owner grain — never the SP process responsible.
    expect(row.getCell(3).value).toBe("Владелец Компании");
  });
});
