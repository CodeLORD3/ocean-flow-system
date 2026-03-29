import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Target, Percent } from "lucide-react";
import { parseISO, format } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";

export default function PortalPortfolio() {
  const { openOfferTab } = usePortalTabs();
  const [tab, setTab] = useState<"active" | "history">("active");

  const { data: pledges = [], isLoading } = useQuery({
    queryKey: ["portal-portfolio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("*, trade_offers(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const activePledges = pledges.filter((p: any) => p.status === "Active");
  const historyPledges = pledges.filter((p: any) => p.status !== "Active");
  const currentList = tab === "active" ? activePledges : historyPledges;

  const totalInvested = activePledges.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalExpectedReturn = activePledges.reduce((s: number, p: any) => {
    const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
    return s + Number(p.amount) * (1 + rate / 100);
  }, 0);
  const totalProfit = totalExpectedReturn - totalInvested;
  const avgRate = activePledges.length > 0
    ? activePledges.reduce((s: number, p: any) => s + (p.trade_offers ? Number(p.trade_offers.interest_rate) : 0), 0) / activePledges.length
    : 0;

  const statusBadge = (status: string) => {
    switch (status) {
      case "Active": return "text-green-700 bg-green-50 border-green-200";
      case "Matured": return "text-orange-600 bg-orange-50 border-orange-200";
      case "Repaid": return "text-primary bg-primary/5 border-primary/20";
      default: return "text-muted-foreground bg-muted/50 border-border";
    }
  };

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading your investments...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-foreground">My Investments</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Track all your active and completed investments.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: DollarSign, label: "Total Invested", value: `${totalInvested.toLocaleString()} kr`, color: "text-primary" },
          { icon: TrendingUp, label: "Expected Payout", value: `${totalExpectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr`, color: "text-green-600" },
          { icon: Target, label: "Expected Profit", value: `+${totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr`, color: "text-green-600" },
          { icon: Percent, label: "Average Return", value: `${avgRate.toFixed(1)}%`, color: "text-primary" },
        ].map((stat) => (
          <div key={stat.label} className="border border-border bg-white p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-muted-foreground font-medium">{stat.label}</span>
              <stat.icon className={`h-3.5 w-3.5 ${stat.color} opacity-60`} />
            </div>
            <span className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Table with tabs */}
      <div className="border border-border bg-white">
        <div className="h-9 flex items-center border-b border-border px-1">
          {(["active", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 h-full text-xs transition-colors border-b-2 ${
                tab === t
                  ? "text-primary font-semibold border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {t === "active" ? `Active (${activePledges.length})` : `History (${historyPledges.length})`}
            </button>
          ))}
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] text-muted-foreground">
              <th className="text-left p-2 pl-3 font-medium">Offer Name</th>
              <th className="text-right p-2 font-medium">Amount Invested</th>
              <th className="text-right p-2 font-medium">Return Rate</th>
              <th className="text-right p-2 font-medium">Expected Payout</th>
              <th className="text-left p-2 font-medium">Maturity Date</th>
              <th className="text-center p-2 pr-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {currentList.map((p: any) => {
              const offer = p.trade_offers;
              const rate = offer ? Number(offer.interest_rate) : 0;
              const expectedReturn = Number(p.amount) * (1 + rate / 100);
              return (
                <tr
                  key={p.id}
                  onClick={() => offer && openOfferTab(offer.id, offer.title)}
                  className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="p-3 pl-4 text-foreground font-medium">{offer?.title || "—"}</td>
                  <td className="p-3 text-right text-foreground font-mono">{Number(p.amount).toLocaleString()} kr</td>
                  <td className="p-3 text-right text-green-600 font-semibold">{rate.toFixed(1)}%</td>
                  <td className="p-3 text-right text-foreground font-semibold font-mono">{expectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</td>
                  <td className="p-3 text-muted-foreground">
                    {offer?.maturity_date ? format(parseISO(offer.maturity_date), "d MMM yyyy") : "—"}
                  </td>
                  <td className="p-3 pr-4 text-center">
                    <span className={`inline-block px-2.5 py-1 text-[10px] font-semibold tracking-wide border ${statusBadge(p.status)}`}>
                      {p.status?.toUpperCase() || "ACTIVE"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {currentList.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-muted-foreground text-sm">
                  {tab === "active" ? "No active investments." : "No completed investments yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
