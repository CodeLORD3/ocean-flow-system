import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Clock, DollarSign, Target } from "lucide-react";

export default function PortalDashboard() {
  const navigate = useNavigate();

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["portal-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*")
        .in("status", ["Open", "Funded"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "Open": return "text-green-400 bg-green-400/10 border-green-400/30";
      case "Funded": return "text-[#0066ff] bg-[#0066ff]/10 border-[#0066ff]/30";
      case "Closed": return "text-red-400 bg-red-400/10 border-red-400/30";
      default: return "text-[#5a6a7a] bg-[#1a2035] border-[#1a2035]";
    }
  };

  if (isLoading) {
    return <div className="text-[#0066ff] text-xs animate-pulse">LOADING OFFERS...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Target, label: "ACTIVE OFFERS", value: offers.filter(o => o.status === "Open").length },
          { icon: DollarSign, label: "TOTAL TARGET", value: `${(offers.reduce((s, o) => s + Number(o.target_amount), 0) / 1000).toFixed(0)}k` },
          { icon: TrendingUp, label: "AVG RATE", value: offers.length ? `${(offers.reduce((s, o) => s + Number(o.interest_rate), 0) / offers.length).toFixed(1)}%` : "—" },
          { icon: Clock, label: "FUNDED", value: offers.filter(o => o.status === "Funded").length },
        ].map((stat) => (
          <div key={stat.label} className="border border-[#1a2035] bg-[#0d1220] p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <stat.icon className="h-3 w-3 text-[#0066ff]" />
              <span className="text-[9px] text-[#5a6a7a] tracking-wider">{stat.label}</span>
            </div>
            <span className="text-lg font-bold text-[#c8d6e5]">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Offers table */}
      <div className="border border-[#1a2035] bg-[#0d1220]">
        <div className="h-8 flex items-center px-3 border-b border-[#1a2035]">
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">ACTIVE TRADE OFFERS</span>
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#1a2035] text-[9px] text-[#5a6a7a] tracking-wider">
              <th className="text-left p-2 pl-3">PRODUCT</th>
              <th className="text-right p-2">QTY</th>
              <th className="text-right p-2">TARGET</th>
              <th className="text-right p-2">RATE</th>
              <th className="text-left p-2">MATURITY</th>
              <th className="p-2">PROGRESS</th>
              <th className="text-center p-2 pr-3">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => {
              const progress = Number(offer.target_amount) > 0
                ? Math.min(100, (Number(offer.funded_amount) / Number(offer.target_amount)) * 100)
                : 0;
              return (
                <tr
                  key={offer.id}
                  onClick={() => navigate(`/portal/offer/${offer.id}`)}
                  className="border-b border-[#1a2035]/50 hover:bg-[#0066ff]/5 cursor-pointer transition-colors"
                >
                  <td className="p-2 pl-3 text-[#c8d6e5] font-medium">{offer.title}</td>
                  <td className="p-2 text-right text-[#c8d6e5]">{Number(offer.quantity).toLocaleString()}</td>
                  <td className="p-2 text-right text-[#c8d6e5]">{Number(offer.target_amount).toLocaleString()} kr</td>
                  <td className="p-2 text-right text-green-400 font-bold">{Number(offer.interest_rate).toFixed(1)}%</td>
                  <td className="p-2 text-[#5a6a7a]">{offer.maturity_date}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#1a2035] overflow-hidden">
                        <div
                          className="h-full bg-[#0066ff] transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-[#5a6a7a] w-8 text-right">{progress.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="p-2 pr-3 text-center">
                    <span className={`inline-block px-2 py-0.5 text-[9px] tracking-wider border ${statusColor(offer.status)}`}>
                      {offer.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              );
            })}
            {offers.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#3a4a5a] text-xs">
                  NO ACTIVE OFFERS
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
