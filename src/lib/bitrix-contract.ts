// src/lib/bitrix-contract.ts
// ─────────────────────────────────────────────────────────────────────
// Upstream schema and contract validator for Bitrix24 REST API payloads.
// Validates field shapes, required critical CRM properties, and list structures.
// ─────────────────────────────────────────────────────────────────────

import {
  COMPANY_SAMPLES_FIELD_ID,
  DEAL_SAMPLE_TRANSFER_FIELD_ID,
  DEAL_SAMPLE_TESTING_FIELD_ID,
} from "./crm-constants";

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

const CRITICAL_DEAL_FIELDS = [
  "ID",
  "STAGE_ID",
  "OPPORTUNITY",
  "CURRENCY_ID",
  "ASSIGNED_BY_ID",
  "COMPANY_ID",
];

const CRITICAL_COMPANY_FIELDS = [
  "ID",
  "TITLE",
  "ASSIGNED_BY_ID",
];

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

  for (const fieldId of CRITICAL_DEAL_FIELDS) {
    if (!fields[fieldId]) {
      issues.push({
        severity: "error",
        entity: "crm.deal.fields",
        field: fieldId,
        message: `Missing critical deal field '${fieldId}' in schema definition`,
      });
    }
  }

  // Check custom sample fields
  if (!fields[DEAL_SAMPLE_TRANSFER_FIELD_ID]) {
    issues.push({
      severity: "warning",
      entity: "crm.deal.fields",
      field: DEAL_SAMPLE_TRANSFER_FIELD_ID,
      message: `Custom sample transfer field '${DEAL_SAMPLE_TRANSFER_FIELD_ID}' is missing in deal fields`,
    });
  }

  if (!fields[DEAL_SAMPLE_TESTING_FIELD_ID]) {
    issues.push({
      severity: "warning",
      entity: "crm.deal.fields",
      field: DEAL_SAMPLE_TESTING_FIELD_ID,
      message: `Custom sample testing field '${DEAL_SAMPLE_TESTING_FIELD_ID}' is missing in deal fields`,
    });
  }

  // Validate structure of present fields
  for (const [fieldId, meta] of Object.entries(fields)) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      issues.push({
        severity: "error",
        entity: "crm.deal.fields",
        field: fieldId,
        message: `Field '${fieldId}' metadata must be an object`,
      });
      continue;
    }

    const fieldMeta = meta as Record<string, unknown>;
    if (typeof fieldMeta.type !== "string") {
      issues.push({
        severity: "error",
        entity: "crm.deal.fields",
        field: fieldId,
        message: `Field '${fieldId}' must have a string 'type' property`,
      });
    }

    if (fieldMeta.items !== undefined && !Array.isArray(fieldMeta.items)) {
      issues.push({
        severity: "error",
        entity: "crm.deal.fields",
        field: fieldId,
        message: `Field '${fieldId}' property 'items' must be an array when present`,
      });
    } else if (Array.isArray(fieldMeta.items)) {
      for (let idx = 0; idx < fieldMeta.items.length; idx++) {
        const item = fieldMeta.items[idx];
        if (!item || typeof item !== "object" || !("ID" in item) || !("VALUE" in item)) {
          issues.push({
            severity: "error",
            entity: "crm.deal.fields",
            field: fieldId,
            message: `Field '${fieldId}' items[${idx}] must contain 'ID' and 'VALUE'`,
          });
          break;
        }
      }
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

  for (const fieldId of CRITICAL_COMPANY_FIELDS) {
    if (!fields[fieldId]) {
      issues.push({
        severity: "error",
        entity: "crm.company.fields",
        field: fieldId,
        message: `Missing critical company field '${fieldId}' in schema definition`,
      });
    }
  }

  if (!fields[COMPANY_SAMPLES_FIELD_ID]) {
    issues.push({
      severity: "warning",
      entity: "crm.company.fields",
      field: COMPANY_SAMPLES_FIELD_ID,
      message: `Custom company samples field '${COMPANY_SAMPLES_FIELD_ID}' is missing in company fields`,
    });
  }

  for (const [fieldId, meta] of Object.entries(fields)) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      issues.push({
        severity: "error",
        entity: "crm.company.fields",
        field: fieldId,
        message: `Field '${fieldId}' metadata must be an object`,
      });
      continue;
    }
    const fieldMeta = meta as Record<string, unknown>;
    if (typeof fieldMeta.type !== "string") {
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
    if (!s.STATUS_ID && !s.statusId) {
      issues.push({
        severity: "error",
        entity: "crm.status.list",
        field: "STATUS_ID",
        message: `Status item ${i} is missing required 'STATUS_ID'`,
      });
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
