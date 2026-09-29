// src/lib/commercial-funnel/disclosure.ts
// ─────────────────────────────────────────────────────────────────────
// ONE shared data-quality disclosure rule (HE contract).
// Every surface whose values depend on incomplete data (Overview signals,
// Action Plan, next-action columns, Manager attention metrics, Sample
// Testing next-action fields, Funnel/Overview financial sections, Excel
// sheets) consumes THESE texts — no copy-pasted warning strings.
// ─────────────────────────────────────────────────────────────────────

/** Warning shown when activity data is only partially available. */
export const ACTIVITY_PARTIAL_DISCLOSURE =
  "Данные активностей неполны: колонки «Последняя активность» и «Следующий шаг» могут отражать не все сделки.";

/**
 * Surfaces affected by partial activity data. Used by the UI to render the
 * disclosure on every dependent view and by Excel to disclose per sheet.
 */
export const ACTIVITY_PARTIAL_AFFECTED_SURFACES = [
  "Обзор (управленческие сигналы)",
  "План действий",
  "Менеджеры (требуют внимания)",
  "Испытания образцов (следующий шаг)",
] as const;

/** Financial PARTIAL quality disclosure (per currency). */
export function financialPartialDisclosure(currencyLabel: string): string {
  return `Неполные финансовые данные (${currencyLabel}): присутствуют сделки с некорректной или отсутствующей суммой — итог может быть занижен.`;
}

/** Financial UNKNOWN quality disclosure (per currency). */
export function financialUnknownDisclosure(currencyLabel: string): string {
  return `Нет достоверных финансовых данных (${currencyLabel}): суммы сделок с оплатой отсутствуют или нечитаемы.`;
}

/** Financial INVALID_ONLY quality disclosure (per currency). */
export function financialInvalidDisclosure(currencyLabel: string): string {
  return `Ошибка финансовых данных (${currencyLabel}): все суммы сделок с оплатой некорректны — значение не вычисляется.`;
}

/**
 * Build the Excel `extraWarnings` list from the shared rule.
 * activityPartial: activity data incomplete (affects next-action columns).
 * financialQualities: per-currency aggregate qualities of the current view.
 */
export function buildExcelExtraWarnings(options: {
  activityPartial?: boolean;
  activityWarning?: string;
  financialQualitiesByCurrency?: Record<string, string>;
}): string[] {
  const warnings: string[] = [];
  if (options.activityPartial) {
    warnings.push(options.activityWarning || ACTIVITY_PARTIAL_DISCLOSURE);
  }
  for (const [cur, quality] of Object.entries(options.financialQualitiesByCurrency || {})) {
    const label = cur === "UNKNOWN" ? "валюта не указана" : cur;
    if (quality === "PARTIAL") warnings.push(financialPartialDisclosure(label));
    else if (quality === "UNKNOWN") warnings.push(financialUnknownDisclosure(label));
    else if (quality === "INVALID_ONLY") warnings.push(financialInvalidDisclosure(label));
  }
  return warnings;
}
