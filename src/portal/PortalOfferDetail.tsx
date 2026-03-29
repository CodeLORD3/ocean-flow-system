import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Calculator, FileText, AlertTriangle, TrendingUp, Shield, Package, CheckCircle, X, Briefcase, Building2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { parseISO, format } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";
import CountryFlag from "@/components/CountryFlag";

export default function PortalOfferDetail({ overrideId }: { overrideId?: string } = {}) {
  const { id: paramId } = useParams<{ id: string }>();
  const id = overrideId || paramId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { switchTab } = usePortalTabs();
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [calcAmount, setCalcAmount] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successRef, setSuccessRef] = useState("");

  const { data: offer, isLoading } = useQuery({
    queryKey: ["portal-offer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: company } = useQuery({
    queryKey: ["portal-company", (offer as any)?.company_id],
    queryFn: async () => {
      const companyId = (offer as any)?.company_id;
      if (!companyId) return null;
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).single();
      if (error) return null;
      return data;
    },
    enabled: !!(offer as any)?.company_id,
  });

  const pledgeMutation = useMutation({
    mutationFn: async (amount: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("pledges").insert({
        offer_id: id!,
        user_id: user.id,
        amount,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const ref = `OT-${Date.now().toString(36).toUpperCase()}`;
      setSuccessRef(ref);
      setShowConfirmModal(false);
      setShowSuccess(true);
      setPledgeAmount("");
      setTermsAccepted(false);
      queryClient.invalidateQueries({ queryKey: ["portal-offer", id] });
      queryClient.invalidateQueries({ queryKey: ["portal-offers"] });
      queryClient.invalidateQueries({ queryKey: ["portal-my-pledges"] });
      queryClient.invalidateQueries({ queryKey: ["portal-portfolio"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
      setShowConfirmModal(false);
    },
  });

  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!offer) return;
    const calc = () => {
      const now = new Date();
      const maturity = new Date(offer.maturity_date);
      setDaysLeft(Math.ceil((maturity.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    };
    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, [offer]);

  if (isLoading || !offer) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading offer details...</div>;
  }

  const o = offer as any;
  const target = Number(offer.target_amount);
  const funded = Number(offer.funded_amount);
  const rate = Number(offer.interest_rate);
  const progress = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
  const profitKr = Math.round(target * (rate / 100));
  const totalPayout = target + profitKr;
  const calcResult = calcAmount ? Number(calcAmount) * (1 + rate / 100) : 0;
  const minPledge = Number(o.min_pledge) || 0;
  const maxPledge = o.max_pledge ? Number(o.max_pledge) : null;
  const pledgeAmt = Number(pledgeAmount) || 0;
  const pledgeReturn = pledgeAmt * (1 + rate / 100);
  const pledgeProfit = pledgeReturn - pledgeAmt;

  const maturityDate = new Date(offer.maturity_date);
  const tenorDays = o.tenor_days ?? (o.purchase_date
    ? Math.ceil((maturityDate.getTime() - new Date(o.purchase_date).getTime()) / (1000 * 60 * 60 * 24))
    : null);

  let annualReturn = o.annual_return ? Number(o.annual_return) : null;
  if (!annualReturn && tenorDays && tenorDays > 0) {
    annualReturn = Math.round((rate / tenorDays) * 365 * 100) / 100;
  }

  const repaymentLabel = o.repayment_type === "rolling" ? "Rolling" : "Bullet";

  const handleInvestClick = () => {
    const amt = Number(pledgeAmount);
    if (amt <= 0) { toast.error("Please enter an amount"); return; }
    if (minPledge > 0 && amt < minPledge) { toast.error(`Minimum investment is ${minPledge.toLocaleString()} kr`); return; }
    if (maxPledge && amt > maxPledge) { toast.error(`Maximum investment is ${maxPledge.toLocaleString()} kr`); return; }
    setShowConfirmModal(true);
  };

  // Success screen
  if (showSuccess) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="mx-auto h-16 w-16 bg-green-50 border border-green-200 flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Investment Confirmed</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Your investment of <strong className="text-foreground">{pledgeAmt.toLocaleString()} kr</strong> in <strong className="text-foreground">{offer.title}</strong> has been submitted successfully.
          </p>
        </div>
        <div className="border border-border bg-white p-5 text-left space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Reference Number</span>
            <span className="font-mono font-semibold text-foreground">{successRef}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount Invested</span>
            <span className="font-mono font-semibold text-foreground">{pledgeAmt.toLocaleString()} kr</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expected Return</span>
            <span className="font-mono font-semibold text-green-600">+{pledgeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Maturity Date</span>
            <span className="font-semibold text-foreground">{format(parseISO(offer.maturity_date), "d MMMM yyyy")}</span>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => switchTab("/portal/portfolio")}
            className="h-10 px-6 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <Briefcase className="h-4 w-4" /> View My Portfolio
          </button>
          <button
            onClick={() => setShowSuccess(false)}
            className="h-10 px-6 border border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Offer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-border w-full max-w-md mx-4 shadow-lg">
            <div className="h-12 flex items-center justify-between px-5 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Confirm Your Investment</h3>
              <button onClick={() => setShowConfirmModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">Please review the details below before confirming.</p>
              <div className="border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Offer</span>
                  <span className="font-medium text-foreground">{offer.title}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Investment</span>
                  <span className="font-mono font-bold text-foreground">{pledgeAmt.toLocaleString()} kr</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">Expected Return ({rate.toFixed(1)}%)</span>
                  <span className="font-mono font-bold text-green-600">+{pledgeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Payout</span>
                  <span className="font-mono font-bold text-foreground">{pledgeReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Maturity Date</span>
                  <span className="font-semibold text-foreground">{format(parseISO(offer.maturity_date), "d MMMM yyyy")}</span>
                </div>
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-1 h-4 w-4 border-border accent-primary" />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  I have read and understood the offer terms, risk notes, and investment details. I confirm this investment at my own risk.
                </span>
              </label>
              <div className="flex gap-3">
                <button onClick={() => pledgeMutation.mutate(pledgeAmt)} disabled={!termsAccepted || pledgeMutation.isPending}
                  className="flex-1 h-10 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {pledgeMutation.isPending ? "Processing..." : "Confirm Investment"}
                </button>
                <button onClick={() => setShowConfirmModal(false)} className="h-10 px-5 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TOP SECTION: Header + Key Metrics + Invest ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: 2 columns wide — title, company, key stats */}
        <div className="lg:col-span-2 space-y-3">
          {/* Title bar */}
          <div className="border border-border bg-white p-4">
            <div className="flex items-start gap-4">
              {o.product_image_url && (
                <img src={o.product_image_url} alt={offer.title} className="h-16 w-24 object-cover border border-border shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-lg font-bold text-foreground truncate">{offer.title}</h1>
                  <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold border ${
                    offer.status === "Open"
                      ? "text-green-700 bg-green-50 border-green-200"
                      : "text-primary bg-primary/5 border-primary/20"
                  }`}>
                    {offer.status}
                  </span>
                </div>
                {offer.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{offer.description}</p>
                )}
                {company && (
                  <div className="flex items-center gap-2 mt-2">
                    {(company as any).logo_url && (
                      <img src={(company as any).logo_url} alt="" className="h-5 w-5 object-contain" />
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CountryFlag country={(company as any).country} size={14} />
                      {(company as any).name}
                    </span>
                    {(company as any).industry && (
                      <span className="text-[10px] text-muted-foreground/70">· {(company as any).industry}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Key metrics row — Avanza style */}
          <div className="border border-border bg-white">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Return</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Annual Return</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Duration</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Profit</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Total Payout</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Maturity</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2.5 font-bold text-green-600 font-mono">{rate.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 font-bold text-green-600 font-mono">{annualReturn ? `${annualReturn.toFixed(1)}%` : "—"}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground font-mono">{tenorDays ? `${tenorDays} days` : "—"}</td>
                  <td className="px-3 py-2.5 font-bold text-green-600 font-mono">+{profitKr.toLocaleString()} kr</td>
                  <td className="px-3 py-2.5 font-bold text-foreground font-mono">{totalPayout.toLocaleString()} kr</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{format(parseISO(offer.maturity_date), "d MMM yyyy")}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Funding progress */}
          <div className="border border-border bg-white p-3">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
              <span className="font-semibold">Funding Progress</span>
              <span className="font-mono">{funded.toLocaleString()} / {target.toLocaleString()} kr ({progress.toFixed(1)}%)</span>
            </div>
            <div className="h-2 bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Countdown */}
          {offer.status === "Open" && daysLeft !== null && (
            <div className={`border p-3 flex items-center justify-between text-xs ${
              daysLeft > 0 ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"
            }`}>
              <div className="flex items-center gap-2">
                <Clock className={`h-4 w-4 ${daysLeft > 0 ? "text-primary" : "text-destructive"}`} />
                <span className="text-foreground font-semibold">
                  {daysLeft > 0 ? `${daysLeft} days remaining` : "This offer has expired"}
                </span>
              </div>
              <span className="text-muted-foreground">
                Maturity: {format(parseISO(offer.maturity_date), "d MMM yyyy")}
              </span>
            </div>
          )}
        </div>

        {/* RIGHT: Invest section — sticky */}
        <div className="lg:col-span-1 space-y-3">
          {offer.status === "Open" ? (
            <div className="border border-primary/30 bg-primary/5 lg:sticky lg:top-4">
              <div className="h-10 flex items-center px-4 border-b border-primary/20">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Invest in This Offer</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground font-medium">Investment Amount (kr)</label>
                  <input
                    type="number" value={pledgeAmount} onChange={e => setPledgeAmount(e.target.value)}
                    min={minPledge || 1} max={maxPledge || undefined}
                    placeholder={minPledge > 0 ? `Min ${minPledge.toLocaleString()} kr` : "Enter amount"}
                    className="w-full h-10 bg-white border border-border px-3 text-sm text-foreground font-mono focus:border-primary focus:outline-none"
                  />
                </div>
                {pledgeAmt > 0 && (
                  <div className="border border-border bg-white p-3 space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Expected Return</span>
                      <span className="font-mono font-bold text-green-600">+{pledgeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Total Payout</span>
                      <span className="font-mono font-bold text-foreground">{pledgeReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Maturity</span>
                      <span className="font-medium text-foreground">{format(parseISO(offer.maturity_date), "d MMM yyyy")}</span>
                    </div>
                  </div>
                )}
                <button
                  onClick={handleInvestClick}
                  disabled={!pledgeAmount || Number(pledgeAmount) <= 0}
                  className="w-full h-10 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  Invest Now <ArrowUpRight className="h-4 w-4" />
                </button>
                {minPledge > 0 && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Min: {minPledge.toLocaleString()} kr{maxPledge && ` · Max: ${maxPledge.toLocaleString()} kr`}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-border bg-muted/20 p-4 text-center">
              <span className="text-xs font-semibold text-muted-foreground">This offer is fully funded</span>
            </div>
          )}

          {/* ROI Calculator — compact, under invest */}
          <div className="border border-border bg-white">
            <div className="h-10 flex items-center gap-2 px-4 border-b border-border">
              <Calculator className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-xs font-semibold text-foreground">Return Calculator</h3>
            </div>
            <div className="p-4 space-y-2">
              <input
                type="number" value={calcAmount} onChange={e => setCalcAmount(e.target.value)}
                min={1} placeholder="Enter amount (kr)"
                className="w-full h-9 bg-muted/50 border border-border px-3 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
              />
              {calcResult > 0 ? (
                <div className="border border-border bg-muted/20 p-2.5 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">You receive</span>
                    <span className="font-mono font-bold text-green-600">{calcResult.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Profit</span>
                    <span className="font-mono font-semibold text-green-600">+{(calcResult - Number(calcAmount)).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr</span>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">Enter an amount to simulate returns</p>
              )}
            </div>
          </div>

          {/* Document link */}
          {o.document_url && (
            <a href={o.document_url} target="_blank" rel="noreferrer"
              className="border border-border bg-white p-3 flex items-center gap-2 text-xs text-primary hover:bg-muted/20 font-medium transition-colors">
              <FileText className="h-4 w-4" /> View Attached Document (PDF)
            </a>
          )}
        </div>
      </div>

      {/* Published by — company detail */}
      {company && (
        <div className="border border-border bg-white p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Published by</span>
          </div>
          <div className="flex items-center gap-3">
            {(company as any).logo_url && (
              <img src={(company as any).logo_url} alt="" className="h-10 w-10 object-contain border border-border rounded" />
            )}
            <div>
              <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <CountryFlag country={(company as any).country} size={16} /> {(company as any).name}
              </div>
              <div className="text-xs text-muted-foreground">
                {(company as any).industry && <span>{(company as any).industry}</span>}
                {(company as any).industry && (company as any).country && <span> · </span>}
                {(company as any).country && <span>{(company as any).country}</span>}
              </div>
              {(company as any).description && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{(company as any).description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ DETAIL SECTIONS — full width, Avanza-style tables ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Section title="Deal Summary" icon={<Package className="h-3.5 w-3.5 text-primary" />}>
          <InfoRow label="Product" value={offer.title} />
          <InfoRow label="Product ID" value={o.product_id_display} />
          <InfoRow label="Status" value={offer.status} />
          <InfoRow label="Sector" value={o.sector || "Trade Finance"} />
          <InfoRow label="Structure" value={o.structure || "Trade Finance"} />
          <InfoRow label="Repayment" value={repaymentLabel} />
        </Section>

        <Section title="Investment Terms" icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}>
          <InfoRow label="Total Amount" value={`${target.toLocaleString()} kr`} />
          <InfoRow label="Min Investment" value={minPledge > 0 ? `${minPledge.toLocaleString()} kr` : "No minimum"} />
          <InfoRow label="Duration" value={tenorDays ? `${tenorDays} days` : "—"} />
          <InfoRow label="Expected Return" value={`${rate.toFixed(1)}%`} highlight />
          <InfoRow label="Annual Return" value={annualReturn ? `${annualReturn.toFixed(1)}%` : "—"} highlight />
          <InfoRow label="Profit (on full)" value={`+${profitKr.toLocaleString()} kr`} highlight />
        </Section>

        <Section title="Underlying Transaction" icon={<Package className="h-3.5 w-3.5 text-primary" />}>
          <InfoRow label="Product" value={offer.title} />
          <InfoRow label="Origin" value={o.origin} />
          <InfoRow label="Volume" value={o.volume} />
          <InfoRow label="Purchase Price" value={o.purchase_price ? `${Number(o.purchase_price).toLocaleString()} kr` : "—"} />
          <InfoRow label="Sales Value" value={o.sales_value ? `${Number(o.sales_value).toLocaleString()} kr` : "—"} />
          <InfoRow label="Gross Margin" value={o.gross_margin ? `${Number(o.gross_margin).toFixed(1)}%` : "—"} />
        </Section>

        <Section title="Risk & Security" icon={<Shield className="h-3.5 w-3.5 text-primary" />}>
          <InfoRow label="Collateral" value={o.collateral || "Inventory"} />
          <InfoRow label="LTV" value={o.ltv ? `${Number(o.ltv).toFixed(1)}%` : "—"} />
          <InfoRow label="Primary Exit" value={o.primary_exit} />
          <InfoRow label="Secondary Exit" value={o.secondary_exit} />
          <InfoRow label="Downside Risk" value={o.downside || o.risk_note} />
        </Section>
      </div>

      {/* Published by — company detail */}
      {company && (
        <div className="border border-border bg-white p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Published by</span>
          </div>
          <div className="flex items-center gap-3">
            {(company as any).logo_url && (
              <img src={(company as any).logo_url} alt="" className="h-10 w-10 object-contain border border-border rounded" />
            )}
            <div>
              <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <CountryFlag country={(company as any).country} size={16} /> {(company as any).name}
              </div>
              <div className="text-xs text-muted-foreground">
                {(company as any).industry && <span>{(company as any).industry}</span>}
                {(company as any).industry && (company as any).country && <span> · </span>}
                {(company as any).country && <span>{(company as any).country}</span>}
              </div>
              {(company as any).description && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{(company as any).description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Risk warning */}
      {(o.risk_note || o.downside) && (
        <div className="border border-warning/30 bg-warning/5 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div>
            <span className="text-[11px] font-semibold text-warning block mb-0.5">Risk Note</span>
            <span className="text-xs text-foreground">{o.downside || o.risk_note}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-white">
      <div className="h-9 flex items-center gap-2 px-3 border-b border-border bg-muted/30">
        {icon}
        <h3 className="text-[11px] font-bold text-foreground uppercase tracking-wider">{title}</h3>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string | number | null | undefined; highlight?: boolean }) {
  return (
    <div className="flex justify-between px-3 py-2 text-[11px] hover:bg-muted/20 transition-colors">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium font-mono ${highlight ? "text-green-600 font-bold" : "text-foreground"}`}>{value ?? "—"}</span>
    </div>
  );
}
