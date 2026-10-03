import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Static contract assertions over scripts/discover-smart-process-contract.mjs.
 * The discovery script must follow the official Universal CRM request shape
 * and verify the canonical `parentId2` Deal relation (never a fabricated
 * `parentId1032`), the quantity fields, and the live stage directory.
 */
const scriptPath = resolve(process.cwd(), "scripts/discover-smart-process-contract.mjs");
const source = readFileSync(scriptPath, "utf8");

describe("Smart Process discovery script contract", () => {
  it("sample crm.item.list request follows the documented Universal CRM shape (categoryId INSIDE filter)", () => {
    expect(source).toContain('"crm.item.list"');
    // entityTypeId / select / order / start / useOriginalUfNames top-level,
    // categoryId strictly inside filter.
    expect(source).toMatch(/entityTypeId:\s*EXPECTED_ENTITY_TYPE_ID/);
    expect(source).toMatch(/filter:\s*\{\s*categoryId:\s*EXPECTED_CATEGORY_ID\s*\}/);
    expect(source).toMatch(/useOriginalUfNames:\s*"Y"/);
    // No undocumented top-level categoryId parameter.
    expect(source).not.toMatch(/^\s*categoryId:\s*EXPECTED_CATEGORY_ID,\s*$/m);
  });

  it("verifies parentId2 as the canonical Deal relation — never parentId1032", () => {
    expect(source).toMatch(/k === "parentId2"/);
    expect(source).not.toMatch(/parentId1032/);
    expect(source).not.toMatch(/parentIds_1032/);
  });

  it("verifies both quantity fields required by the runtime contract", () => {
    expect(source).toContain("Кол-во переданного образца (ГЕЛЬ) кг");
    expect(source).toContain("Кол-во переданного образца (ЗОЛЬ) л");
  });

  it("verifies the live stage directory DYNAMIC_1032_STAGE_15 via crm.status.list", () => {
    expect(source).toContain('EXPECTED_STAGE_ENTITY = "DYNAMIC_1032_STAGE_15"');
    expect(source).toMatch(/"crm\.status\.list"/);
    expect(source).toMatch(/ENTITY_ID:\s*EXPECTED_STAGE_ENTITY/);
    // Stage IDs missing from the committed map are reported, never auto-extended.
    expect(source).toContain("liveStagesMissingFromCommittedMap");
    expect(source).toContain("committedStagesMissingLive");
  });

  it("preserves the read-only safety contract", () => {
    // Only known read-only methods appear in the script.
    const allowedMethods = [
      "crm.type.list",
      "crm.item.fields",
      "crm.category.list",
      "crm.status.list",
      "crm.item.list",
    ];
    const called = [...source.matchAll(/callReadOnly\(webhookUrl,\s*"([^"]+)"/g)].map(
      (m) => m[1]
    );
    for (const method of called) {
      expect(allowedMethods).toContain(method);
    }
    // No write/delete methods anywhere.
    expect(source).not.toMatch(/crm\.item\.(add|update|delete)/);
    expect(source).not.toMatch(/\.(add|update|delete)\b/);
    // The webhook is never printed.
    expect(source).toContain("NEVER printed");
  });
});
