"use client";

// src/components/dashboard/preview-primitives.tsx
// ─────────────────────────────────────────────────────────────────────
// Smallest shared presentation primitives for the ONE preview design
// system (WP5). CompanyPreview and DealPreview must visibly look like the
// same product: one heading hierarchy, one label/value/empty/link
// treatment. Purely presentational — no data, no fetching, no models.
//
// Hierarchy contract:
// - H1/entity title: the SheetTitle (owned by each preview; one size).
// - Context/subtitle: SheetDescription («Просмотр … · ID …»), muted.
// - H2/major section: PreviewSectionHeading (consistent case + weight).
// - Field label: PreviewFieldLabel (one muted gray, one size/weight).
// - Field value: PreviewFieldValue (one main color; empty → muted «—»).
// - Link: corporate blue (text-primary), underline on hover only.
// ─────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";

/** H2 / major section heading — shared by Company & Deal previews. */
export function PreviewSectionHeading({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h4
      className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider ${className}`}
    >
      {children}
    </h4>
  );
}

/** Field label (dt) — one muted gray, one size/weight across previews. */
export function PreviewFieldLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <dt className={`text-xs text-muted-foreground ${className}`}>{children}</dt>;
}

/** Truthful empty-value placeholder (shared token treatment). */
export const PREVIEW_EMPTY_VALUE = "—";

/**
 * Field value (dd) — one main text color; empty/`—` values render in the
 * consistent muted treatment. Whitespace-pre-wrap for long text is opt-in
 * via `preserveWhitespace`.
 */
export function PreviewFieldValue({
  children,
  isEmpty = false,
  preserveWhitespace = false,
  className = "",
}: {
  children: ReactNode;
  isEmpty?: boolean;
  preserveWhitespace?: boolean;
  className?: string;
}) {
  if (isEmpty) {
    return (
      <span className="text-muted-foreground/70 font-normal">
        {typeof children === "string" && children.trim() === "" ? PREVIEW_EMPTY_VALUE : children}
      </span>
    );
  }
  return (
    <span
      className={`${preserveWhitespace ? "whitespace-pre-wrap break-words " : ""}font-medium ${className}`}
    >
      {children}
    </span>
  );
}
