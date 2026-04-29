import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEMO_FIELDS, generateDemoDeals } from "@/lib/demo-data";
import {
  DEAL_TABLE_DEFAULT_COLUMNS,
  RESPONSIBLE_FIELD_ID,
} from "@/lib/crm-constants";

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
  dealsTruncated: boolean;
  dealsFetched: number;

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
  companiesDataFetchedAt: Record<string, number>;
  companiesDataLoading: boolean;

  // Activities data mapping (Deal ID -> { last: ActivityData, next: ActivityData })
  activitiesData: Record<string, any>;
  activitiesDataFetchedAt: Record<string, number>;
  activitiesDataLoading: boolean;
  userNamesLoading: boolean;

  // ─── Actions ───
  checkConfig: () => Promise<void>;
  fetchFields: () => Promise<void>;
  fetchDeals: () => Promise<void>;
  loadDemoData: () => void;
  setSelectedColumns: (columns: string[]) => void;
  toggleColumn: (columnId: string) => void;
  reorderColumns: (startIndex: number, endIndex: number) => void;
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
      // ✅ Force Bitrix API to include the entirety of the selected end day
      bitrixFilter["<=DATE_CREATE"] = `${filter.customTo}T23:59:59`;
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

export const DEFAULT_COLUMNS = [...DEAL_TABLE_DEFAULT_COLUMNS] as string[];

const sortColumns = (columns: string[]) => {
  return [...columns].sort((a, b) => {
    const indexA = DEFAULT_COLUMNS.indexOf(a);
    const indexB = DEFAULT_COLUMNS.indexOf(b);
    
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  });
};

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
      dealsTruncated: false,
      dealsFetched: 0,

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
      companiesDataFetchedAt: {},
      companiesDataLoading: false,
      activitiesData: {},
      activitiesDataFetchedAt: {},
      activitiesDataLoading: false,
      userNamesLoading: false,

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
          
          // Migration logic is now handled by Zustand persist migrate function
          // We just need to make sure we have valid columns selected
          if (currentSelected.length === 0 && availableFields.length > 0) {
            const availableDefaults = DEFAULT_COLUMNS.filter((col) =>
              availableFields.some((f) => f.id === col)
            );
            
            if (availableDefaults.length === 0) {
              set({ selectedColumns: [availableFields[0].id] });
            } else {
              set({ selectedColumns: availableDefaults });
            }
          }
        } catch (error) {
          const { isDemoMode } = get();
          if (isDemoMode) {
            set({
              fields: DEMO_FIELDS,
              fieldsLoading: false,
              fieldsError: null,
            });
          } else {
            set({
              fieldsLoading: false,
              fieldsError: "Failed to load fields",
            });
          }
        }
      },

      fetchDeals: async () => {
        set({ dealsLoading: true, dealsError: null });
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
          if (!select.includes("ASSIGNED_BY_NAME")) select.push("ASSIGNED_BY_NAME");
          if (!select.includes("DATE_MODIFY")) select.push("DATE_MODIFY");
          if (!select.includes("STAGE_ID")) select.push("STAGE_ID");
          if (!select.includes("OPPORTUNITY")) select.push("OPPORTUNITY");
          if (!select.includes("CURRENCY_ID")) select.push("CURRENCY_ID");
          if (!select.includes("COMPANY_ID")) select.push("COMPANY_ID");
          if (!select.includes("COMPANY_TITLE")) select.push("COMPANY_TITLE");

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
            dealsTruncated: data.truncated || false,
            dealsFetched: data.fetched || data.deals.length,
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
          const message = error instanceof Error ? error.message : "Не удалось загрузить данные";
          set({
            dealsLoading: false,
            dealsError: message,
            connectionStatus: "disconnected",
          });
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
        if (!get().isDemoMode) {
          get().fetchActivitiesData();
          get().fetchCompaniesData();
        }
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

      reorderColumns: (startIndex, endIndex) => {
        const { selectedColumns } = get();
        const result = Array.from(selectedColumns);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        set({ selectedColumns: result });
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
            if (dateFilter.customTo) {
              toDate = new Date(dateFilter.customTo);
              // ✅ Push JS Date object to 23:59:59 so afternoon deals aren't filtered out
              toDate.setHours(23, 59, 59, 999);
            }
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

        const { pageSize, currentPage } = get();
        const totalPages = Math.ceil(filtered.length / pageSize);
        let newPage = currentPage;
        if (currentPage > totalPages) {
          newPage = totalPages || 1;
        }

        set({ deals: filtered, currentPage: newPage });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query, currentPage: 1 });
        get().applyClientFilters();
      },

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
        const { isDemoMode, userNames } = get();
        set({ userNamesLoading: true });
        // In demo mode, use the demo responsible persons
        if (isDemoMode) {
          const { RESPONSIBLE_PERSONS } = await import("@/lib/demo-data");
          const demoNames: Record<string, string> = {};
          for (const person of RESPONSIBLE_PERSONS) {
            demoNames[person.ID] = person.NAME;
          }
          set({ userNames: demoNames, userNamesLoading: false });
          return;
        }
        try {
          const response = await fetchWithTimeout(`/api/bitrix/users`);
          if (!response.ok) {
            console.warn("[Dashboard] Failed to fetch user names: API returned", response.status);
            set({ userNamesLoading: false });
            return;
          }
          const data = await response.json();
          if (data.success && data.users) {
            set({ userNames: { ...userNames, ...data.users }, userNamesLoading: false });
          } else {
            set({ userNamesLoading: false });
          }
        } catch {
          console.warn("[Dashboard] Failed to fetch user names");
          set({ userNamesLoading: false });
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
          allDeals.map((d) => String(d.COMPANY_ID || "")).filter((id) => id && id !== "0")
        )];

        if (uniqueIds.length === 0) return;

        // Only fetch IDs we don't already have data for or if data is older than 5 minutes
        const now = Date.now();
        const missingIds = uniqueIds.filter((id) => {
          const cached = companiesData[id];
          const fetchedAt = get().companiesDataFetchedAt[id];
          if (!cached) return true;
          if (!fetchedAt || now - fetchedAt > 5 * 60 * 1000) return true;
          return false;
        });
        if (missingIds.length === 0) return;

        set({ companiesDataLoading: true });

        // Determine which company fields to fetch based on selected columns
        const companyFieldsToSelect = selectedColumns
          .filter(col => col.startsWith("COMPANY_"))
          .map(col => col.replace("COMPANY_", ""));
        
        if (!companyFieldsToSelect.includes("TITLE")) {
          companyFieldsToSelect.push("TITLE");
        }
        if (!companyFieldsToSelect.includes("ID")) {
          companyFieldsToSelect.push("ID");
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
            set({ companiesDataLoading: false });
            return;
          }
          const data = await response.json();
          if (data.success && data.companies) {
            set((state) => {
              const normalizedCompanies: Record<string, any> = {};
              if (Array.isArray(data.companies)) {
                data.companies.forEach((c: any) => {
                  if (c.ID) normalizedCompanies[String(c.ID)] = c;
                });
              } else if (typeof data.companies === 'object') {
                for (const [k, v] of Object.entries(data.companies)) {
                  normalizedCompanies[String(k)] = v;
                }
              }
              const newCompaniesData = { ...state.companiesData, ...normalizedCompanies };
              const newCompaniesDataFetchedAt = { ...state.companiesDataFetchedAt };
              const now = Date.now();
              
              // ✅ Mark ALL requested IDs as fetched to prevent infinite loops
              for (const id of missingIds) {
                newCompaniesDataFetchedAt[id] = now;
              }
              // Prune cache to only keep companies present in allDeals
              const validCompanyIds = new Set(state.allDeals.map(d => String(d.COMPANY_ID || "")).filter(Boolean));
              for (const id in newCompaniesData) {
                if (!validCompanyIds.has(id)) {
                  delete newCompaniesData[id];
                  delete newCompaniesDataFetchedAt[id];
                }
              }
              return { companiesData: newCompaniesData, companiesDataFetchedAt: newCompaniesDataFetchedAt, companiesDataLoading: false };
            });
          } else {
            set({ companiesDataLoading: false });
          }
        } catch {
          console.warn("[Dashboard] Failed to fetch companies data");
          set({ companiesDataLoading: false });
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

        // Only fetch IDs we don't already have data for or if data is older than 5 minutes
        const now = Date.now();
        const missingIds = uniqueIds.filter((id) => {
          const cached = activitiesData[id];
          const fetchedAt = get().activitiesDataFetchedAt[id];
          if (!cached) return true;
          if (!fetchedAt || now - fetchedAt > 5 * 60 * 1000) return true;
          return false;
        });
        if (missingIds.length === 0) return;

        set({ activitiesDataLoading: true });

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
            set({ activitiesDataLoading: false });
            return;
          }
          const data = await response.json();
          if (data.success && data.activities) {
            set((state) => {
              const newActivitiesData = { ...state.activitiesData, ...data.activities };
              const newActivitiesDataFetchedAt = { ...state.activitiesDataFetchedAt };
              const now = Date.now();
              
              // ✅ Mark ALL requested IDs as fetched to prevent infinite loops
              for (const id of missingIds) {
                newActivitiesDataFetchedAt[id] = now;
              }
              // Prune cache to only keep deals present in allDeals
              const validDealIds = new Set(state.allDeals.map(d => String(d.ID || d.id || "")).filter(Boolean));
              for (const id in newActivitiesData) {
                if (!validDealIds.has(id)) {
                  delete newActivitiesData[id];
                  delete newActivitiesDataFetchedAt[id];
                }
              }
              return { activitiesData: newActivitiesData, activitiesDataFetchedAt: newActivitiesDataFetchedAt, activitiesDataLoading: false };
            });
          } else {
            set({ activitiesDataLoading: false });
          }
        } catch {
          console.warn("[Dashboard] Failed to fetch activities data");
          set({ activitiesDataLoading: false });
        }
      },
    }),
    {
      name: "bitrix-bi-dashboard",
      version: 3, // BUMPED: trigger migration to add ASSIGNED_BY_ID and COMPANY_TITLE
      migrate: (persistedState: any, version: number) => {
        if (version === 0 || version === 1) {
          // Migration from older versions
          const state = persistedState as DashboardState;
          if (state.selectedColumns) {
            const currentSelected = state.selectedColumns;
            const isOldDefault = currentSelected.length === 14 && currentSelected.includes("ACTIVITY_LAST");
            const isNewDefault = currentSelected.length === DEFAULT_COLUMNS.length && DEFAULT_COLUMNS.every((col) => currentSelected.includes(col));
            const isGenuineUserCustomisation = !isOldDefault && !isNewDefault && currentSelected.length > 0;
            
            if (!isGenuineUserCustomisation) {
              state.selectedColumns = DEFAULT_COLUMNS;
            } else if (!currentSelected.includes(RESPONSIBLE_FIELD_ID)) {
              const closeDateIndex = currentSelected.indexOf("CLOSEDATE");
              if (closeDateIndex !== -1) {
                const newColumns = [...currentSelected];
                newColumns.splice(closeDateIndex + 1, 0, RESPONSIBLE_FIELD_ID);
                state.selectedColumns = newColumns;
              } else {
                state.selectedColumns = [...currentSelected, RESPONSIBLE_FIELD_ID];
              }
            }
          }
        }

        if (version < 3) {
          const state = persistedState as DashboardState;
          const cols: string[] = state.selectedColumns ? [...state.selectedColumns] : [...DEFAULT_COLUMNS];

          // Добавляем COMPANY_TITLE если отсутствует
          if (!cols.includes("COMPANY_TITLE")) {
            cols.unshift("COMPANY_TITLE");
          }

          // Добавляем ASSIGNED_BY_ID сразу после COMPANY_TITLE
          if (!cols.includes("ASSIGNED_BY_ID")) {
            const companyIdx = cols.indexOf("COMPANY_TITLE");
            if (companyIdx !== -1) {
              cols.splice(companyIdx + 1, 0, "ASSIGNED_BY_ID");
            } else {
              cols.push("ASSIGNED_BY_ID");
            }
          }

          state.selectedColumns = cols;
        }

        return persistedState;
      },
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
