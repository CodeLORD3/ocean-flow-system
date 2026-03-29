import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, DollarSign, Wallet, Target, ArrowUpRight, Search, ArrowRight } from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";

export default function PortalDashboard() {
  const { openOfferTab, switchTab } = usePortalTabs();

  const { data: offers = [], isLoading: offersLoading } = useQuery({
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

  const { data: pledges = [], isLoading: pledgesLoading } = useQuery({
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

  const isLoading = offersLoading || pledgesLoading;

  const activePledges = pledges.filter((p: any) => p.status === "Active");
  const totalInvested = pledges.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalReturns = pledges
    .filter((p: any) => p.status === "Repaid" || p.status === "Matured")
    .reduce((s: number, p: any) => {
      const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
      return s + Number(p.amount) * (rate / 100);
    }, 0);

  // Calculate expected returns from active investments
  const expectedActiveReturns = activePledges.reduce((s: number, p: any) => {
    const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
    return s + Number(p.amount) * (rate / 100);
  }, 0);

  const newOpportunities = offers.filter(o => o.status === "Open").slice(0, 3);
  const hasInvestments = pledges.length > 0;

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading your overview...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Welcome */}
      <div>
        <h1 className="text-base font-bold text-foreground">Welcome back</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Here's a summary of your investment activity.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: DollarSign, label: "Total Invested", value: `${totalInvested.toLocaleString()} kr`, sub: `Across ${pledges.length} investment${pledges.length !== 1 ? "s" : ""}`, accent: "text-primary" },
          { icon: TrendingUp, label: "Returns Earned", value: `${totalReturns.toLocaleString()} kr`, sub: expectedActiveReturns > 0 ? `+${expectedActiveReturns.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr pending` : "No completed deals yet", accent: "text-green-600" },
          { icon: Target, label: "Active Investments", value: activePledges.length.toString(), sub: activePledges.length > 0 ? "Currently earning returns" : "No active deals", accent: "text-primary" },
          { icon: Wallet, label: "Available Balance", value: "0 kr", sub: "Ready to invest", accent: "text-foreground" },
        ].map((stat) => (
          <div key={stat.label} className="border border-border bg-white p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-muted-foreground font-medium">{stat.label}</span>
              <stat.icon className={`h-3.5 w-3.5 ${stat.accent} opacity-60`} />
            </div>
            <div className={`text-lg font-bold ${stat.accent} font-mono`}>{stat.value}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {!hasInvestments && (
        <div className="border border-primary/20 bg-primary/5 p-5 text-center space-y-3">
          <Search className="h-8 w-8 text-primary mx-auto opacity-60" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Start Your First Investment</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              Browse our curated trade finance opportunities and earn attractive returns on short-term investments backed by real goods.
            </p>
          </div>
          <button
            onClick={() => switchTab("/portal/opportunities")}
            className="h-8 px-4 bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
          >
            Browse Opportunities <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Active investments table */}
      {hasInvestments && (
        <div className="border border-border bg-white">
        <div className="h-9 flex items-center justify-between px-3 border-b border-border">
            <h2 className="text-xs font-semibold text-foreground">Your Active Investments</h2>
            <button
              onClick={() => switchTab("/portal/portfolio")}
              className="text-[11px] text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] text-muted-foreground">
                <th className="text-left p-2 pl-3 font-medium">Offer</th>
                <th className="text-right p-2 font-medium">Invested</th>
                <th className="text-right p-2 font-medium">Return</th>
                <th className="text-right p-2 font-medium">Expected Payout</th>
                <th className="text-left p-2 font-medium">Maturity</th>
                <th className="text-center p-2 pr-3 font-medium">Status</th>
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
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors h-8"
                  >
                    <td className="p-2 pl-3 text-foreground font-medium">{offer?.title || "—"}</td>
                    <td className="p-2 text-right text-foreground font-mono">{Number(p.amount).toLocaleString()} kr</td>
                    <td className="p-2 text-right text-green-600 font-semibold">{rate.toFixed(1)}%</td>
                    <td className="p-2 text-right text-foreground font-semibold font-mono">{expectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</td>
                    <td className="p-2 text-muted-foreground">
                      {offer?.maturity_date ? format(parseISO(offer.maturity_date), "d MMM yyyy") : "—"}
                    </td>
                    <td className="p-2 pr-3 text-center">
                      <span className="inline-block px-2 py-0.5 text-[9px] font-semibold tracking-wide border text-green-700 border-green-200 bg-green-50">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                );
              })}
              {activePledges.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                    No active investments.{" "}
                    <button onClick={() => switchTab("/portal/opportunities")} className="text-primary hover:underline font-medium">
                      Browse opportunities
                    </button>{" "}to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New opportunities */}
      <div className="border border-border bg-white">
        <div className="h-11 flex items-center justify-between px-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">New Opportunities</h2>
          <button
            onClick={() => switchTab("/portal/opportunities")}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Browse all <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
        <div className="p-4 grid grid-cols-3 gap-4">
          {newOpportunities.map((offer) => {
            const target = Number(offer.target_amount) || 0;
            const funded = Number(offer.funded_amount) || 0;
            const rate = Number(offer.interest_rate) || 0;
            const progress = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
            const maturity = offer.maturity_date ? parseISO(offer.maturity_date) : null;
            const daysLeft = maturity ? Math.max(0, differenceInDays(maturity, new Date())) : null;

            return (
              <div
                key={offer.id}
                onClick={() => openOfferTab(offer.id, offer.title)}
                className="border border-border p-5 hover:border-primary hover:shadow-sm cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug pr-2">
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

                {offer.description && (
                  <p className="text-xs text-muted-foreground mb-4 line-clamp-2 leading-relaxed">{offer.description}</p>
                )}

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Funding progress</span>
                    <span className="text-foreground font-semibold">{progress.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{funded.toLocaleString()} kr raised</span>
                    <span>{target.toLocaleString()} kr target</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                  <div>
                    <div className="text-[11px] text-muted-foreground mb-0.5">Expected Return</div>
                    <div className="text-base font-bold text-green-600">{rate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground mb-0.5">Time Remaining</div>
                    <div className="text-base font-bold text-foreground">{daysLeft !== null ? `${daysLeft} days` : "—"}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {newOpportunities.length === 0 && (
            <div className="col-span-3 p-8 text-center text-muted-foreground text-sm">
              No new opportunities available right now.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
