import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEMO_FIELDS, generateDemoDeals } from "@/lib/demo-data";

// ─── Client-side fetch timeout (prevents infinite loading spinner) ───
// Server-side bitrix helpers already have 15s/30s timeouts,
// but the client→server fetch had NO timeout — if the API hangs,
// the user sees a forever-spinning loader.
const CLIENT_FETCH_TIMEOUT_MS = 30_000; // 30 seconds

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
  });
}

export interface FieldInfo {
  id: string;
  title: string;
  type: string;
  isMultiple: boolean;
  isSortable: boolean;
  listValues?: Array<{ ID: string; VALUE: string }>;
}

export type DateFilterPreset =
  | "all"
  | "7days"
  | "14days"
  | "30days"
  | "90days"
  | "custom";

export interface DateFilter {
  preset: DateFilterPreset;
  customFrom?: string;
  customTo?: string;
}

export type SortDirection = "asc" | "desc" | null;

export interface ColumnSort {
  columnId: string;
  direction: SortDirection;
}

export interface ColumnFilter {
  columnId: string;
  value: string;
}

export interface DealData {
  [key: string]: string | string[] | number | null;
}

export interface SavedView {
  id: string;
  name: string;
  dateFilter: DateFilter;
  pipelineFilter: string;
  responsibleFilter: string;
  selectedColumns: string[];
  columnSort: ColumnSort;
  createdAt: number;
}

interface DashboardState {
  // Configuration
  isConfigured: boolean | null;
  isDemoMode: boolean;

  // Fields
  fields: FieldInfo[];
  fieldsLoading: boolean;
  fieldsError: string | null;

  // Selected columns
  selectedColumns: string[];
  columnSelectorOpen: boolean;

  // Deals
  deals: DealData[];
  allDeals: DealData[];
  dealsLoading: boolean;
  dealsError: string | null;
  dealsTotal: number;

  // Date filter
  dateFilter: DateFilter;

  // Search
  searchQuery: string;

  // Column sorting
  columnSort: ColumnSort;

  // Column filters
  columnFilters: ColumnFilter[];

  // Pagination
  currentPage: number;
  pageSize: number;

  // New state fields for header features
  lastSyncAt: number | null;
  lastReadAlertsAt: number | null;
  pipelineFilter: string;
  responsibleFilter: string;
  viewMode: "table" | "cards" | "kanban";
  connectionStatus: "checking" | "connected" | "demo" | "disconnected";
  appLoaded: boolean;
  savedViews: SavedView[];

  // User name mapping (ID -> Name) for responsible persons
  userNames: Record<string, string>;

  // Company data mapping (ID -> Company Data)
  companiesData: Record<string, any>;

  // Activities data mapping (Deal ID -> { last: ActivityData, next: ActivityData })
  activitiesData: Record<string, any>;

  // Export data
  exportData: string[][];
  exportColumns: string[];

  // ─── Actions ───
  checkConfig: () => Promise<void>;
  fetchFields: () => Promise<void>;
  fetchDeals: () => Promise<void>;
  loadDemoData: () => void;
  setSelectedColumns: (columns: string[]) => void;
  toggleColumn: (columnId: string) => void;
  setColumnSelectorOpen: (open: boolean) => void;
  setDateFilter: (filter: DateFilter) => void;
  setSearchQuery: (query: string) => void;
  setColumnSort: (sort: ColumnSort) => void;
  toggleColumnSort: (columnId: string) => void;
  setColumnFilter: (columnId: string, value: string) => void;
  clearColumnFilter: (columnId: string) => void;
  clearAllColumnFilters: () => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  syncData: () => Promise<void>;
  applyClientFilters: () => void;

  // ─── Actions (header features) ───
  setPipelineFilter: (filter: string) => void;
  setResponsibleFilter: (id: string) => void;
  setViewMode: (mode: "table" | "cards" | "kanban") => void;
  saveView: (name: string) => void;
  deleteSavedView: (id: string) => void;
  loadSavedView: (id: string) => void;
  setConnectionStatus: (status: "checking" | "connected" | "demo" | "disconnected") => void;
  setAppLoaded: (loaded: boolean) => void;
  fetchUserNames: () => Promise<void>;
  fetchCompaniesData: () => Promise<void>;
  fetchActivitiesData: () => Promise<void>;
  markAlertsAsRead: () => void;
  setExportData: (data: string[][], columns: string[]) => void;
}

function getDateFilterRange(filter: DateFilter): Record<string, string> {
  const now = new Date();
  const bitrixFilter: Record<string, string> = {};

  if (filter.preset === "all") {
    return {};
  }

  if (filter.preset === "custom") {
    if (filter.customFrom) {
      bitrixFilter[">=DATE_CREATE"] = filter.customFrom;
    }
    if (filter.customTo) {
      bitrixFilter["<=DATE_CREATE"] = filter.customTo;
    }
    return bitrixFilter;
  }

  const daysMap: Record<string, number> = {
    "7days": 7,
    "14days": 14,
    "30days": 30,
    "90days": 90,
  };

  const days = daysMap[filter.preset];
  if (days) {
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    bitrixFilter[">=DATE_CREATE"] = from.toISOString().slice(0, 19);
  }

  return bitrixFilter;
}

const DEFAULT_COLUMNS = [
  "BEGINDATE", // Дата начала
  "DATE_MODIFY", // Дата изменения
  "CLOSEDATE", // Дата завершения
  "ASSIGNED_BY_ID", // Ответственный
  "ACTIVITY_LAST", // Последнее дело
  "ACTIVITY_NEXT", // Следующий шаг
  "UF_CRM_69257BBACD471", // Тип продукта
  "OPPORTUNITY", // Сумма
  "COMPANY_TITLE", // Наименование компании
  "COMPANY_UF_CRM_1777326239557", // Выручка компании (млн руб/год)
  "UF_CRM_1774879911841", // Потребление (тн/год)
  "UF_CRM_6915D8C2C31D0", // Отрасль
  "UF_CRM_6915D8C328208", // Направление
  "COMMENTS", // Комментарий
];

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Configuration
      isConfigured: null,
      isDemoMode: false,

      // Fields
      fields: [],
      fieldsLoading: false,
      fieldsError: null,

      // Selected columns
      selectedColumns: DEFAULT_COLUMNS,
      columnSelectorOpen: false,

      // Deals
      deals: [],
      allDeals: [],
      dealsLoading: false,
      dealsError: null,
      dealsTotal: 0,

      // Date filter
      dateFilter: { preset: "all" },

      // Search
      searchQuery: "",

      // Column sorting
      columnSort: { columnId: "", direction: null },

      // Column filters
      columnFilters: [],

      // Pagination
      currentPage: 1,
      pageSize: 50,

      // New state fields
      lastSyncAt: null,
      lastReadAlertsAt: null,
      pipelineFilter: "all",
      responsibleFilter: "all",
      viewMode: "table",
      connectionStatus: "checking",
      appLoaded: false,
      savedViews: [],
      userNames: {},
      companiesData: {},
      activitiesData: {},
      exportData: [],
      exportColumns: [],

      // ─── Actions ───
      checkConfig: async () => {
        try {
          const response = await fetchWithTimeout("/api/bitrix/status");
          // Check HTTP status — fetch doesn't throw on 401/403/500
          if (!response.ok) {
            // Auth error or server error — treat as disconnected
            set({
              isConfigured: false,
              connectionStatus: response.status === 401 ? "demo" : "disconnected",
            });
            return;
          }
          const data = await response.json();
          set({
            isConfigured: data.configured,
            connectionStatus: data.configured ? "connected" : "demo",
          });
        } catch {
          set({
            isConfigured: false,
            connectionStatus: "disconnected",
          });
        }
      },

      fetchFields: async () => {
        set({ fieldsLoading: true, fieldsError: null });
        try {
          const response = await fetchWithTimeout("/api/bitrix/fields");

          // Check HTTP status — fetch doesn't throw on 401/403/500
          if (!response.ok) {
            // Fall through to catch block for demo fallback
            throw new Error(`API returned ${response.status}`);
          }

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || "Failed to fetch fields");
          }

          if (data.fields.length === 0) {
            set({ fields: DEMO_FIELDS, fieldsLoading: false, isDemoMode: true });
          } else {
            set({ fields: data.fields, fieldsLoading: false, isDemoMode: false, isConfigured: true });
          }

          const currentSelected = get().selectedColumns;
          const availableFields = get().fields;
          if (currentSelected.length === 0 && availableFields.length > 0) {
            const availableDefaults = DEFAULT_COLUMNS.filter((col) =>
              availableFields.some((f) => f.id === col)
            );
            if (availableDefaults.length === 0) {
              const first5 = availableFields.slice(0, 5).map((f) => f.id);
              set({ selectedColumns: first5 });
            } else {
              set({ selectedColumns: availableDefaults });
            }
          }
        } catch (error) {
          set({
            fields: DEMO_FIELDS,
            fieldsLoading: false,
            isDemoMode: true,
            fieldsError: null,
          });
        }
      },

      fetchDeals: async () => {
        set({ dealsLoading: true, dealsError: null, activitiesData: {}, companiesData: {} });
        try {
          const { dateFilter, selectedColumns } = get();
          const filter = getDateFilterRange(dateFilter);

          const select = selectedColumns.length > 0
            ? [...selectedColumns]
            : ["*", "UF_*"];

          if (!select.includes("DATE_CREATE")) select.push("DATE_CREATE");
          if (!select.includes("TITLE")) select.push("TITLE");
          if (!select.includes("ID")) select.push("ID");
          // Required by filters/alerts/stats even if not in selectedColumns:
          if (!select.includes("ASSIGNED_BY_ID")) select.push("ASSIGNED_BY_ID");
          if (!select.includes("DATE_MODIFY")) select.push("DATE_MODIFY");
          if (!select.includes("STAGE_ID")) select.push("STAGE_ID");
          if (!select.includes("OPPORTUNITY")) select.push("OPPORTUNITY");
          if (!select.includes("CURRENCY_ID")) select.push("CURRENCY_ID");
          if (!select.includes("COMPANY_ID")) select.push("COMPANY_ID");
          if (!select.includes("COMPANY_TITLE")) select.push("COMPANY_TITLE");
          // Required for unpaid deals alert (payment status):
          if (!select.includes("UF_CRM_1584464068013")) select.push("UF_CRM_1584464068013");

          const response = await fetchWithTimeout("/api/bitrix/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              select,
              filter,
              order: { DATE_CREATE: "DESC" },
            }),
          });

          // Check HTTP status — fetch doesn't throw on 401/403/500
          if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
          }

          const data = await response.json();

          if (!data.success) {
            throw new Error(data.error || "Failed to fetch deals");
          }

          set({
            allDeals: data.deals,
            dealsTotal: data.total,
            dealsLoading: false,
            isDemoMode: false,
            connectionStatus: "connected",
            isConfigured: true,
            lastSyncAt: Date.now(),
          });
          get().applyClientFilters();
          // Fetch user names for responsible persons (non-blocking)
          get().fetchUserNames();
          // Fetch companies data (non-blocking)
          get().fetchCompaniesData();
          // Fetch activities data (non-blocking)
          get().fetchActivitiesData();
        } catch (error) {
          const demoDeals = generateDemoDeals(150);
          set({
            allDeals: demoDeals,
            dealsTotal: demoDeals.length,
            dealsLoading: false,
            isDemoMode: true,
            dealsError: null,
            connectionStatus: "demo",
          });
          get().applyClientFilters();
          // Fetch demo user names
          get().fetchUserNames();
        }
      },

      loadDemoData: () => {
        const demoDeals = generateDemoDeals(150);
        set({
          fields: DEMO_FIELDS,
          allDeals: demoDeals,
          dealsTotal: demoDeals.length,
          isDemoMode: true,
          selectedColumns: DEFAULT_COLUMNS,
        });
        get().applyClientFilters();
      },

      setSelectedColumns: (columns) => {
        set({ selectedColumns: columns });
        get().fetchActivitiesData();
        get().fetchCompaniesData();
      },

      toggleColumn: (columnId) => {
        const { selectedColumns } = get();
        if (selectedColumns.includes(columnId)) {
          if (selectedColumns.length <= 1) return;
          set({ selectedColumns: selectedColumns.filter((c) => c !== columnId) });
        } else {
          set({ selectedColumns: [...selectedColumns, columnId] });
          // Fetch data for the new column if needed
          if (columnId === "ACTIVITY_LAST" || columnId === "ACTIVITY_NEXT") {
            get().fetchActivitiesData();
          } else if (columnId.startsWith("COMPANY_")) {
            get().fetchCompaniesData();
          }
        }
      },

      setColumnSelectorOpen: (open) => set({ columnSelectorOpen: open }),

      setDateFilter: (filter) => {
        set({ dateFilter: filter, currentPage: 1 });
        get().applyClientFilters();
        if (!get().isDemoMode) {
          get().fetchDeals();
        }
      },

      applyClientFilters: () => {
        const { allDeals, dateFilter, pipelineFilter, responsibleFilter } = get();

        let filtered = allDeals;

        // 1. Date filter
        if (dateFilter.preset !== "all") {
          const now = new Date();
          let fromDate: Date | null = null;
          let toDate: Date | null = null;

          if (dateFilter.preset === "custom") {
            if (dateFilter.customFrom) fromDate = new Date(dateFilter.customFrom);
            if (dateFilter.customTo) toDate = new Date(dateFilter.customTo);
          } else {
            const daysMap: Record<string, number> = {
              "7days": 7,
              "14days": 14,
              "30days": 30,
              "90days": 90,
            };
            const days = daysMap[dateFilter.preset];
            if (days) {
              fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            }
          }

          filtered = filtered.filter((deal) => {
            const dateStr = deal.DATE_CREATE as string;
            if (!dateStr) return false;
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return false;
            if (fromDate && d < fromDate) return false;
            if (toDate && d > toDate) return false;
            return true;
          });
        }

        // 2. Pipeline filter
        if (pipelineFilter === "in_work") {
          filtered = filtered.filter((deal) => {
            const stage = String(deal.STAGE_ID || "");
            return !["WON", "LOSE"].includes(stage);
          });
        } else if (pipelineFilter !== "all") {
          filtered = filtered.filter((deal) => String(deal.STAGE_ID) === pipelineFilter);
        }

        // 3. Responsible filter
        if (responsibleFilter !== "all") {
          filtered = filtered.filter((deal) => String(deal.ASSIGNED_BY_ID || "") === responsibleFilter);
        }

        set({ deals: filtered });
      },

      setSearchQuery: (query) => set({ searchQuery: query }),

      setColumnSort: (sort) => set({ columnSort: sort, currentPage: 1 }),

      toggleColumnSort: (columnId) => {
        const { columnSort } = get();
        if (columnSort.columnId === columnId) {
          // Cycle: asc → desc → null
          if (columnSort.direction === "asc") {
            set({ columnSort: { columnId, direction: "desc" }, currentPage: 1 });
          } else if (columnSort.direction === "desc") {
            set({ columnSort: { columnId: "", direction: null }, currentPage: 1 });
          }
        } else {
          set({ columnSort: { columnId, direction: "asc" }, currentPage: 1 });
        }
      },

      setColumnFilter: (columnId, value) => {
        const { columnFilters } = get();
        const existing = columnFilters.find((f) => f.columnId === columnId);
        if (existing) {
          set({
            columnFilters: columnFilters.map((f) =>
              f.columnId === columnId ? { ...f, value } : f
            ),
            currentPage: 1,
          });
        } else {
          set({
            columnFilters: [...columnFilters, { columnId, value }],
            currentPage: 1,
          });
        }
      },

      clearColumnFilter: (columnId) => {
        set({
          columnFilters: get().columnFilters.filter((f) => f.columnId !== columnId),
          currentPage: 1,
        });
      },

      clearAllColumnFilters: () => {
        set({ columnFilters: [], currentPage: 1 });
      },

      setCurrentPage: (page) => set({ currentPage: page }),

      setPageSize: (size) => set({ pageSize: size, currentPage: 1 }),

      syncData: async () => {
        const { isDemoMode } = get();
        if (isDemoMode) {
          const demoDeals = generateDemoDeals(150);
          set({
            allDeals: demoDeals,
            dealsTotal: demoDeals.length,
            lastSyncAt: Date.now(),
          });
          get().applyClientFilters();
          return;
        }
        // Fetch fields first (sequentially), then deals — avoids race condition
        // where fetchDeals depends on selectedColumns that may be updated by fetchFields
        await get().fetchFields();
        await get().fetchDeals();
        set({ lastSyncAt: Date.now() });
      },

      // ─── Actions (header features) ───
      setPipelineFilter: (filter) => {
        set({ pipelineFilter: filter, currentPage: 1 });
        get().applyClientFilters();
      },

      setResponsibleFilter: (id) => {
        set({ responsibleFilter: id, currentPage: 1 });
        get().applyClientFilters();
      },

      setViewMode: (mode) => set({ viewMode: mode }),

      saveView: (name) => {
        const { dateFilter, pipelineFilter, responsibleFilter, selectedColumns, columnSort, savedViews } = get();
        const newView: SavedView = {
          id: `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name,
          dateFilter: { ...dateFilter },
          pipelineFilter,
          responsibleFilter,
          selectedColumns: [...selectedColumns],
          columnSort: { ...columnSort },
          createdAt: Date.now(),
        };
        set({ savedViews: [...savedViews, newView] });
      },

      deleteSavedView: (id) => {
        set({ savedViews: get().savedViews.filter((v) => v.id !== id) });
      },

      loadSavedView: (id) => {
        const view = get().savedViews.find((v) => v.id === id);
        if (!view) return;
        set({
          dateFilter: { ...view.dateFilter },
          pipelineFilter: view.pipelineFilter,
          responsibleFilter: view.responsibleFilter,
          selectedColumns: [...view.selectedColumns],
          columnSort: { ...view.columnSort },
          currentPage: 1,
        });
        get().applyClientFilters();
        get().fetchActivitiesData();
        get().fetchCompaniesData();
      },

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      setAppLoaded: (loaded) => set({ appLoaded: loaded }),

      markAlertsAsRead: () => set({ lastReadAlertsAt: Date.now() }),

      fetchUserNames: async () => {
        const { isDemoMode, allDeals, userNames } = get();

        // In demo mode, use the demo responsible persons
        if (isDemoMode) {
          const { RESPONSIBLE_PERSONS } = await import("@/lib/demo-data");
          const demoNames: Record<string, string> = {};
          for (const person of RESPONSIBLE_PERSONS) {
            demoNames[person.ID] = person.NAME;
          }
          set({ userNames: demoNames });
          return;
        }

        // Collect unique responsible IDs from deals
        const uniqueIds = [...new Set(
          allDeals.map((d) => String(d.ASSIGNED_BY_ID || "")).filter(Boolean)
        )];

        if (uniqueIds.length === 0) return;

        // Only fetch IDs we don't already have names for
        const missingIds = uniqueIds.filter((id) => !userNames[id]);
        if (missingIds.length === 0) return;

        try {
          const response = await fetchWithTimeout(`/api/bitrix/users?ids=${missingIds.join(",")}`);

          if (!response.ok) {
            console.warn("[Dashboard] Failed to fetch user names: API returned", response.status);
            return;
          }
          const data = await response.json();
          if (data.success && data.users) {
            set({ userNames: { ...userNames, ...data.users } });
          }
        } catch {
          // Non-critical — responsible filter will show "ID xxx" fallback
          console.warn("[Dashboard] Failed to fetch user names");
        }
      },

      fetchCompaniesData: async () => {
        const { isDemoMode, allDeals, companiesData, selectedColumns } = get();

        if (isDemoMode) return;

        // Check if any company fields are selected
        const hasCompanyFields = selectedColumns.some(col => col.startsWith("COMPANY_"));
        if (!hasCompanyFields) return;

        // Collect unique company IDs from deals
        const uniqueIds = [...new Set(
          allDeals.map((d) => String(d.COMPANY_ID || "")).filter(Boolean)
        )];

        if (uniqueIds.length === 0) return;

        // Only fetch IDs we don't already have data for
        const missingIds = uniqueIds.filter((id) => !companiesData[id]);
        if (missingIds.length === 0) return;

        // Determine which company fields to fetch based on selected columns
        const companyFieldsToSelect = selectedColumns
          .filter(col => col.startsWith("COMPANY_"))
          .map(col => col.replace("COMPANY_", ""));
        
        if (!companyFieldsToSelect.includes("TITLE")) {
          companyFieldsToSelect.push("TITLE");
        }

        try {
          const response = await fetchWithTimeout("/api/bitrix/companies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ids: missingIds,
              select: companyFieldsToSelect,
            }),
          });

          if (!response.ok) {
            console.warn("[Dashboard] Failed to fetch companies data: API returned", response.status);
            return;
          }
          const data = await response.json();
          if (data.success && data.companies) {
            set({ companiesData: { ...companiesData, ...data.companies } });
          }
        } catch {
          console.warn("[Dashboard] Failed to fetch companies data");
        }
      },

      fetchActivitiesData: async () => {
        const { isDemoMode, allDeals, activitiesData, selectedColumns } = get();

        if (isDemoMode) return;

        // Check if any activity fields are selected
        const hasActivityFields = selectedColumns.includes("ACTIVITY_LAST") || selectedColumns.includes("ACTIVITY_NEXT");
        if (!hasActivityFields) return;

        // Collect unique deal IDs
        const uniqueIds = [...new Set(
          allDeals.map((d) => String(d.ID || d.id || "")).filter(Boolean)
        )];

        if (uniqueIds.length === 0) return;

        // Only fetch IDs we don't already have data for
        const missingIds = uniqueIds.filter((id) => !activitiesData[id]);
        if (missingIds.length === 0) return;

        try {
          const response = await fetchWithTimeout("/api/bitrix/activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dealIds: missingIds,
            }),
          });

          if (!response.ok) {
            console.warn("[Dashboard] Failed to fetch activities data: API returned", response.status);
            return;
          }
          const data = await response.json();
          if (data.success && data.activities) {
            set({ activitiesData: { ...activitiesData, ...data.activities } });
          }
        } catch {
          console.warn("[Dashboard] Failed to fetch activities data");
        }
      },

      setExportData: (data, columns) => set({ exportData: data, exportColumns: columns }),
    }),
    {
      name: "bitrix-bi-dashboard",
      partialize: (state) => ({
        selectedColumns: state.selectedColumns,
        dateFilter: state.dateFilter,
        pageSize: state.pageSize,
        pipelineFilter: state.pipelineFilter,
        responsibleFilter: state.responsibleFilter,
        viewMode: state.viewMode,
        savedViews: state.savedViews,
        lastReadAlertsAt: state.lastReadAlertsAt,
      }),
    }
  )
);
