import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Calculator, FileText, AlertTriangle, TrendingUp, Shield, Package, CheckCircle, Briefcase, Building2, ArrowUpRight, ArrowRight, ArrowLeft, CreditCard, Info, Copy, Download, Calendar } from "lucide-react";
import { toast } from "sonner";
import { parseISO, format, addBusinessDays } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";
import CountryFlag from "@/components/CountryFlag";
import { getCurrency } from "@/lib/currency";
import { generateConfirmationPdf } from "@/lib/generateConfirmationPdf";

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

      // funded_amount is updated only when admin marks the pledge as "Active" (received)

      // Notification is handled by the database trigger (notify_new_pledge)

      return data;
    },
    onSuccess: (data: any) => {
      setSuccessRef(data.payment_reference || "");
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

  // Fetch pending pledges for this offer
  const { data: pendingPledgeAmount = 0 } = useQuery({
    queryKey: ["portal-pending-pledges-offer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("amount")
        .eq("offer_id", id!)
        .eq("status", "Pending Payment");
      if (error) throw error;
      return data.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    },
    enabled: !!id,
  });

  // Fetch user's existing pledges for this offer
  const { data: myPledges = [] } = useQuery({
    queryKey: ["my-pledges-for-offer", id, authUser?.id],
    queryFn: async () => {
      if (!authUser?.id || !id) return [];
      const { data } = await supabase
        .from("pledges")
        .select("id, amount, status, created_at")
        .eq("offer_id", id)
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!authUser?.id && !!id,
  });

  // Reset investment flow when navigating to a different offer
  useEffect(() => {
    setStep(1);
    setPledgeAmount("");
    setTermsAccepted(false);
    setAmountTouched(false);
    setSuccessRef("");
  }, [id]);

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
  const cur = getCurrency((company as any)?.country);
  const target = Number(offer.target_amount);
  const funded = Number(offer.funded_amount);
  const pending = pendingPledgeAmount;
  const rate = Number(offer.interest_rate);
  const confirmedPct = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
  const pendingPct = target > 0 ? Math.min(100 - confirmedPct, (pending / target) * 100) : 0;
  const progress = confirmedPct;
  const profitKr = Math.round(target * (rate / 100));
  const totalPayout = target + profitKr;
  const calcResult = calcAmount ? Number(calcAmount) * (1 + rate / 100) : 0;
  const minPledge = Number(o.min_pledge) || 0;
  const maxPledge = o.max_pledge ? Number(o.max_pledge) : null;
  const sanitizedPledgeAmount = pledgeAmount.replace(/[^\d]/g, "");
  const pledgeAmt = sanitizedPledgeAmount ? Number(sanitizedPledgeAmount) : 0;
  const pledgeReturn = pledgeAmt * (1 + rate / 100);
  const pledgeProfit = pledgeReturn - pledgeAmt;
  const remaining = target - funded;
  const remainingAfterPending = target - funded - pending;
  const isFullyCommitted = remainingAfterPending <= 0 && offer.status === "Open";
  const effectiveMin = (minPledge > 0 && remainingAfterPending < minPledge && remainingAfterPending > 0) ? 1 : minPledge;

  const maturityDate = new Date(offer.maturity_date);
  const tenorDays = o.tenor_days ?? (o.purchase_date
    ? Math.ceil((maturityDate.getTime() - new Date(o.purchase_date).getTime()) / (1000 * 60 * 60 * 24))
    : null);
  let annualReturn = o.annual_return ? Number(o.annual_return) : null;
  if (!annualReturn && tenorDays && tenorDays > 0) {
    annualReturn = Math.round((rate / tenorDays) * 365 * 100) / 100;
  }
  const repaymentLabel = o.repayment_type === "rolling" ? "Rolling" : "Bullet";

  const isValidAmount = pledgeAmt > 0 && pledgeAmt >= effectiveMin && pledgeAmt <= Math.max(0, remainingAfterPending);
  const investorName = investorProfile
    ? `${investorProfile.first_name} ${investorProfile.last_name}`.trim()
    : authUser?.email || "Investor";
  const companyName = (company as any)?.name || "the issuer";

  /* ── Step indicator ── */
  const stepIndicator = (
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

  const paymentDeadline = format(addBusinessDays(new Date(), 5), "d MMMM yyyy");

  const handleDownloadConfirmation = () => {
    generateConfirmationPdf({
      reference: successRef,
      offerTitle: offer.title,
      companyName,
      amount: pledgeAmt,
      currency: cur,
      status: "Pending Payment",
      date: new Date().toISOString(),
      rate,
      maturityDate: format(parseISO(offer.maturity_date), "d MMMM yyyy"),
      iban: o.company_iban || undefined,
      paymentDeadline,
    });
  };

  const copyReference = () => {
    navigator.clipboard.writeText(successRef);
    toast.success("Reference copied to clipboard");
  };

  /* ── Investment Panel (3-step) ── */
  const investPanel = (() => {
    if (offer.status !== "Open" || remaining <= 0) {
      return (
        <div className="border border-border bg-muted/20 p-4 text-center">
          <span className="text-xs font-semibold text-muted-foreground">
            {offer.status === "Funded" ? "This offer is fully funded" : `This offer is ${offer.status}`}
          </span>
        </div>
      );
    }

    if (isFullyCommitted) {
      return (
        <div className="border border-primary/30 bg-primary/5 p-4 text-center space-y-2">
          <CheckCircle className="h-8 w-8 text-primary mx-auto" />
          <p className="text-xs font-semibold text-foreground">This offer is fully committed</p>
          <p className="text-[10px] text-muted-foreground">No further investments can be accepted. All remaining capacity is covered by pending commitments.</p>
        </div>
      );
    }

    return (
      <div className="border border-primary/30 bg-primary/5 lg:sticky lg:top-4">
        <div className="h-10 flex items-center px-4 border-b border-primary/20">
          <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Invest in This Offer</h3>
        </div>
        <div className="p-4">
          {/* Existing investments info banner */}
          {myPledges.length > 0 && step === 1 && (
            <div className="border border-mackerel/30 bg-mackerel-light p-3 mb-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-mackerel shrink-0" />
                <span className="text-[11px] font-semibold text-mackerel">You have existing investments in this offer</span>
              </div>
              <div className="space-y-0.5">
                {myPledges.map((p: any) => (
                  <div key={p.id} className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">
                      {format(parseISO(p.created_at), "d MMM yyyy")} — <span className={`font-medium ${
                        p.status === 'Active' ? 'text-mackerel' : p.status === 'Paid Out' ? 'text-primary' : 'text-amber-600'
                      }`}>{p.status}</span>
                    </span>
                    <span className="font-mono font-medium text-foreground">{Number(p.amount).toLocaleString()} {cur}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">You can invest additional amounts below.</p>
            </div>
          )}
          {stepIndicator}

          {/* ── STEP 1: Enter Amount ── */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] text-muted-foreground font-medium">Investment Amount</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={pledgeAmount}
                  onChange={(e) => setPledgeAmount(e.target.value)}
                  onBlur={() => setPledgeAmount((v) => v.replace(/[^\d]/g, ""))}
                  placeholder={minPledge > 0 ? `Min ${minPledge.toLocaleString()} ${cur}` : "Enter amount"}
                  className={`w-full h-10 bg-white border px-3 text-sm text-foreground font-mono focus:outline-none ${
                    amountTouched && pledgeAmt > 0 && !isValidAmount ? "border-destructive focus:border-destructive" : "border-border focus:border-primary"
                  }`}
                />
                {amountTouched && pledgeAmt > 0 && pledgeAmt < effectiveMin && (
                  <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Minimum investment is {effectiveMin.toLocaleString()} {cur}
                  </p>
                )}
                {amountTouched && pledgeAmt > Math.max(0, remainingAfterPending) && remainingAfterPending > 0 && (
                  <p className="text-[11px] text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Only {Math.max(0, remainingAfterPending).toLocaleString()} {cur} remaining
                  </p>
                )}
                {remainingAfterPending < minPledge && remainingAfterPending > 0 && minPledge > 0 && (
                  <p className="text-[11px] text-amber-600 font-medium">
                    Only {Math.max(0, remainingAfterPending).toLocaleString()} {cur} left — minimum rule waived
                  </p>
                )}
              </div>

              {isValidAmount && (
                <div className="border border-border bg-white p-3 space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">You invest</span>
                    <span className="font-mono font-bold text-foreground">{pledgeAmt.toLocaleString()} {cur}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Expected return</span>
                    <span className="font-mono font-bold text-mackerel">+{pledgeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} {cur} ({rate.toFixed(1)}%)</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Expected payout</span>
                    <span className="font-mono font-bold text-foreground">{pledgeReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} {cur}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Maturity date</span>
                    <span className="font-medium text-foreground">{format(parseISO(offer.maturity_date), "d MMMM yyyy")}</span>
                  </div>
                </div>
              )}

              <button
                onClick={() => { setAmountTouched(true); if (isValidAmount) setStep(2); }}
                disabled={false}
                className="w-full h-10 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
              {(minPledge > 0 || remaining < target) && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {effectiveMin > 0 && `Min: ${effectiveMin.toLocaleString()} ${cur}`}
                  {effectiveMin > 0 && maxPledge ? " · " : ""}
                  {maxPledge && `Max: ${maxPledge.toLocaleString()} ${cur}`}
                  {(effectiveMin > 0 || maxPledge) && remainingAfterPending < target ? " · " : ""}
                  {remainingAfterPending < target && `Available: ${Math.max(0, remainingAfterPending).toLocaleString()} ${cur}`}
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
                  <span className="font-mono font-bold text-foreground">{pledgeAmt.toLocaleString()} {cur}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Expected return ({rate.toFixed(1)}%)</span>
                  <span className="font-mono font-bold text-mackerel">+{pledgeProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })} {cur}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Total payout</span>
                  <span className="font-mono font-bold text-foreground">{pledgeReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} {cur}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Maturity date</span>
                  <span className="font-medium text-foreground">{format(parseISO(offer.maturity_date), "d MMMM yyyy")}</span>
                </div>
              </div>

              {/* Agreement text */}
              <div className="border border-border bg-muted/20 p-3 text-[10px] text-muted-foreground leading-relaxed space-y-2 max-h-64 overflow-y-auto">
                <p className="font-semibold text-foreground text-[11px]">Investment Agreement</p>
                <p>
                  I, <strong className="text-foreground">{investorName}</strong>, hereby commit to invest{" "}
                  <strong className="text-foreground">{pledgeAmt.toLocaleString()} {cur}</strong> in the trade finance offer{" "}
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
              <div className="bg-mackerel-light border border-mackerel/30 p-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-mackerel shrink-0" />
                <div>
                  <div className="text-sm font-bold text-mackerel">Your investment is booked! ✓</div>
                  <div className="text-[11px] text-mackerel">Complete the payment below to activate your investment.</div>
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
                  <div className="flex justify-between text-[11px] items-center">
                    <span className="text-muted-foreground">Reference</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-primary">{successRef}</span>
                      <button onClick={copyReference} className="h-5 w-5 flex items-center justify-center border border-border rounded hover:bg-muted/50" title="Copy">
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-mono font-bold text-foreground">{pledgeAmt.toLocaleString()} {cur}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Deadline</span>
                    <span className="font-medium text-foreground">{paymentDeadline}</span>
                  </div>
                </div>

                <div className="border-t border-border pt-2">
                  <p className="text-[10px] text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Use the exact reference. Funds must arrive by {paymentDeadline}.
                  </p>
                </div>
              </div>

              {/* Info box */}
              <div className="border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Your investment will appear as <strong className="text-foreground">Pending Payment</strong> on your portfolio.
                  It will change to <strong className="text-foreground">Active</strong> once we confirm receipt (<strong className="text-foreground">1–2 business days</strong>).
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={copyReference}
                  className="h-10 px-3 border border-border text-xs text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy Ref
                </button>
                <button
                  onClick={handleDownloadConfirmation}
                  className="flex-1 h-10 border border-border text-foreground text-sm font-semibold hover:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
                <button
                  onClick={() => switchTab("/portal/portfolio")}
                  className="flex-1 h-10 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Briefcase className="h-4 w-4" /> Portfolio
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  })();

  /* ── FULL-PAGE SUCCESS SCREEN (Step 3) ── */

  if (step === 3) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-2">
      <div className="w-full max-w-lg space-y-5">
          {stepIndicator}
          {/* Success header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-mackerel/10 mx-auto">
              <CheckCircle className="h-9 w-9 text-mackerel" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Investment committed!</h1>
            <p className="text-sm text-muted-foreground">Your commitment has been registered. Complete the bank transfer below to activate your investment.</p>
          </div>

          {/* Payment instruction box */}
          <div className="border-2 border-primary/30 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-foreground">Payment Instructions</span>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bank</span>
                <span className="font-medium text-foreground">{companyName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">IBAN</span>
                <span className="font-mono font-bold text-foreground">{o.company_iban || "Contact support"}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">Reference number</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary text-base">{successRef}</span>
                  <button
                    onClick={copyReference}
                    className="h-7 w-7 flex items-center justify-center border border-border rounded hover:bg-muted/50 transition-colors"
                    title="Copy reference"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount to transfer</span>
                <span className="font-mono font-bold text-foreground">{pledgeAmt.toLocaleString()} {cur}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment deadline</span>
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {paymentDeadline}
                </span>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-xs text-amber-600 font-semibold flex items-center gap-1.5 bg-amber-50 border border-amber-200 p-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Use the exact reference number so your payment can be matched. Funds must arrive by {paymentDeadline}.
              </p>
            </div>
          </div>

          {/* Secondary note */}
          <div className="border border-primary/20 bg-primary/5 p-4 flex items-start gap-2.5">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Once we receive and confirm your transfer (typically <strong className="text-foreground">1–2 business days</strong>),
              your investment status will change to <strong className="text-foreground">Active</strong> and you'll receive a confirmation notification.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={copyReference}
              className="h-11 px-4 border border-border text-foreground text-sm font-semibold hover:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Copy className="h-4 w-4" /> Copy Reference
            </button>
            <button
              onClick={handleDownloadConfirmation}
              className="flex-1 h-11 border border-border text-foreground text-sm font-semibold hover:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="h-4 w-4" /> Download Confirmation
            </button>
            <button
              onClick={() => switchTab("/portal/portfolio")}
              className="flex-1 h-11 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
            >
              View My Investments <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                      ? "text-mackerel bg-mackerel-light border-mackerel/30"
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
          <div className="border border-border bg-white overflow-x-auto">
            <table className="w-full text-[11px] min-w-[500px]">
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
                  <td className="px-3 py-2.5 font-bold text-mackerel font-mono">{rate.toFixed(1)}%</td>
                  <td className="px-3 py-2.5 font-bold text-mackerel font-mono">{annualReturn ? `${annualReturn.toFixed(1)}%` : "—"}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground font-mono">{tenorDays ? `${tenorDays} days` : "—"}</td>
                  <td className="px-3 py-2.5 font-bold text-mackerel font-mono">+{profitKr.toLocaleString()} {cur}</td>
                  <td className="px-3 py-2.5 font-bold text-foreground font-mono">{totalPayout.toLocaleString()} {cur}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{format(parseISO(offer.maturity_date), "d MMM yyyy")}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Funding progress */}
          <div className="border border-border bg-white p-3">
            <div className="flex flex-col sm:flex-row sm:justify-between text-[11px] text-muted-foreground mb-1.5 gap-1">
              <span className="font-semibold">Funding Progress</span>
              <span className="font-mono text-[10px] sm:text-[11px]">
                {funded.toLocaleString()} / {target.toLocaleString()} {cur} ({confirmedPct.toFixed(1)}%{pendingPct > 0 ? ` confirmed · ${pendingPct.toFixed(1)}% pending` : ""})
              </span>
            </div>
            <div className="h-2 bg-muted overflow-hidden flex">
              <div className="h-full bg-mackerel transition-all" style={{ width: `${confirmedPct}%` }} />
              {pendingPct > 0 && (
                <div className="h-full bg-mackerel/30 transition-all" style={{ width: `${pendingPct}%` }} />
              )}
            </div>
            {pendingPct > 0 && (
              <div className="flex items-center gap-3 mt-2 text-[10px]">
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 bg-mackerel" />
                  <span className="text-muted-foreground">Confirmed ({funded.toLocaleString()} {cur})</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 bg-mackerel/30" />
                  <span className="text-muted-foreground">Pending ({pending.toLocaleString()} {cur})</span>
                </div>
              </div>
            )}
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
          {investPanel}

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
                  min={1} placeholder="Enter amount"
                  className="w-full h-9 bg-muted/50 border border-border px-3 text-xs text-foreground font-mono focus:border-primary focus:outline-none"
                />
                {calcResult > 0 ? (
                  <div className="border border-border bg-muted/20 p-2.5 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">You receive</span>
                      <span className="font-mono font-bold text-mackerel">{calcResult.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} {cur}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">Profit</span>
                      <span className="font-mono font-semibold text-mackerel">+{(calcResult - Number(calcAmount)).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} {cur}</span>
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
          <InfoRow label="Total Amount" value={`${target.toLocaleString()} ${cur}`} />
          <InfoRow label="Min Investment" value={minPledge > 0 ? `${minPledge.toLocaleString()} ${cur}` : "No minimum"} />
          <InfoRow label="Duration" value={tenorDays ? `${tenorDays} days` : "—"} />
          <InfoRow label="Expected Return" value={`${rate.toFixed(1)}%`} highlight />
          <InfoRow label="Annual Return" value={annualReturn ? `${annualReturn.toFixed(1)}%` : "—"} highlight />
          <InfoRow label="Profit (on full)" value={`+${profitKr.toLocaleString()} ${cur}`} highlight />
        </Section>

        <Section title="Underlying Transaction" icon={<Package className="h-3.5 w-3.5 text-primary" />}>
          <InfoRow label="Product" value={offer.title} />
          <InfoRow label="Origin" value={o.origin} />
          <InfoRow label="Volume" value={o.volume} />
          <InfoRow label="Purchase Price" value={o.purchase_price ? `${Number(o.purchase_price).toLocaleString()} ${cur}` : "—"} />
          <InfoRow label="Sales Value" value={o.sales_value ? `${Number(o.sales_value).toLocaleString()} ${cur}` : "—"} />
          <InfoRow label="Gross Margin" value={o.gross_margin ? `${Number(o.gross_margin).toFixed(1)}%` : "—"} />
        </Section>

        <Section title="Risk & Security" icon={<Shield className="h-3.5 w-3.5 text-primary" />}>
          <div className="flex justify-between px-3 py-2 text-[11px] hover:bg-muted/20 transition-colors">
            <span className="text-muted-foreground">Risk Rating</span>
            {o.risk_level === "Low" ? (
              <span className="px-1.5 py-0.5 text-[9px] font-semibold border text-emerald-700 bg-emerald-50 border-emerald-200">Low Risk</span>
            ) : o.risk_level === "High" ? (
              <span className="px-1.5 py-0.5 text-[9px] font-semibold border text-red-600 bg-red-50 border-red-200">High Risk</span>
            ) : o.risk_level === "Medium" ? (
              <span className="px-1.5 py-0.5 text-[9px] font-semibold border text-amber-700 bg-amber-50 border-amber-200">Medium Risk</span>
            ) : (
              <span className="px-1.5 py-0.5 text-[9px] font-medium border border-border text-muted-foreground bg-muted/30">Not rated</span>
            )}
          </div>
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
      <span className={`font-medium font-mono ${highlight ? "text-mackerel font-bold" : "text-foreground"}`}>{value ?? "—"}</span>
    </div>
  );
}
