import { useState, useEffect } from "react";

export function useUserDetails(userId: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;

    async function fetchDetails() {
      setLoading(true);
      setError(null);
      try {
        const [usersRes, dealsRes] = await Promise.all([
          fetch("/api/bitrix/users"),
          fetch("/api/bitrix/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filter: { "=ASSIGNED_BY_ID": userId },
              select: ["ID", "TITLE", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID"],
              order: { DATE_CREATE: "DESC" }
            })
          })
        ]);

        if (!usersRes.ok) throw new Error("Failed to fetch users");
        if (!dealsRes.ok) throw new Error("Failed to fetch deals");

        const usersData = await usersRes.json();
        const dealsData = await dealsRes.json();

        if (isMounted) {
          const userName = usersData.users?.[userId];
          if (!userName) {
            throw new Error("User not found");
          }
          setData({
            id: userId,
            name: userName,
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
  }, [userId]);

  return { data, loading, error };
}
