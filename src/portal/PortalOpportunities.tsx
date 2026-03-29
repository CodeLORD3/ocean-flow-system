import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Filter, TrendingUp } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";

export default function PortalOpportunities() {
  const { openOfferTab } = usePortalTabs();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [minInvestment, setMinInvestment] = useState("");
  const [returnRange, setReturnRange] = useState<string>("all");

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["portal-all-offers"],
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

  const filtered = offers.filter((o) => {
    if (search && !o.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === "open" && o.status !== "Open") return false;
    if (statusFilter === "funded" && o.status !== "Funded") return false;
    if (minInvestment && Number(o.min_pledge) > Number(minInvestment)) return false;
    const rate = Number(o.interest_rate);
    if (returnRange === "0-5" && (rate < 0 || rate > 5)) return false;
    if (returnRange === "5-10" && (rate < 5 || rate > 10)) return false;
    if (returnRange === "10+" && rate < 10) return false;
    return true;
  });

  const calcRow = (offer: any) => {
    const target = Number(offer.target_amount) || 0;
    const funded = Number(offer.funded_amount) || 0;
    const rate = Number(offer.interest_rate) || 0;
    const progress = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
    const maturity = offer.maturity_date ? parseISO(offer.maturity_date) : null;
    const daysLeft = maturity ? Math.max(0, differenceInDays(maturity, new Date())) : null;
    const start = offer.purchase_date ? parseISO(offer.purchase_date) : null;
    const tenorDays = (start && maturity) ? differenceInDays(maturity, start) : (Number(offer.tenor_days) || null);
    const annualReturn = (tenorDays && tenorDays > 0) ? ((rate / tenorDays) * 365).toFixed(1) : null;
    return { target, funded, rate, progress, daysLeft, annualReturn };
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "Open": return "text-green-600 bg-green-50 border-green-200";
      case "Funded": return "text-[#0066ff] bg-blue-50 border-blue-200";
      default: return "text-[#6b7a8d] bg-gray-50 border-gray-200";
    }
  };

  if (isLoading) {
    return <div className="text-[#0066ff] text-xs animate-pulse p-8 text-center">LOADING OPPORTUNITIES...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="border border-[#d0d7e2] bg-white p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-[#6b7a8d]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search offers..."
              className="flex-1 h-8 bg-[#f4f6f9] border border-[#d0d7e2] px-3 text-[11px] text-[#1a2035] focus:border-[#0066ff] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3 w-3 text-[#6b7a8d]" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 bg-[#f4f6f9] border border-[#d0d7e2] px-2 text-[10px] text-[#1a2035] focus:border-[#0066ff] focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="funded">Fully Funded</option>
            </select>
            <input
              type="number"
              value={minInvestment}
              onChange={(e) => setMinInvestment(e.target.value)}
              placeholder="Min invest"
              className="h-8 w-24 bg-[#f4f6f9] border border-[#d0d7e2] px-2 text-[10px] text-[#1a2035] focus:border-[#0066ff] focus:outline-none"
            />
            <select
              value={returnRange}
              onChange={(e) => setReturnRange(e.target.value)}
              className="h-8 bg-[#f4f6f9] border border-[#d0d7e2] px-2 text-[10px] text-[#1a2035] focus:border-[#0066ff] focus:outline-none"
            >
              <option value="all">All Returns</option>
              <option value="0-5">0–5%</option>
              <option value="5-10">5–10%</option>
              <option value="10+">10%+</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="text-[9px] text-[#6b7a8d] tracking-wider px-1">
        {filtered.length} OPPORTUNITIES FOUND
      </div>

      {/* Offers grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((offer) => {
          const r = calcRow(offer);
          return (
            <div
              key={offer.id}
              className="border border-[#d0d7e2] bg-white hover:border-[#0066ff] cursor-pointer transition-colors group"
              onClick={() => openOfferTab(offer.id, offer.title)}
            >
              {/* Image */}
              {offer.product_image_url && (
                <div className="h-32 overflow-hidden border-b border-[#d0d7e2]">
                  <img src={offer.product_image_url} alt={offer.title} className="w-full h-full object-cover" />
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-[12px] font-bold text-[#1a2035] group-hover:text-[#0066ff] transition-colors leading-tight flex-1">
                    {offer.title}
                  </h3>
                  <span className={`inline-block px-2 py-0.5 text-[8px] tracking-wider border shrink-0 ml-2 ${statusColor(offer.status)}`}>
                    {offer.status.toUpperCase()}
                  </span>
                </div>

                {offer.description && (
                  <p className="text-[10px] text-[#6b7a8d] line-clamp-2">{offer.description}</p>
                )}

                {/* Target & funding */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[9px]">
                    <span className="text-[#6b7a8d]">Total needed</span>
                    <span className="text-[#1a2035] font-bold font-mono">{r.target.toLocaleString()} kr</span>
                  </div>
                  <div className="h-2 bg-gray-100 overflow-hidden">
                    <div className="h-full bg-[#0066ff] transition-all" style={{ width: `${r.progress}%` }} />
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-[#6b7a8d]">{r.progress.toFixed(0)}% funded</span>
                    <span className="text-[#6b7a8d] font-mono">{r.funded.toLocaleString()} kr</span>
                  </div>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#d0d7e2]">
                  <div>
                    <div className="text-[8px] text-[#6b7a8d] tracking-wider">RETURN</div>
                    <div className="text-[13px] font-bold text-green-600 flex items-center gap-0.5">
                      <TrendingUp className="h-3 w-3" />
                      {r.rate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[#6b7a8d] tracking-wider">DURATION</div>
                    <div className="text-[13px] font-bold text-[#1a2035]">{r.daysLeft ?? "—"}d</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-[#6b7a8d] tracking-wider">MIN</div>
                    <div className="text-[11px] font-bold text-[#1a2035] font-mono">
                      {Number(offer.min_pledge) > 0 ? `${Number(offer.min_pledge).toLocaleString()} kr` : "—"}
                    </div>
                  </div>
                </div>

                <button className="w-full h-8 border border-[#0066ff] text-[#0066ff] text-[10px] font-bold tracking-wider hover:bg-[#0066ff] hover:text-white transition-colors">
                  VIEW DETAILS
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="border border-[#d0d7e2] bg-white p-8 text-center text-[#8a95a5] text-xs">
          No opportunities match your criteria.
        </div>
      )}
    </div>
  );
}
