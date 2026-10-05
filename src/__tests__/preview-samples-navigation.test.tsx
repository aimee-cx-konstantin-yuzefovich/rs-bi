// src/__tests__/preview-samples-navigation.test.tsx
// ─────────────────────────────────────────────────────────────────────
// UI-NAV-1 .. UI-NAV-6: No dead Samples navigation (WP6).
//
// Invariant: VISIBLE ACTION = REAL DESTINATION EXISTS.
// - DealPreview Samples link renders only when canonical Smart Process
//   evidence (exact deal/company attribution from the shared session
//   cache) or the deal's OWN legacy sample evidence exists.
// - Marker-only field (UF_CRM_1779394379) never qualifies.
// - While existence is unknown (loading) no clickable link is exposed.
// - Drill-down sheet link gated on canonical CommercialCompany facts.
// - CompanyPreview link gated on the loaded company-scoped summary.
// - One SP fetch owner: useSmartProcessData (session cache) — no per-row
//   or per-link requests (no N+1).
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import type { SmartProcessItemView } from "@/lib/samples/smart-process-view";

// ─── Session mock (authenticated principal) ───
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1" } }, status: "authenticated" }),
}));

// ─── Store mock: minimal fields consumed by DealPreview ───
const storeState = {
  userNames: {} as Record<string, string>,
  fields: [] as Array<Record<string, unknown>>,
  activitiesData: {} as Record<string, unknown>,
  usersCoverage: null,
  dealTypeRegistry: null,
  allDeals: [] as Array<Record<string, unknown>>,
  fetchDealActivities: undefined,
};
vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: () => storeState,
}));

// ─── fetch mock (deal preview API) ───
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// ─── SP data hook mock: controllable per-test state ───
let spHookState: {
  dataState: string;
  byDealId: Record<string, SmartProcessItemView[]>;
  byCompanyId: Record<string, SmartProcessItemView[]>;
  reload: () => void;
};
vi.mock("@/components/dashboard/samples/use-smart-process-data", () => ({
  useSmartProcessData: () => spHookState,
}));

import { DealPreview } from "@/components/dashboard/deal-preview";

function spView(overrides: Partial<SmartProcessItemView> = {}): SmartProcessItemView {
  return {
    processItemId: "sp-1",
    title: "Тестирование образца",
    companyId: "42",
    linkedDealId: "1375",
    stageId: "DT1032_15:NEW",
    stageLabel: "Подготовка к отправке",
    isActive: true,
    isTerminal: false,
    sentDates: [],
    grades: [],
    quantities: [],
    normalizedResult: "unknown",
    dataIssues: [],
    ...overrides,
  } as SmartProcessItemView;
}

function mockDealResponse(deal: Record<string, unknown>) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/api/bitrix/deals/")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            deal: { ID: "1375", TITLE: "Сделка", COMPANY_ID: "42", ...deal },
            bitrixUrl: null,
            companyBitrixUrl: null,
          }),
      });
    }
    return Promise.reject(new Error("unexpected fetch " + url));
  });
}

async function renderDealPreview() {
  render(<DealPreview id="1375" onClose={() => {}} />);
  await screen.findByText("Сделка", { selector: "[data-slot='sheet-title'], h2" }).catch(() => {});
  // Wait a microtask for state to settle.
  await Promise.resolve();
}

describe("Preview Samples Navigation (UI-NAV-1 .. UI-NAV-6)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    storeState.userNames = {};
    storeState.fields = [];
    spHookState = {
      dataState: "loading",
      byDealId: {},
      byCompanyId: {},
      reload: () => {},
    };
  });

  it("UI-NAV-1: link hidden while SP cache loading and no deal evidence (existence unknown)", async () => {
    mockDealResponse({});
    await renderDealPreview();
    expect(document.querySelector("[data-samples-link]")).toBeNull();
  });

  it("UI-NAV-2: link visible when SP cache has items for the exact deal", async () => {
    mockDealResponse({});
    spHookState = {
      dataState: "ready",
      byDealId: { "1375": [spView()] },
      byCompanyId: {},
      reload: () => {},
    };
    await renderDealPreview();
    expect(document.querySelector("[data-samples-link]")).not.toBeNull();
  });

  it("UI-NAV-3: link visible when SP cache has items for the company", async () => {
    mockDealResponse({});
    spHookState = {
      dataState: "ready",
      byDealId: {},
      byCompanyId: { "42": [spView({ linkedDealId: "9999" })] },
      reload: () => {},
    };
    await renderDealPreview();
    expect(document.querySelector("[data-samples-link]")).not.toBeNull();
  });

  it("UI-NAV-4: link visible from deal's own legacy sent-date evidence (marker never qualifies)", async () => {
    // Real legacy evidence: sent date present; marker-only field also set —
    // the link must come from the evidence, not the marker.
    mockDealResponse({
      UF_CRM_1774879952785: "2026-01-15",
      UF_CRM_1779394379: "Да",
    });
    await renderDealPreview();
    expect(document.querySelector("[data-samples-link]")).not.toBeNull();
  });

  it("UI-NAV-5: marker-only field alone never produces the link", async () => {
    mockDealResponse({ UF_CRM_1779394379: "Да" });
    await renderDealPreview();
    expect(document.querySelector("[data-samples-link]")).toBeNull();
  });

  it("UI-NAV-6: no dead link for a deal without any sample evidence (ready empty SP)", async () => {
    mockDealResponse({});
    spHookState = {
      dataState: "ready",
      byDealId: {},
      byCompanyId: {},
      reload: () => {},
    };
    await renderDealPreview();
    expect(document.querySelector("[data-samples-link]")).toBeNull();
  });
});

describe("Drill-down sheet & CompanyPreview gating (content assertions)", () => {
  const repoRoot = process.cwd();
  const read = (rel: string) =>
    fs.readFileSync(path.resolve(repoRoot, rel), "utf-8");

  it("drill-down sheet gates the Samples deep link on canonical sample facts", () => {
    const src = read("src/components/commercial-funnel/drill-down-sheet.tsx");
    expect(src).toMatch(/hasCanonicalSamplesData/);
    // Link is conditional (guarded), not unconditional.
    expect(src).toMatch(/\{hasCanonicalSamplesData && \(/);
    // Gate reads canonical projection facts only — never raw transport fields.
    expect(src).toMatch(/sampleStatusSource/);
    expect(src).toMatch(/sampleAllDates/);
  });

  it("CompanyPreview Samples link stays gated on the loaded summary", () => {
    const src = read("src/components/dashboard/company-preview.tsx");
    expect(src).toMatch(/\{summary && \(/);
    expect(src).toContain("/samples?company=");
  });

  it("one SP fetch owner: DealPreview uses the shared session cache hook", () => {
    const src = read("src/components/dashboard/deal-preview.tsx");
    expect(src).toMatch(/useSmartProcessData\(\)/);
    // No per-row/per-link fetch usage beyond the scoped deal load and
    // activities owner (both scoped, not per-link).
    expect(src).toMatch(/\/api\/bitrix\/deals\//);
  });
});
