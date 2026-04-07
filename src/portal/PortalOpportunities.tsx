import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, SlidersHorizontal, TrendingUp, Clock, ArrowRight, LayoutGrid, List, Calendar, CalendarClock, AlertTriangle, X, Landmark, ShieldAlert, ArrowUp, ArrowDown } from "lucide-react";

type SortKey = "return" | "daysToMaturity" | "duration" | "minInvest";
type SortDir = "asc" | "desc";
import { differenceInDays, parseISO, format } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";
import CountryFlag from "@/components/CountryFlag";
import InvestmentMap from "@/components/portal/InvestmentMap";
import { getCurrency } from "@/lib/currency";

export default function PortalOpportunities() {
  const { openOfferTab, switchTab } = usePortalTabs();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [minInvestment, setMinInvestment] = useState("all");
  const [returnRange, setReturnRange] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"rows" | "cards">("rows");
  const [riskDismissed, setRiskDismissed] = useState(() => sessionStorage.getItem("risk-banner-dismissed") === "true");
  const [ibanBannerDismissed, setIbanBannerDismissed] = useState(() => sessionStorage.getItem("iban-banner-dismissed") === "true");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close mobile filters on outside click
  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setMobileFiltersOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileFiltersOpen]);

  const hasActiveFilters = statusFilter !== "all" || minInvestment !== "all" || returnRange !== "all" || sectorFilter !== "all" || countryFilter !== "all" || currencyFilter !== "all";

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

  const { data: investorProfile, isFetched: ibanFetched } = useQuery({
    queryKey: ["portal-investor-profile-iban-check"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("investor_profiles")
        .select("iban")
        .eq("user_id", user.id)
        .maybeSingle();
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

  // Fetch pending pledges grouped by offer
  const { data: pendingPledges = [] } = useQuery({
    queryKey: ["portal-pending-pledges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("offer_id, amount")
        .eq("status", "Pending Payment");
      if (error) throw error;
      return data;
    },
  });

  const pendingByOffer: Record<string, number> = {};
  for (const p of pendingPledges) {
    pendingByOffer[p.offer_id] = (pendingByOffer[p.offer_id] || 0) + Number(p.amount);
  }

  const companyMap: Record<string, any> = Object.fromEntries(companies.map((c: any) => [c.id, c]));
  const showIbanBanner = !ibanBannerDismissed && ibanFetched && (!(investorProfile as any)?.iban);

  // Derive dynamic filter options from offers + companies
  const sectorOptions = [...new Set(offers.map(o => (o as any).sector).filter(Boolean))].sort();
  const countryOptions = [...new Set(offers.map(o => {
    const comp = (o as any).company_id ? companyMap[(o as any).company_id] : null;
    return comp?.country;
  }).filter(Boolean))].sort();

  const getOfferCurrency = (o: any) => {
    const comp = o.company_id ? companyMap[o.company_id] : null;
    return getCurrency(comp?.country);
  };

  const filtered = offers.filter((o) => {
    if (search && !o.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter === "open" && o.status !== "Open") return false;
    if (statusFilter === "funded" && o.status !== "Funded") return false;
    if (minInvestment !== "all") {
      const min = Number(o.min_pledge) || 0;
      if (minInvestment === "<50000" && min >= 50000) return false;
      if (minInvestment === "50000-100000" && (min < 50000 || min > 100000)) return false;
      if (minInvestment === "100000-200000" && (min < 100000 || min > 200000)) return false;
      if (minInvestment === "200000+" && min < 200000) return false;
    }
    const rate = Number(o.interest_rate);
    if (returnRange === "0-5" && (rate < 0 || rate > 5)) return false;
    if (returnRange === "5-10" && (rate < 5 || rate > 10)) return false;
    if (returnRange === "10+" && rate < 10) return false;
    if (sectorFilter !== "all" && (o as any).sector !== sectorFilter) return false;
    if (countryFilter !== "all") {
      const comp = (o as any).company_id ? companyMap[(o as any).company_id] : null;
      if (comp?.country !== countryFilter) return false;
    }
    if (currencyFilter !== "all" && getOfferCurrency(o) !== currencyFilter) return false;
    return true;
  });

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading opportunities...</div>;
  }

  const getRiskBadge = (offer: any) => {
    const level = (offer as any).risk_level;
    if (level === "Low") return { label: "Low Risk", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    if (level === "High") return { label: "High Risk", cls: "text-red-600 bg-red-50 border-red-200" };
    // Default to Medium if set or if downside/risk_note exists
    if (level === "Medium" || offer.downside || offer.risk_note) return { label: "Medium Risk", cls: "text-amber-700 bg-amber-50 border-amber-200" };
    return null;
  };

  const renderOfferData = (offer: any) => {
    const target = Number(offer.target_amount) || 0;
    const funded = Number(offer.funded_amount) || 0;
    const pending = pendingByOffer[offer.id] || 0;
    const rate = Number(offer.interest_rate) || 0;
    const confirmedPct = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
    const pendingPct = target > 0 ? Math.min(100 - confirmedPct, (pending / target) * 100) : 0;
    const progress = confirmedPct; // keep for backward compat
    const maturity = offer.maturity_date ? parseISO(offer.maturity_date) : null;
    const purchaseDate = offer.purchase_date ? parseISO(offer.purchase_date) : null;
    const now = new Date();
    const daysToMaturity = maturity ? differenceInDays(maturity, now) : null;
    const tenorDays = offer.tenor_days ? Number(offer.tenor_days) : (purchaseDate && maturity ? differenceInDays(maturity, purchaseDate) : null);
    const company = (offer as any).company_id ? companyMap[(offer as any).company_id] : null;
    const isMatured = daysToMaturity !== null && daysToMaturity <= 0;
    const cur = getCurrency(company?.country);
    // Batch / period label derived from purchase_date or maturity_date
    const batchMonth = purchaseDate ? format(purchaseDate, "MMM yyyy") : maturity ? format(maturity, "MMM yyyy") : null;
    const dateRange = purchaseDate && maturity
      ? `${format(purchaseDate, "d MMM")} → ${format(maturity, "d MMM yyyy")}`
      : null;
    const risk = getRiskBadge(offer);
    return { target, funded, pending, rate, progress, confirmedPct, pendingPct, maturity, purchaseDate, daysToMaturity, tenorDays, company, isMatured, cur, batchMonth, dateRange, risk };
  };


  const dismissRisk = () => {
    setRiskDismissed(true);
    sessionStorage.setItem("risk-banner-dismissed", "true");
  };

  return (
    <div className="space-y-2">
      {/* Risk disclaimer banner */}
      {!riskDismissed && (
        <div className="border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-relaxed flex-1">
            <span className="font-semibold">Capital at risk.</span> Investments made through Makrill Trade are not covered by any government deposit guarantee scheme. You may lose part or all of your invested capital. Please read the{" "}
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

      {/* IBAN reminder banner */}
      {showIbanBanner && (
        <div className="border border-primary/30 bg-primary/5 px-4 py-2.5 flex items-center gap-2.5">
          <Landmark className="h-4 w-4 text-primary shrink-0" />
          <p className="text-[11px] text-foreground leading-relaxed flex-1">
            <span className="font-semibold">Add your payout IBAN</span> to receive returns at maturity. Without it, we can't pay you back automatically.
          </p>
          <button
            onClick={() => switchTab("/portal/profile")}
            className="shrink-0 px-3 py-1 bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1"
          >
            Add IBAN <ArrowRight className="h-3 w-3" />
          </button>
          <button
            onClick={() => { setIbanBannerDismissed(true); sessionStorage.setItem("iban-banner-dismissed", "true"); }}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Investment Map */}
      <InvestmentMap companies={companies} offers={offers} onOfferClick={(id) => {
        const offer = offers.find((o: any) => o.id === id);
        if (offer) openOfferTab(offer.id, offer.title);
      }} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-foreground">Investment Opportunities</h1>
          <p className="text-[10px] text-muted-foreground">Browse available trade finance deals and invest directly.</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground border border-border bg-white px-2 py-1">
          <Calendar className="h-3 w-3" />
          <span className="font-medium text-foreground">{format(new Date(), "d MMM yyyy")}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="border border-border bg-white px-3 py-1.5">
        {/* Desktop: search + all filters in one row */}
        <div className="hidden md:flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-7 w-36 bg-muted/50 border border-border px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-7 bg-muted/50 border border-border px-1.5 text-xs text-foreground focus:border-primary focus:outline-none min-w-0">
            <option value="all">Status</option>
            <option value="open">Open</option>
            <option value="funded">Funded</option>
          </select>
          <select value={minInvestment} onChange={(e) => setMinInvestment(e.target.value)} className="h-7 bg-muted/50 border border-border px-1.5 text-xs text-foreground focus:border-primary focus:outline-none min-w-0">
            <option value="all">Min. invest</option>
            <option value="<50000">&lt; 50 000</option>
            <option value="50000-100000">50 000–100 000</option>
            <option value="100000-200000">100 000–200 000</option>
            <option value="200000+">200 000+</option>
          </select>
          <select value={returnRange} onChange={(e) => setReturnRange(e.target.value)} className="h-7 bg-muted/50 border border-border px-1.5 text-xs text-foreground focus:border-primary focus:outline-none min-w-0">
            <option value="all">Return</option>
            <option value="0-5">0–5%</option>
            <option value="5-10">5–10%</option>
            <option value="10+">10%+</option>
          </select>
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className="h-7 bg-muted/50 border border-border px-1.5 text-xs text-foreground focus:border-primary focus:outline-none min-w-0">
            <option value="all">Sector</option>
            {sectorOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="h-7 bg-muted/50 border border-border px-1.5 text-xs text-foreground focus:border-primary focus:outline-none min-w-0">
            <option value="all">Country</option>
            {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="h-7 bg-muted/50 border border-border px-1.5 text-xs text-foreground focus:border-primary focus:outline-none min-w-0">
            <option value="all">Currency</option>
            <option value="SEK">SEK</option>
            <option value="CHF">CHF</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>

        {/* Mobile: search + filter icon */}
        <div className="md:hidden relative" ref={filterRef}>
          <div className="flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 h-7 bg-muted/50 border border-border px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none min-w-0"
            />
            <button
              onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
              className={`h-7 w-7 flex items-center justify-center border border-border shrink-0 transition-colors ${hasActiveFilters ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Mobile filter dropdown */}
          {mobileFiltersOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 border border-border bg-white shadow-lg p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground">Filters</span>
                {hasActiveFilters && (
                  <button onClick={() => { setStatusFilter("all"); setMinInvestment("all"); setReturnRange("all"); setSectorFilter("all"); setCountryFilter("all"); setCurrencyFilter("all"); }} className="text-[10px] text-primary hover:underline">Clear all</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Status</label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full h-7 bg-muted/50 border border-border px-2 text-xs text-foreground focus:border-primary focus:outline-none">
                    <option value="all">All</option>
                    <option value="open">Open</option>
                    <option value="funded">Funded</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Min. invest</label>
                  <select value={minInvestment} onChange={(e) => setMinInvestment(e.target.value)} className="w-full h-7 bg-muted/50 border border-border px-2 text-xs text-foreground focus:border-primary focus:outline-none">
                    <option value="all">Any</option>
                    <option value="<50000">&lt; 50 000</option>
                    <option value="50000-100000">50 000–100 000</option>
                    <option value="100000-200000">100 000–200 000</option>
                    <option value="200000+">200 000+</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Return</label>
                  <select value={returnRange} onChange={(e) => setReturnRange(e.target.value)} className="w-full h-7 bg-muted/50 border border-border px-2 text-xs text-foreground focus:border-primary focus:outline-none">
                    <option value="all">Any</option>
                    <option value="0-5">0–5%</option>
                    <option value="5-10">5–10%</option>
                    <option value="10+">10%+</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Sector</label>
                  <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className="w-full h-7 bg-muted/50 border border-border px-2 text-xs text-foreground focus:border-primary focus:outline-none">
                    <option value="all">All</option>
                    {sectorOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Country</label>
                  <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="w-full h-7 bg-muted/50 border border-border px-2 text-xs text-foreground focus:border-primary focus:outline-none">
                    <option value="all">All</option>
                    {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-0.5 block">Currency</label>
                  <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="w-full h-7 bg-muted/50 border border-border px-2 text-xs text-foreground focus:border-primary focus:outline-none">
                    <option value="all">All</option>
                    <option value="SEK">SEK</option>
                    <option value="CHF">CHF</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <button onClick={() => setMobileFiltersOpen(false)} className="w-full h-7 bg-primary text-primary-foreground text-xs font-medium mt-1">Apply</button>
            </div>
          )}
        </div>
      </div>

      {/* Count + view toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">{filtered.length} {filtered.length === 1 ? "opportunity" : "opportunities"} found</p>
        <div className="flex items-center border border-border bg-white">
          <button
            onClick={() => setViewMode("rows")}
            className={`h-7 w-7 flex items-center justify-center transition-colors ${viewMode === "rows" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`h-7 w-7 flex items-center justify-center transition-colors ${viewMode === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            title="Card view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ROW VIEW */}
      {viewMode === "rows" && (
        <div className="border border-border bg-white overflow-x-auto">
          <table className="w-full text-[10px] min-w-[900px]" style={{ tableLayout: 'auto' }}>
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Offer</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Company</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Funding</th>
                <th className="text-center px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Progress</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Return</th>
                <th className="text-center px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Risk</th>
                <th className="text-center px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Start → Maturity</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Duration</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Days to Maturity</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Min. Invest</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((offer) => {
                const { target, funded, pending, rate, progress, confirmedPct, pendingPct, daysToMaturity, tenorDays, company, isMatured, purchaseDate, maturity, cur, batchMonth, risk } = renderOfferData(offer);
                return (
                  <tr
                    key={offer.id}
                    className={`border-b border-border last:border-b-0 hover:bg-mackerel/10 cursor-pointer transition-colors group ${filtered.indexOf(offer) % 2 === 1 ? "bg-muted/50" : ""}`}
                    onClick={() => openOfferTab(offer.id, offer.title)}
                  >
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        {offer.product_image_url && (
                          <img src={offer.product_image_url} alt="" className="h-5 w-5 object-cover border border-border shrink-0" />
                        )}
                        <span className="font-semibold text-foreground group-hover:text-mackerel transition-colors line-clamp-1 max-w-[180px]">
                          {offer.title}
                        </span>
                        {batchMonth && (
                          <span className="shrink-0 px-1.5 py-0.5 bg-muted text-[9px] font-medium text-muted-foreground border border-border">
                            {batchMonth}
                          </span>
                        )}
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
                          ? "text-mackerel bg-mackerel-light border-mackerel/30"
                          : "text-muted-foreground bg-muted border-border"
                      }`}>
                        {offer.status === "Open" ? "OPEN" : "FUNDED"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-foreground whitespace-nowrap">
                      {funded.toLocaleString()} / {target.toLocaleString()} {cur}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <div className="min-w-[5rem] mx-auto whitespace-nowrap">
                        <div className="h-1.5 bg-muted overflow-hidden flex">
                          <div className="h-full bg-mackerel transition-all" style={{ width: `${confirmedPct}%` }} />
                          {pendingPct > 0 && (
                            <div className="h-full bg-mackerel/30 transition-all" style={{ width: `${pendingPct}%` }} />
                          )}
                        </div>
                        <div className="text-[9px] text-muted-foreground text-center mt-0.5 whitespace-nowrap">
                          {confirmedPct.toFixed(0)}%{pendingPct > 0 ? ` · ${pendingPct.toFixed(0)}% pending` : ""}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <span className="font-bold text-mackerel flex items-center justify-end gap-0.5">
                        <TrendingUp className="h-3 w-3" />
                        {rate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {risk ? (
                        <span className={`px-1.5 py-0.5 text-[9px] font-semibold border ${risk.cls}`}>
                          {risk.label}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[9px] font-medium border border-border text-muted-foreground bg-muted/30 cursor-help" title="This offer has not yet been assigned a risk rating. Please review the Risk &amp; Security section on the offer detail page.">Not rated</span>
                      )}
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
                      {Number(offer.min_pledge) > 0 ? `${Number(offer.min_pledge).toLocaleString()} ${cur}` : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-mackerel transition-colors" />
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
            const { target, funded, pending, rate, progress, confirmedPct, pendingPct, daysToMaturity, tenorDays, company, isMatured, purchaseDate, maturity, cur, batchMonth, dateRange, risk } = renderOfferData(offer);
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
                    <div className="flex-1 pr-2">
                      <h3 className="text-xs font-semibold text-foreground group-hover:text-mackerel transition-colors leading-snug">
                        {offer.title}
                      </h3>
                      {dateRange && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{dateRange}</p>
                      )}
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold border ${
                      offer.status === "Open"
                        ? "text-mackerel bg-mackerel-light border-mackerel/30"
                        : "text-muted-foreground bg-muted border-border"
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
                      <span className="text-foreground font-medium font-mono">{funded.toLocaleString()} / {target.toLocaleString()} {cur}</span>
                    </div>
                    <div className="h-2 bg-muted overflow-hidden flex">
                      <div className="h-full bg-mackerel transition-all" style={{ width: `${confirmedPct}%` }} />
                      {pendingPct > 0 && (
                        <div className="h-full bg-mackerel/30 transition-all" style={{ width: `${pendingPct}%` }} />
                      )}
                    </div>
                    {pendingPct > 0 && (
                      <div className="text-[9px] text-muted-foreground">
                        {confirmedPct.toFixed(0)}% confirmed · {pendingPct.toFixed(0)}% pending
                      </div>
                    )}
                  </div>

                  {/* Timeline info */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-2">
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    <span>{purchaseDate ? format(purchaseDate, "d MMM") : "—"} → {maturity ? format(maturity, "d MMM yyyy") : "—"}</span>
                    {tenorDays !== null && <span className="text-foreground font-medium">({tenorDays}d)</span>}
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border mt-auto">
                    <div>
                      <div className="text-[10px] text-muted-foreground">Return</div>
                      <div className="text-xs font-bold text-mackerel flex items-center gap-0.5">
                        <TrendingUp className="h-3 w-3" />
                        {rate.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Risk</div>
                      {risk ? (
                        <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold border mt-0.5 ${risk.cls}`}>
                          {risk.label}
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 text-[9px] font-medium border border-border text-muted-foreground bg-muted/30 mt-0.5 cursor-help" title="This offer has not yet been assigned a risk rating. Please review the Risk &amp; Security section on the offer detail page.">Not rated</span>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Maturity</div>
                      <div className={`text-xs font-bold flex items-center gap-0.5 ${isMatured ? "text-destructive" : daysToMaturity !== null && daysToMaturity <= 7 ? "text-destructive" : daysToMaturity !== null && daysToMaturity <= 30 ? "text-warning" : "text-foreground"}`}>
                        <Clock className="h-3 w-3" />
                        {isMatured ? "MATURED" : daysToMaturity !== null ? `${daysToMaturity}d` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Min. invest</div>
                      <div className="text-xs font-bold text-foreground font-mono">
                        {Number(offer.min_pledge) > 0 ? `${Number(offer.min_pledge).toLocaleString()} ${cur}` : "—"}
                      </div>
                    </div>
                  </div>

                  <button className="w-full h-8 mt-3 border border-primary text-primary text-[11px] font-semibold hover:bg-primary hover:text-mackerel-foreground transition-colors flex items-center justify-center gap-1.5">
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
