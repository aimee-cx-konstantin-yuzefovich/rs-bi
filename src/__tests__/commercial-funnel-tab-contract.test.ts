// @vitest-environment jsdom
// src/__tests__/commercial-funnel-tab-contract.test.ts
// T01: Commercial Funnel exposes EXACTLY the five management tabs.
// No permanent Образцы / Компании / Сделки internal tabs.

import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { COMMERCIAL_FUNNEL_TABS } from "@/app/commercial-funnel/page";

describe("T01 — Final tab set contract", () => {
  it("exports exactly five tabs in the mandated order", () => {
    expect(COMMERCIAL_FUNNEL_TABS.map((t) => t.label)).toEqual([
      "Обзор",
      "Воронка",
      "Сегменты",
      "Менеджеры",
      "Требуют внимания",
    ]);
    expect(COMMERCIAL_FUNNEL_TABS.map((t) => t.id)).toEqual([
      "overview",
      "funnel",
      "segments",
      "managers",
      "bottlenecks",
    ]);
  });

  it("tab ids contain no registry tabs (samples/companies/deals)", () => {
    const ids = COMMERCIAL_FUNNEL_TABS.map((t) => t.id);
    expect(ids).not.toContain("samples");
    expect(ids).not.toContain("companies");
    expect(ids).not.toContain("deals");
  });
});
