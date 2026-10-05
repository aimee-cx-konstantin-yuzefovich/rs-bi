// src/lib/enrichment-disclosure.ts
// ─────────────────────────────────────────────────────────────────────
// Selected-column-aware enrichment disclosure. One dependency model feeds
// BOTH the UI warning banner and the Excel extraWarnings block so the two
// surfaces can never diverge.
//
// A Deals dataset may be COMPLETE while its enrichment sources (user
// directory, activities, company enrichment, CRM field metadata) are
// PARTIAL/CAPPED. The detached workbook must disclose every incomplete
// source that the exported columns actually depend on — and must stay
// silent about sources outside the exported semantic scope.
// ─────────────────────────────────────────────────────────────────────

import type { DatasetCoverage } from "./dataset-coverage";
import type { CompanyEnrichmentDiagnostics } from "./enrichment-coverage";
import type { FieldInfo } from "@/store/dashboard-store";

/** Russian Excel/UI warnings — one wording per source (§18). */
export const WARNING_USERS_PARTIAL =
  "ВНИМАНИЕ: справочник сотрудников загружен частично. Некоторые ФИО ответственных могут быть недоступны.";
export const WARNING_ACTIVITIES_PARTIAL =
  "ВНИМАНИЕ: данные активностей загружены частично. Поля \"Последнее дело\" / \"Следующий шаг\" могут быть неполными.";
export const WARNING_COMPANIES_PARTIAL_FALLBACK =
  "Не удалось получить данные части компаний из CRM.";
export const WARNING_COMPANIES_PARTIAL =
  `ВНИМАНИЕ: данные компаний загружены частично. ${WARNING_COMPANIES_PARTIAL_FALLBACK}`;
export const WARNING_FIELDS_PARTIAL =
  "ВНИМАНИЕ: метаданные CRM загружены частично. Типы/подписи части пользовательских полей могут быть недоступны.";
/**
 * Restrained user-facing wording for the company ENRICHMENT source
 * (company enrichment by deal-referenced IDs; the base Company population
 * comes from the dedicated companies/list route and is unaffected).
 * The detailed failed/total counts remain in the Excel disclosure block;
 * ordinary UI users see this calm line instead of alarming raw numbers.
 */
export const WARNING_COMPANIES_PARTIAL_UI =
  "Часть дополнительных данных компаний недоступна";

/**
 * Muted data-quality line for related Company IDs that CRM did not return
 * from successful reads. NOT a transport failure and never implies the
 * Company registry lost entities.
 */
export const WARNING_COMPANY_REFERENCES_UI =
  "Часть дополнительных данных связанных компаний недоступна.";
const WARNING_COMPANY_REFERENCES_EXCEL_PREFIX =
  "ПРИМЕЧАНИЕ: данные связанных компаний недоступны для";

export interface EnrichmentCoverageSnapshot {
  usersCoverage?: DatasetCoverage | null;
  activitiesCoverage?: DatasetCoverage | null;
  companiesDataCoverage?: DatasetCoverage | null;
  companiesEnrichmentDiagnostics?: CompanyEnrichmentDiagnostics | null;
  fieldsCoverage?: DatasetCoverage | null;
}

export interface EnrichmentWarningsInput extends EnrichmentCoverageSnapshot {
  /** Raw selected column IDs (the export semantic scope). */
  selectedColumns: string[];
  /** Field metadata for user-type detection (may be empty). */
  fields?: Array<Pick<FieldInfo, "id" | "type">>;
}

function isIncomplete(coverage?: DatasetCoverage | null): boolean {
  return coverage?.status === "PARTIAL" || coverage?.status === "CAPPED";
}

/** Does any selected column depend on the user directory? */
export function selectedColumnsNeedUsers(
  selectedColumns: string[],
  fields?: Array<Pick<FieldInfo, "id" | "type">>
): boolean {
  const fieldMap = new Map((fields || []).map((f) => [f.id, f]));
  return selectedColumns.some(
    (c) => c === "ASSIGNED_BY_ID" || c === "COMPANY_ASSIGNED_BY_ID" || fieldMap.get(c)?.type === "user"
  );
}

/** Does any selected column depend on activities enrichment? */
export function selectedColumnsNeedActivities(selectedColumns: string[]): boolean {
  return selectedColumns.includes("ACTIVITY_LAST") || selectedColumns.includes("ACTIVITY_NEXT");
}

/** Does any selected column depend on company enrichment? */
export function selectedColumnsNeedCompanies(selectedColumns: string[]): boolean {
  return selectedColumns.some((c) => c.startsWith("COMPANY_"));
}

/**
 * Does any selected column depend on CRM field metadata for correct
 * types/labels (crm_status/listValues-driven custom fields)? Standard
 * fields with fixed semantics (dates, money, stage) do not require it.
 */
export function selectedColumnsNeedFieldMetadata(
  selectedColumns: string[],
  fields?: Array<Pick<FieldInfo, "id" | "type">>
): boolean {
  const fieldMap = new Map((fields || []).map((f) => [f.id, f]));
  return selectedColumns.some((c) => {
    const meta = fieldMap.get(c);
    if (!meta) return false;
    // Fields whose display depends on listValues/type metadata:
    // crm_status enums and enumeration-typed custom fields.
    return meta.type === "crm_status" || meta.type === "enumeration";
  });
}

/**
 * Returns the extraWarnings lines for the export's selected-column scope.
 * Only sources that are BOTH incomplete AND actually depended upon by the
 * selected columns produce a warning — unrelated failures never leak into
 * unrelated exports.
 */
export function buildEnrichmentExtraWarnings(
  input: EnrichmentWarningsInput
): string[] {
  const warnings: string[] = [];
  const { selectedColumns, fields } = input;

  if (selectedColumnsNeedUsers(selectedColumns, fields) && isIncomplete(input.usersCoverage)) {
    warnings.push(WARNING_USERS_PARTIAL);
  }
  if (selectedColumnsNeedActivities(selectedColumns) && isIncomplete(input.activitiesCoverage)) {
    warnings.push(WARNING_ACTIVITIES_PARTIAL);
  }
  if (selectedColumnsNeedCompanies(selectedColumns) && isIncomplete(input.companiesDataCoverage)) {
    const cov = input.companiesDataCoverage;
    if (cov && typeof cov.total === "number" && typeof cov.fetched === "number") {
      const unresolved = Math.max(0, cov.total - cov.fetched);
      if (cov.status === "CAPPED") {
        warnings.push(
          `ВНИМАНИЕ: данные компаний загружены частично. ${cov.warning || `Достигнут лимит выборки CRM. Загружено ${cov.fetched} из ${cov.total}.`}`
        );
      } else if (unresolved > 0) {
        warnings.push(
          `ВНИМАНИЕ: данные компаний загружены частично. Не удалось получить данные ${unresolved} из ${cov.total} компаний из CRM.`
        );
      }
    } else {
      warnings.push(WARNING_COMPANIES_PARTIAL);
    }
  }
  // Unresolved related-company references (successful reads, ID not
  // returned): separate data-quality note, only when a COMPANY_* column is
  // visible. Distinct from the transport-failure line above.
  const refCount =
    input.companiesEnrichmentDiagnostics?.activeUnresolvedReferenceCount ??
    input.companiesEnrichmentDiagnostics?.unresolvedReferenceCount ??
    0;
  if (selectedColumnsNeedCompanies(selectedColumns) && refCount > 0) {
    warnings.push(
      `${WARNING_COMPANY_REFERENCES_EXCEL_PREFIX} ${refCount} связанных компаний (CRM не вернула запись по ссылке из сделки). Сделки загружены полностью.`
    );
  }
  if (
    selectedColumnsNeedFieldMetadata(selectedColumns, fields) &&
    isIncomplete(input.fieldsCoverage)
  ) {
    warnings.push(WARNING_FIELDS_PARTIAL);
  }

  return warnings;
}

/**
 * Compact UI warning lines for enrichment sources a currently visible
 * column depends on (shorter phrasing than the Excel block).
 *
 * Company enrichment is OPTIONAL detail on top of the complete base Company
 * population (fetched by the dedicated companies/list route): a partial
 * enrichment refresh never means entity loss, so the UI shows the restrained
 * wording without raw batch/failure counts. The detailed counts stay in the
 * Excel disclosure (buildEnrichmentExtraWarnings) for detached artifacts.
 */
export function buildEnrichmentUiWarnings(
  input: EnrichmentWarningsInput
): string[] {
  return buildEnrichmentExtraWarnings(input).map((w) => {
    if (w.startsWith(WARNING_COMPANY_REFERENCES_EXCEL_PREFIX)) {
      return WARNING_COMPANY_REFERENCES_UI;
    }
    const companyMatch = w.match(/Не удалось получить данные (.*)$/);
    if (companyMatch) {
      return WARNING_COMPANIES_PARTIAL_UI;
    }
    if (w.includes("данные компаний загружены частично")) {
      return WARNING_COMPANIES_PARTIAL_UI;
    }
    const stripped = w.replace(/^ВНИМАНИЕ:\s*/, "");
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
  });
}
