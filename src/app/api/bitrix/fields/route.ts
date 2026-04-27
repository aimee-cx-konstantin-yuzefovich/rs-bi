import { NextResponse } from "next/server";
import { bitrixGet, isSystemField, type BitrixFieldsResponse, type BitrixField } from "@/lib/bitrix";
import { requireAuth, isAuthError } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export interface CleanField {
  id: string;
  title: string;
  type: string;
  isMultiple: boolean;
  isSortable: boolean;
  listValues?: Array<{ ID: string; VALUE: string }>;
}

/**
 * Determine if a field type is sortable
 */
function isSortableType(type: string): boolean {
  const sortableTypes = new Set([
    "string",
    "double",
    "integer",
    "date",
    "datetime",
    "money",
    "enumeration",
    "crm_status",
    "crm_currency",
    "crm_category",
    "boolean",
    "char",
  ]);
  return sortableTypes.has(type);
}

/**
 * Extract human-readable title from Bitrix24 field metadata.
 * Priority: formLabel > listLabel > filterLabel > title > fieldId
 */
function getFieldTitle(fieldId: string, meta: BitrixField): string {
  if (fieldId === "ASSIGNED_BY_ID") return "Ответственный менеджер";
  if (meta.formLabel) return meta.formLabel;
  if (meta.listLabel) return meta.listLabel;
  if (meta.filterLabel) return meta.filterLabel;
  if (meta.title && meta.title !== fieldId) return meta.title;
  return fieldId;
}

export async function GET() {
  // ─── SECURITY: Require authentication ───
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  try {
    const data = await bitrixGet<BitrixFieldsResponse>(
      "crm.deal.fields"
    );

    const fields = data.result;

    // Transform and filter: remove system junk, keep informative fields
    const cleanFields: CleanField[] = [];

    if (fields && typeof fields === "object") {
      for (const [fieldId, fieldMeta] of Object.entries(fields)) {
        // Skip system/internal fields
        if (isSystemField(fieldId, fieldMeta as unknown as Record<string, unknown>)) continue;

        const meta = fieldMeta as BitrixField;
        const title = getFieldTitle(fieldId, meta);

        // Extract list values from items[] (Bitrix24 real format)
        let listValues: Array<{ ID: string; VALUE: string }> | undefined;
        if (Array.isArray(meta.items) && meta.items.length > 0) {
          listValues = meta.items.map((item) => ({
            ID: item.ID,
            VALUE: item.VALUE,
          }));
        }

        cleanFields.push({
          id: fieldId,
          title,
          type: meta.type || "string",
          isMultiple: meta.isMultiple === true || meta.isMultiple === "Y",
          isSortable: isSortableType(meta.type),
          listValues,
        });
      }
    }

    // Fetch company fields to allow selecting company data in the deals table
    try {
      const companyData = await bitrixGet<BitrixFieldsResponse>("crm.company.fields");
      const companyFields = companyData.result;
      if (companyFields && typeof companyFields === "object") {
        for (const [fieldId, fieldMeta] of Object.entries(companyFields)) {
          if (isSystemField(fieldId, fieldMeta as unknown as Record<string, unknown>)) continue;
          
          const meta = fieldMeta as BitrixField;
          const title = getFieldTitle(fieldId, meta);

          let listValues: Array<{ ID: string; VALUE: string }> | undefined;
          if (Array.isArray(meta.items) && meta.items.length > 0) {
            listValues = meta.items.map((item) => ({
              ID: item.ID,
              VALUE: item.VALUE,
            }));
          }

          cleanFields.push({
            id: `COMPANY_${fieldId}`,
            title: `Компания: ${title}`,
            type: meta.type || "string",
            isMultiple: meta.isMultiple === true || meta.isMultiple === "Y",
            isSortable: isSortableType(meta.type),
            listValues,
          });
        }
      }
    } catch (error) {
      console.warn("[Fields API] Failed to fetch company fields, continuing with deal fields only", error);
    }

    // Sort: standard fields first (alphabetically by title), then custom UF_CRM_* fields
    cleanFields.sort((a, b) => {
      const aIsCustom = a.id.startsWith("UF_CRM_") ? 1 : 0;
      const bIsCustom = b.id.startsWith("UF_CRM_") ? 1 : 0;
      if (aIsCustom !== bIsCustom) return aIsCustom - bIsCustom;
      return a.title.localeCompare(b.title, "ru");
    });

    // Inject virtual fields that are available in crm.deal.list but not in crm.deal.fields
    cleanFields.unshift({
      id: "COMPANY_TITLE",
      title: "Наименование компании",
      type: "string",
      isMultiple: false,
      isSortable: true,
    });

    // Inject virtual fields for activities
    cleanFields.push({
      id: "ACTIVITY_LAST",
      title: "Последнее дело",
      type: "string",
      isMultiple: false,
      isSortable: false,
    });
    cleanFields.push({
      id: "ACTIVITY_NEXT",
      title: "Следующий шаг",
      type: "string",
      isMultiple: false,
      isSortable: false,
    });

    return NextResponse.json({
      success: true,
      fields: cleanFields,
      total: cleanFields.length,
    });
  } catch (error) {
    console.error("[Fields API Error]", error);

    // Return sanitized error — don't expose internal details
    const message = error instanceof Error && error.message.includes("not configured")
      ? error.message
      : "Failed to fetch field metadata. Please try again later.";

    return NextResponse.json(
      {
        success: false,
        error: message,
        fields: [],
        total: 0,
      },
      { status: 500 }
    );
  }
}
