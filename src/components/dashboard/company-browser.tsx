"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardStore, type DateFilter } from "@/store/dashboard-store";
import {
  COMPANY_RESPONSIBLE_FIELD_TITLE,
  COMPANY_SAMPLES_FIELD_ID,
  COMPANY_SAMPLES_FIELD_TITLE,
} from "@/lib/crm-constants";
import { exportToExcelWysiwyg } from "@/lib/export-utils";
import { CompanyPreview } from "./company-preview";
import { isCompanyId } from "@/lib/company-preview";
import { CompanyColumnSelector } from "./company-column-selector";
import { CompanyDateFilter } from "./company-date-filter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  UserCircle,
  X,
} from "lucide-react";

const PAGE_SIZE = 50;

type SortDirection = "asc" | "desc" | null;
interface CompanyColumnSort {
  columnId: string;
  direction: SortDirection;
}
interface CompanyColumnFilter {
  columnId: string;
  value: string;
}

interface CompanyFieldMeta {
  type?: string;
  listValues?: Array<{ ID: string; VALUE: string }>;
}

function resolveCompanyValue(
  company: Record<string, any>,
  colId: string,
  userNames: Record<string, string>,
  field?: CompanyFieldMeta
): string {
  if (colId === "TITLE") {
    return String(company.TITLE || "").trim() || "Без названия";
  }

  // Person-reference ID fields — resolve to a name via userNames instead of
  // showing the raw numeric ID.
  if (colId === "ASSIGNED_BY_ID" || colId === "LAST_ACTIVITY_BY") {
    const id = String(company[colId] || "").trim();
    if (!id) return "";
    return userNames[id]?.trim() || `ID ${id}`;
  }

  const raw = company[colId];
  if (raw === null || raw === undefined || raw === "") return "";

  const listValues = field?.listValues;
  if (listValues && listValues.length > 0) {
    if (Array.isArray(raw)) {
      return raw
        .map((v) => listValues.find((lv) => lv.ID === String(v))?.VALUE || String(v))
        .join(", ");
    }
    const found = listValues.find((lv) => lv.ID === String(raw));
    if (found) return found.VALUE;
  }

  if (Array.isArray(raw)) return raw.join(", ");

  if (field?.type === "money" && typeof raw === "string") {
    const [amountStr, currency] = raw.split("|");
    const amount = parseFloat(amountStr);
    if (!isNaN(amount)) {
      return `${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
    }
  }

  if ((field?.type === "double" || field?.type === "integer") && (typeof raw === "string" || typeof raw === "number")) {
    const num = parseFloat(String(raw));
    if (!isNaN(num)) {
      return field.type === "integer"
        ? Math.round(num).toLocaleString("ru-RU")
        : num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }

  if ((field?.type === "date" || field?.type === "datetime") && typeof raw === "string") {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const dateStr = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
      return field.type === "datetime"
        ? `${dateStr} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
        : dateStr;
    }
  }

  if (typeof raw === "object") {
    // Composite/object-shaped fields (e.g. Bitrix "address"-type values) have no
    // single string form — render their non-empty parts instead of "[object Object]".
    const parts = Object.values(raw as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    return parts.join(", ");
  }

  return String(raw);
}

/**
 * Value used for sorting — numeric/date fields sort as numbers/timestamps,
 * everything else falls back to the resolved display string (lowercased).
 */
function getCompanySortValue(
  company: Record<string, any>,
  colId: string,
  userNames: Record<string, string>,
  field?: CompanyFieldMeta
): string | number {
  if (field?.type === "money" && typeof company[colId] === "string") {
    const num = parseFloat(String(company[colId]).split("|")[0]);
    return isNaN(num) ? 0 : num;
  }
  if (field?.type === "double" || field?.type === "integer") {
    const num = parseFloat(String(company[colId]));
    return isNaN(num) ? 0 : num;
  }
  if (field?.type === "date" || field?.type === "datetime") {
    const d = new Date(String(company[colId]));
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return resolveCompanyValue(company, colId, userNames, field).toLowerCase();
}

/**
 * True when the "Образцы" field holds real information — i.e. anything other
 * than empty/missing or Bitrix's boolean-false placeholder for an unset value.
 */
function hasSamplesInfo(company: Record<string, any>): boolean {
  const raw = company[COMPANY_SAMPLES_FIELD_ID];
  if (raw === null || raw === undefined || raw === "") return false;
  if (raw === false || raw === "false") return false;
  return true;
}

/**
 * Same range logic as the deals table's applyClientFilters (dashboard-store.ts)
 * — applied here to the company's own "Дата создания" (DATE_CREATE), entirely
 * client-side (the whole responsible-scoped set is already loaded), and fully
 * independent from the deals table's dateFilter.
 */
function matchesCompanyDateFilter(company: Record<string, any>, filter: DateFilter): boolean {
  if (filter.preset === "all") return true;

  const dateStr = company.DATE_CREATE as string | undefined;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;

  let fromDate: Date | null = null;
  let toDate: Date | null = null;

  if (filter.preset === "custom") {
    if (filter.customFrom) fromDate = new Date(filter.customFrom);
    if (filter.customTo) {
      toDate = new Date(filter.customTo);
      toDate.setHours(23, 59, 59, 999);
    }
  } else {
    const daysMap: Record<string, number> = { "7days": 7, "14days": 14, "30days": 30, "90days": 90 };
    const days = daysMap[filter.preset];
    if (days) fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}

export function CompanyBrowser() {
  const {
    fields,
    companyResponsibleCounts,
    companyResponsibleCountsLoading,
    userNames,
    userNamesLoading,
    selectedColumns,
    companyBrowserItems,
    companyBrowserLoading,
    companyBrowserError,
    companyBrowserTotal,
    companyBrowserFetched,
    companyBrowserTruncated,
    companyBrowserPartial,
    companyBrowserWarning,
    companyBrowserResponsibleId,
    setCompanyBrowserResponsibleId,
    fetchCompanyBrowser,
    setCompanyColumnSelectorOpen,
    companyColumnWidths,
    setCompanyColumnWidth,
  } = useDashboardStore();

  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [columnSort, setColumnSort] = useState<CompanyColumnSort>({ columnId: "", direction: null });
  const [columnFilters, setColumnFilters] = useState<CompanyColumnFilter[]>([]);
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);
  const [highlightSamples, setHighlightSamples] = useState(false);
  const [companyDateFilter, setCompanyDateFilter] = useState<DateFilter>({ preset: "all" });
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Column resizing — same pointer-capture approach as the deals table.
  const resizingState = useRef({ colId: null as string | null, startX: 0, startWidth: 0 });
  const [activeResizingCol, setActiveResizingCol] = useState<string | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, colId: string, thElement: HTMLTableCellElement | null) => {
    if (!thElement) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizingState.current = { colId, startX: e.clientX, startWidth: thElement.getBoundingClientRect().width };
    setActiveResizingCol(colId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resizingState.current.colId) {
      const diff = e.clientX - resizingState.current.startX;
      const newWidth = Math.max(80, resizingState.current.startWidth + diff);
      setCompanyColumnWidth(resizingState.current.colId, newWidth);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    resizingState.current.colId = null;
    setActiveResizingCol(null);
  };

  useEffect(() => {
    if (activeFilterCol && filterInputRef.current) {
      filterInputRef.current.focus();
    }
  }, [activeFilterCol]);

  const setColumnFilter = (columnId: string, value: string) => {
    setColumnFilters((prev) => {
      const existing = prev.find((f) => f.columnId === columnId);
      if (existing) return prev.map((f) => (f.columnId === columnId ? { ...f, value } : f));
      return [...prev, { columnId, value }];
    });
    setCurrentPage(1);
  };

  const clearColumnFilter = (columnId: string) => {
    setColumnFilters((prev) => prev.filter((f) => f.columnId !== columnId));
    setCurrentPage(1);
  };

  const toggleColumnSort = (columnId: string) => {
    setColumnSort((prev) => {
      if (prev.columnId !== columnId) return { columnId, direction: "asc" };
      if (prev.direction === "asc") return { columnId, direction: "desc" };
      return { columnId: "", direction: null };
    });
    setCurrentPage(1);
  };

  // Same COMPANY_* columns the user has picked in the deals table's column
  // selector — so this view stays in sync with what they've already chosen.
  const columns = useMemo(() => {
    const extra = selectedColumns
      .filter((col) => col.startsWith("COMPANY_"))
      .map((col) => col.replace("COMPANY_", ""))
      .filter((col) => col !== "ID" && col !== "TITLE" && col !== "ASSIGNED_BY_ID");
    return ["TITLE", "ASSIGNED_BY_ID", ...extra];
  }, [selectedColumns]);

  // Refetch whenever the set of requested COMPANY_* fields changes (e.g. the
  // user adds a column while already on this page) — not just on mount.
  const companyFieldsKey = columns.join(",");

  useEffect(() => {
    fetchCompanyBrowser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyFieldsKey]);

  // Reset to page 1 whenever the underlying result set changes for any reason
  // (filter change, re-selecting the same filter, or a fields-triggered refetch).
  useEffect(() => {
    setCurrentPage(1);
  }, [companyBrowserItems]);

  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);

  const columnTitle = (colId: string): string => {
    if (colId === "TITLE") return "Наименование компании";
    if (colId === "ASSIGNED_BY_ID") return COMPANY_RESPONSIBLE_FIELD_TITLE;
    const meta = fieldMap.get(`COMPANY_${colId}`);
    return meta?.title.replace(/^Компания:\s*/, "") || colId;
  };

  // Real source of truth for "who is a company's responsible person": scanned
  // directly from crm.company.list (companyResponsibleCounts), not derived
  // from deal ownership — so people who own companies but no deals still show
  // up here, and duplicates only appear if two distinct real Bitrix accounts
  // both genuinely own companies (not from stale/unused user records).
  const responsibleOptions = useMemo(() => {
    return Object.entries(companyResponsibleCounts)
      .map(([id, count]) => ({ id, name: userNames[id]?.trim() || `ID ${id}`, count }))
      .sort((a, b) => b.count - a.count);
  }, [companyResponsibleCounts, userNames]);

  const activeName =
    companyBrowserResponsibleId === "all"
      ? "Все ответственные"
      : responsibleOptions.find((o) => o.id === companyBrowserResponsibleId)?.name ||
        userNames[companyBrowserResponsibleId]?.trim() ||
        "Все ответственные";

  const getField = (colId: string) =>
    colId === "TITLE" || colId === "ASSIGNED_BY_ID" ? undefined : fieldMap.get(`COMPANY_${colId}`);

  const filteredItems = useMemo(() => {
    let items = companyBrowserItems;

    if (companyDateFilter.preset !== "all") {
      items = items.filter((company) => matchesCompanyDateFilter(company, companyDateFilter));
    }

    if (columnFilters.length > 0) {
      items = items.filter((company) =>
        columnFilters.every((filter) => {
          if (!filter.value.trim()) return true;
          const resolved = resolveCompanyValue(company, filter.columnId, userNames, getField(filter.columnId));
          return resolved.toLowerCase().includes(filter.value.toLowerCase());
        })
      );
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyBrowserItems, companyDateFilter, columnFilters, userNames, fieldMap]);

  const sortedItems = useMemo(() => {
    if (!columnSort.direction || !columnSort.columnId) return filteredItems;
    const dir = columnSort.direction === "asc" ? 1 : -1;
    const field = getField(columnSort.columnId);
    return [...filteredItems].sort((a, b) => {
      const aVal = getCompanySortValue(a, columnSort.columnId, userNames, field);
      const bVal = getCompanySortValue(b, columnSort.columnId, userNames, field);
      if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
      return String(aVal).localeCompare(String(bVal), "ru") * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems, columnSort, userNames, fieldMap]);

  const samplesCount = useMemo(
    () => sortedItems.filter((company) => hasSamplesInfo(company)).length,
    [sortedItems]
  );

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedItems.slice(start, start + PAGE_SIZE);
  }, [sortedItems, currentPage]);

  // WYSIWYG export — same columns/order/formatting/filter/sort currently
  // shown in the table, but over the full set (not just the current page),
  // mirroring how the deals table's export works.
  const handleExport = useCallback(() => {
    if (sortedItems.length === 0 || columns.length === 0) return;

    const exportColumns = columns.map((colId) => columnTitle(colId));
    const exportData = sortedItems.map((company) =>
      columns.map((colId) => {
        const field = getField(colId);
        return resolveCompanyValue(company, colId, userNames, field);
      })
    );

    exportToExcelWysiwyg(exportData, exportColumns, {
      sheetName: "Компании",
      fileNamePrefix: "russilica_companies",
      // Mirror the on-screen "Образцы" highlight in the exported file.
      highlightRows: highlightSamples ? sortedItems.map((company) => hasSamplesInfo(company)) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedItems, columns, fieldMap, userNames, highlightSamples]);

  const previewFields = (company: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      PHONE: "Телефон", EMAIL: "Email", DATE_CREATE: "Дата создания", DATE_MODIFY: "Дата изменения",
      [COMPANY_SAMPLES_FIELD_ID]: COMPANY_SAMPLES_FIELD_TITLE,
    };
    return [...new Set(["ASSIGNED_BY_ID", "PHONE", "EMAIL", ...columns,
      "DATE_CREATE", "DATE_MODIFY", COMPANY_SAMPLES_FIELD_ID])]
      .filter((id) => id !== "TITLE" && (id !== COMPANY_SAMPLES_FIELD_ID || hasSamplesInfo(company)))
      .map((id) => ({ id, label: labels[id] || columnTitle(id),
        value: resolveCompanyValue(company, id, userNames,
          getField(id) || (id === "DATE_CREATE" || id === "DATE_MODIFY" ? { type: "datetime" } : undefined)),
      })).filter((field) => field.value.trim());
  };
  const openPreview = (id: string, row: HTMLTableRowElement | null) => {
    if (!isCompanyId(id)) return;
    previewTrigger.current = row?.querySelector<HTMLButtonElement>("[data-company-preview]") || null;
    setPreviewId(id);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 px-4 sm:px-6 py-4 gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <CompanyDateFilter
          value={companyDateFilter}
          onChange={(filter) => {
            setCompanyDateFilter(filter);
            setCurrentPage(1);
          }}
        />

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs justify-between min-w-[220px]"
            >
              <span className="flex items-center gap-1.5 truncate">
                <UserCircle className="h-3.5 w-3.5 opacity-60" />
                {activeName}
              </span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Поиск сотрудника..." className="text-xs" />
              <CommandList>
                <CommandEmpty className="text-xs">Не найдено</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__all__"
                    onSelect={() => {
                      setCompanyBrowserResponsibleId("all");
                      setPickerOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={`h-3.5 w-3.5 mr-1 ${companyBrowserResponsibleId === "all" ? "opacity-100" : "opacity-0"}`}
                    />
                    Все ответственные
                  </CommandItem>
                  {responsibleOptions.map((option) => (
                    <CommandItem
                      key={option.id}
                      value={option.name}
                      onSelect={() => {
                        setCompanyBrowserResponsibleId(option.id);
                        setPickerOpen(false);
                      }}
                      className="text-xs"
                    >
                      <Check
                        className={`h-3.5 w-3.5 mr-1 ${companyBrowserResponsibleId === option.id ? "opacity-100" : "opacity-0"}`}
                      />
                      {option.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {(userNamesLoading || companyResponsibleCountsLoading) && (
          <span className="text-[11px] text-muted-foreground">Загрузка сотрудников…</span>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setCompanyColumnSelectorOpen(true)}
          className="h-8 gap-1.5 text-xs"
        >
          <Columns3 className="h-3.5 w-3.5" />
          Столбцы
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={companyBrowserItems.length === 0}
          className="h-8 gap-1.5 text-xs"
        >
          <Download className="h-3.5 w-3.5" />
          Экспорт
        </Button>

        <label className="flex items-center gap-1.5 h-8 px-2 rounded-md border text-xs cursor-pointer select-none hover:bg-muted/50">
          <Checkbox
            checked={highlightSamples}
            onCheckedChange={(checked) => setHighlightSamples(checked === true)}
            className="h-3.5 w-3.5"
          />
          {COMPANY_SAMPLES_FIELD_TITLE}
          <span className="text-muted-foreground tabular-nums">Шт.: {samplesCount}</span>
        </label>

        <div className="ml-auto text-xs text-muted-foreground tabular-nums">
          {companyBrowserLoading ? (
            "Загрузка…"
          ) : (
            <>
              Всего компаний в Bitrix24: <span className="font-semibold text-foreground">{companyBrowserTotal}</span>
              {companyBrowserTruncated && (
                <span className="ml-1">(показано {companyBrowserFetched})</span>
              )}
            </>
          )}
        </div>
      </div>

      {companyBrowserError && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{companyBrowserError}</AlertDescription>
        </Alert>
      )}

      {companyBrowserTruncated && !companyBrowserError && (
        <Alert
          className={
            companyBrowserPartial
              ? "py-2 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800"
              : "py-2 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"
          }
        >
          <AlertTriangle className={`h-4 w-4 ${companyBrowserPartial ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
          <AlertDescription className={`text-xs ${companyBrowserPartial ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
            {companyBrowserWarning || `Найдено ${companyBrowserTotal} компаний — показаны первые ${companyBrowserFetched}.`}
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs whitespace-nowrap w-10">№</TableHead>
              {columns.map((colId) => {
                const field = getField(colId);
                const isSorted = columnSort.columnId === colId;
                const hasFilter = columnFilters.some((f) => f.columnId === colId && f.value.trim());
                const isFilterActive = activeFilterCol === colId;
                const isNumeric = field?.type === "double" || field?.type === "integer" || field?.type === "money";
                const isDate = field?.type === "date" || field?.type === "datetime";

                return (
                  <TableHead
                    key={colId}
                    className="text-xs whitespace-nowrap group relative"
                    style={{
                      width: companyColumnWidths[colId] ? `${companyColumnWidths[colId]}px` : undefined,
                      minWidth: companyColumnWidths[colId] ? `${companyColumnWidths[colId]}px` : undefined,
                      maxWidth: companyColumnWidths[colId] ? `${companyColumnWidths[colId]}px` : undefined,
                    }}
                  >
                    <div className="flex items-start gap-1">
                      <button
                        onClick={() => toggleColumnSort(colId)}
                        className="flex items-start gap-1 hover:text-foreground transition-colors cursor-pointer text-left"
                        title={
                          isNumeric
                            ? "Сортировка по числам"
                            : isDate
                            ? "Сортировка по датам"
                            : "Сортировка по алфавиту"
                        }
                      >
                        <span className="whitespace-normal break-words leading-tight">{columnTitle(colId)}</span>
                        {isSorted && columnSort.direction === "asc" && <ArrowUp className="h-3 w-3 text-brand-blue flex-shrink-0 mt-0.5" />}
                        {isSorted && columnSort.direction === "desc" && <ArrowDown className="h-3 w-3 text-brand-blue flex-shrink-0 mt-0.5" />}
                        {!isSorted && <ArrowUpDown className="h-3 w-3 opacity-0 group-hover:opacity-30 transition-opacity flex-shrink-0 mt-0.5" />}
                      </button>

                      <button
                        onClick={() => setActiveFilterCol(isFilterActive ? null : colId)}
                        className={`p-0.5 rounded transition-all mt-0.5 ${
                          hasFilter ? "text-brand-orange" : "opacity-0 group-hover:opacity-40 hover:!opacity-70"
                        }`}
                        title="Фильтр по столбцу"
                      >
                        <Filter className="h-2.5 w-2.5" />
                      </button>
                    </div>

                    {isFilterActive && (
                      <div className="mt-1.5">
                        <div className="relative">
                          <Input
                            ref={filterInputRef}
                            placeholder="Фильтр..."
                            value={columnFilters.find((f) => f.columnId === colId)?.value || ""}
                            onChange={(e) => setColumnFilter(colId, e.target.value)}
                            className="h-6 text-[11px] rounded-sm pr-6 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
                          />
                          {(columnFilters.find((f) => f.columnId === colId)?.value || "") && (
                            <button
                              onClick={() => clearColumnFilter(colId)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div
                      className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-blue/50 ${activeResizingCol === colId ? "bg-brand-blue" : ""}`}
                      onPointerDown={(e) => handlePointerDown(e, colId, e.currentTarget.parentElement as HTMLTableCellElement)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {companyBrowserLoading && companyBrowserItems.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                  {columns.map((colId) => (
                    <TableCell key={colId}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : companyBrowserError ? null : pageItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-center text-xs text-muted-foreground py-8">
                  Компании не найдены
                </TableCell>
              </TableRow>
            ) : (
              pageItems.map((company, idx) => (
                <TableRow
                  key={String(company.ID)}
                  onClick={(event) => {
                    if (resizingState.current.colId || (event.target as HTMLElement).closest(
                      "button, a, input, select, textarea, label, [role='checkbox'], [role='button'], [contenteditable='true']"
                    )) return;
                    openPreview(String(company.ID), event.currentTarget);
                  }}
                  className={highlightSamples && hasSamplesInfo(company) ? "cursor-pointer bg-amber-100 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/40" : "cursor-pointer"}
                >
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {(currentPage - 1) * PAGE_SIZE + idx + 1}
                  </TableCell>
                  {columns.map((colId) => {
                    const field = getField(colId);
                    return (
                      <TableCell key={colId} className="text-xs whitespace-nowrap max-w-[280px] truncate">
                        {colId === "TITLE" ? <button type="button" data-company-preview
                          className="max-w-full truncate text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={(event) => openPreview(String(company.ID), event.currentTarget.closest("tr"))}>
                          {resolveCompanyValue(company, colId, userNames, field) || "—"}
                        </button> : resolveCompanyValue(company, colId, userNames, field) || "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {/* Spacer so the table's own horizontal scrollbar doesn't sit on top
            of the last row when scrolled all the way down. */}
        <div className="h-4" />
      </div>

      {/* Pagination (client-side, over the filtered/sorted set) */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {sortedItems.length > 0
            ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, sortedItems.length)} из ${sortedItems.length}`
            : ""}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="tabular-nums px-1">{currentPage} / {totalPages}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {previewId && <CompanyPreview key={previewId} id={previewId} fieldsFor={previewFields}
        onClose={() => setPreviewId(null)} onRestoreFocus={() => previewTrigger.current?.focus()} />}
      <CompanyColumnSelector />
    </div>
  );
}
