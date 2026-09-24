"use client";

// src/components/dashboard/samples/sample-preview.tsx
// Read-only Sample Preview drawer — mirrors Company/Deal Preview quality.
// No edit mode, no write actions (Samples v1 §12.D).

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Handshake, ExternalLink, FlaskConical } from "lucide-react";
import {
  NORMALIZED_RESULT_LABELS,
  SAMPLE_DATA_ISSUE_LABELS,
  SOURCE_QUALITY_LABELS,
} from "@/lib/samples/constants";
import type { SampleSummary } from "@/lib/samples/types";
import { formatDateRu } from "./samples-registry";

const RESULT_BADGE_CLASS: Record<string, string> = {
  positive: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  negative: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  rework: "bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  mixed: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
  unknown: "bg-muted text-muted-foreground",
};

const QUALITY_BADGE_CLASS: Record<string, string> = {
  structured: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  partial: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
  legacy: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ambiguous: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300",
};

export interface SamplePreviewProps {
  summary: SampleSummary;
  onClose: () => void;
  onRestoreFocus?: () => void;
  onOpenCompanyPreview?: (companyId: string) => void;
  onOpenDealPreview?: (dealId: string) => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-3 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function SamplePreview({
  summary,
  onClose,
  onRestoreFocus,
  onOpenCompanyPreview,
  onOpenDealPreview,
}: SamplePreviewProps) {
  const [bitrixUrl, setBitrixUrl] = useState<string | null>(null);

  // Safe external Bitrix link is derived server-side on the main pages;
  // here we reuse the same convention via the company details route pattern.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/bitrix/companies/${encodeURIComponent(summary.companyId)}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setBitrixUrl(typeof data.bitrixUrl === "string" ? data.bitrixUrl : null);
        }
      } catch {
        // Link stays null — UI handles absence gracefully.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summary.companyId]);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col"
        onCloseAutoFocus={(event) => {
          if (onRestoreFocus) {
            event.preventDefault();
            onRestoreFocus();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle className="pr-6 break-words text-lg flex items-start gap-2">
            <FlaskConical className="h-4 w-4 mt-1 shrink-0 text-muted-foreground" />
            <span>{summary.companyTitle}</span>
          </SheetTitle>
          <SheetDescription>
            Образцы · просмотр (только чтение) · компания ID {summary.companyId}
          </SheetDescription>
        </SheetHeader>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4"
          aria-live="polite"
        >
          <dl className="space-y-1 pb-6 text-sm divide-y divide-border/60">
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <Badge
                className={`text-[10px] px-1.5 py-0 font-normal ${
                  RESULT_BADGE_CLASS[summary.normalizedResult] ?? ""
                }`}
              >
                {NORMALIZED_RESULT_LABELS[summary.normalizedResult] ?? summary.normalizedResult}
              </Badge>
              <Badge
                className={`text-[10px] px-1.5 py-0 font-normal ${
                  QUALITY_BADGE_CLASS[summary.sourceQuality] ?? ""
                }`}
                title="Качество данных источника"
              >
                {SOURCE_QUALITY_LABELS[summary.sourceQuality] ?? summary.sourceQuality}
              </Badge>
            </div>

            <Section title="Основное">
              <Row label="Ответственный">
                {summary.responsibleName ?? summary.responsibleId ?? "—"}
              </Row>
              <Row label="Компания">
                {onOpenCompanyPreview ? (
                  <button
                    type="button"
                    data-company-link={summary.companyId}
                    onClick={() => onOpenCompanyPreview(summary.companyId)}
                    className="font-medium text-primary hover:underline inline-flex items-center gap-1.5 text-left"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {summary.companyTitle}
                  </button>
                ) : (
                  <span className="font-medium inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {summary.companyTitle}
                  </span>
                )}
              </Row>
              <Row label="Отрасль / применение">
                {[summary.industry, summary.application].filter(Boolean).join(" · ") || "—"}
              </Row>
            </Section>

            <Section title="Образцы">
              <Row label="Продукты">
                {summary.productFamilies.length > 0
                  ? summary.productFamilies.join(", ")
                  : "—"}
              </Row>
              <Row label="Марки (Гель/Золь)">
                {summary.grades.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {summary.grades.map((g, i) => (
                      <Badge
                        key={`${g.value}-${i}`}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 font-normal"
                      >
                        {g.productFamily ? `${g.productFamily}: ` : ""}
                        {g.value}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="Количество">
                {summary.quantities.length > 0
                  ? summary.quantities
                      .map(
                        (q) =>
                          `${typeof q.value === "number" ? q.value.toLocaleString("ru-RU") : q.value}${
                            q.unit ? ` ${q.unit}` : ""
                          }${q.productFamily ? ` (${q.productFamily})` : ""}`
                      )
                      .join(" · ")
                  : "—"}
              </Row>
              <Row label="Даты передачи образцов">
                {summary.sentDates.length > 0
                  ? summary.sentDates.map(formatDateRu).join(", ")
                  : "—"}
              </Row>
              <Row label="Статусы / индикаторы">
                {[...summary.sampleIndicators, ...summary.processStatuses].join(", ") || "—"}
              </Row>
              <Row label="Результат испытаний (исходное значение)">
                {summary.rawTestResult ? (
                  <span className="whitespace-pre-wrap break-words text-xs">
                    «{summary.rawTestResult}»
                  </span>
                ) : (
                  "—"
                )}
              </Row>
            </Section>

            <Section title="Связанные сделки">
              {summary.relatedDeals.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Сделок с данными по образцам не найдено
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {summary.relatedDeals.map((deal) => (
                    <li key={deal.id} className="text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Handshake className="h-3 w-3 text-muted-foreground shrink-0" />
                        {onOpenDealPreview ? (
                          <button
                            type="button"
                            data-deal-link={deal.id}
                            onClick={() => onOpenDealPreview(deal.id)}
                            className="font-medium text-primary hover:underline text-left"
                          >
                            {deal.title}
                          </button>
                        ) : (
                          <span className="font-medium">{deal.title}</span>
                        )}
                        {deal.stageId && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                            {deal.stageId}
                          </Badge>
                        )}
                      </div>
                      {(deal.sampleTransferStatus ||
                        deal.sampleTestingStatus.length > 0 ||
                        deal.sampleSentDate) && (
                        <div className="mt-0.5 text-muted-foreground">
                          {[
                            deal.sampleTransferStatus,
                            deal.sampleTestingStatus.join(", "),
                            deal.sampleSentDate ? formatDateRu(deal.sampleSentDate) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Качество данных">
              {summary.dataIssues.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Существенных проблем в данных не обнаружено
                </p>
              ) : (
                <ul className="space-y-1">
                  {summary.dataIssues.map((issue) => (
                    <li key={issue} className="text-xs text-amber-700 dark:text-amber-400">
                      ⚠ {SAMPLE_DATA_ISSUE_LABELS[issue] ?? issue}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-muted-foreground pt-1">
                Уровень «{SOURCE_QUALITY_LABELS[summary.sourceQuality] ?? summary.sourceQuality}» —
                автоматическая оценка полноты и согласованности полей образцов в Bitrix24.
              </p>
            </Section>
          </dl>
        </div>

        <SheetFooter className="border-t pt-3">
          {bitrixUrl ? (
            <Button asChild className="w-full sm:w-auto">
              <a href={bitrixUrl} target="_blank" rel="noopener noreferrer">
                Открыть компанию в Bitrix24
                <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </a>
            </Button>
          ) : (
            <Button disabled className="w-full sm:w-auto">
              Открыть компанию в Bitrix24
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
