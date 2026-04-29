"use client";

import { useEntityDrawerStore } from "@/store/entity-drawer-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useCompanyDetails } from "@/hooks/use-company-details";
import { useUserDetails } from "@/hooks/use-user-details";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function DealsPreview({ deals }: { deals: any[] }) {
  if (!deals || deals.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No related deals found.
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      <h3 className="text-sm font-semibold">Recent Deals ({deals.length})</h3>
      <div className="space-y-2">
        {deals.slice(0, 5).map((deal) => (
          <div key={deal.ID} className="p-3 border rounded-md text-sm">
            <div className="font-medium truncate">{deal.TITLE || `Deal #${deal.ID}`}</div>
            <div className="text-muted-foreground text-xs mt-1 flex justify-between">
              <span>Stage: {deal.STAGE_ID}</span>
              {deal.OPPORTUNITY && (
                <span>{deal.OPPORTUNITY} {deal.CURRENCY_ID}</span>
              )}
            </div>
          </div>
        ))}
        {deals.length > 5 && (
          <div className="text-xs text-muted-foreground text-center pt-2">
            + {deals.length - 5} more deals
          </div>
        )}
      </div>
    </div>
  );
}

function OpenInCRMButton({ type, id }: { type: "company" | "user"; id: string }) {
  const href = type === "company" 
    ? `https://your-bitrix-domain.bitrix24.ru/crm/company/details/${id}/`
    : `https://your-bitrix-domain.bitrix24.ru/company/personal/user/${id}/`;

  return (
    <Button variant="outline" className="w-full mt-4" asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="w-4 h-4 mr-2" />
        Open in CRM
      </a>
    </Button>
  );
}

function CompanyDrawerContent({ companyId }: { companyId: string }) {
  const { data, loading, error } = useCompanyDetails(companyId);

  if (loading) {
    return (
      <div className="space-y-4 mt-6">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="grid grid-cols-2 gap-4 mt-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <Skeleton className="h-32 w-full mt-6" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-sm text-destructive mt-6">
        {error?.message || "Company not found"}
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-6">
      <div>
        <h2 className="text-xl font-semibold">{data.TITLE || `ID ${companyId}`}</h2>
        <div className="text-sm text-muted-foreground mt-1">
          Company ID: {companyId}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Revenue" value={data.REVENUE} />
        <Field label="Industry" value={data.INDUSTRY} />
      </div>

      <DealsPreview deals={data.deals} />

      <OpenInCRMButton type="company" id={companyId} />
    </div>
  );
}

function ResponsibleDrawerContent({ userId }: { userId: string }) {
  const { data, loading, error } = useUserDetails(userId);

  if (loading) {
    return (
      <div className="space-y-4 mt-6">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full mt-6" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-sm text-destructive mt-6">
        {error?.message || "User not found"}
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-6">
      <div>
        <h2 className="text-xl font-semibold">{data.name || `ID ${userId}`}</h2>
        <div className="text-sm text-muted-foreground mt-1">
          User ID: {userId}
        </div>
      </div>

      <DealsPreview deals={data.deals} />

      <OpenInCRMButton type="user" id={userId} />
    </div>
  );
}

export function EntityDrawer() {
  const { isOpen, entityType, entityId, close } = useEntityDrawerStore();

  return (
    <Sheet open={isOpen} onOpenChange={(v) => !v && close()}>
      <SheetContent side="right" className="w-full sm:w-[520px] overflow-y-auto">
        <SheetHeader className="sr-only">
          <SheetTitle>Details</SheetTitle>
          <SheetDescription>Entity details and related deals</SheetDescription>
        </SheetHeader>
        
        {entityType === "company" && entityId && (
          <CompanyDrawerContent companyId={entityId} />
        )}

        {entityType === "responsible" && entityId && (
          <ResponsibleDrawerContent userId={entityId} />
        )}
      </SheetContent>
    </Sheet>
  );
}
