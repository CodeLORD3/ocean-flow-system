import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Calculator, FileText, AlertTriangle, TrendingUp, Shield, Package, CheckCircle, Briefcase, Building2, ArrowUpRight, ArrowRight, ArrowLeft, CreditCard, Info } from "lucide-react";
import { toast } from "sonner";
import { parseISO, format } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";
import CountryFlag from "@/components/CountryFlag";

export default function PortalOfferDetail({ overrideId }: { overrideId?: string } = {}) {
  const { id: paramId } = useParams<{ id: string }>();
  const id = overrideId || paramId;
  const queryClient = useQueryClient();
  const { switchTab } = usePortalTabs();

  // Investment flow state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [successRef, setSuccessRef] = useState("");
  const [calcAmount, setCalcAmount] = useState("");

  // Auth user + profile
  const { data: authUser } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: investorProfile } = useQuery({
    queryKey: ["investor-profile", authUser?.id],
    queryFn: async () => {
      if (!authUser?.id) return null;
      const { data } = await supabase
        .from("investor_profiles")
        .select("*")
        .eq("user_id", authUser.id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!authUser?.id,
  });

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
      if (!authUser) throw new Error("You must be logged in to invest");

      const { data, error } = await supabase.from("pledges").insert({
        offer_id: id!,
        user_id: authUser.id,
        amount,
        status: "Pending Payment",
      } as any).select().single();
      if (error) throw error;

      // Update funded_amount
      const { data: currentOffer } = await supabase.from("trade_offers").select("funded_amount, target_amount, title, company_iban").eq("id", id!).single();
      const currentFunded = Number(currentOffer?.funded_amount || 0);
      const targetAmount = Number(currentOffer?.target_amount || 0);
      const newFunded = currentFunded + amount;

      const updatePayload: any = { funded_amount: newFunded };
      if (newFunded >= targetAmount && targetAmount > 0) {
        updatePayload.status = "Funded";
      }
      await supabase.from("trade_offers").update(updatePayload).eq("id", id!);

      // Create investor notification for booking
      const offerTitle = currentOffer?.title || (offer as any)?.title || "an offer";
      await supabase.from("notifications").insert({
        portal: "investor",
        target_page: "/portal/portfolio",
        message: `Investment booked for "${offerTitle}" — please send ${amount.toLocaleString()} kr to the IBAN provided.`,
        entity_type: "pledge",
        entity_id: data.id,
      });

      return data;
    },
    onSuccess: () => {
      const investorShort = authUser?.id?.slice(0, 4).toUpperCase() || "XXXX";
      const offerShort = id?.slice(0, 4).toUpperCase() || "XXXX";
      const prefix = (offer as any)?.payment_reference_prefix || "OT-";
      setSuccessRef(`${prefix}${new Date().getFullYear()}-${investorShort}-${offerShort}`);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ["portal-offer", id] });
      queryClient.invalidateQueries({ queryKey: ["portal-offers"] });
      queryClient.invalidateQueries({ queryKey: ["portal-my-pledges"] });
      queryClient.invalidateQueries({ queryKey: ["portal-portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["investment-log"] });
      queryClient.invalidateQueries({ queryKey: ["portal-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["portal-notification-count"] });
      toast.success("Investment booked!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to submit investment");
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
  const remaining = target - funded;
  const effectiveMin = (minPledge > 0 && remaining < minPledge && remaining > 0) ? 1 : minPledge;

  const maturityDate = new Date(offer.maturity_date);
  const tenorDays = o.tenor_days ?? (o.purchase_date
    ? Math.ceil((maturityDate.getTime() - new Date(o.purchase_date).getTime()) / (1000 * 60 * 60 * 24))
    : null);
  let annualReturn = o.annual_return ? Number(o.annual_return) : null;
  if (!annualReturn && tenorDays && tenorDays > 0) {
    annualReturn = Math.round((rate / tenorDays) * 365 * 100) / 100;
  }
  const repaymentLabel = o.repayment_type === "rolling" ? "Rolling" : "Bullet";

  const isValidAmount = pledgeAmt > 0 && pledgeAmt >= effectiveMin && pledgeAmt <= remaining;
  const investorName = investorProfile
    ? `${investorProfile.first_name} ${investorProfile.last_name}`.trim()
    : authUser?.email || "Investor";
  const companyName = (company as any)?.name || "the issuer";

  /* ── Step indicator ── */
  const StepIndicator = () => (
    <div className="flex items-center gap-1.5 mb-4">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-1.5">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
            step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}>{s}</div>
          {s < 3 && <div className={`w-6 h-0.5 ${step > s ? "bg-primary" : "bg-muted"}`} />}
        </div>
      ))}
      <span className="ml-2 text-[10px] text-muted-foreground">
        {step === 1 ? "Enter Amount" : step === 2 ? "Review & Sign" : "Payment"}
      </span>
    </div>
  );

  /* ── Investment Panel (3-step) ── */
  const InvestPanel = () => {
    if (offer.status !== "Open" || remaining <= 0) {
      return (
        <div className="border border-border bg-muted/20 p-4 text-center">
          <span className="text-xs font-semibold text-muted-foreground">
            {offer.status === "Funded" ? "This offer is fully funded" : `This offer is ${offer.status}`}
          </span>
        </div>
      );
    }

    return (
      <div className="border border-primary/30 bg-primary/5 lg:sticky lg:top-4">
        <div className="h-10 flex items-center px-4 border-b border-primary/20">
          <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Invest in This Offer</h3>
        </div>
        <div className="p-4">
          <StepIndicator />

          {/* ── STEP 1: Enter Amount ── */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground font-medium">Investment Amount (kr)</label>
                <input
                  type="number" value={pledgeAmount} onChange={e => setPledgeAmount(e.target.value)}
                  min={effectiveMin || 1} max={maxPledge || undefined}
                  placeholder={minPledge > 0 ? `Min ${minPledge.toLocaleString()} kr` : "Enter amount"}
                  className={`w-full h-10 bg-white border px-3 text-sm text-foreground font-mono focus:outline-none ${
                    pledgeAmt > 0 && !isValidAmount ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {pledgeAmt > 0 && pledgeAmt < effectiveMin && (
                  <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Minimum investment is {effectiveMin.toLocaleString()} kr
                  </p>
                )}
                {pledgeAmt > remaining && remaining > 0 && (
                  <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Only {remaining.toLocaleString()} kr remaining
                  </p>
                )}
                {remaining < minPledge && remaining > 0 && minPledge > 0 && (
                  <p className="text-[11px] text-amber-600 font-medium">
                    Only {remaining.toLocaleString()} kr left — minimum rule waived
                  </p>
                )}
              </div>

              {isValidAmount && (
                <div className="border border-border bg-white p-3 space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">You invest</span>
                    <span className="font-mono font-bold text-foreground">{pledgeAmt.toLocaleString()} kr</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Expected return</span>
                    <span className="font-mono font-bold text-green-600">+{pledgeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr ({rate.toFixed(1)}%)</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Expected payout</span>
                    <span className="font-mono font-bold text-foreground">{pledgeReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Maturity date</span>
                    <span className="font-medium text-foreground">{format(parseISO(offer.maturity_date), "d MMMM yyyy")}</span>
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep(2)}
                disabled={!isValidAmount}
                className="w-full h-10 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
              {(minPledge > 0 || remaining < target) && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {effectiveMin > 0 && `Min: ${effectiveMin.toLocaleString()} kr`}
                  {effectiveMin > 0 && maxPledge ? " · " : ""}
                  {maxPledge && `Max: ${maxPledge.toLocaleString()} kr`}
                  {(effectiveMin > 0 || maxPledge) && remaining < target ? " · " : ""}
                  {remaining < target && `Available: ${remaining.toLocaleString()} kr`}
                </p>
              )}
            </div>
          )}

          {/* ── STEP 2: Review & Sign Agreement ── */}
          {step === 2 && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="border border-border bg-white p-3 space-y-2">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Investment Summary</div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Offer</span>
                  <span className="font-medium text-foreground">{offer.title}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Company</span>
                  <span className="font-medium text-foreground">{companyName}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Your investment</span>
                  <span className="font-mono font-bold text-foreground">{pledgeAmt.toLocaleString()} kr</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Expected return ({rate.toFixed(1)}%)</span>
                  <span className="font-mono font-bold text-green-600">+{pledgeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Total payout</span>
                  <span className="font-mono font-bold text-foreground">{pledgeReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Maturity date</span>
                  <span className="font-medium text-foreground">{format(parseISO(offer.maturity_date), "d MMMM yyyy")}</span>
                </div>
              </div>

              {/* Agreement text */}
              <div className="border border-border bg-muted/20 p-3 text-[10px] text-muted-foreground leading-relaxed space-y-2 max-h-40 overflow-y-auto">
                <p className="font-semibold text-foreground text-[11px]">Investment Agreement</p>
                <p>
                  I, <strong className="text-foreground">{investorName}</strong>, hereby commit to invest{" "}
                  <strong className="text-foreground">{pledgeAmt.toLocaleString()} kr</strong> in the trade finance offer{" "}
                  "<strong className="text-foreground">{offer.title}</strong>" published by{" "}
                  <strong className="text-foreground">{companyName}</strong>.
                </p>
                <p>
                  I understand that the expected return is <strong className="text-foreground">{rate.toFixed(1)}%</strong> and that the maturity date
                  is <strong className="text-foreground">{format(parseISO(offer.maturity_date), "d MMMM yyyy")}</strong>.
                </p>
                <p>
                  I acknowledge that this investment is <strong className="text-foreground">not covered by government deposit insurance</strong> and
                  that my capital will be committed for the full duration of the investment period. Returns are not guaranteed and
                  depend on the successful completion of the underlying trade transaction.
                </p>
                <p>
                  By proceeding, I confirm that I have reviewed the offer documentation, understand the associated risks,
                  and agree to the platform's Terms of Use.
                </p>
              </div>

              {/* Terms checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 border-border accent-primary"
                />
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  I have read and agree to the investment terms and the platform's Terms of Use.
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep(1); setTermsAccepted(false); }}
                  className="h-10 px-4 border border-border text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  onClick={() => pledgeMutation.mutate(pledgeAmt)}
                  disabled={!termsAccepted || pledgeMutation.isPending}
                  className="flex-1 h-10 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  {pledgeMutation.isPending ? "Processing…" : "Confirm Investment"} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Payment Instructions ── */}
          {step === 3 && (
            <div className="space-y-3">
              {/* Success banner */}
              <div className="bg-green-50 border border-green-200 p-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-green-800">Your investment is booked! ✓</div>
                  <div className="text-[11px] text-green-700">Complete the payment below to activate your investment.</div>
                </div>
              </div>

              {/* Payment card */}
              <div className="border border-border bg-white p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span className="text-xs font-bold text-foreground">Send your funds to complete the investment</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="font-medium text-foreground">{companyName}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">IBAN</span>
                    <span className="font-mono font-bold text-foreground">{o.company_iban || "Contact support"}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Reference</span>
                    <span className="font-mono font-bold text-primary">{successRef}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-mono font-bold text-foreground">{pledgeAmt.toLocaleString()} kr</span>
                  </div>
                </div>

                <div className="border-t border-border pt-2">
                  <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> You must use the exact reference number so your payment can be matched.
                  </p>
                </div>
              </div>

              {/* Info box */}
              <div className="border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Your investment will appear as <strong className="text-foreground">Pending Payment</strong> on your portfolio once submitted.
                  It will change to <strong className="text-foreground">Active</strong> once we have confirmed receipt of your funds.
                  This typically takes <strong className="text-foreground">1–2 business days</strong>.
                </p>
              </div>

              <button
                onClick={() => switchTab("/portal/portfolio")}
                className="w-full h-10 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
              >
                <Briefcase className="h-4 w-4" /> View My Portfolio
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* ═══════════ TOP SECTION: Header + Key Metrics + Invest ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: 2 columns wide */}
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

          {/* Key metrics row */}
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

        {/* RIGHT: Investment panel */}
        <div className="lg:col-span-1 space-y-3">
          <InvestPanel />

          {/* ROI Calculator — only show when offer is not Open (no invest panel) */}
          {offer.status !== "Open" && (
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
          )}

          {/* Document link */}
          {o.document_url && (
            <a href={o.document_url} target="_blank" rel="noreferrer"
              className="border border-border bg-white p-3 flex items-center gap-2 text-xs text-primary hover:bg-muted/20 font-medium transition-colors">
              <FileText className="h-4 w-4" /> View Attached Document (PDF)
            </a>
          )}
        </div>
      </div>

      {/* Published by */}
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

      {/* Detail sections */}
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
