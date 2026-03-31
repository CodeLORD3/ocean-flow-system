import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, SlidersHorizontal, TrendingUp, Clock, ArrowRight, LayoutGrid, List, Calendar, CalendarClock, AlertTriangle, X } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";
import CountryFlag from "@/components/CountryFlag";
import InvestmentMap from "@/components/portal/InvestmentMap";

export default function PortalOpportunities() {
  const { openOfferTab, switchTab } = usePortalTabs();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [minInvestment, setMinInvestment] = useState("");
  const [returnRange, setReturnRange] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"rows" | "cards">("rows");

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

  const renderOfferData = (offer: any) => {
    const target = Number(offer.target_amount) || 0;
    const funded = Number(offer.funded_amount) || 0;
    const rate = Number(offer.interest_rate) || 0;
    const progress = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
    const maturity = offer.maturity_date ? parseISO(offer.maturity_date) : null;
    const purchaseDate = offer.purchase_date ? parseISO(offer.purchase_date) : null;
    const now = new Date();
    const daysToMaturity = maturity ? differenceInDays(maturity, now) : null;
    const tenorDays = offer.tenor_days ? Number(offer.tenor_days) : (purchaseDate && maturity ? differenceInDays(maturity, purchaseDate) : null);
    const company = (offer as any).company_id ? companyMap[(offer as any).company_id] : null;
    const isMatured = daysToMaturity !== null && daysToMaturity <= 0;
    return { target, funded, rate, progress, maturity, purchaseDate, daysToMaturity, tenorDays, company, isMatured };
  };

  const [riskDismissed, setRiskDismissed] = useState(() => sessionStorage.getItem("risk-banner-dismissed") === "true");

  const dismissRisk = () => {
    setRiskDismissed(true);
    sessionStorage.setItem("risk-banner-dismissed", "true");
  };

  return (
    <div className="space-y-4">
      {/* Risk disclaimer banner */}
      {!riskDismissed && (
        <div className="border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed flex-1">
            <span className="font-semibold">Capital at risk.</span> Investments made through Ocean Trade are not covered by any government deposit guarantee scheme. You may lose part or all of your invested capital. Please read the{" "}
            <button onClick={() => switchTab("/portal/terms")} className="underline font-medium hover:text-amber-900">Terms of Use</button>{" "}
            and{" "}
            <button onClick={() => switchTab("/portal/guidelines")} className="underline font-medium hover:text-amber-900">Investment Guidelines</button>{" "}
            before investing.
          </p>
          <button onClick={dismissRisk} className="text-amber-600 hover:text-amber-800 shrink-0 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-foreground">Investment Opportunities</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Browse available trade finance deals and invest directly.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border bg-white px-3 py-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{format(new Date(), "d MMM yyyy")}</span>
        </div>
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

      {/* Count + view toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? "opportunity" : "opportunities"} found</p>
        <div className="flex items-center border border-border bg-white">
          <button
            onClick={() => setViewMode("rows")}
            className={`h-8 w-8 flex items-center justify-center transition-colors ${viewMode === "rows" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`h-8 w-8 flex items-center justify-center transition-colors ${viewMode === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ROW VIEW */}
      {viewMode === "rows" && (
        <div className="border border-border bg-white overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Offer</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Company</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Funding</th>
                <th className="text-center px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Progress</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Return</th>
                <th className="text-center px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Start → Maturity</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Duration</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Days to Maturity</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Min. Invest</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((offer) => {
                const { target, funded, rate, progress, daysToMaturity, tenorDays, company, isMatured, purchaseDate, maturity } = renderOfferData(offer);
                return (
                  <tr
                    key={offer.id}
                    className={`border-b border-border last:border-b-0 hover:bg-primary/10 cursor-pointer transition-colors group ${filtered.indexOf(offer) % 2 === 1 ? "bg-muted/50" : ""}`}
                    onClick={() => openOfferTab(offer.id, offer.title)}
                  >
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        {offer.product_image_url && (
                          <img src={offer.product_image_url} alt="" className="h-5 w-5 object-cover border border-border shrink-0" />
                        )}
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1 max-w-[180px]">
                          {offer.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      {company ? (
                        <div className="flex items-center gap-1.5">
                          <CountryFlag country={company.country} size={12} />
                          <span className="text-muted-foreground line-clamp-1 max-w-[120px]">{company.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold border ${
                        offer.status === "Open"
                          ? "text-green-700 bg-green-50 border-green-200"
                          : "text-primary bg-primary/5 border-primary/20"
                      }`}>
                        {offer.status === "Open" ? "OPEN" : "FUNDED"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-foreground whitespace-nowrap">
                      {funded.toLocaleString()} / {target.toLocaleString()} kr
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="w-16 mx-auto">
                        <div className="h-1.5 bg-muted overflow-hidden">
                          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <div className="text-[9px] text-muted-foreground text-center mt-0.5">{progress.toFixed(0)}%</div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="font-bold text-green-600 flex items-center justify-end gap-0.5">
                        <TrendingUp className="h-3 w-3" />
                        {rate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                      <div className="text-[10px] text-muted-foreground">
                        {purchaseDate ? format(purchaseDate, "d MMM") : "—"} → {maturity ? format(maturity, "d MMM yyyy") : "—"}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <span className="text-foreground font-medium">
                        {tenorDays !== null ? `${tenorDays}d` : "—"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {isMatured ? (
                        <span className="text-destructive font-bold text-[10px]">MATURED</span>
                      ) : daysToMaturity !== null ? (
                        <span className={`font-bold ${daysToMaturity <= 7 ? "text-destructive" : daysToMaturity <= 30 ? "text-warning" : "text-foreground"}`}>
                          {daysToMaturity}d
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-foreground whitespace-nowrap">
                      {Number(offer.min_pledge) > 0 ? `${Number(offer.min_pledge).toLocaleString()} kr` : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CARD VIEW */}
      {viewMode === "cards" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((offer) => {
            const { target, funded, rate, progress, daysToMaturity, tenorDays, company, isMatured, purchaseDate, maturity } = renderOfferData(offer);
            return (
              <div
                key={offer.id}
                className="border border-border bg-white hover:border-primary hover:shadow-sm cursor-pointer transition-all group flex flex-col"
                onClick={() => openOfferTab(offer.id, offer.title)}
              >
                <div className="relative">
                  {offer.product_image_url && (
                    <div className="h-20 overflow-hidden border-b border-border">
                      <img src={offer.product_image_url} alt={offer.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  {company && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-white/90 border border-border text-[9px] font-medium text-muted-foreground rounded shadow-sm">
                      <div className="flex items-center gap-1">
                        <CountryFlag country={company.country} size={10} />
                        {company.name}
                      </div>
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
                    <p className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1">
                      <CountryFlag country={company.country} size={14} /> {company.name}
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

                  {/* Timeline info */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-2">
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    <span>{purchaseDate ? format(purchaseDate, "d MMM") : "—"} → {maturity ? format(maturity, "d MMM yyyy") : "—"}</span>
                    {tenorDays !== null && <span className="text-foreground font-medium">({tenorDays}d)</span>}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border mt-auto">
                    <div>
                      <div className="text-[10px] text-muted-foreground">Return</div>
                      <div className="text-xs font-bold text-green-600 flex items-center gap-0.5">
                        <TrendingUp className="h-3 w-3" />
                        {rate.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Days to Maturity</div>
                      <div className={`text-xs font-bold flex items-center gap-0.5 ${isMatured ? "text-destructive" : daysToMaturity !== null && daysToMaturity <= 7 ? "text-destructive" : daysToMaturity !== null && daysToMaturity <= 30 ? "text-warning" : "text-foreground"}`}>
                        <Clock className="h-3 w-3" />
                        {isMatured ? "MATURED" : daysToMaturity !== null ? `${daysToMaturity}d` : "—"}
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
      )}

      {filtered.length === 0 && (
        <div className="border border-border bg-white p-10 text-center text-muted-foreground text-sm">
          No opportunities match your criteria. Try adjusting your filters.
        </div>
      )}
    </div>
  );
}
