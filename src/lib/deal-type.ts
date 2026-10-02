// src/lib/deal-type.ts
// ─────────────────────────────────────────────────────────────────────
// Authoritative Deal Type registry and shared resolver.
// Resolves CRM status identifiers (e.g. TYPE_ID = "SALE") to human-readable
// business labels using the Bitrix DEAL_TYPE registry (crm.status.list).
// ─────────────────────────────────────────────────────────────────────

export type DealTypeRegistry = Record<string, string>;

export interface FieldMetadataWithListValues {
  id?: string;
  listValues?: Array<{ ID: string; VALUE: string }>;
}

/**
 * Shared resolver for Deal TYPE_ID.
 *
 * Precedence:
 * 1. Current DEAL_TYPE registry (STATUS_ID -> NAME from crm.status.list)
 * 2. Valid TYPE_ID field metadata listValues, if available
 * 3. Neutral fallback: "Не классифицировано"
 *
 * User-facing outputs MUST NEVER leak raw IDs like "SALE" or "Не классифицировано (SALE)".
 */
export function resolveDealType(
  rawTypeId: unknown,
  dealTypeRegistry?: DealTypeRegistry | null,
  fieldMetadata?: FieldMetadataWithListValues | null
): string {
  if (rawTypeId === undefined || rawTypeId === null || rawTypeId === "") {
    return "–";
  }

  // Handle multi-value arrays if encountered
  if (Array.isArray(rawTypeId)) {
    if (rawTypeId.length === 0) return "–";
    return rawTypeId
      .map((item) => resolveDealType(item, dealTypeRegistry, fieldMetadata))
      .filter((val) => val && val !== "–")
      .join(", ") || "–";
  }

  const s = String(rawTypeId).trim();
  if (!s || s === "null" || s === "undefined" || s === "–" || s === "—") {
    return "–";
  }

  // 1. Current DEAL_TYPE registry lookup
  if (dealTypeRegistry && typeof dealTypeRegistry === "object" && dealTypeRegistry[s]) {
    return dealTypeRegistry[s];
  }

  // 2. Field metadata listValues fallback
  if (fieldMetadata?.listValues && Array.isArray(fieldMetadata.listValues)) {
    const found = fieldMetadata.listValues.find((lv) => lv.ID === s);
    if (found?.VALUE) {
      return found.VALUE;
    }
  }

  // 3. Truthful neutral fallback: strictly "Не классифицировано"
  return "Не классифицировано";
}

/**
 * Normalizes an array of status or list-value items into a standard DealTypeRegistry.
 */
export function buildDealTypeRegistry(
  items?: Array<{ ENTITY_ID?: string; ID?: string; STATUS_ID?: string; VALUE?: string; NAME?: string }> | null
): DealTypeRegistry {
  const registry: DealTypeRegistry = {};
  if (!items || !Array.isArray(items)) return registry;

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    if (item.ENTITY_ID && item.ENTITY_ID !== "DEAL_TYPE") {
      continue;
    }
    const id = item.STATUS_ID ?? item.ID;
    const name = item.NAME ?? item.VALUE;
    if (id && name) {
      const trimmedId = String(id).trim();
      const trimmedName = String(name).trim();
      if (trimmedId && trimmedName) {
        registry[trimmedId] = trimmedName;
      }
    }
  }

  return registry;
}
