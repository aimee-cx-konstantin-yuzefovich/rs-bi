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
  "crm.activity.list",
  "crm.stage.list",
  "crm.status.list",
  "crm.currency.list",
  "crm.category.list",
  "user.get",
  "user.search",
]);

/**
 * Check if a hostname falls within the 172.16.0.0/12 private range (RFC 1918).
 * This covers 172.16.x.x through 172.31.x.x — the previous code only checked 172.16.*
 */
function is172PrivateRange(hostname: string): boolean {
  // Match 172.X.X.X pattern
  const match = /^172\.(\d{1,3})\./.exec(hostname);
  if (!match) return false;
  const secondOctet = parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

/**
 * Build full Bitrix24 API URL from a method path.
 * Validates method against allowlist to prevent SSRF.
 */
function buildUrl(method: string): string {
  const WEBHOOK_URL = process.env.BITRIX_WEBHOOK_URL;
  
  if (!WEBHOOK_URL) {
    throw new Error("CRM integration is not configured.");
  }

  // Validate method against allowlist
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(`Invalid API method: ${method}`);
  }

  // Validate webhook URL format
  const base = WEBHOOK_URL.replace(/\/+$/, "");
  
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== 'https:') {
      throw new Error("Webhook URL must use HTTPS");
    }
    
    const hostname = parsed.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0';
    const isAwsMetadata = hostname === '169.254.169.254';
    const isPrivate = hostname.startsWith('10.') || hostname.startsWith('192.168.') || is172PrivateRange(hostname);

    if (isLocalhost || isAwsMetadata || isPrivate) {
      throw new Error("Webhook URL cannot point to private IP ranges or localhost");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("Webhook URL")) {
      throw e;
    }
    throw new Error("Invalid webhook URL format");
  }

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
  try {
    const url = new URL(buildUrl(method));
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
      signal: AbortSignal.timeout(15_000), // 15s timeout to prevent hanging requests (DoS)
    });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
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
    throw sanitizeError(error, method);
  }
}

/**
 * Generic POST request to Bitrix24 REST API.
 * Body parameters are validated and sanitized before forwarding.
 */
export async function bitrixPost<T = unknown>(
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  try {
    const url = buildUrl(method);

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
      signal: AbortSignal.timeout(30_000), // 30s timeout for POST (may need longer for pagination)
    });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
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
    throw sanitizeError(error, method);
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
  "PARENT_ID_1032",
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
  "LAST_ACTIVITY_TIME",
  "LAST_ACTIVITY_BY",
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
  "DATE_CREATE",
  "TITLE",
  "TAX_VALUE",
  "UF_CRM_692573380C4F0",
  "UF_CRM_1774878993375",
  "UF_CRM_6915D8C25162A",
  "UF_CRM_69257337E7E9B",
  "UF_CRM_1774878835644",
]);

/**
 * Check if a field is a system/internal field that should be hidden.
 * Uses both the explicit set and pattern matching for *_ID fields.
 */
export function isSystemField(fieldId: string, fieldMeta?: Record<string, unknown>): boolean {
  // Explicitly excluded fields (checked first so we can exclude specific UF_CRM_* fields)
  if (SYSTEM_FIELDS_TO_EXCLUDE.has(fieldId)) return true;

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
