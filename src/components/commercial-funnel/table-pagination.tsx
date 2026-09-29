"use client";

// src/components/commercial-funnel/table-pagination.tsx
// Standardized client-side pagination footer for Commercial Funnel tables.

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
  pageSizeOptions?: number[];
}

export function CommercialTablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 250],
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const from = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);

  if (totalItems <= pageSizeOptions[0] && totalItems <= pageSize) {
    return (
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/60 text-xs text-muted-foreground bg-card/30">
        <span>Показано {totalItems} записей</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border-t border-border/60 text-xs text-muted-foreground bg-card/30">
      {/* Records info */}
      <div className="flex items-center gap-4">
        <span>
          Показано <strong className="text-foreground font-medium">{from}–{to}</strong> из{" "}
          <strong className="text-foreground font-medium">{totalItems}</strong> записей
        </span>

        {/* Page size selector */}
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline">Показывать по:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(val) => {
              onPageSizeChange(Number(val));
              onPageChange(1);
            }}
          >
            <SelectTrigger className="h-6.5 w-16 text-xs px-1.5 py-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-1 ml-auto">
        <span className="text-xs mr-2">
          Стр. <strong className="text-foreground font-medium">{safePage}</strong> из {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={safePage <= 1}
          className="h-6.5 w-6.5 p-0"
          title="Первая страница"
        >
          <ChevronsLeft className="h-3 w-3" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="h-6.5 w-6.5 p-0"
          title="Предыдущая страница"
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="h-6.5 w-6.5 p-0"
          title="Следующая страница"
        >
          <ChevronRight className="h-3 w-3" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={safePage >= totalPages}
          className="h-6.5 w-6.5 p-0"
          title="Последняя страница"
        >
          <ChevronsRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
