"use client";

import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLoginRedirect } from "@/hooks/use-login-redirect";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useDashboardStore } from "@/store/dashboard-store";
import { CompanyBrowser } from "@/components/dashboard/company-browser";
import { BarChart3, ArrowLeft } from "lucide-react";

function CompaniesContent() {
  const { data: session, status } = useSession();
  const rawSearchParams = useSearchParams();
  const {
    fields,
    fetchFields,
    userNames,
    fetchUserNames,
    isDemoMode,
    checkConfig,
    setCompanyBrowserResponsibleId,
    companyResponsibleCounts,
    fetchCompanyResponsibleCounts,
  } = useDashboardStore();
  const [appliedUrlResponsible, setAppliedUrlResponsible] = useState(false);

  useLoginRedirect(status, session?.error);

  useEffect(() => {
    if (status !== "authenticated") return;
    checkConfig();
    if (fields.length === 0) fetchFields();
    if (userNames && Object.keys(userNames).length === 0) fetchUserNames();
    // The responsible-person picker uses companyResponsibleCounts as its
    // source of truth — real company ownership, scanned directly from
    // crm.company.list, independent of the deals dataset.
    if (Object.keys(companyResponsibleCounts).length === 0) fetchCompanyResponsibleCounts();
  }, [status, fields.length]);

  // Deep link from the main deals table's "Ответственный компании" filter:
  // /companies?responsible=<name typed there> — pre-select the matching person.
  useEffect(() => {
    if (appliedUrlResponsible) return;
    const nameParam = rawSearchParams.get("responsible");
    if (!nameParam || Object.keys(userNames).length === 0) return;

    const query = nameParam.trim().toLowerCase();
    const match = Object.entries(userNames).find(([, name]) =>
      name.toLowerCase().includes(query)
    );
    if (match) {
      setCompanyBrowserResponsibleId(match[0]);
    }
    setAppliedUrlResponsible(true);
  }, [rawSearchParams, userNames, appliedUrlResponsible, setCompanyBrowserResponsibleId]);

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="z-30 header-gradient border-b border-white/10">
        <div className="flex items-center justify-between px-3 sm:px-5 h-12 gap-2">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity cursor-pointer">
            <BarChart3 className="h-5 w-5 text-white/80 shrink-0" />
            <span className="text-sm font-semibold tracking-wide text-white">RusSilica</span>
            <span className="hidden sm:inline text-xs font-normal text-white/40">Компании</span>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-1.5 h-7 px-2 rounded text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">К сделкам</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0">
        {isDemoMode && (
          <div className="px-4 sm:px-6 pt-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                Демо-режим — прямой запрос к Bitrix24 недоступен без подключения
              </span>
            </div>
          </div>
        )}
        <CompanyBrowser />
      </main>
    </div>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={null}>
      <CompaniesContent />
    </Suspense>
  );
}
