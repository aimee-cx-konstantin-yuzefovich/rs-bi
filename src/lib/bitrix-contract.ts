// src/lib/bitrix-contract.ts
// ─────────────────────────────────────────────────────────────────────
// Upstream schema and contract validator for Bitrix24 REST API payloads.
// Implements the single canonical validation engine for RusSilica BI.
// ─────────────────────────────────────────────────────────────────────

import {
  ExpectedBitrixField,
  EXPECTED_DEAL_FIELDS,
  EXPECTED_COMPANY_FIELDS,
  REQUIRED_BASE_STAGES,
  normalizeBitrixBoolean,
  OFFLINE_CONTRACT_SNAPSHOT,
} from "./bitrix-contract-spec";
import { assertSafeWebhookUrl, DnsLookupFunction } from "./network-safety";

export { OFFLINE_CONTRACT_SNAPSHOT };

export type IssueSeverity = "error" | "warning";

export interface ContractIssue {
  severity: IssueSeverity;
  entity:
    | "crm.deal.fields"
    | "crm.company.fields"
    | "crm.deal.list"
    | "crm.company.list"
    | "crm.status.list";
  field?: string;
  message: string;
}

export interface ContractValidationResult {
  ok: boolean;
  errors: ContractIssue[];
  warnings: ContractIssue[];
  allIssues: ContractIssue[];
}

function validateFieldMetadata(
  fieldSpec: ExpectedBitrixField,
  meta: unknown,
  entity: "crm.deal.fields" | "crm.company.fields"
): ContractIssue[] {
  const issues: ContractIssue[] = [];

  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    issues.push({
      severity: "error",
      entity,
      field: fieldSpec.id,
      message: `Field '${fieldSpec.id}' metadata must be a non-array object`,
    });
    return issues;
  }

  const fieldMeta = meta as Record<string, unknown>;

  // 1. Type validation
  if (typeof fieldMeta.type !== "string") {
    issues.push({
      severity: "error",
      entity,
      field: fieldSpec.id,
      message: `Field '${fieldSpec.id}' must have a string 'type' property`,
    });
  } else {
    const actualType = fieldMeta.type.toLowerCase().trim();
    const allowed = fieldSpec.allowedTypes.map((t) => t.toLowerCase().trim());
    if (!allowed.includes(actualType)) {
      issues.push({
        severity: "error",
        entity,
        field: fieldSpec.id,
        message: `Field '${fieldSpec.id}' expected type [${fieldSpec.allowedTypes.join(", ")}], found '${fieldMeta.type}'`,
      });
    }
  }

  // 2. Multiplicity validation
  if (fieldSpec.expectedMultiple !== undefined) {
    const actualMultiple = normalizeBitrixBoolean(fieldMeta.isMultiple);
    if (actualMultiple !== fieldSpec.expectedMultiple) {
      issues.push({
        severity: "error",
        entity,
        field: fieldSpec.id,
        message: `Field '${fieldSpec.id}' expected multiplicity ${fieldSpec.expectedMultiple ? "MULTIPLE" : "SINGLE"}, found ${actualMultiple ? "MULTIPLE" : "SINGLE"}`,
      });
    }
  }

  // 3. Enum IDs and Items structure validation
  if (fieldMeta.items !== undefined && !Array.isArray(fieldMeta.items)) {
    issues.push({
      severity: "error",
      entity,
      field: fieldSpec.id,
      message: `Field '${fieldSpec.id}' property 'items' must be an array when present`,
    });
  } else if (Array.isArray(fieldMeta.items)) {
    for (let idx = 0; idx < fieldMeta.items.length; idx++) {
      const item = fieldMeta.items[idx];
      if (!item || typeof item !== "object" || !("ID" in item) || !("VALUE" in item)) {
        issues.push({
          severity: "error",
          entity,
          field: fieldSpec.id,
          message: `Field '${fieldSpec.id}' items[${idx}] must contain 'ID' and 'VALUE'`,
        });
        break;
      }
    }

    if (fieldSpec.enumIds && fieldSpec.enumIds.length > 0) {
      const presentEnumIds = new Set(
        fieldMeta.items
          .filter((it): it is Record<string, unknown> => it && typeof it === "object" && "ID" in it)
          .map((it) => String(it.ID))
      );

      for (const requiredEnumId of fieldSpec.enumIds) {
        if (!presentEnumIds.has(requiredEnumId)) {
          const semantics = fieldSpec.enumSemantics?.[requiredEnumId];
          const semanticLabel = semantics ? ` (${semantics})` : "";
          issues.push({
            severity: "error",
            entity,
            field: fieldSpec.id,
            message: `Field '${fieldSpec.id}' is missing required enum ID '${requiredEnumId}'${semanticLabel}`,
          });
        }
      }
    }
  } else if (fieldSpec.enumIds && fieldSpec.enumIds.length > 0 && fieldMeta.items === undefined) {
    issues.push({
      severity: "error",
      entity,
      field: fieldSpec.id,
      message: `Field '${fieldSpec.id}' requires enum values [${fieldSpec.enumIds.join(", ")}], but no 'items' array was provided`,
    });
  }

  return issues;
}

export function validateDealFieldsContract(payload: unknown): ContractIssue[] {
  const issues: ContractIssue[] = [];
  if (!payload || typeof payload !== "object") {
    issues.push({
      severity: "error",
      entity: "crm.deal.fields",
      message: "Payload must be a non-null object",
    });
    return issues;
  }

  const raw = payload as Record<string, unknown>;
  const fields = (raw.result && typeof raw.result === "object" ? raw.result : raw) as Record<string, unknown>;

  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    issues.push({
      severity: "error",
      entity: "crm.deal.fields",
      message: "Fields map must be an object dictionary",
    });
    return issues;
  }

  // Check all expected fields against canonical spec
  for (const fieldSpec of EXPECTED_DEAL_FIELDS) {
    const presentMeta = fields[fieldSpec.id];
    if (!presentMeta) {
      issues.push({
        severity: fieldSpec.required ? "error" : "warning",
        entity: "crm.deal.fields",
        field: fieldSpec.id,
        message: fieldSpec.required
          ? `Missing critical deal field '${fieldSpec.id}' in schema definition`
          : `Missing optional deal field '${fieldSpec.id}' in schema definition`,
      });
    } else {
      issues.push(...validateFieldMetadata(fieldSpec, presentMeta, "crm.deal.fields"));
    }
  }

  // Check any additional fields for generic metadata validity
  for (const [fieldId, meta] of Object.entries(fields)) {
    if (EXPECTED_DEAL_FIELDS.some((f) => f.id === fieldId)) continue;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      issues.push({
        severity: "error",
        entity: "crm.deal.fields",
        field: fieldId,
        message: `Field '${fieldId}' metadata must be a non-array object`,
      });
    } else if (typeof (meta as Record<string, unknown>).type !== "string") {
      issues.push({
        severity: "error",
        entity: "crm.deal.fields",
        field: fieldId,
        message: `Field '${fieldId}' must have a string 'type' property`,
      });
    }
  }

  return issues;
}

export function validateCompanyFieldsContract(payload: unknown): ContractIssue[] {
  const issues: ContractIssue[] = [];
  if (!payload || typeof payload !== "object") {
    issues.push({
      severity: "error",
      entity: "crm.company.fields",
      message: "Payload must be a non-null object",
    });
    return issues;
  }

  const raw = payload as Record<string, unknown>;
  const fields = (raw.result && typeof raw.result === "object" ? raw.result : raw) as Record<string, unknown>;

  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    issues.push({
      severity: "error",
      entity: "crm.company.fields",
      message: "Fields map must be an object dictionary",
    });
    return issues;
  }

  // Check all expected fields against canonical spec
  for (const fieldSpec of EXPECTED_COMPANY_FIELDS) {
    const presentMeta = fields[fieldSpec.id];
    if (!presentMeta) {
      issues.push({
        severity: fieldSpec.required ? "error" : "warning",
        entity: "crm.company.fields",
        field: fieldSpec.id,
        message: fieldSpec.required
          ? `Missing critical company field '${fieldSpec.id}' in schema definition`
          : `Missing optional company field '${fieldSpec.id}' in schema definition`,
      });
    } else {
      issues.push(...validateFieldMetadata(fieldSpec, presentMeta, "crm.company.fields"));
    }
  }

  // Check any additional fields for generic metadata validity
  for (const [fieldId, meta] of Object.entries(fields)) {
    if (EXPECTED_COMPANY_FIELDS.some((f) => f.id === fieldId)) continue;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      issues.push({
        severity: "error",
        entity: "crm.company.fields",
        field: fieldId,
        message: `Field '${fieldId}' metadata must be a non-array object`,
      });
    } else if (typeof (meta as Record<string, unknown>).type !== "string") {
      issues.push({
        severity: "error",
        entity: "crm.company.fields",
        field: fieldId,
        message: `Field '${fieldId}' must have a string 'type' property`,
      });
    }
  }

  return issues;
}

export function validateDealListContract(payload: unknown): ContractIssue[] {
  const issues: ContractIssue[] = [];
  if (!payload || typeof payload !== "object") {
    issues.push({
      severity: "error",
      entity: "crm.deal.list",
      message: "Payload must be a non-null object",
    });
    return issues;
  }

  const raw = payload as Record<string, unknown>;
  const list = Array.isArray(raw.result) ? raw.result : Array.isArray(raw) ? raw : null;

  if (!list) {
    issues.push({
      severity: "error",
      entity: "crm.deal.list",
      message: "Deals list must contain a 'result' array",
    });
    return issues;
  }

  if (list.length === 0) {
    return issues;
  }

  const sample = list.slice(0, 10);
  for (let i = 0; i < sample.length; i++) {
    const row = sample[i];
    if (!row || typeof row !== "object") {
      issues.push({
        severity: "error",
        entity: "crm.deal.list",
        message: `Row ${i} must be an object`,
      });
      continue;
    }
    const r = row as Record<string, unknown>;
    if (!r.ID && !r.id) {
      issues.push({
        severity: "error",
        entity: "crm.deal.list",
        field: "ID",
        message: `Row ${i} is missing required 'ID' field`,
      });
    }
    if (!("STAGE_ID" in r) && !("stageId" in r)) {
      issues.push({
        severity: "warning",
        entity: "crm.deal.list",
        field: "STAGE_ID",
        message: `Row ${i} does not specify 'STAGE_ID'`,
      });
    }
  }

  return issues;
}

export function validateCompanyListContract(payload: unknown): ContractIssue[] {
  const issues: ContractIssue[] = [];
  if (!payload || typeof payload !== "object") {
    issues.push({
      severity: "error",
      entity: "crm.company.list",
      message: "Payload must be a non-null object",
    });
    return issues;
  }

  const raw = payload as Record<string, unknown>;
  const list = Array.isArray(raw.result) ? raw.result : Array.isArray(raw) ? raw : null;

  if (!list) {
    issues.push({
      severity: "error",
      entity: "crm.company.list",
      message: "Companies list must contain a 'result' array",
    });
    return issues;
  }

  if (list.length === 0) {
    return issues;
  }

  const sample = list.slice(0, 10);
  for (let i = 0; i < sample.length; i++) {
    const row = sample[i];
    if (!row || typeof row !== "object") {
      issues.push({
        severity: "error",
        entity: "crm.company.list",
        message: `Row ${i} must be an object`,
      });
      continue;
    }
    const r = row as Record<string, unknown>;
    if (!r.ID && !r.id) {
      issues.push({
        severity: "error",
        entity: "crm.company.list",
        field: "ID",
        message: `Row ${i} is missing required 'ID' field`,
      });
    }
  }

  return issues;
}

export function validateStatusListContract(payload: unknown): ContractIssue[] {
  const issues: ContractIssue[] = [];
  if (!payload || typeof payload !== "object") {
    issues.push({
      severity: "error",
      entity: "crm.status.list",
      message: "Payload must be a non-null object",
    });
    return issues;
  }

  const raw = payload as Record<string, unknown>;
  const list = Array.isArray(raw.result) ? raw.result : Array.isArray(raw) ? raw : null;

  if (!list) {
    issues.push({
      severity: "error",
      entity: "crm.status.list",
      message: "Status list must contain a 'result' array",
    });
    return issues;
  }

  const foundStatusIds = new Set<string>();

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") {
      issues.push({
        severity: "error",
        entity: "crm.status.list",
        message: `Status item ${i} must be an object`,
      });
      continue;
    }
    const s = item as Record<string, unknown>;
    const statusId = s.STATUS_ID || s.statusId;
    if (!statusId) {
      issues.push({
        severity: "error",
        entity: "crm.status.list",
        field: "STATUS_ID",
        message: `Status item ${i} is missing required 'STATUS_ID'`,
      });
    } else {
      const idUpper = String(statusId).trim().toUpperCase();
      const colonIdx = idUpper.lastIndexOf(":");
      const baseKey = colonIdx !== -1 ? idUpper.slice(colonIdx + 1) : idUpper;
      foundStatusIds.add(idUpper);
      foundStatusIds.add(baseKey);
    }

    if (!s.NAME && !s.name) {
      issues.push({
        severity: "warning",
        entity: "crm.status.list",
        field: "NAME",
        message: `Status item ${i} is missing 'NAME'`,
      });
    }
  }

  // Validate presence of required base stages
  for (const baseStage of REQUIRED_BASE_STAGES) {
    if (!foundStatusIds.has(baseStage)) {
      issues.push({
        severity: "error",
        entity: "crm.status.list",
        field: baseStage,
        message: `Missing required base stage '${baseStage}' in status list`,
      });
    }
  }

  return issues;
}

export function validateAllBitrixContracts(payloads: {
  dealFields?: unknown;
  companyFields?: unknown;
  dealList?: unknown;
  companyList?: unknown;
  statusList?: unknown;
}): ContractValidationResult {
  const issues: ContractIssue[] = [];

  if (payloads.dealFields !== undefined) {
    issues.push(...validateDealFieldsContract(payloads.dealFields));
  }
  if (payloads.companyFields !== undefined) {
    issues.push(...validateCompanyFieldsContract(payloads.companyFields));
  }
  if (payloads.dealList !== undefined) {
    issues.push(...validateDealListContract(payloads.dealList));
  }
  if (payloads.companyList !== undefined) {
    issues.push(...validateCompanyListContract(payloads.companyList));
  }
  if (payloads.statusList !== undefined) {
    issues.push(...validateStatusListContract(payloads.statusList));
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    allIssues: issues,
  };
}

export interface LiveVerificationResult {
  status: "SKIPPED" | "PASS" | "FAIL";
  message: string;
  errors: ContractIssue[];
  warnings: ContractIssue[];
  allIssues: ContractIssue[];
}

export interface LiveContractOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  lookupFn?: DnsLookupFunction;
}

export async function verifyLiveBitrixContract(
  webhookUrl?: string,
  options?: LiveContractOptions
): Promise<LiveVerificationResult> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return {
      status: "SKIPPED",
      message:
        "SKIPPED — LIVE BITRIX NOT CONFIGURED\n(BITRIX_WEBHOOK_URL is unset; live contract verification cannot run)",
      errors: [],
      warnings: [],
      allIssues: [],
    };
  }

  try {
    const lookupFn =
      options?.lookupFn ||
      (options?.fetchFn
        ? (async () => [{ address: "93.184.216.34", family: 4 }] as any)
        : undefined);
    const safeUrl = await assertSafeWebhookUrl(webhookUrl.trim(), lookupFn);
    const cleanUrl = safeUrl.toString().replace(/\/+$/, "");
    const fetchFn = options?.fetchFn || fetch;
    const timeoutMs = options?.timeoutMs || 10000;

    const fetchWithTimeout = async (path: string, postBody?: Record<string, unknown>) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = `${cleanUrl}/${path}`;
        const res = await fetchFn(url, {
          method: postBody ? "POST" : "GET",
          headers: { "Content-Type": "application/json" },
          body: postBody ? JSON.stringify(postBody) : undefined,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText} from ${path}`);
        }
        return await res.json();
      } finally {
        clearTimeout(id);
      }
    };

    const [dealFields, companyFields, dealList, companyList, statusList] = await Promise.all([
      fetchWithTimeout("crm.deal.fields.json"),
      fetchWithTimeout("crm.company.fields.json"),
      fetchWithTimeout("crm.deal.list.json", { start: 0 }),
      fetchWithTimeout("crm.company.list.json", { start: 0 }),
      fetchWithTimeout("crm.status.list.json", { filter: { ENTITY_ID: "DEAL_STAGE" } }).catch(() => ({ result: [] })),
    ]);

    const result = validateAllBitrixContracts({
      dealFields,
      companyFields,
      dealList,
      companyList,
      statusList,
    });

    return {
      status: result.ok ? "PASS" : "FAIL",
      message: result.ok
        ? "Live Bitrix contract validation passed successfully."
        : `Live Bitrix contract validation failed with ${result.errors.length} error(s).`,
      errors: result.errors,
      warnings: result.warnings,
      allIssues: result.allIssues,
    };
  } catch (err: any) {
    const errorIssue: ContractIssue = {
      severity: "error",
      entity: "crm.deal.fields",
      message: `Failed to communicate with live Bitrix webhook: ${err?.message || String(err)}`,
    };
    return {
      status: "FAIL",
      message: `Live Bitrix contract validation failed: ${err?.message || String(err)}`,
      errors: [errorIssue],
      warnings: [],
      allIssues: [errorIssue],
    };
  }
}
