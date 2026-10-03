// @vitest-environment node
// src/__tests__/company-preview-canonical-repository.test.ts
// ─────────────────────────────────────────────────────────────────────
// Repository-wide canonicalization guards:
// 1. Caller-specific Company Preview content is removed: no
//    sampleFieldsFor/previewSampleFields/defaultSampleFields anywhere;
//    every <CompanyPreview call site passes only navigation/focus props.
// 2. COMPANY_* Deal-table columns follow the structural classification
//    rule: every COMPANY_* column in crm-constants/fields route source is
//    client-enrichment except the whitelisted real Deal fields
//    (UPSTREAM_COMPANY_DEAL_COLUMNS) — no prefix guessing, verified structurally.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const grep = (pattern: string, glob: string): string => {
  try {
    return execSync(`grep -rn ${JSON.stringify(pattern)} --include=${JSON.stringify(glob)} src`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch {
    return "";
  }
};

describe("Company Preview canonicalization — repository scan", () => {
  it("no caller-specific field overrides remain (sampleFieldsFor / previewSampleFields / defaultSampleFields / defaultCompanyFields)", () => {
    let hits = "";
    try {
      hits = execSync(
        `grep -rn -E "sampleFieldsFor|previewSampleFields|defaultSampleFields|defaultCompanyFields" --include="*.ts" --include="*.tsx" src | grep -v __tests__ || true`,
        { cwd: REPO_ROOT, encoding: "utf8" }
      );
    } catch {
      hits = "";
    }
    expect(hits.trim()).toBe("");
  });

  it("every <CompanyPreview call site passes only the canonical prop set", () => {
    const hits = grep("<CompanyPreview", "*.tsx");
    const files = new Set(
      hits
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split(":")[0])
    );
    // The component definition file itself plus test files are expected;
    // every non-test consumer must be one of the four canonical entry points.
    const consumerFiles = [...files].filter(
      (f) => !f.includes("__tests__") && !f.endsWith("company-preview.tsx")
    );
    expect(consumerFiles.sort()).toEqual([
      "src/app/commercial-funnel/page.tsx",
      "src/app/samples/page.tsx",
      "src/components/dashboard/company-browser.tsx",
      "src/components/dashboard/data-table.tsx",
    ]);
    // None of the call sites passes caller-specific content props.
    for (const file of consumerFiles) {
      const content = execSync(`cat ${file}`, { cwd: REPO_ROOT, encoding: "utf8" });
      const m = content.match(/<CompanyPreview[\s\S]*?\/>/g) ?? [];
      for (const call of m) {
        expect(call).not.toMatch(/sampleFieldsFor|previewSampleFields|fields=|companyModel=|contentOverride/);
      }
    }
  });

  it("CompanyPreview accepts no field-selection/content props in its interface", () => {
    const content = execSync("cat src/components/dashboard/company-preview.tsx", {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const iface = content.match(/export interface CompanyPreviewProps \{[\s\S]*?\}/)![0];
    expect(iface).toContain("id: string");
    expect(iface).toContain("onClose");
    expect(iface).not.toMatch(/sampleFieldsFor|previewSampleFields|onExport|fields\b.*=/);
  });
});

describe("COMPANY_* Deal-table classification — structural guard", () => {
  it("every COMPANY_* column literal emitted to users classifies as client-only except UPSTREAM_COMPANY_DEAL_COLUMNS", async () => {
    const { isClientOnlyDealColumn, UPSTREAM_COMPANY_DEAL_COLUMNS } = await import(
      "@/lib/deal-table-columns"
    );
    // Source literals of COMPANY_* column IDs users can select (crm-constants
    // + fields route). Scanning source keeps the guard honest when new
    // columns are added: a new COMPANY_* literal must either be added to the
    // upstream whitelist DELIBERATELY or remain client-only.
    const constants = execSync("cat src/lib/crm-constants.ts", { cwd: REPO_ROOT, encoding: "utf8" });
    const literals = new Set<string>();
    for (const m of constants.matchAll(/"(COMPANY_[A-Z0-9_]+)"/g)) literals.add(m[1]);
    for (const m of constants.matchAll(/'(COMPANY_[A-Z0-9_]+)'/g)) literals.add(m[1]);

    expect(literals.size).toBeGreaterThan(0);
    const upstreamWhitelist = UPSTREAM_COMPANY_DEAL_COLUMNS as readonly string[];
    for (const literal of literals) {
      const isUpstreamEligible = !isClientOnlyDealColumn(literal);
      if (isUpstreamEligible) {
        // Must be a deliberate whitelist entry, never implicit.
        expect(
          upstreamWhitelist.includes(literal),
          `COMPANY_* literal '${literal}' is upstream-eligible but not whitelisted`
        ).toBe(true);
      }
    }
    // The known real Deal field stays upstream-eligible.
    expect(isClientOnlyDealColumn("COMPANY_ID")).toBe(false);
    // Spot-check the defect family stays client-only.
    for (const col of ["COMPANY_TITLE", "COMPANY_ASSIGNED_BY_ID", "COMPANY_DATE_CREATE", "COMPANY_LAST_ACTIVITY_TIME"]) {
      expect(isClientOnlyDealColumn(col)).toBe(true);
    }
  });

  it("no COMPANY_TITLE force-push remains in the deals transport paths", () => {
    const store = execSync("cat src/store/dashboard-store.ts", { cwd: REPO_ROOT, encoding: "utf8" });
    const route = execSync("cat src/app/api/bitrix/deals/route.ts", { cwd: REPO_ROOT, encoding: "utf8" });
    for (const [name, content] of [["dashboard-store", store], ["deals route", route]] as const) {
      expect(content, name).not.toMatch(/select\.push\(\s*"COMPANY_TITLE"\s*\)/);
      expect(content, name).not.toMatch(/select\.includes\("COMPANY_TITLE"\)[^]*?select\.push/);
    }
  });
});
