// src/lib/dataset-coverage.ts
// ─────────────────────────────────────────────────────────────────────
// Shared dataset coverage contract for the whole product.
// A capped or partially-failed dataset must NEVER masquerade as complete.
// COMPLETE / CAPPED / PARTIAL must never collapse into one boolean.
// ─────────────────────────────────────────────────────────────────────

export type DatasetCoverage =
  | {
      status: "COMPLETE";
      fetched: number;
      total: number;
    }
  | {
      status: "CAPPED";
      fetched: number;
      total: number;
      cap: number;
      warning: string;
    }
  | {
      status: "PARTIAL";
      fetched: number;
      total?: number;
      warning: string;
      failedPages?: number[];
    };

export interface CoverageApiEnvelope {
  fetched?: number;
  total?: number;
  partial?: boolean;
  failedPages?: number;
  failedOffsets?: number[];
  cappedByLimit?: boolean;
  truncated?: boolean;
  warning?: string | null;
}

/**
 * Maps an API coverage envelope to the canonical DatasetCoverage.
 * Precedence: upstream page failure (PARTIAL) beats the application cap
 * (CAPPED) beats complete — the cause matters and must stay distinct.
 * `total` is authoritative even when unknown (PARTIAL without total).
 */
export function resolveDatasetCoverage(
  envelope: CoverageApiEnvelope,
  cap?: number
): DatasetCoverage {
  const fetched = envelope.fetched ?? 0;
  const total = envelope.total ?? fetched;

  if (envelope.partial || (envelope.failedPages ?? 0) > 0) {
    return {
      status: "PARTIAL",
      fetched,
      total,
      warning:
        envelope.warning ||
        `Некоторые данные не удалось загрузить. Загружено ${fetched} из ${total}.`,
      failedPages: envelope.failedOffsets,
    };
  }

  if (envelope.cappedByLimit && cap !== undefined) {
    return {
      status: "CAPPED",
      fetched,
      total,
      cap,
      warning:
        envelope.warning ||
        `Данные усечены. Загружено ${fetched} из ${total} (лимит загрузки ${cap}).`,
    };
  }

  return { status: "COMPLETE", fetched, total };
}

/** Russian report labels used by UI banners and Excel metadata. */
export function describeDatasetCoverage(coverage: DatasetCoverage): string {
  switch (coverage.status) {
    case "COMPLETE":
      return "Статус данных: Полный набор";
    case "CAPPED":
      return `Статус данных: НЕПОЛНЫЙ НАБОР. Загружено: ${coverage.fetched} из ${coverage.total}. Причина: лимит загрузки`;
    case "PARTIAL":
      return `Статус данных: ЧАСТИЧНЫЕ ДАННЫЕ. Загружено: ${coverage.fetched}${coverage.total !== undefined ? ` из ${coverage.total}` : ""}. Причина: ошибка получения части страниц`;
  }
}

/** Excel metadata lines (detached-artifact truthfulness). */
export function coverageExcelLines(coverage: DatasetCoverage): string[] {
  switch (coverage.status) {
    case "COMPLETE":
      return ["Статус данных: Полный набор"];
    case "CAPPED":
      return [
        "Статус данных: НЕПОЛНЫЙ НАБОР",
        `Загружено: ${coverage.fetched} из ${coverage.total}`,
        "Причина: лимит загрузки",
      ];
    case "PARTIAL":
      return [
        "Статус данных: ЧАСТИЧНЫЕ ДАННЫЕ",
        `Загружено: ${coverage.fetched}${coverage.total !== undefined ? ` из ${coverage.total}` : ""}`,
        "Причина: ошибка получения части страниц",
      ];
  }
}

export function isCoverageComplete(coverage: DatasetCoverage): boolean {
  return coverage.status === "COMPLETE";
}
