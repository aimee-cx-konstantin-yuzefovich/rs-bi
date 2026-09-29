"use client";

import { useCallback, useMemo } from "react";
import { useDashboardStore } from "@/store/dashboard-store";
import { useTableState } from "@/hooks/use-table-state";
import { Button } from "@/components/ui/button";
import { DateFilter } from "./date-filter";
import { PipelineFilter } from "./pipeline-filter";
import { ResponsibleFilter } from "./responsible-filter";
import { GlobalSearch } from "./global-search";
import { ActiveFilters } from "./active-filters";
import { SavedViews } from "./saved-views";
import { Columns3, Download } from "lucide-react";
import { exportToExcelWysiwyg } from "@/lib/export-utils";
import { formatHeaderToRussian, formatStageToRussian } from "@/lib/excel-brand";
import { buildEnrichmentExtraWarnings } from "@/lib/enrichment-disclosure";
import { getDealStageDisplayLabel } from "@/lib/crm-constants";
import { parseStrictDate, parseStrictNumber } from "@/lib/scalar-safety";

export function DealsToolbar() {
  const {
    dateFilter,
    pipelineFilter,
    responsibleFilter,
    searchQuery,
    userNames,
    columnFilters,
    dealsCoverage,
    dealsTotal,
    dealsFetched,
    dealsTruncated,
    dealsLoading,
    fields,
    companiesDataLoading,
    activitiesDataLoading,
    userNamesLoading,
    usersCoverage,
    activitiesCoverage,
    companiesDataCoverage,
    fieldsCoverage,
    setColumnSelectorOpen,
  } = useDashboardStore();

  const { sortedDeals, columns, fieldMap, resolveValue } = useTableState();

  const enrichmentPending = useMemo(() => {
    return columns.some((colId) => {
      if (colId === "COMPANY_TITLE" || colId.startsWith("COMPANY_")) return companiesDataLoading;
      if (colId === "ACTIVITY_LAST" || colId === "ACTIVITY_NEXT") return activitiesDataLoading;
      if (colId === "ASSIGNED_BY_ID") return userNamesLoading;
      return false;
    });
  }, [columns, companiesDataLoading, activitiesDataLoading, userNamesLoading]);

  const handleExport = useCallback(() => {
    if (sortedDeals.length === 0 || columns.length === 0) return;

    const exportColumns = columns.map((colId) => {
      const title = fieldMap.get(colId)?.title;
      return formatHeaderToRussian(title || colId);
    });

    const exportData = sortedDeals.map((deal) =>
      columns.map((colId) => {
        const raw = deal[colId];
        const resolved = resolveValue(deal, colId);
        const field = fieldMap.get(colId);

        if (resolved === null || resolved === undefined || resolved === "") return null;

        if (colId === "STAGE_ID" || field?.id === "STAGE_ID") {
          return formatStageToRussian(resolved);
        }

        if (colId === "CURRENCY_ID" || field?.id === "CURRENCY_ID") {
          return resolved === "RUB" ? "₽" : resolved;
        }

        if (field?.type === "char" || field?.type === "boolean") {
          if (raw === "Y" || raw === "1" || String(raw) === "true") return "Да";
          if (raw === "N" || raw === "0" || String(raw) === "false") return "Нет";
        }

        if (field?.type === "money" && raw) {
          const parts = String(raw).split("|");
          const amount = parseStrictNumber(parts[0]);
          if (amount !== undefined) {
            return amount;
          }
        }

        if (
          field?.type === "double" ||
          field?.type === "integer" ||
          field?.id === "OPPORTUNITY" ||
          colId === "OPPORTUNITY"
        ) {
          const num = parseStrictNumber(resolved);
          if (num !== undefined) {
            return num;
          }
        }

        if (
          field?.type === "date" ||
          field?.type === "datetime" ||
          field?.id === "DATE_CREATE" ||
          field?.id === "DATE_MODIFY"
        ) {
          const d = parseStrictDate(resolved);
          if (d && !isNaN(d.getTime())) {
            return d;
          }
        }

        return resolved;
      })
    );

    const filtersSummary: string[] = [];
    if (responsibleFilter && responsibleFilter !== "all") {
      filtersSummary.push(`Ответственный: ${userNames[responsibleFilter] || responsibleFilter}`);
    }
    if (pipelineFilter && pipelineFilter !== "all") {
      filtersSummary.push(`Воронка: ${getDealStageDisplayLabel(pipelineFilter)}`);
    }
    if (searchQuery && searchQuery.trim()) {
      filtersSummary.push(`Поиск (только таблица): "${searchQuery.trim()}"`);
    }
    for (const cf of columnFilters || []) {
      if (cf.value && cf.value.trim()) {
        const label = fieldMap.get(cf.columnId)?.title || cf.columnId;
        filtersSummary.push(`Столбец "${label}": "${cf.value.trim()}"`);
      }
    }

    const periodLabel =
      dateFilter.preset === "custom" && dateFilter.customFrom && dateFilter.customTo
        ? `${dateFilter.customFrom} – ${dateFilter.customTo}`
        : dateFilter.preset === "7days"
        ? "Последние 7 дней"
        : dateFilter.preset === "14days"
        ? "Последние 14 дней"
        : dateFilter.preset === "30days"
        ? "Последние 30 дней"
        : dateFilter.preset === "90days"
        ? "Последние 90 дней"
        : "Все";

    try {
      exportToExcelWysiwyg(exportData, exportColumns, {
        title: "Отчёт по сделкам",
        sheetName: "Сделки",
        fileNamePrefix: "РусСилика_Сделки",
        period: periodLabel,
        filtersText: filtersSummary.length > 0 ? filtersSummary.join(" | ") : "Все",
        rawColumnIds: columns,
        rawColumnTypes: columns.map((colId: string) => fieldMap.get(colId)?.type),
        rowCurrencies: sortedDeals.map((d: any) => d.CURRENCY_ID),
        coverage: dealsCoverage ?? undefined,
        extraWarnings: buildEnrichmentExtraWarnings({
          selectedColumns: columns,
          fields,
          usersCoverage,
          activitiesCoverage,
          companiesDataCoverage,
          fieldsCoverage,
        }),
      });
    } catch (err) {
      console.error("Ошибка при экспорте сделок в Excel:", err);
    }
  }, [
    sortedDeals,
    columns,
    fieldMap,
    resolveValue,
    dateFilter,
    pipelineFilter,
    responsibleFilter,
    searchQuery,
    columnFilters,
    dealsCoverage,
    userNames,
    fields,
    usersCoverage,
    activitiesCoverage,
    companiesDataCoverage,
    fieldsCoverage,
  ]);

  return (
    <div
      data-testid="deals-toolbar"
      className="flex items-center gap-2 px-4 sm:px-6 py-2.5 border-b bg-card/50 overflow-x-auto no-scrollbar flex-nowrap"
    >
      {/* 1. Date */}
      <DateFilter />

      {/* 2. Pipeline */}
      <PipelineFilter />

      {/* 3. Responsible */}
      <ResponsibleFilter />

      {/* 4. Search */}
      <div className="w-56 shrink-0">
        <GlobalSearch />
      </div>

      {/* 5. Active filters badge */}
      <ActiveFilters />

      {/* 6. Saved Views */}
      <SavedViews />

      {/* 7. Columns */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setColumnSelectorOpen(true)}
        className="h-8 gap-1.5 text-xs shrink-0"
      >
        <Columns3 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Столбцы</span>
      </Button>

      {/* 8. Export — ALWAYS THE LAST ACTION CONTROL */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={sortedDeals.length === 0 || enrichmentPending}
        title={
          enrichmentPending
            ? "Экспорт недоступен: данные для выбранных столбцов ещё загружаются"
            : undefined
        }
        className="h-8 gap-1.5 text-xs shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Экспорт</span>
      </Button>

      {/* Far-right informational non-action total */}
      <div className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0 whitespace-nowrap pl-2">
        {dealsLoading ? (
          "Загрузка…"
        ) : (
          <>
            Всего сделок: <span className="font-semibold text-foreground">{dealsTotal.toLocaleString("ru-RU")}</span>
            {dealsTruncated && (
              <span className="ml-1 text-amber-600 dark:text-amber-400 font-normal">
                (загружено {dealsFetched.toLocaleString("ru-RU")})
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
