import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseISO, format } from "date-fns";

export default function PortalArchive() {
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["portal-archive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*")
        .in("status", ["Closed", "Repaid"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading archive...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Archive</h1>
        <p className="text-sm text-muted-foreground mt-1">Previously completed or closed investment offers.</p>
      </div>

      <div className="border border-border bg-white">
        <div className="h-11 flex items-center px-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Closed Offers</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left p-3 pl-4 font-medium">Offer</th>
              <th className="text-right p-3 font-medium">Target Amount</th>
              <th className="text-right p-3 font-medium">Amount Funded</th>
              <th className="text-right p-3 font-medium">Return</th>
              <th className="text-left p-3 font-medium">Maturity</th>
              <th className="text-center p-3 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="p-3 pl-4 text-foreground font-medium">{offer.title}</td>
                <td className="p-3 text-right text-foreground font-mono">{Number(offer.target_amount).toLocaleString()} kr</td>
                <td className="p-3 text-right text-foreground font-mono">{Number(offer.funded_amount).toLocaleString()} kr</td>
                <td className="p-3 text-right text-green-600 font-semibold">{Number(offer.interest_rate).toFixed(1)}%</td>
                <td className="p-3 text-muted-foreground">
                  {offer.maturity_date ? format(parseISO(offer.maturity_date), "d MMM yyyy") : "—"}
                </td>
                <td className="p-3 pr-4 text-center">
                  <span className={`inline-block px-2.5 py-1 text-[10px] font-semibold tracking-wide border ${
                    offer.status === "Repaid"
                      ? "text-green-700 border-green-200 bg-green-50"
                      : "text-destructive border-destructive/20 bg-destructive/5"
                  }`}>
                    {offer.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
            {offers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-muted-foreground text-sm">
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
