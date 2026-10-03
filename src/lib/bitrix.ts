/**
 * Bitrix24 CRM API Helper
 * All requests go through the backend — webhook URL is NEVER exposed to the frontend.
 *
 * Security measures:
 * - Method allowlist: only known Bitrix24 CRM API methods are permitted
 * - Input sanitization: all parameters are validated before forwarding
 * - Error sanitization: raw API errors are logged server-side only, generic errors returned to client
 */

/**
 * Allowed Bitrix24 API methods (allowlist to prevent SSRF)
 */
const ALLOWED_METHODS = new Set([
  "crm.deal.fields",
  "crm.deal.list",
  "crm.deal.get",
  "crm.company.fields",
  "crm.company.list",
  "crm.company.get",
  "crm.item.fields",
  "crm.item.get",
  "crm.item.list",
  "crm.activity.list",
  "crm.stage.list",
  "crm.status.list",
  "crm.currency.list",
  "crm.category.list",
  "user.get",
  "user.search",
]);

import { assertSafeWebhookUrl } from "@/lib/network-safety";

/**
 * Build full Bitrix24 API URL from a method path.
 * Validates method against allowlist and webhook endpoint against SSRF safety rules.
 */
async function buildUrl(method: string): Promise<string> {
  const WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL;
  
  if (!WEBHOOK_URL) {
    throw new Error("CRM integration is not configured.");
  }

  // Validate method against allowlist
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(`Invalid API method: ${method}`);
  }

  const safeUrl = await assertSafeWebhookUrl(WEBHOOK_URL);
  const base = safeUrl.toString().replace(/\/+$/, "");
  return `${base}/${method}`;
}

/**
 * Sanitize error for client — removes internal details.
 * Full error is logged server-side only.
 */
function sanitizeError(error: unknown, context: string): Error {
  // Log full error server-side
  console.error(`[Bitrix24 ${context} Error]`, error);

  // Return generic error to client
  if (error instanceof Error) {
    // Check for specific safe error types we can expose
    if (error.message.includes("not configured")) {
      return new Error("CRM integration is not configured. Contact your administrator.");
    }
    if (error.message.includes("Invalid API method")) {
      return new Error("Invalid request parameters.");
    }
  }

  return new Error(`Failed to ${context.toLowerCase()}. Please try again later.`);
}

/**
 * Generic GET request to Bitrix24 REST API
 */
export async function bitrixGet<T = unknown>(
  method: string,
  params?: Record<string, string | number | boolean>
): Promise<T> {
  return retryTransient<T>(() => doGet<T>(method, params), method, () =>
    sanitizeError(new Error("exhausted"), method)
  );
}

async function doGet<T = unknown>(
  method: string,
  params?: Record<string, string | number | boolean>
): Promise<T> {
  try {
    const url = new URL(await buildUrl(method));
    if (params) {
      // Sanitize parameter keys — only allow safe characters
      Object.entries(params).forEach(([key, value]) => {
        // Prevent injection via parameter keys
        if (!/^[a-zA-Z0-9_>=<\[\]@%!]+$/.test(key)) {
          console.warn(`[Bitrix24] Rejected invalid param key: ${key}`);
          return;
        }
        url.searchParams.set(key, String(value));
      });
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 0 },
      redirect: "error", // Prevent HTTP redirect SSRF bypasses
      signal: AbortSignal.timeout(15_000), // 15s timeout to prevent hanging requests (DoS)
    });

    if (!response.ok) {
      throw new BitrixTransientError(
        `API returned status ${response.status}`,
        response.status
      );
    }

    const data = await response.json();

    if (data.error) {
      // SECURITY: Log sanitized error server-side only.
      // Do NOT log full error_description — it may contain internal URLs or tokens.
      console.error(`[Bitrix24 API Error] Method: ${method}, Error: ${data.error}`);
      throw new Error(`API request failed`);
    }

    return data as T;
  } catch (error) {
    if (error instanceof BitrixTransientError) throw error;
    if (error instanceof SyntaxError) {
      throw new BitrixTransientError("Malformed JSON response", undefined, error);
    }
    // Preserve native transport exceptions for retry classification: wrap
    // instead of sanitizing. Unknown shapes propagate unclassified (fail-closed).
    const transport = asTransientTransportError(error);
    if (transport) throw transport;
    throw error;
  }
}

/**
 * Only the safe, actionable failures needed by company previews.
 */
export class BitrixItemError extends Error {
  constructor(public readonly code: "NOT_FOUND" | "ACCESS_DENIED") {
    super(code === "NOT_FOUND" ? "Company not found." : "Company access denied.");
  }
}

/**
 * Transient transport failure carrying the HTTP status when available.
 * Used to drive the shared bounded retry strategy — never surfaced to clients.
 */
export class BitrixTransientError extends Error {
  constructor(message: string, public readonly status?: number, public readonly cause?: unknown) {
    super(message);
  }
}

export const BITRIX_POST_TIMEOUT_MS = 60_000;

// ─── Shared bounded transient-retry strategy ───────────────────────────
// One shared retry policy for all Bitrix transport calls (list pagination
// middle pages, metadata, per-entity gets).
//
// RETRY (transient): HTTP 429, HTTP 500, HTTP 503, timeouts / AbortError,
// clear transport errors (network failures, non-actionable server responses).
//
// NEVER RETRY (deterministic): unconfigured webhook / invalid method
// (request-contract validation), BitrixItemError (NOT_FOUND / ACCESS_DENIED),
// auth/access errors (401/403), client validation (400), API-level error
// payloads (Bitrix auth/access/permission errors), corrupted response
// envelopes that indicate deterministic data/schema issues.
// ───────────────────────────────────────────────────────────────────────

const RETRY_MAX_ATTEMPTS = 3; // 1 initial + 2 bounded retries — no storms
const RETRY_DELAYS_MS =
  process.env.NODE_ENV === "test" || process.env.VITEST ? [5, 10] : [500, 1500];

function isTransientFailure(error: unknown): boolean {
  if (error instanceof BitrixTransientError) {
    // 429 (rate limit), 503 (service unavailable) and 500 (server-side
    // internal error) are transient Bitrix server failures; bounded retry
    // applies. 400/401/403/404 remain deterministic and NEVER retried.
    if (error.status === 429 || error.status === 503 || error.status === 500) return true;
    // Blanket status codes are intentional: 400/401/403/404 are deterministic.
    if (error.status !== undefined) return false;
    // Status-less BitrixTransientError = unclassified transport failure
    // (timeouts / network errors) — transient.
    return true;
  }
  if (error instanceof BitrixItemError) return false;
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("not configured") || msg.includes("Invalid API method")) return false;
    if (msg.includes("AbortError") || msg.includes("TimeoutError")) return true;
    if (msg.includes("timeout") || msg.includes("timed out")) return true;
    if (msg.includes("fetch failed") || msg.includes("network")) return true;
    if (msg.includes("terminated") || msg.includes("ECONNRESET") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT")) return true;
    return false;
  }
  // Unknown non-Error throw needs a stable shape; classification never retries
  // blindly with unbounded attempts, so unknown shapes fail fast (fail-closed).
  return false;
}

function classifyDeterministicError(error: unknown, method: string): never {
  if (error instanceof BitrixTransientError) {
    // Deterministic statuses surface as generic integration failures.
    if (error.status !== undefined) {
      console.error(`[Bitrix24] Deterministic failure (status ${error.status}); not retrying`, {
        status: error.status,
        attemptsReached: true,
      });
    }
    throw error;
  }
  // Unknown deterministic shapes are sanitized only here — after retry
  // classification — keeping the credential-safe client envelope contract.
  finalSanitizeOrThrow(error, method);
}

function isCredentialSafePayload(error: unknown): string {
  // Only class names and statuses are ever logged — never URLs or tokens.
  if (error instanceof BitrixTransientError) {
    return error.status !== undefined ? `status ${error.status}` : "transport timeout/network";
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Credential-safe final failure envelope for non-transient unknown errors.
 * Applied only AFTER retry classification — never before. Special-cased
 * safe messages (not configured / invalid method) pass through their
 * client-safe forms; everything else gets the generic sanitized fallback.
 */
function finalSanitizeOrThrow(error: unknown, method: string): never {
  if (error instanceof BitrixItemError) throw error;
  if (error instanceof BitrixTransientError) throw error;
  throw sanitizeError(error, method);
}

/**
 * Preserves/classifies a native transport exception so the shared retry
 * layer decides — raw transport exceptions are never sanitized ahead of
 * retry classification. Checks the error itself and nested `cause` levels
 * (Node wraps network failures, e.g. `TypeError: fetch failed` with
 * `cause.code = ECONNRESET`; undici wraps timeouts with a TimeoutError cause).
 */
function isTransportException(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    const name = current.name ?? "";
    const code = (current as NodeJS.ErrnoException).code ?? "";
    const msg = current.message ?? "";
    if (name === "AbortError" || name === "TimeoutError") return true;
    if (code === "ECONNRESET" || code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "EAI_AGAIN" || code === "EPIPE") return true;
    const lower = msg.toLowerCase();
    if (
      lower.includes("timeout") ||
      lower.includes("timed out") ||
      lower.includes("fetch failed") ||
      lower.includes("network") ||
      lower.includes("terminated") ||
      lower.includes("socket hang up") ||
      msg.includes("ECONNRESET") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ETIMEDOUT")
    ) {
      return true;
    }
    current = (current as Error & { cause?: unknown }).cause;
  }
  return false;
}

function asTransientTransportError(error: unknown): BitrixTransientError | null {
  if (isTransportException(error)) {
    return new BitrixTransientError("Bitrix transport failure (timeout/network)", undefined, error);
  }
  return null;
}

/**
 * One shared bounded retry strategy for transient Bitrix transport failures.
 * Exponential backoff + small jitter, bounded attempts (no retry storms).
 * On exhaustion the last transient error goes through the safe client
 * sanitizer — raw statuses/errors never surface and failures stay truthful.
 */
async function retryTransient<T>(
  op: () => Promise<T>,
  method: string,
  fallbackError: () => Error
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    try {
      return await op();
    } catch (error) {
      const durationMs = Date.now() - t0;
      // Deterministic failures propagate immediately (no retry, no masking).
      if (error instanceof BitrixItemError) throw error;
      if (!isTransientFailure(error)) {
        classifyDeterministicError(error, method);
        // Not reached — classifyDeterministicError always throws.
      }
      lastError = error;
      if (attempt < RETRY_MAX_ATTEMPTS) {
        const base = RETRY_DELAYS_MS[attempt - 1] ?? 1500;
        const jitter = base * 0.15 * Math.random(); // ≤15% jitter
        console.warn(`[Bitrix24] Transient failure, retrying (${attempt}/${RETRY_MAX_ATTEMPTS})`, {
          method,
          attempt,
          durationMs,
          reason: isCredentialSafePayload(error),
        });
        await new Promise((resolve) => setTimeout(resolve, Math.round(base + jitter)));
      }
    }
  }
  // Retry exhaustion: log truthfully, throw the safe sanitized error.
  console.error(`[Bitrix24] Retries exhausted (${RETRY_MAX_ATTEMPTS} attempts)`, {
    method,
    attempts: RETRY_MAX_ATTEMPTS,
    reason: isCredentialSafePayload(lastError),
  });
  throw fallbackError();
}

/**
 * Generic POST request to Bitrix24 REST API.
 * Body parameters are validated and sanitized before forwarding.
 * Transient transport failures (429/503/timeouts/network) are retried
 * with one shared bounded strategy; deterministic errors fail closed.
 */
export async function bitrixPost<T = unknown>(
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  return retryTransient<T>(() => doPost<T>(method, body), method, () =>
    sanitizeError(new Error("exhausted"), method)
  );
}

async function doPost<T = unknown>(
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  try {
    const url = await buildUrl(method);

    // Sanitize body — remove any keys that look suspicious
    const sanitizedBody: Record<string, unknown> = {};
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        // Skip suspicious keys (prototype pollution protection)
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        // Validate key format — only allow safe characters
        if (!/^[a-zA-Z0-9_>=<\[\]@%!]+$/.test(key)) {
          console.warn(`[Bitrix24] Rejected invalid body key: ${key}`);
          continue;
        }
        sanitizedBody[key] = value;
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: Object.keys(sanitizedBody).length > 0 ? JSON.stringify(sanitizedBody) : undefined,
      redirect: "error", // Prevent HTTP redirect SSRF bypasses
      signal: AbortSignal.timeout(BITRIX_POST_TIMEOUT_MS), // 60s timeout for POST
    });

    // Universal CRM item-level errors are documented as HTTP 400. Restrict
    // the special mapping to that status so system-level 403 ACCESS_DENIED
    // remains a generic integration failure instead of a company permission error.
    if (method === "crm.item.get") {
      let data: { error?: string };
      try {
        data = (await response.json()) as { error?: string };
      } catch (parseError) {
        // Corrupted / non-JSON envelope: transient verdicts (429/503 etc.)
        // MUST reach the shared retry path — preserve the HTTP status.
        if (!response.ok) {
          throw new BitrixTransientError(
            `API returned status ${response.status}`,
            response.status,
            parseError
          );
        }
        throw new BitrixTransientError("Malformed JSON response", undefined, parseError);
      }
      if (response.status === 400 && (data.error === "NOT_FOUND" || data.error === "ACCESS_DENIED")) {
        throw new BitrixItemError(data.error);
      }
      if (!response.ok) {
        // 429/503 and other non-deterministic statuses use the SHARED retry
        // path — never prematurely classified as deterministic item failures.
        throw new BitrixTransientError(
          `API returned status ${response.status}`,
          response.status
        );
      }
      if (data.error) throw new Error("API request failed");
      return data as T;
    }

    if (!response.ok) {
      throw new BitrixTransientError(
        `API returned status ${response.status}`,
        response.status
      );
    }

    const data = await response.json();

    if (data.error) {
      // SECURITY: Log sanitized error server-side only.
      // Do NOT log full error_description — it may contain internal URLs or tokens.
      console.error(`[Bitrix24 API Error] Method: ${method}, Error: ${data.error}`);
      throw new Error(`API request failed`);
    }

    return data as T;
  } catch (error) {
    if (error instanceof BitrixItemError) throw error;
    if (error instanceof BitrixTransientError) throw error;
    if (error instanceof SyntaxError) {
      // Malformed JSON may indicate transient truncation; bounded retry applies
      // (schema/material corruption surfaces truthfully after exhaustion).
      throw new BitrixTransientError("Malformed JSON response", undefined, error);
    }
    // Preserve native transport exceptions for retry classification: wrap
    // instead of sanitizing. Unknown shapes propagate unclassified (fail-closed).
    const transport = asTransientTransportError(error);
    if (transport) throw transport;
    throw error;
  }
}

/**
 * System fields to EXCLUDE from the column selector.
 * Based on real Bitrix24 CRM deal fields schema — these are internal IDs,
 * system metadata, UTM tracking, and other non-informative fields.
 */
export const SYSTEM_FIELDS_TO_EXCLUDE = new Set([
  // Internal IDs — never useful for business users
  "ID",
  "MOVED_BY_ID",
  "MODIFY_BY_ID",
  "CREATED_BY_ID",
  "LEAD_ID",
  "COMPANY_ID",
  "CONTACT_ID",
  "CONTACT_IDS",
  "QUOTE_ID",
  "MYCOMPANY_ID",
  "PARENT_ID_1032", // Historical / Deal-side parent link is absent in live schema; SP links via parentId2
  "ORIGINATOR_ID",
  "ORIGIN_ID",

  // System metadata / internal flags
  "IS_NEW",
  "IS_RECURRING",
  "IS_RETURN_CUSTOMER",
  "IS_REPEATED_APPROACH",
  "IS_MANUAL_OPPORTUNITY",
  "STAGE_SEMANTIC_ID",
  "PREVIOUS_STAGE_ID",
  "PROBABILITY",
  "OPENED",
  "CLOSED",
  "ADDITIONAL_INFO",
  "LOCATION_ID",
  "MOVED_TIME",
  "LAST_COMMUNICATION_TIME",

  // UTM tracking — not informative for BI
  "UTM_SOURCE",
  "UTM_MEDIUM",
  "UTM_CAMPAIGN",
  "UTM_CONTENT",
  "UTM_TERM",

  // Source descriptions — usually empty or noise
  "SOURCE_DESCRIPTION",
  "SEARCH_INDEX",

  // Explicitly requested to be removed from UI
  "TITLE",
  "TAX_VALUE",
  "UF_CRM_692573380C4F0",
  "UF_CRM_1774878993375",
  "UF_CRM_6915D8C25162A",
  "UF_CRM_69257337E7E9B",
  "UF_CRM_1774878835644",
]);

/**
 * Fields only hidden for DEALS — the same underlying Bitrix field exists on
 * companies too, but is wanted there (e.g. "Дата создания"/"Последняя
 * активность" columns in the Companies browser).
 */
const DEAL_ONLY_SYSTEM_FIELDS = new Set(["DATE_CREATE", "LAST_ACTIVITY_TIME", "LAST_ACTIVITY_BY"]);

/**
 * Check if a field is a system/internal field that should be hidden.
 * Uses both the explicit set and pattern matching for *_ID fields.
 * `entity` distinguishes deal fields from company fields, since a small
 * number of fields (see DEAL_ONLY_SYSTEM_FIELDS) are only noise on deals.
 */
export function isSystemField(
  fieldId: string,
  fieldMeta?: Record<string, unknown>,
  entity: "deal" | "company" = "deal"
): boolean {
  // Explicitly excluded fields (checked first so we can exclude specific UF_CRM_* fields)
  if (SYSTEM_FIELDS_TO_EXCLUDE.has(fieldId)) return true;
  if (entity === "deal" && DEAL_ONLY_SYSTEM_FIELDS.has(fieldId)) return true;

  // Custom fields (UF_CRM_*) are NEVER system fields — always keep them (unless explicitly excluded above)
  if (fieldId.startsWith("UF_CRM_")) return false;

  // Fields ending with _ID that are not custom — these are internal references
  if (fieldId.endsWith("_ID") && !fieldId.startsWith("UF_")) return true;

  // Read-only internal fields with no useful title (title matches field ID)
  if (fieldMeta) {
    const title = fieldMeta.title as string | undefined;
    // Bitrix24 returns isReadOnly as "Y"/"N" or true/false — handle both
    const isReadOnly = fieldMeta.isReadOnly === true || fieldMeta.isReadOnly === "Y";
    if (title && title === fieldId && isReadOnly) {
      return true;
    }
  }

  // File fields — not displayable in table
  if (fieldMeta?.type === "file") return true;

  return false;
}

/**
 * Bitrix24 field metadata type (real API response format)
 */
export interface BitrixField {
  type: string;
  isRequired: boolean | string;
  isReadOnly: boolean | string;
  isImmutable: boolean | string;
  isMultiple: boolean | string;
  isDynamic: boolean | string;
  title: string;
  listLabel?: string;
  formLabel?: string;
  filterLabel?: string;
  statusType?: string;
  items?: Array<{ ID: string; VALUE: string }>;
  settings?: Record<string, unknown>;
  isDeprecated?: boolean;
}

/**
 * Bitrix24 deal type
 */
export interface BitrixDeal {
  [key: string]: string | string[] | number | null;
}

/**
 * Bitrix24 fields API response — returns object with field IDs as keys
 */
export interface BitrixFieldsResponse {
  result: Record<string, BitrixField>;
}

/**
 * Bitrix24 deals list API response
 */
export interface BitrixDealsResponse {
  result: BitrixDeal[];
  next?: number;
  total?: number;
}
