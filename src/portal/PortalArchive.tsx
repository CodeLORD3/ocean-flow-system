import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, format, differenceInDays } from "date-fns";
import { Archive, CheckCircle } from "lucide-react";
import { usePortalTabs } from "./PortalTabsContext";

export default function PortalArchive() {
  const { openOfferTab } = usePortalTabs();

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["portal-archive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*, companies(*)")
        .in("status", ["Closed", "Repaid"])
        .order("maturity_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading archive...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-foreground flex items-center gap-2">
          <Archive className="h-4 w-4 text-primary" />
          Archive
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">Completed investment offers that have been fully paid out.</p>
      </div>

      <div className="border border-border bg-white">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border text-[10px] text-muted-foreground">
              <th className="text-left p-2 pl-3 font-medium">Offer</th>
              <th className="text-left p-2 font-medium">Company</th>
              <th className="text-right p-2 font-medium">Funded Amount</th>
              <th className="text-right p-2 font-medium">Return</th>
              <th className="text-left p-2 font-medium">Purchase Date</th>
              <th className="text-left p-2 font-medium">Maturity Date</th>
              <th className="text-right p-2 font-medium">Duration</th>
              <th className="text-center p-2 pr-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer: any, idx: number) => {
              const duration = offer.tenor_days ? Number(offer.tenor_days) : (offer.purchase_date && offer.maturity_date ? differenceInDays(parseISO(offer.maturity_date), parseISO(offer.purchase_date)) : null);
              return (
                <tr
                  key={offer.id}
                  onClick={() => openOfferTab(offer.id, offer.title)}
                  className={`border-b border-border/50 hover:bg-primary/10 cursor-pointer transition-colors h-8 ${idx % 2 === 1 ? "bg-muted/50" : ""}`}
                >
                  <td className="p-2 pl-3 text-foreground font-medium">{offer.title}</td>
                  <td className="p-2 text-muted-foreground">{offer.companies?.name || "—"}</td>
                  <td className="p-2 text-right text-foreground font-mono">{Number(offer.funded_amount).toLocaleString()} kr</td>
                  <td className="p-2 text-right text-green-600 font-semibold">{Number(offer.interest_rate).toFixed(1)}%</td>
                  <td className="p-2 text-muted-foreground">
                    {offer.purchase_date ? format(parseISO(offer.purchase_date), "d MMM yyyy") : "—"}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {offer.maturity_date ? format(parseISO(offer.maturity_date), "d MMM yyyy") : "—"}
                  </td>
                  <td className="p-2 text-right text-muted-foreground font-mono">
                    {duration !== null ? `${duration}d` : "—"}
                  </td>
                  <td className="p-2 pr-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-semibold tracking-wide border text-green-700 bg-green-50 border-green-200">
                      <CheckCircle className="h-2.5 w-2.5" />
                      CLOSED
                    </span>
                  </td>
                </tr>
              );
            })}
            {offers.length === 0 && (
              <tr>
                <td colSpan={8} className="p-5 text-center text-muted-foreground text-xs">
                  No archived offers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
