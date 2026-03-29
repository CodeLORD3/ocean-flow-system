import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, SlidersHorizontal, TrendingUp, Clock, ArrowRight } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";
import CountryFlag from "@/components/CountryFlag";

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

  const { data: companies = [] } = useQuery({
    queryKey: ["portal-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*");
      if (error) throw error;
      return data;
    },
  });

  const companyMap: Record<string, any> = Object.fromEntries(companies.map((c: any) => [c.id, c]));

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

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading opportunities...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-foreground">Investment Opportunities</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Browse available trade finance deals and invest directly.</p>
      </div>

      {/* Filters */}
      <div className="border border-border bg-white p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="flex-1 h-9 bg-muted/50 border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 bg-muted/50 border border-border px-3 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="open">Open for Investment</option>
              <option value="funded">Fully Funded</option>
            </select>
            <input
              type="number"
              value={minInvestment}
              onChange={(e) => setMinInvestment(e.target.value)}
              placeholder="Min amount"
              className="h-9 w-28 bg-muted/50 border border-border px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <select
              value={returnRange}
              onChange={(e) => setReturnRange(e.target.value)}
              className="h-9 bg-muted/50 border border-border px-3 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">Any Return</option>
              <option value="0-5">0 – 5%</option>
              <option value="5-10">5 – 10%</option>
              <option value="10+">10%+</option>
            </select>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? "opportunity" : "opportunities"} found</p>

      {/* Offers grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((offer) => {
          const target = Number(offer.target_amount) || 0;
          const funded = Number(offer.funded_amount) || 0;
          const rate = Number(offer.interest_rate) || 0;
          const progress = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
          const maturity = offer.maturity_date ? parseISO(offer.maturity_date) : null;
          const daysLeft = maturity ? Math.max(0, differenceInDays(maturity, new Date())) : null;

          const company = (offer as any).company_id ? companyMap[(offer as any).company_id] : null;

          return (
            <div
              key={offer.id}
              className="border border-border bg-white hover:border-primary hover:shadow-sm cursor-pointer transition-all group flex flex-col"
              onClick={() => openOfferTab(offer.id, offer.title)}
            >
              <div className="relative">
                {offer.product_image_url && (
                  <div className="h-28 overflow-hidden border-b border-border">
                    <img src={offer.product_image_url} alt={offer.title} className="w-full h-full object-cover" />
                  </div>
                )}
                {company?.logo_url && (
                  <div className="absolute top-2 right-2 h-8 w-8 bg-white border border-border rounded shadow-sm overflow-hidden">
                    <img src={company.logo_url} alt="" className="h-full w-full object-contain" />
                  </div>
                )}
              </div>

              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors leading-snug flex-1 pr-2">
                    {offer.title}
                  </h3>
                  <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold border ${
                    offer.status === "Open"
                      ? "text-green-700 bg-green-50 border-green-200"
                      : "text-primary bg-primary/5 border-primary/20"
                  }`}>
                    {offer.status === "Open" ? "OPEN" : "FUNDED"}
                  </span>
                </div>

                {company && (
                  <p className="text-[10px] text-muted-foreground mb-1.5">
                    {getCountryFlag(company.country)} {company.name}
                  </p>
                )}

                {offer.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mb-3 leading-relaxed">{offer.description}</p>
                )}

                <div className="space-y-1.5 mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Funding</span>
                    <span className="text-foreground font-medium font-mono">{funded.toLocaleString()} / {target.toLocaleString()} kr</span>
                  </div>
                  <div className="h-2 bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border mt-auto">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Return</div>
                    <div className="text-xs font-bold text-green-600 flex items-center gap-0.5">
                      <TrendingUp className="h-3 w-3" />
                      {rate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Duration</div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-0.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {daysLeft !== null ? `${daysLeft}d` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Min. invest</div>
                    <div className="text-xs font-bold text-foreground font-mono">
                      {Number(offer.min_pledge) > 0 ? `${Number(offer.min_pledge).toLocaleString()}` : "—"}
                    </div>
                  </div>
                </div>

                <button className="w-full h-8 mt-3 border border-primary text-primary text-[11px] font-semibold hover:bg-primary hover:text-primary-foreground transition-colors flex items-center justify-center gap-1.5">
                  View Details <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="border border-border bg-white p-10 text-center text-muted-foreground text-sm">
          No opportunities match your criteria. Try adjusting your filters.
        </div>
      )}
    </div>
  );
}
