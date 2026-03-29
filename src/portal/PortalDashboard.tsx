import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Clock, DollarSign, Wallet, Target, CheckCircle } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";

export default function PortalDashboard() {
  const { openOfferTab, switchTab } = usePortalTabs();

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

  const { data: pledges = [] } = useQuery({
    queryKey: ["portal-my-pledges"],
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
  const totalInvested = pledges.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalReturns = pledges
    .filter((p: any) => p.status === "Repaid" || p.status === "Matured")
    .reduce((s: number, p: any) => {
      const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
      return s + Number(p.amount) * (rate / 100);
    }, 0);

  const calcRow = (offer: any) => {
    const target = Number(offer.target_amount) || 0;
    const funded = Number(offer.funded_amount) || 0;
    const rate = Number(offer.interest_rate) || 0;
    const profitKr = Math.round(target * (rate / 100));
    const totalPayout = target + profitKr;
    const progress = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
    const maturity = offer.maturity_date ? parseISO(offer.maturity_date) : null;
    const start = offer.purchase_date ? parseISO(offer.purchase_date) : null;
    const daysLeft = maturity ? Math.max(0, differenceInDays(maturity, new Date())) : null;
    const tenorDays = (start && maturity) ? differenceInDays(maturity, start) : (Number(offer.tenor_days) || null);
    const annualReturn = (tenorDays && tenorDays > 0) ? ((rate / tenorDays) * 365).toFixed(1) : null;
    return { target, funded, rate, profitKr, totalPayout, progress, daysLeft, annualReturn, start, maturity };
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "Open": return "text-green-600 bg-green-50 border-green-200";
      case "Funded": return "text-[#0066ff] bg-blue-50 border-blue-200";
      case "Closed": return "text-red-500 bg-red-50 border-red-200";
      case "Repaid": return "text-green-600 bg-green-50 border-green-200";
      default: return "text-[#6b7a8d] bg-gray-50 border-gray-200";
    }
  };

  if (isLoading) {
    return <div className="text-[#0066ff] text-xs animate-pulse p-8 text-center">LOADING DASHBOARD...</div>;
  }

  const newOpportunities = offers.filter(o => o.status === "Open").slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: DollarSign, label: "TOTAL INVESTED", value: `${totalInvested.toLocaleString()} kr`, accent: "text-[#0066ff]" },
          { icon: TrendingUp, label: "TOTAL RETURNS", value: `${totalReturns.toLocaleString()} kr`, accent: "text-green-600" },
          { icon: Target, label: "ACTIVE INVESTMENTS", value: activePledges.length.toString(), accent: "text-[#0066ff]" },
          { icon: Wallet, label: "AVAILABLE BALANCE", value: "0 kr", accent: "text-[#1a2035]" },
        ].map((stat) => (
          <div key={stat.label} className="border border-[#d0d7e2] bg-white p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <stat.icon className={`h-3.5 w-3.5 ${stat.accent}`} />
              <span className="text-[9px] text-[#6b7a8d] tracking-wider">{stat.label}</span>
            </div>
            <span className={`text-xl font-bold ${stat.accent} font-mono`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Active investments table */}
      <div className="border border-[#d0d7e2] bg-white">
        <div className="h-8 flex items-center justify-between px-3 border-b border-[#d0d7e2]">
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">YOUR ACTIVE INVESTMENTS</span>
          <button
            onClick={() => switchTab("/portal/portfolio")}
            className="text-[9px] text-[#6b7a8d] hover:text-[#0066ff] tracking-wider transition-colors"
          >
            VIEW ALL →
          </button>
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#d0d7e2] text-[9px] text-[#6b7a8d] tracking-wider">
              <th className="text-left p-2 pl-3">OFFER</th>
              <th className="text-right p-2">INVESTED</th>
              <th className="text-right p-2">RETURN %</th>
              <th className="text-right p-2">EXPECTED RETURN</th>
              <th className="text-left p-2">MATURITY</th>
              <th className="text-center p-2 pr-3">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {activePledges.slice(0, 5).map((p: any) => {
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
                    <span className="inline-block px-2 py-0.5 text-[9px] tracking-wider border text-green-600 border-green-200 bg-green-50">ACTIVE</span>
                  </td>
                </tr>
              );
            })}
            {activePledges.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-[#8a95a5] text-xs">
                  No active investments yet. Browse{" "}
                  <button onClick={() => switchTab("/portal/opportunities")} className="text-[#0066ff] hover:underline">opportunities</button>
                  {" "}to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* New opportunities cards */}
      <div className="border border-[#d0d7e2] bg-white">
        <div className="h-8 flex items-center justify-between px-3 border-b border-[#d0d7e2]">
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">NEW OPPORTUNITIES</span>
          <button
            onClick={() => switchTab("/portal/opportunities")}
            className="text-[9px] text-[#6b7a8d] hover:text-[#0066ff] tracking-wider transition-colors"
          >
            VIEW ALL →
          </button>
        </div>
        <div className="p-3 grid grid-cols-3 gap-3">
          {newOpportunities.map((offer) => {
            const r = calcRow(offer);
            return (
              <div
                key={offer.id}
                onClick={() => openOfferTab(offer.id, offer.title)}
                className="border border-[#d0d7e2] p-4 hover:border-[#0066ff] cursor-pointer transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-[12px] font-bold text-[#1a2035] group-hover:text-[#0066ff] transition-colors leading-tight">{offer.title}</h3>
                  <span className={`inline-block px-2 py-0.5 text-[8px] tracking-wider border shrink-0 ml-2 ${statusColor(offer.status)}`}>
                    {offer.status.toUpperCase()}
                  </span>
                </div>

                {offer.description && (
                  <p className="text-[10px] text-[#6b7a8d] mb-3 line-clamp-2">{offer.description}</p>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between text-[9px]">
                    <span className="text-[#6b7a8d]">Target</span>
                    <span className="text-[#1a2035] font-bold font-mono">{r.target.toLocaleString()} kr</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 overflow-hidden">
                    <div className="h-full bg-[#0066ff] transition-all" style={{ width: `${r.progress}%` }} />
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-[#6b7a8d]">{r.progress.toFixed(0)}% funded</span>
                    <span className="text-[#6b7a8d]">{r.funded.toLocaleString()} kr</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-[#d0d7e2] grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] text-[#6b7a8d]">Return</div>
                    <div className="text-[13px] font-bold text-green-600">{r.rate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[#6b7a8d]">Days left</div>
                    <div className="text-[13px] font-bold text-[#1a2035]">{r.daysLeft ?? "—"}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {newOpportunities.length === 0 && (
            <div className="col-span-3 p-6 text-center text-[#8a95a5] text-xs">
              No open opportunities at this time.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
