import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Calculator, FileText, AlertTriangle, TrendingUp, Shield, Package, CheckCircle, X, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { parseISO, format } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";

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
    <div className="max-w-4xl mx-auto space-y-5">
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
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 border-border accent-primary"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  I have read and understood the offer terms, risk notes, and investment details. I confirm this investment at my own risk.
                </span>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => pledgeMutation.mutate(pledgeAmt)}
                  disabled={!termsAccepted || pledgeMutation.isPending}
                  className="flex-1 h-10 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {pledgeMutation.isPending ? "Processing..." : "Confirm Investment"}
                </button>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="h-10 px-5 border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">{offer.title}</h1>
        {offer.description && (
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{offer.description}</p>
        )}
      </div>

      {/* Countdown banner */}
      {offer.status === "Open" && daysLeft !== null && (
        <div className={`border p-4 flex items-center justify-between ${
          daysLeft > 0 ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"
        }`}>
          <div className="flex items-center gap-2.5">
            <Clock className={`h-5 w-5 ${daysLeft > 0 ? "text-primary" : "text-destructive"}`} />
            <span className="text-sm text-foreground font-semibold">
              {daysLeft > 0 ? `${daysLeft} days remaining` : "This offer has expired"}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Maturity: {format(parseISO(offer.maturity_date), "d MMM yyyy")}
          </span>
        </div>
      )}

      {/* Funding progress */}
      <div className="border border-border bg-white p-5">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span className="font-medium">Funding Progress</span>
          <span className="font-mono">{funded.toLocaleString()} / {target.toLocaleString()} kr ({progress.toFixed(1)}%)</span>
        </div>
        <div className="h-3 bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Product image */}
      {o.product_image_url && (
        <div className="w-full h-48 overflow-hidden border border-border">
          <img src={o.product_image_url} alt={offer.title} className="w-full h-full object-cover" />
        </div>
      )}

      {/* Return overview */}
      <div className="border border-green-200 bg-green-50/50 p-5">
        <h3 className="text-xs font-semibold text-green-700 mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Investor Return Overview
        </h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xl font-bold text-foreground font-mono">{target.toLocaleString()} kr</div>
            <div className="text-xs text-muted-foreground mt-1">Total Investment</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-600">{rate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">Return Rate</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-600 font-mono">+{profitKr.toLocaleString()} kr</div>
            <div className="text-xs text-muted-foreground mt-1">Profit</div>
          </div>
          <div>
            <div className="text-xl font-bold text-foreground font-mono">{totalPayout.toLocaleString()} kr</div>
            <div className="text-xs text-muted-foreground mt-1">Total Payout</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Deal Summary" icon={<Package className="h-4 w-4 text-primary" />}>
          <InfoRow label="Product" value={offer.title} />
          <InfoRow label="Product ID" value={o.product_id_display} />
          <InfoRow label="Status" value={offer.status} />
          <InfoRow label="Sector" value={o.sector || "Trade Finance"} />
          <InfoRow label="Structure" value={o.structure || "Trade Finance"} />
        </Section>
        <Section title="Investment Terms" icon={<TrendingUp className="h-4 w-4 text-primary" />}>
          <InfoRow label="Total Amount" value={`${target.toLocaleString()} kr`} />
          <InfoRow label="Minimum Investment" value={minPledge > 0 ? `${minPledge.toLocaleString()} kr` : "No minimum"} />
          <InfoRow label="Duration" value={tenorDays ? `${tenorDays} days` : "—"} />
          <InfoRow label="Expected Return" value={`${rate.toFixed(1)}%`} />
          <InfoRow label="Annual Return" value={annualReturn ? `${annualReturn.toFixed(1)}%` : "—"} />
          <InfoRow label="Repayment Type" value={repaymentLabel} />
        </Section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Underlying Transaction" icon={<Package className="h-4 w-4 text-primary" />}>
          <InfoRow label="Product" value={offer.title} />
          <InfoRow label="Origin" value={o.origin} />
          <InfoRow label="Volume" value={o.volume} />
          <InfoRow label="Purchase Price" value={o.purchase_price ? `${Number(o.purchase_price).toLocaleString()} kr` : "—"} />
          <InfoRow label="Sales Value" value={o.sales_value ? `${Number(o.sales_value).toLocaleString()} kr` : "—"} />
          <InfoRow label="Gross Margin" value={o.gross_margin ? `${Number(o.gross_margin).toFixed(1)}%` : "—"} />
        </Section>
        <Section title="Risk & Security" icon={<Shield className="h-4 w-4 text-primary" />}>
          <InfoRow label="Collateral" value={o.collateral || "Inventory"} />
          <InfoRow label="LTV" value={o.ltv ? `${Number(o.ltv).toFixed(1)}%` : "—"} />
          <InfoRow label="Primary Exit" value={o.primary_exit} />
          <InfoRow label="Secondary Exit" value={o.secondary_exit} />
          <InfoRow label="Downside Risk" value={o.downside || o.risk_note} />
        </Section>
      </div>

      {(o.risk_note || o.downside) && (
        <div className="border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
          <div>
            <span className="text-xs font-semibold text-warning block mb-1">Risk Note</span>
            <span className="text-sm text-foreground">{o.downside || o.risk_note}</span>
          </div>
        </div>
      )}

      {o.document_url && (
        <a href={o.document_url} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline font-medium">
          <FileText className="h-4 w-4" /> View Attached Document (PDF)
        </a>
      )}

      {/* ROI Calculator */}
      <div className="border border-border bg-white">
        <div className="h-11 flex items-center gap-2 px-4 border-b border-border">
          <Calculator className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Return Calculator</h3>
        </div>
        <div className="p-5">
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-muted-foreground font-medium">Enter amount (kr)</label>
              <input
                type="number" value={calcAmount} onChange={e => setCalcAmount(e.target.value)}
                min={1} placeholder="e.g. 50,000"
                className="w-full h-10 bg-muted/50 border border-border px-3 text-sm text-foreground font-mono focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex-1 border border-border p-3 h-10 flex items-center bg-muted/20">
              {calcResult > 0 ? (
                <span className="text-sm font-semibold text-green-600">
                  You receive: {calcResult.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Enter an amount to calculate</span>
              )}
            </div>
          </div>
          {calcResult > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Profit: <span className="text-green-600 font-semibold">{(calcResult - Number(calcAmount)).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr</span> ({rate.toFixed(1)}% return)
            </p>
          )}
        </div>
      </div>

      {/* Investment form */}
      {offer.status === "Open" && (
        <div className="border border-primary/30 bg-primary/5">
          <div className="h-11 flex items-center px-4 border-b border-primary/20">
            <h3 className="text-sm font-semibold text-primary">Invest in This Offer</h3>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex gap-4 items-end">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Investment Amount (kr)</label>
                <input
                  type="number" value={pledgeAmount} onChange={e => setPledgeAmount(e.target.value)}
                  min={minPledge || 1} max={maxPledge || undefined}
                  placeholder={minPledge > 0 ? `Minimum ${minPledge.toLocaleString()} kr` : "Enter amount"}
                  className="w-full h-10 bg-white border border-border px-3 text-sm text-foreground font-mono focus:border-primary focus:outline-none"
                />
              </div>
              <button
                onClick={handleInvestClick}
                disabled={!pledgeAmount || Number(pledgeAmount) <= 0}
                className="h-10 px-8 bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Invest Now
              </button>
            </div>
            {pledgeAmt > 0 && (
              <p className="text-xs text-muted-foreground">
                You will receive <span className="text-green-600 font-semibold">{pledgeReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</span> back on {format(parseISO(offer.maturity_date), "d MMM yyyy")}
              </p>
            )}
            {minPledge > 0 && (
              <p className="text-xs text-muted-foreground">
                Minimum: {minPledge.toLocaleString()} kr{maxPledge && ` · Maximum: ${maxPledge.toLocaleString()} kr`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-white">
      <div className="h-11 flex items-center gap-2 px-4 border-b border-border">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );
}
