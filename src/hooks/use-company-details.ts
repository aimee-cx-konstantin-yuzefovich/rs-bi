import { useState, useEffect } from "react";

export function useCompanyDetails(companyId: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!companyId) return;

    let isMounted = true;

    async function fetchDetails() {
      setLoading(true);
      setError(null);
      try {
        const [companyRes, dealsRes] = await Promise.all([
          fetch("/api/bitrix/companies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ids: [companyId],
              select: ["ID", "TITLE", "REVENUE", "INDUSTRY"]
            })
          }),
          fetch("/api/bitrix/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filter: { "=COMPANY_ID": companyId },
              select: ["ID", "TITLE", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID"],
              order: { DATE_CREATE: "DESC" }
            })
          })
        ]);

        if (!companyRes.ok) throw new Error("Failed to fetch company");
        if (!dealsRes.ok) throw new Error("Failed to fetch deals");

        const companyData = await companyRes.json();
        const dealsData = await dealsRes.json();

        if (isMounted) {
          const company = companyData.companies?.[companyId];
          if (!company) {
            throw new Error("Company not found");
          }
          setData({
            ...company,
            deals: dealsData.deals || []
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("Unknown error"));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [companyId]);

  return { data, loading, error };
}
