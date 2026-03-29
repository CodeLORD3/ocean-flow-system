import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Target, Clock } from "lucide-react";
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
      case "Active": return "text-green-600 bg-green-50 border-green-200";
      case "Matured": return "text-orange-500 bg-orange-50 border-orange-200";
      case "Repaid": return "text-[#0066ff] bg-blue-50 border-blue-200";
      default: return "text-[#6b7a8d] bg-gray-50 border-gray-200";
    }
  };

  if (isLoading) {
    return <div className="text-[#0066ff] text-xs animate-pulse p-8 text-center">LOADING PORTFOLIO...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: DollarSign, label: "TOTAL INVESTED", value: `${totalInvested.toLocaleString()} kr`, color: "text-[#0066ff]" },
          { icon: TrendingUp, label: "EXPECTED RETURN", value: `${totalExpectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr`, color: "text-green-600" },
          { icon: Target, label: "EXPECTED PROFIT", value: `+${totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr`, color: "text-green-600" },
          { icon: Clock, label: "AVG RATE", value: `${avgRate.toFixed(1)}%`, color: "text-[#0066ff]" },
        ].map((stat) => (
          <div key={stat.label} className="border border-[#d0d7e2] bg-white p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
              <span className="text-[9px] text-[#6b7a8d] tracking-wider">{stat.label}</span>
            </div>
            <span className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border border-[#d0d7e2] bg-white">
        <div className="h-8 flex items-center border-b border-[#d0d7e2]">
          {(["active", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 h-full text-[10px] tracking-wider transition-colors border-b-2 ${
                tab === t
                  ? "text-[#0066ff] font-bold border-[#0066ff]"
                  : "text-[#6b7a8d] border-transparent hover:text-[#1a2035]"
              }`}
            >
              {t === "active" ? `ACTIVE (${activePledges.length})` : `HISTORY (${historyPledges.length})`}
            </button>
          ))}
        </div>

        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#d0d7e2] text-[9px] text-[#6b7a8d] tracking-wider">
              <th className="text-left p-2 pl-3">OFFER NAME</th>
              <th className="text-right p-2">INVESTED</th>
              <th className="text-right p-2">RETURN %</th>
              <th className="text-right p-2">EXPECTED RETURN</th>
              <th className="text-left p-2">MATURITY DATE</th>
              <th className="text-center p-2 pr-3">STATUS</th>
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
                  className="border-b border-[#d0d7e2]/50 hover:bg-[#0066ff]/5 cursor-pointer transition-colors"
                >
                  <td className="p-2 pl-3 text-[#1a2035] font-medium">{offer?.title || "—"}</td>
                  <td className="p-2 text-right text-[#1a2035] font-mono">{Number(p.amount).toLocaleString()} kr</td>
                  <td className="p-2 text-right text-green-600 font-bold">{rate.toFixed(1)}%</td>
                  <td className="p-2 text-right text-[#1a2035] font-bold font-mono">{expectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</td>
                  <td className="p-2 text-[#6b7a8d]">{offer?.maturity_date || "—"}</td>
                  <td className="p-2 pr-3 text-center">
                    <span className={`inline-block px-2 py-0.5 text-[9px] tracking-wider border ${statusBadge(p.status)}`}>
                      {p.status?.toUpperCase() || "ACTIVE"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {currentList.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[#8a95a5] text-xs">
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
