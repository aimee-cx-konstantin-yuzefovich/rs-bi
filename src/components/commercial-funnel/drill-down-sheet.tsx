"use client";

// src/components/commercial-funnel/drill-down-sheet.tsx
// Displays the exact list of unique companies behind any KPI card.
// Reconciles with card number and allows opening CompanyPreview.

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ExternalLink } from "lucide-react";
import type { CommercialCompany } from "@/lib/commercial-funnel/types";
import { formatCurrencyAmount } from "@/lib/commercial-funnel/normalize";

interface DrillDownSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  companyIds: string[];
  allCompanies: CommercialCompany[];
  onSelectCompany: (companyId: string) => void;
}

export function CommercialDrillDownSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  companyIds,
  allCompanies,
  onSelectCompany,
}: DrillDownSheetProps) {
  // Reconcile: filter exactly those companies whose ID is in companyIds
  const matchingCompanies = allCompanies.filter((c) => companyIds.includes(c.id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <SheetTitle className="text-base">{title}</SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            {subtitle || `Компании, вошедшие в показатель (${matchingCompanies.length})`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4">
          {matchingCompanies.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Нет компаний для отображения
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Компания</TableHead>
                    <TableHead className="text-xs">Ответственный</TableHead>
                    <TableHead className="text-xs">Статус образцов</TableHead>
                    <TableHead className="text-xs">Этап сделки</TableHead>
                    <TableHead className="text-xs text-right">Сумма</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchingCompanies.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelectCompany(c.id)}
                    >
                      <TableCell className="font-medium text-xs">
                        <div className="flex items-center gap-1.5">
                          <span>{c.title}</span>
                          {c.hasAttention && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">
                              Внимание
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.responsibleName || c.responsibleId}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="text-[10px]">
                          {c.sampleStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.primaryDealStageName || c.primaryDealStageId || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        {c.primaryDealOpportunity
                          ? formatCurrencyAmount(
                              c.primaryDealOpportunity,
                              c.primaryDealCurrencyId ||
                                (c.primaryDealId
                                  ? c.deals.find((d) => d.id === c.primaryDealId)?.currencyId
                                  : undefined) ||
                                "RUB"
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCompany(c.id);
                          }}
                          title="Открыть карточку компании"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
