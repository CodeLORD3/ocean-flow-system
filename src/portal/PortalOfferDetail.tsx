import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Clock, Calculator, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function PortalOfferDetail({ overrideId }: { overrideId?: string } = {}) {
  const { id: paramId } = useParams<{ id: string }>();
  const id = overrideId || paramId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pledgeAmount, setPledgeAmount] = useState("");
  const [calcAmount, setCalcAmount] = useState("");

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
      const { error } = await supabase.from("pledges").insert({
        offer_id: id!,
        user_id: user.id,
        amount,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pledge submitted successfully");
      setPledgeAmount("");
      queryClient.invalidateQueries({ queryKey: ["portal-offer", id] });
      queryClient.invalidateQueries({ queryKey: ["portal-offers"] });
      queryClient.invalidateQueries({ queryKey: ["portal-commitments"] });
    },
    onError: (err: any) => toast.error(err.message),
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
    return <div className="text-[#0066ff] text-xs animate-pulse">LOADING...</div>;
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

  const maturityDate = new Date(offer.maturity_date);
  const tenorDays = o.tenor_days ?? (o.purchase_date
    ? Math.ceil((maturityDate.getTime() - new Date(o.purchase_date).getTime()) / (1000 * 60 * 60 * 24))
    : null);

  let annualReturn = o.annual_return ? Number(o.annual_return) : null;
  if (!annualReturn && tenorDays && tenorDays > 0) {
    annualReturn = Math.round((rate / tenorDays) * 365 * 100) / 100;
  }

  const repaymentLabel = o.repayment_type === "rolling" ? "Löpande" : "Bullet";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button
        onClick={() => navigate("/portal")}
        className="flex items-center gap-1 text-[10px] text-[#6b7a8d] hover:text-[#0066ff] tracking-wider transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> BACK TO OFFERS
      </button>

      {/* Countdown */}
      {offer.status === "Open" && daysLeft !== null && (
        <div className={`border p-3 flex items-center justify-between ${daysLeft > 0 ? "border-[#0066ff]/30 bg-[#0066ff]/5" : "border-red-400/30 bg-red-400/5"}`}>
          <div className="flex items-center gap-2">
            <Clock className={`h-4 w-4 ${daysLeft > 0 ? "text-[#0066ff]" : "text-red-400"}`} />
            <span className="text-[11px] text-[#1a2035] font-bold tracking-wider">
              {daysLeft > 0 ? `${daysLeft} DAGAR KVAR` : "ERBJUDANDET HAR LÖPT UT"}
            </span>
          </div>
          <span className="text-[9px] text-[#6b7a8d]">{offer.maturity_date}</span>
        </div>
      )}

      {/* Funding Progress */}
      <div className="border border-[#d0d7e2] bg-white p-3 space-y-1">
        <div className="flex justify-between text-[9px] text-[#6b7a8d] tracking-wider">
          <span>FUNDING PROGRESS</span>
          <span>{funded.toLocaleString()} / {target.toLocaleString()} kr ({progress.toFixed(1)}%)</span>
        </div>
        <div className="h-3 bg-[#1a2035] overflow-hidden relative">
          <div className="h-full bg-[#0066ff] transition-all" style={{ width: `${progress}%` }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[8px] font-bold text-white mix-blend-difference">{progress.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Product image */}
      {o.product_image_url && (
        <div className="w-full h-40 overflow-hidden border border-[#d0d7e2]">
          <img src={o.product_image_url} alt={offer.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Deal Summary */}
        <Section title="DEAL SUMMARY">
          <InfoRow label="Product" value={offer.title} />
          <InfoRow label="Product-ID" value={o.product_id_display} />
          <InfoRow label="Status" value={offer.status} />
          <InfoRow label="Sector" value={o.sector || "Seafood Trading"} />
          <InfoRow label="Structure" value={o.structure || "Trade Finance"} />
        </Section>

        {/* Investment Terms */}
        <Section title="INVESTMENT TERMS">
          <InfoRow label="Total Investment" value={`${target.toLocaleString()} kr`} />
          <InfoRow label="Minimum Ticket" value={minPledge > 0 ? `${minPledge.toLocaleString()} kr` : "—"} />
          <InfoRow label="Tenor" value={tenorDays ? `${tenorDays} days` : "—"} />
          <InfoRow label="Expected Return" value={`${rate.toFixed(1)}%`} />
          <InfoRow label="Annual Return" value={annualReturn ? `${annualReturn.toFixed(1)}%` : "—"} />
          <InfoRow label="Repayment" value={repaymentLabel} />
        </Section>
      </div>

      {/* Return - Investor View */}
      <div className="border border-[#0066ff]/30 bg-[#0066ff]/5 p-4">
        <h3 className="text-[10px] text-[#0066ff] tracking-wider font-bold mb-3">RETURN — INVESTOR VIEW</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-[#1a2035]">{target.toLocaleString()} kr</div>
            <div className="text-[9px] text-[#6b7a8d]">Investment</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-400">{rate.toFixed(1)}%</div>
            <div className="text-[9px] text-[#6b7a8d]">Return %</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-400">+{profitKr.toLocaleString()} kr</div>
            <div className="text-[9px] text-[#6b7a8d]">Profit</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[#1a2035]">{totalPayout.toLocaleString()} kr</div>
            <div className="text-[9px] text-[#6b7a8d]">Total Payout</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Underlying Transaction */}
        <Section title="UNDERLYING TRANSACTION">
          <InfoRow label="Product" value={offer.title} />
          <InfoRow label="Origin" value={o.origin} />
          <InfoRow label="Volume" value={o.volume} />
          <InfoRow label="Purchase Price" value={o.purchase_price ? `${Number(o.purchase_price).toLocaleString()} kr` : "—"} />
          <InfoRow label="Sales Value" value={o.sales_value ? `${Number(o.sales_value).toLocaleString()} kr` : "—"} />
          <InfoRow label="Gross Margin" value={o.gross_margin ? `${Number(o.gross_margin).toFixed(1)}%` : "—"} />
        </Section>

        {/* Risk & Security */}
        <Section title="RISK & SECURITY">
          <InfoRow label="Collateral" value={o.collateral || "Inventory"} />
          <InfoRow label="LTV" value={o.ltv ? `${Number(o.ltv).toFixed(1)}%` : "—"} />
          <InfoRow label="Primary Exit" value={o.primary_exit} />
          <InfoRow label="Secondary Exit" value={o.secondary_exit} />
          <InfoRow label="Downside" value={o.downside || o.risk_note} />
        </Section>
      </div>

      {/* Risk note warning */}
      {(o.risk_note || o.downside) && (
        <div className="border border-yellow-500/20 bg-yellow-500/5 p-3 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <span className="text-[9px] text-yellow-500 tracking-wider font-bold block mb-0.5">RISKNOTERING</span>
            <span className="text-[10px] text-[#1a2035]">{o.downside || o.risk_note}</span>
          </div>
        </div>
      )}

      {/* Document */}
      {o.document_url && (
        <a href={o.document_url} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 text-[10px] text-[#0066ff] hover:underline tracking-wider">
          <FileText className="h-3 w-3" /> VISA BIFOGAT DOKUMENT (PDF)
        </a>
      )}

      {/* ROI Calculator */}
      <div className="border border-[#d0d7e2] bg-white">
        <div className="h-8 flex items-center px-3 border-b border-[#d0d7e2]">
          <Calculator className="h-3 w-3 text-[#0066ff] mr-1.5" />
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">AVKASTNINGSKALKYLATOR</span>
        </div>
        <div className="p-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[9px] text-[#6b7a8d] tracking-wider">ANGE BELOPP (KR)</label>
              <input
                type="number" value={calcAmount} onChange={e => setCalcAmount(e.target.value)}
                min={1} placeholder="0"
                className="w-full h-9 bg-[#f4f6f9] border border-[#d0d7e2] px-3 text-sm text-[#1a2035] font-bold focus:border-[#0066ff] focus:outline-none font-mono"
              />
            </div>
            <div className="flex-1 border border-[#d0d7e2] p-2 h-9 flex items-center">
              {calcResult > 0 ? (
                <span className="text-sm font-bold text-green-400">
                  Du får tillbaka: {calcResult.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr
                </span>
              ) : (
                <span className="text-[10px] text-[#8a95a5]">Ange belopp för att beräkna</span>
              )}
            </div>
          </div>
          {calcResult > 0 && (
            <div className="mt-2 text-[9px] text-[#6b7a8d]">
              Vinst: <span className="text-green-400 font-bold">{(calcResult - Number(calcAmount)).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr</span> ({rate.toFixed(1)}% ränta)
            </div>
          )}
        </div>
      </div>

      {/* Pledge form */}
      {offer.status === "Open" && (
        <div className="border border-[#d0d7e2] bg-white">
          <div className="h-8 flex items-center px-3 border-b border-[#d0d7e2]">
            <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">SUBMIT PLEDGE</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[9px] text-[#6b7a8d] tracking-wider">AMOUNT (KR)</label>
                <input
                  type="number" value={pledgeAmount} onChange={e => setPledgeAmount(e.target.value)}
                  min={minPledge || 1} max={maxPledge || undefined}
                  placeholder={minPledge > 0 ? `Min ${minPledge.toLocaleString()} kr` : "0"}
                  className="w-full h-9 bg-[#f4f6f9] border border-[#d0d7e2] px-3 text-sm text-[#1a2035] font-bold focus:border-[#0066ff] focus:outline-none font-mono"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    const amt = Number(pledgeAmount);
                    if (minPledge > 0 && amt < minPledge) { toast.error(`Minsta insats är ${minPledge.toLocaleString()} kr`); return; }
                    if (maxPledge && amt > maxPledge) { toast.error(`Högsta insats är ${maxPledge.toLocaleString()} kr`); return; }
                    if (amt > 0) pledgeMutation.mutate(amt);
                  }}
                  disabled={pledgeMutation.isPending || !pledgeAmount || Number(pledgeAmount) <= 0}
                  className="h-9 px-6 bg-[#0066ff] text-white text-[10px] font-bold tracking-wider hover:bg-[#0052cc] disabled:opacity-50 transition-colors"
                >
                  {pledgeMutation.isPending ? "SUBMITTING..." : "COMMIT"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#d0d7e2] bg-white p-3">
      <h3 className="text-[10px] text-[#0066ff] tracking-wider font-bold mb-2">{title}</h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[#d0d7e2] last:border-0">
      <span className="text-[10px] text-[#6b7a8d]">{label}</span>
      <span className="text-[11px] font-medium text-[#1a2035]">{value ?? "—"}</span>
    </div>
  );
}
