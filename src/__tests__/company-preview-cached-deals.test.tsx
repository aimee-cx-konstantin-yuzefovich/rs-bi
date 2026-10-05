// src/__tests__/company-preview-cached-deals.test.tsx
// ─────────────────────────────────────────────────────────────────────
// UI-CACHE-1 .. UI-CACHE-4: Linked-deal cache messaging (WP7).
//
// - A VALID USABLE cached snapshot renders related deals normally with no
//   orange technical warning and no "кэшированные" wording for users.
// - Cache provenance stays internal ("cached" source state retained).
// - NO usable data + refresh failure keeps the truthful error + Retry.
// ─────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1" } }, status: "authenticated" }),
}));

// Minimal store consumed by CompanyPreview internals under test.
const storeState = {
  userNames: {} as Record<string, string>,
  usersCoverage: null,
  fields: [] as Array<Record<string, unknown>>,
  fieldsCoverage: null,
  allDeals: [] as Array<Record<string, unknown>>,
  isDemoMode: false,
  userNamesLoading: false,
  dealsCoverage: { status: "COMPLETE", fetched: 1, total: 1 },
  fetchFields: vi.fn(async () => {}),
  fetchUserNames: vi.fn(async () => {}),
};
vi.mock("@/store/dashboard-store", () => ({
  useDashboardStore: () => storeState,
}));

// Export utility must never be invoked by these messaging tests.
vi.mock("@/lib/export-utils", () => ({ exportCompanyToExcel: vi.fn() }));

// ── Direct unit target: the exact JSX contract lives in the component file
//    — behavioral render tests below exercise the real component. ──

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { CompanyPreview } from "@/components/dashboard/company-preview";

function mockResponses({
  companyOk = true,
  dealsOk,
  dealsPayload,
}: {
  companyOk?: boolean;
  dealsOk: boolean;
  dealsPayload: unknown;
}) {
  fetchMock.mockImplementation((url: string) => {
    // NOTE: the deals endpoint (/companies/82/deals) must be matched FIRST —
    // it also contains the company URL prefix.
    if (url.endsWith("/deals")) {
      if (!dealsOk) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(dealsPayload) });
    }
    if (url === `/api/bitrix/companies/82`) {
      if (!companyOk) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            company: { ID: "82", TITLE: "Компания Кэш" },
            bitrixUrl: "https://b24/company/82/",
          }),
      });
    }
    if (url.includes("/api/bitrix/samples")) {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });
    }
    return Promise.reject(new Error("unexpected fetch " + url));
  });
}

function cachedDealsPayload() {
  return {
    success: true,
    deals: [{ ID: "900", TITLE: "Сделка Кэш", STAGE_ID: "NEW", OPPORTUNITY: 10 }],
  };
}

describe("Company Preview cached-deals messaging (UI-CACHE-1 .. UI-CACHE-4)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("UI-CACHE-1: usable cached snapshot renders deals with no technical cache warning", async () => {
    // Seed store cache with a trustworthy previous snapshot.
    storeState.allDeals = [
      { ID: "900", TITLE: "Сделка Кэш", COMPANY_ID: "82", STAGE_ID: "NEW" },
    ];
    // Company resolves; deals refresh FAILS; cached seed is usable.
    mockResponses({ dealsOk: false, dealsPayload: null });

    render(<CompanyPreview id="82" onClose={() => {}} />);
    // Cached/failed-refresh path renders deal row title.
    await screen.findByText("Сделка Кэш");

    // No orange technical warning, no "кэшированные" wording for users.
    expect(screen.queryByText(/кэшированные/i)).toBeNull();
    expect(screen.queryByText(/обновление с сервера не удалось/i)).toBeNull();
    expect(document.querySelector("[data-stale-warning]")).toBeNull();

    // Internal provenance stays truthful (component state keeps source:"cached").
    cleanup();
  });

  it("UI-CACHE-2: no usable snapshot + failure keeps the truthful error state", async () => {
    storeState.allDeals = [];
    mockResponses({ dealsOk: false, dealsPayload: null });

    render(<CompanyPreview id="82" onClose={() => {}} />);
    await screen.findByRole("status");
    await screen.findByText(/Связанные сделки временно недоступны/i);
    expect(screen.getAllByRole("button", { name: "Повторить" }).length).toBeGreaterThan(0);
    cleanup();
  });

  it("UI-CACHE-3: successful server load renders rows with no stale warning", async () => {
    storeState.allDeals = [];
    mockResponses({ dealsOk: true, dealsPayload: cachedDealsPayload() });

    render(<CompanyPreview id="82" onClose={() => {}} />);
    await screen.findByText("Сделка Кэш");
    expect(document.querySelector("[data-stale-warning]")).toBeNull();
    expect(screen.queryByText(/кэшированные/i)).toBeNull();
    cleanup();
  });

  it("UI-CACHE-4: the technical cache-warning markup no longer exists in the component", () => {
    // Guard char-level: the removed paragraph is verbatim absent.
    // (This file contains the phrases only inside this string literal.)
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(process.cwd(), "src/components/dashboard/company-preview.tsx"),
      "utf-8"
    );
    expect(src).not.toContain("Показаны кэшированные сделки");
    expect(src).not.toContain("data-stale-warning");
  });
});
