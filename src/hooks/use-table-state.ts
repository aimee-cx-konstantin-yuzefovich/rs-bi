import { useMemo, useCallback } from "react";
import { useDashboardStore, type DealData } from "@/store/dashboard-store";

export function useTableState() {
  const {
    deals,
    fields,
    selectedColumns,
    searchQuery,
    columnSort,
    columnFilters,
    userNames,
    companiesData,
    activitiesData,
  } = useDashboardStore();

  const fieldMap = useMemo(
    () => new Map(fields.map((f) => [f.id, f])),
    [fields]
  );

  const resolveValue = useCallback(
    (deal: DealData, colId: string): string => {
      const raw = deal[colId];
      const field = fieldMap.get(colId);

      if (raw === null || raw === undefined || raw === "") return "";

      if (colId === "ASSIGNED_BY_ID") {
        const id = String(raw);
        return userNames[id] || `ID ${id}`;
      }

      if (colId === "ACTIVITY_LAST" || colId === "ACTIVITY_NEXT") {
        const dealId = String(deal.ID || deal.id || "");
        if (!dealId || !activitiesData[dealId]) return "";
        
        const activity = colId === "ACTIVITY_LAST" ? activitiesData[dealId].last : activitiesData[dealId].next;
        if (!activity) return "";

        const dateStr = activity.DEADLINE || activity.CREATED;
        const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : "";
        
        const text = activity.DESCRIPTION ? `${activity.SUBJECT} — ${activity.DESCRIPTION}` : activity.SUBJECT;
        const cleanText = text.replace(/<[^>]*>?/gm, '');
        
        return `${formattedDate ? formattedDate + ": " : ""}${cleanText}`;
      }

      if (colId.startsWith("COMPANY_")) {
        let companyFieldId = colId.replace("COMPANY_", "");
        if (companyFieldId === "ID") companyFieldId = "TITLE";

        if (companyFieldId === "TITLE" && deal.COMPANY_TITLE) {
          return String(deal.COMPANY_TITLE);
        }

        const companyId = String(deal.COMPANY_ID || "");
        if (!companyId) return "";
        
        const company = companiesData[companyId];
        
        if (!company) {
          if (companyFieldId === "TITLE") return `ID ${companyId}`;
          return "";
        }
        
        const rawCompanyVal = company[companyFieldId];
        
        if (rawCompanyVal === null || rawCompanyVal === undefined || rawCompanyVal === "") {
          if (companyFieldId === "TITLE") return `ID ${companyId}`;
          return "";
        }
        
        if (field?.listValues && rawCompanyVal) {
          if (Array.isArray(rawCompanyVal)) {
            return rawCompanyVal
              .map((v) => {
                const listVal = field.listValues?.find((lv) => lv.ID === String(v));
                return listVal?.VALUE || String(v);
              })
              .join(", ");
          }
          const val = String(rawCompanyVal);
          const listVal = field.listValues.find((lv) => lv.ID === val);
          if (listVal) return listVal.VALUE;
        }

        if (Array.isArray(rawCompanyVal)) {
          return rawCompanyVal.join(", ");
        }

        return String(rawCompanyVal);
      }

      if (field?.listValues && raw) {
        if (Array.isArray(raw)) {
          return raw
            .map((v) => {
              const listVal = field.listValues?.find((lv) => lv.ID === String(v));
              return listVal?.VALUE || String(v);
            })
            .join(", ");
        }
        const val = String(raw);
        const listVal = field.listValues.find((lv) => lv.ID === val);
        if (listVal) return listVal.VALUE;
      }

      if (Array.isArray(raw)) {
        return raw.join(", ");
      }

      return String(raw);
    },
    [fieldMap, userNames, companiesData, activitiesData]
  );

  const getSortValue = useCallback(
    (deal: DealData, colId: string): string | number => {
      const field = fieldMap.get(colId);
      const raw = deal[colId];

      if (raw === null || raw === undefined || raw === "") return "";

      if (
        field?.type === "double" ||
        field?.type === "integer" ||
        field?.type === "money"
      ) {
        const num = parseFloat(String(raw));
        return isNaN(num) ? 0 : num;
      }

      if (field?.type === "date" || field?.type === "datetime") {
        const d = new Date(String(raw));
        return isNaN(d.getTime()) ? 0 : d.getTime();
      }

      if (field?.listValues && raw) {
        return resolveValue(deal, colId);
      }

      if (colId === "ASSIGNED_BY_ID") {
        return resolveValue(deal, colId).toLowerCase();
      }

      if (colId.startsWith("COMPANY_")) {
        return resolveValue(deal, colId).toLowerCase();
      }

      return String(raw).toLowerCase();
    },
    [fieldMap, resolveValue]
  );

  const searchedDeals = useMemo(() => {
    if (!searchQuery.trim()) return deals;
    const q = searchQuery.toLowerCase();
    return deals.filter((deal) => {
      const assignedById = String(deal.ASSIGNED_BY_ID || "");
      if (assignedById && userNames[assignedById]) {
        if (userNames[assignedById].toLowerCase().includes(q)) return true;
      }

      const companyId = String(deal.COMPANY_ID || "");
      if (companyId) {
        const companyName = companiesData[companyId]?.TITLE || `ID ${companyId}`;
        if (companyName.toLowerCase().includes(q)) return true;
      }

      return Object.entries(deal).some(([key, val]) => {
        const resolved = resolveValue(deal, key);
        return resolved.toLowerCase().includes(q);
      });
    });
  }, [deals, searchQuery, resolveValue, userNames, companiesData]);

  const filteredDeals = useMemo(() => {
    if (columnFilters.length === 0) return searchedDeals;

    return searchedDeals.filter((deal) =>
      columnFilters.every((filter) => {
        if (!filter.value.trim()) return true;
        const resolved = resolveValue(deal, filter.columnId);
        return resolved.toLowerCase().includes(filter.value.toLowerCase());
      })
    );
  }, [searchedDeals, columnFilters, resolveValue]);

  const sortedDeals = useMemo(() => {
    if (!columnSort.direction || !columnSort.columnId) return filteredDeals;

    const colId = columnSort.columnId;
    const dir = columnSort.direction === "asc" ? 1 : -1;

    return [...filteredDeals].sort((a, b) => {
      const aVal = getSortValue(a, colId);
      const bVal = getSortValue(b, colId);

      if (typeof aVal === "number" && typeof bVal === "number") {
        return (aVal - bVal) * dir;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);
      return aStr.localeCompare(bStr, "ru") * dir;
    });
  }, [filteredDeals, columnSort, getSortValue]);

  const columns = useMemo(() => {
    if (selectedColumns.length > 0 && fields.length > 0) {
      return selectedColumns.filter((colId) => fieldMap.has(colId));
    }
    if (selectedColumns.length > 0) {
      return selectedColumns;
    }
    if (deals.length > 0) {
      return Object.keys(deals[0]).slice(0, 8);
    }
    return [];
  }, [selectedColumns, fields.length, fieldMap, deals]);

  return {
    fieldMap,
    resolveValue,
    getSortValue,
    searchedDeals,
    filteredDeals,
    sortedDeals,
    columns,
  };
}
