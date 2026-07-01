"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { COMPANY_RESPONSIBLE_FIELD_TITLE } from "@/lib/crm-constants";
import { exportToExcelWysiwyg } from "@/lib/export-utils";
import { CompanyColumnSelector } from "./company-column-selector";
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
import { AlertCircle, AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Columns3, Download, UserCircle } from "lucide-react";

const PAGE_SIZE = 50;

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
    return String(company.TITLE || "").trim() || `ID ${company.ID ?? ""}`;
  }

  if (colId === "ASSIGNED_BY_ID") {
    const id = String(company.ASSIGNED_BY_ID || "").trim();
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

export function CompanyBrowser() {
  const {
    fields,
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
  } = useDashboardStore();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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

  const responsibleOptions = useMemo(() => {
    return Object.entries(userNames)
      .map(([id, name]) => ({ id, name: name || `ID ${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [userNames]);

  const activeName =
    companyBrowserResponsibleId === "all"
      ? "Все ответственные"
      : responsibleOptions.find((o) => o.id === companyBrowserResponsibleId)?.name || "Все ответственные";

  const totalPages = Math.max(1, Math.ceil(companyBrowserItems.length / PAGE_SIZE));
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return companyBrowserItems.slice(start, start + PAGE_SIZE);
  }, [companyBrowserItems, currentPage]);

  // WYSIWYG export — same columns/order/formatting shown in the table, but
  // over the full fetched set (not just the current page), mirroring how the
  // deals table's export works over the full filtered/sorted set.
  const handleExport = useCallback(() => {
    if (companyBrowserItems.length === 0 || columns.length === 0) return;

    const exportColumns = columns.map((colId) => columnTitle(colId));
    const exportData = companyBrowserItems.map((company) =>
      columns.map((colId) => {
        const field =
          colId === "TITLE" || colId === "ASSIGNED_BY_ID" ? undefined : fieldMap.get(`COMPANY_${colId}`);
        return resolveCompanyValue(company, colId, userNames, field);
      })
    );

    exportToExcelWysiwyg(exportData, exportColumns, {
      sheetName: "Компании",
      fileNamePrefix: "russilica_companies",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyBrowserItems, columns, fieldMap, userNames]);

  return (
    <div className="flex-1 flex flex-col min-h-0 px-4 sm:px-6 py-4 gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
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

        {userNamesLoading && (
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
              {columns.map((colId) => (
                <TableHead key={colId} className="text-xs whitespace-nowrap">
                  {columnTitle(colId)}
                </TableHead>
              ))}
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
                <TableRow key={String(company.ID)}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {(currentPage - 1) * PAGE_SIZE + idx + 1}
                  </TableCell>
                  {columns.map((colId) => {
                    const field =
                      colId === "TITLE" || colId === "ASSIGNED_BY_ID"
                        ? undefined
                        : fieldMap.get(`COMPANY_${colId}`);
                    return (
                      <TableCell key={colId} className="text-xs whitespace-nowrap max-w-[280px] truncate">
                        {resolveCompanyValue(company, colId, userNames, field) || "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination (client-side, over the fetched/capped set) */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {companyBrowserItems.length > 0
            ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, companyBrowserItems.length)} из ${companyBrowserItems.length}`
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

      <CompanyColumnSelector />
    </div>
  );
}
