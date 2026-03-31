import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Banknote, TrendingUp, Target, Percent, ChevronDown, ChevronUp, Clock, CreditCard, CheckCircle, AlertTriangle, Award, Briefcase, ArrowRight } from "lucide-react";
import { parseISO, format, differenceInDays } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";
import CountryFlag from "@/components/CountryFlag";
import InvestmentFlowDiagram from "./InvestmentFlowDiagram";

export default function PortalPortfolio() {
  const { openOfferTab, switchTab } = usePortalTabs();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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

  const { data: companies = [] } = useQuery({
    queryKey: ["portal-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*");
      if (error) throw error;
      return data;
    },
  });

  const companyMap: Record<string, any> = Object.fromEntries(companies.map((c: any) => [c.id, c]));

  const activePledges = pledges.filter((p: any) => ["Active", "Pending Payment", "Matured"].includes(p.status));
  const historyPledges = pledges.filter((p: any) => ["Paid Out", "Repaid"].includes(p.status));
  const currentList = tab === "active" ? activePledges : historyPledges;

  // Active tab stats
  const totalInvested = activePledges.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalExpectedReturn = activePledges.reduce((s: number, p: any) => {
    const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
    return s + Number(p.amount) * (1 + rate / 100);
  }, 0);
  const totalProfit = totalExpectedReturn - totalInvested;
  const avgRate = activePledges.length > 0
    ? activePledges.reduce((s: number, p: any) => s + (p.trade_offers ? Number(p.trade_offers.interest_rate) : 0), 0) / activePledges.length
    : 0;

  // History tab stats
  const totalPaidOut = historyPledges.reduce((s: number, p: any) => {
    const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
    return s + Number(p.amount) * (1 + rate / 100);
  }, 0);
  const totalHistoryProfit = historyPledges.reduce((s: number, p: any) => {
    const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
    return s + Number(p.amount) * (rate / 100);
  }, 0);

  const statusBadge = (status: string) => {
    switch (status) {
      case "Active": return "text-mackerel bg-mackerel-light border-mackerel/30";
      case "Pending Payment": return "text-amber-700 bg-amber-50 border-amber-200";
      case "Matured": return "text-orange-600 bg-orange-50 border-orange-200";
      case "Paid Out":
      case "Repaid": return "text-primary bg-primary/5 border-primary/20";
      default: return "text-muted-foreground bg-muted/50 border-border";
    }
  };

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading your investments...</div>;
  }

  const hasActiveData = activePledges.length > 0;
  const hasHistoryData = historyPledges.length > 0;

  const activeStats = [
    { icon: Banknote, label: "Total Invested", value: hasActiveData ? `${totalInvested.toLocaleString()} kr` : "—", color: "text-primary" },
    { icon: TrendingUp, label: "Expected Payout", value: hasActiveData ? `${totalExpectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr` : "—", color: "text-mackerel" },
    { icon: Target, label: "Expected Profit", value: hasActiveData ? `+${totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr` : "—", color: "text-mackerel" },
    { icon: Percent, label: "Average Return", value: hasActiveData ? `${avgRate.toFixed(1)}%` : "—", color: "text-primary" },
  ];

  const historyStats = [
    { icon: Banknote, label: "Total Paid Out", value: hasHistoryData ? `${Math.round(totalPaidOut).toLocaleString()} kr` : "—", color: "text-primary" },
    { icon: Target, label: "Total Profit Earned", value: hasHistoryData ? `+${Math.round(totalHistoryProfit).toLocaleString()} kr` : "—", color: "text-mackerel" },
    { icon: Award, label: "Completed Investments", value: hasHistoryData ? `${historyPledges.length}` : "—", color: "text-primary" },
    { icon: Percent, label: "Avg. Return", value: hasHistoryData ? `${(historyPledges.reduce((s: number, p: any) => s + (p.trade_offers ? Number(p.trade_offers.interest_rate) : 0), 0) / historyPledges.length).toFixed(1)}%` : "—", color: "text-mackerel" },
  ];

  const currentStats = tab === "active" ? activeStats : historyStats;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-bold text-foreground">My Investments</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Track all your active and completed investments.</p>
      </div>

      {/* Summary cards — change based on tab */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {currentStats.map((stat) => (
          <div key={stat.label} className="border border-border bg-white p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-muted-foreground font-medium">{stat.label}</span>
              <stat.icon className={`h-3.5 w-3.5 ${stat.color} opacity-60`} />
            </div>
            <span className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Investment Flow Diagram — only on active tab */}
      {tab === "active" && <InvestmentFlowDiagram pledges={pledges as any} />}

      {/* Table with tabs */}
      <div className="border border-border bg-white">
        <div className="h-9 flex items-center border-b border-border px-1">
          {(["active", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setExpandedRow(null); }}
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

        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border text-[10px] text-muted-foreground">
              <th className="w-6 p-2"></th>
              <th className="text-left p-2 font-medium">Offer Name</th>
              <th className="text-right p-2 font-medium">Amount Invested</th>
              <th className="text-right p-2 font-medium">Return Rate</th>
              <th className="text-right p-2 font-medium">{tab === "history" ? "Total Payout" : "Expected Payout"}</th>
              <th className="text-left p-2 font-medium">Maturity Date</th>
              <th className="text-right p-2 font-medium">Duration</th>
              {tab === "active" && <th className="text-right p-2 font-medium">Days to Maturity</th>}
              <th className="text-center p-2 pr-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {currentList.map((p: any, idx: number) => {
              const offer = p.trade_offers;
              const rate = offer ? Number(offer.interest_rate) : 0;
              const expectedReturn = Number(p.amount) * (1 + rate / 100);
              const maturityDate = offer?.maturity_date ? parseISO(offer.maturity_date) : null;
              const daysToMaturity = maturityDate ? differenceInDays(maturityDate, new Date()) : null;
              const duration = offer?.tenor_days ? Number(offer.tenor_days) : (offer?.purchase_date && offer?.maturity_date ? differenceInDays(parseISO(offer.maturity_date), parseISO(offer.purchase_date)) : null);
              const isExpanded = expandedRow === p.id;
              const colCount = tab === "active" ? 9 : 8;

              return (
                <>
                  <tr
                    key={p.id}
                    onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                    className={`border-b border-border/50 hover:bg-primary/10 cursor-pointer transition-colors h-8 ${idx % 2 === 1 ? "bg-muted/50" : ""}`}
                  >
                    <td className="p-2 pl-3">
                      {isExpanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    </td>
                    <td className="p-2 text-foreground font-medium">
                      <div className="flex items-center gap-1.5">
                        {offer?.company_id && companyMap[offer.company_id] && (
                          <CountryFlag country={companyMap[offer.company_id].country} size={14} />
                        )}
                        <span>{offer?.title || "—"}</span>
                        {offer?.company_id && companyMap[offer.company_id] && (
                          <span className="text-[10px] text-muted-foreground font-normal">· {companyMap[offer.company_id].name}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-right text-foreground font-mono">{Number(p.amount).toLocaleString()} kr</td>
                    <td className="p-2 text-right text-mackerel font-semibold">{rate.toFixed(1)}%</td>
                    <td className="p-2 text-right text-foreground font-semibold font-mono">{expectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</td>
                    <td className="p-2 text-muted-foreground">
                      {offer?.maturity_date ? format(parseISO(offer.maturity_date), "d MMM yyyy") : "—"}
                    </td>
                    <td className="p-2 text-right text-muted-foreground font-mono">
                      {duration !== null ? `${duration}d` : "—"}
                    </td>
                    {tab === "active" && (
                      <td className="p-2 text-right">
                        {daysToMaturity !== null ? (
                          <span className={`font-bold ${daysToMaturity <= 0 ? "text-destructive" : daysToMaturity <= 7 ? "text-destructive" : daysToMaturity <= 14 ? "text-amber-600" : "text-foreground"}`}>
                            {daysToMaturity <= 0 ? "DUE" : `${daysToMaturity}d`}
                          </span>
                        ) : "—"}
                      </td>
                    )}
                    <td className="p-2 pr-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-[9px] font-semibold tracking-wide border ${statusBadge(p.status)}`}>
                        {(p.status || "ACTIVE").toUpperCase()}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${p.id}-detail`} className="bg-muted/30">
                      <td colSpan={colCount} className="p-0">
                        <ExpandedInvestmentDetail
                          pledge={p}
                          offer={offer}
                          companyMap={companyMap}
                          expectedReturn={expectedReturn}
                          daysToMaturity={daysToMaturity}
                          onViewOffer={() => offer && openOfferTab(offer.id, offer.title)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {currentList.length === 0 && (
              <tr>
                <td colSpan={tab === "active" ? 9 : 8} className="p-0">
                  {tab === "active" ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="h-14 w-14 bg-primary/10 flex items-center justify-center rounded-full mb-3">
                        <Briefcase className="h-7 w-7 text-primary" />
                      </div>
                      <div className="text-sm font-semibold text-foreground mb-1">You haven't made any investments yet</div>
                      <p className="text-xs text-muted-foreground mb-4">Start by exploring available trade finance opportunities.</p>
                      <button
                        onClick={() => switchTab("/portal")}
                        className="h-9 px-5 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                      >
                        Browse Opportunities <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="p-5 text-center text-muted-foreground text-xs">No completed investments yet.</div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpandedInvestmentDetail({ pledge, offer, companyMap, expectedReturn, daysToMaturity, onViewOffer }: {
  pledge: any;
  offer: any;
  companyMap: Record<string, any>;
  expectedReturn: number;
  daysToMaturity: number | null;
  onViewOffer: () => void;
}) {
  const status = pledge.status || "Active";
  const company = offer?.company_id ? companyMap[offer.company_id] : null;
  const rate = offer ? Number(offer.interest_rate) : 0;
  const refCode = (pledge as any).payment_reference || `OT-${new Date(pledge.created_at).getFullYear()}-${pledge.id.slice(0, 6)}-${(offer?.id || "").slice(0, 6)}`;

  return (
    <div className="px-6 py-4 border-t border-border/30">
      <div className="grid grid-cols-3 gap-4">
        {/* Status explanation */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            {status === "Pending Payment" && <CreditCard className="h-3.5 w-3.5 text-amber-600" />}
            {status === "Active" && <CheckCircle className="h-3.5 w-3.5 text-mackerel" />}
            {status === "Matured" && <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />}
            {status === "Paid Out" && <Banknote className="h-3.5 w-3.5 text-primary" />}
            Status: {status}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {status === "Pending Payment" && "Your investment has been booked. We are waiting for your bank transfer to be confirmed. This typically takes 1–2 business days after you send the funds."}
            {status === "Active" && "Your investment is live and running. Funds have been received and deployed into the trade. You will receive your payout at maturity."}
            {status === "Matured" && "Payout due — awaiting transfer from company. Your investment has reached maturity and the payout is being processed."}
            {status === "Paid Out" && "This investment has been completed and the full payout has been transferred to your bank account."}
          </p>
          {daysToMaturity !== null && status === "Active" && (
            <div className={`text-[11px] font-semibold ${daysToMaturity <= 7 ? "text-destructive" : daysToMaturity <= 14 ? "text-amber-600" : "text-foreground"}`}>
              {daysToMaturity <= 0 ? "Maturity date reached" : `${daysToMaturity} days to maturity`}
            </div>
          )}
        </div>

        {/* Investment summary */}
        <div className="space-y-1.5 border-l border-border/50 pl-4">
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Investment Summary</div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Offer</span>
            <button onClick={onViewOffer} className="text-primary hover:underline font-medium">{offer?.title || "—"}</button>
          </div>
          {company && (
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Company</span>
              <span className="text-foreground">{company.name}</span>
            </div>
          )}
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Invested</span>
            <span className="text-foreground font-mono">{Number(pledge.amount).toLocaleString()} kr</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Return</span>
            <span className="text-mackerel font-semibold">{rate.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">{status === "Paid Out" ? "Total Payout" : "Expected Payout"}</span>
            <span className="text-foreground font-mono font-semibold">{expectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Maturity</span>
            <span className="text-foreground">{offer?.maturity_date ? format(parseISO(offer.maturity_date), "d MMM yyyy") : "—"}</span>
          </div>
        </div>

        {/* Payment instructions for Pending Payment */}
        {status === "Pending Payment" && (
          <div className="space-y-2 border-l border-border/50 pl-4">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Payment Instructions</div>
            <div className="bg-amber-50 border border-amber-200 p-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-amber-800">Bank</span>
                <span className="text-amber-900 font-medium">{company?.name || "Makrill Trade"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-800">IBAN</span>
                <span className="text-amber-900 font-mono font-medium">{offer?.company_iban || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-800">Reference</span>
                <span className="text-amber-900 font-mono font-bold">{refCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-800">Amount</span>
                <span className="text-amber-900 font-mono font-bold">{Number(pledge.amount).toLocaleString()} kr</span>
              </div>
            </div>
            <p className="text-[10px] text-amber-700 italic">
              Use the exact reference number so your payment can be matched.
            </p>
          </div>
        )}

        {/* Matured — payout message */}
        {status === "Matured" && (
          <div className="space-y-2 border-l border-border/50 pl-4">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Payout Status</div>
            <div className="bg-orange-50 border border-orange-200 p-3 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-orange-700 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Payout Due
              </div>
              <p className="text-orange-700">Your investment has matured. The company is processing your payout of <span className="font-bold font-mono">{expectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>.</p>
              <p className="text-orange-600 text-[10px]">This typically takes 1–3 business days after maturity.</p>
            </div>
          </div>
        )}

        {/* Timeline for Active / Paid Out */}
        {(status === "Active" || status === "Paid Out") && (
          <div className="space-y-2 border-l border-border/50 pl-4">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Timeline</div>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Date Committed</span>
              <span className="text-foreground">{format(parseISO(pledge.created_at), "d MMM yyyy")}</span>
            </div>
            {offer?.purchase_date && (
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Start Date</span>
                <span className="text-foreground">{format(parseISO(offer.purchase_date), "d MMM yyyy")}</span>
              </div>
            )}
            {offer?.maturity_date && (
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Maturity Date</span>
                <span className="text-foreground">{format(parseISO(offer.maturity_date), "d MMM yyyy")}</span>
              </div>
            )}
            {status === "Paid Out" && (
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Status</span>
                <span className="text-mackerel font-semibold">✓ Payout completed</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
