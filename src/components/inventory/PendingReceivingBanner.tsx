import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useIncomingTransfers } from "@/hooks/useTransferOrders";

/** Varnar i Lager när butiken har leveranser som inte är mottagna — lagret stämmer inte förrän de godkänts. */
export default function PendingReceivingBanner() {
  const { activeStoreId } = useSite();
  const { data: transfers = [] } = useIncomingTransfers(activeStoreId || null);
  const { data: orders = 0 } = useQuery({
    queryKey: ["pending_receiving_count", activeStoreId],
    enabled: !!activeStoreId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: sent } = await supabase
        .from("shop_orders")
        .select("id")
        .eq("store_id", activeStoreId!)
        .eq("status", "Skickad");
      const ids = (sent ?? []).map((o: any) => o.id);
      if (!ids.length) return 0;
      const { data: reps } = await supabase
        .from("delivery_receiving_reports")
        .select("shop_order_id")
        .in("shop_order_id", ids);
      const done = new Set((reps ?? []).map((r: any) => r.shop_order_id));
      return ids.filter((id) => !done.has(id)).length;
    },
  });

  const total = orders + transfers.length;
  if (!activeStoreId || total === 0) return null;

  return (
    <Link
      to="/receiving"
      className="mb-3 flex items-start gap-3 rounded-md border-2 border-warning bg-warning/15 p-3 text-foreground"
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
      <div className="text-sm">
        <p className="font-semibold">
          {total === 1 ? "1 inleverans väntar på att godkännas" : `${total} inleveranser väntar på att godkännas`}
        </p>
        <p className="text-xs text-muted-foreground">
          Lagret stämmer inte förrän varorna är mottagna. Tryck här för att ta emot.
        </p>
      </div>
    </Link>
  );
}
