import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, TrendingUp, Calendar, Target, DollarSign, Clock, Calculator, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function PortalOfferDetail() {
  const { id } = useParams<{ id: string }>();
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

  // Countdown
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!offer) return;
    const calc = () => {
      const now = new Date();
      const maturity = new Date(offer.maturity_date);
      const diff = Math.ceil((maturity.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      setDaysLeft(diff);
    };
    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, [offer]);

  if (isLoading || !offer) {
    return <div className="text-[#0066ff] text-xs animate-pulse">LOADING...</div>;
  }

  const progress = Number(offer.target_amount) > 0
    ? Math.min(100, (Number(offer.funded_amount) / Number(offer.target_amount)) * 100)
    : 0;

  const interestRate = Number(offer.interest_rate);
  const calcResult = calcAmount ? Number(calcAmount) * (1 + interestRate / 100) : 0;

  const offerAny = offer as any;
  const minPledge = Number(offerAny.min_pledge) || 0;
  const maxPledge = offerAny.max_pledge ? Number(offerAny.max_pledge) : null;
  const repaymentLabel = offerAny.repayment_type === "rolling" ? "Löpande när produkter säljs" : "Klumpsumma vid förfall";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button
        onClick={() => navigate("/portal")}
        className="flex items-center gap-1 text-[10px] text-[#5a6a7a] hover:text-[#0066ff] tracking-wider transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> BACK TO OFFERS
      </button>

      {/* Countdown banner */}
      {offer.status === "Open" && daysLeft !== null && (
        <div className={`border p-3 flex items-center justify-between ${daysLeft > 0 ? "border-[#0066ff]/30 bg-[#0066ff]/5" : "border-red-400/30 bg-red-400/5"}`}>
          <div className="flex items-center gap-2">
            <Clock className={`h-4 w-4 ${daysLeft > 0 ? "text-[#0066ff]" : "text-red-400"}`} />
            <span className="text-[11px] text-[#c8d6e5] font-bold tracking-wider">
              {daysLeft > 0 ? `${daysLeft} DAGAR KVAR` : "ERBJUDANDET HAR LÖPT UT"}
            </span>
          </div>
          <span className="text-[9px] text-[#5a6a7a]">{offer.maturity_date}</span>
        </div>
      )}

      {/* Header with image */}
      <div className="border border-[#1a2035] bg-[#0d1220]">
        <div className="h-8 flex items-center justify-between px-3 border-b border-[#1a2035]">
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">OFFER DETAIL</span>
          <span className={`px-2 py-0.5 text-[9px] tracking-wider border ${
            offer.status === "Open" ? "text-green-400 border-green-400/30 bg-green-400/10" :
            offer.status === "Funded" ? "text-[#0066ff] border-[#0066ff]/30 bg-[#0066ff]/10" :
            "text-red-400 border-red-400/30 bg-red-400/10"
          }`}>
            {offer.status.toUpperCase()}
          </span>
        </div>

        <div className="p-4 space-y-4">
          {offerAny.product_image_url && (
            <div className="w-full h-40 overflow-hidden border border-[#1a2035]">
              <img src={offerAny.product_image_url} alt={offer.title} className="w-full h-full object-cover" />
            </div>
          )}

          <h2 className="text-base font-bold text-[#c8d6e5]">{offer.title}</h2>
          {offer.description && (
            <p className="text-[11px] text-[#5a6a7a] leading-relaxed">{offer.description}</p>
          )}

          {offerAny.supplier_name && (
            <div className="text-[10px] text-[#5a6a7a]">
              <span className="tracking-wider">LEVERANTÖR: </span>
              <span className="text-[#c8d6e5] font-medium">{offerAny.supplier_name}</span>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: Target, label: "TARGET", value: `${Number(offer.target_amount).toLocaleString()} kr` },
              { icon: TrendingUp, label: "RATE", value: `${interestRate.toFixed(1)}%` },
              { icon: Calendar, label: "MATURITY", value: offer.maturity_date },
              { icon: DollarSign, label: "FUNDED", value: `${Number(offer.funded_amount).toLocaleString()} kr` },
            ].map((s) => (
              <div key={s.label} className="border border-[#1a2035] p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <s.icon className="h-3 w-3 text-[#0066ff]" />
                  <span className="text-[9px] text-[#5a6a7a] tracking-wider">{s.label}</span>
                </div>
                <span className="text-sm font-bold text-[#c8d6e5]">{s.value}</span>
              </div>
            ))}
          </div>

          {/* Extra info row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="border border-[#1a2035] p-2">
              <span className="text-[9px] text-[#5a6a7a] tracking-wider block mb-0.5">ÅTERBETALNING</span>
              <span className="text-[10px] text-[#c8d6e5]">{repaymentLabel}</span>
            </div>
            <div className="border border-[#1a2035] p-2">
              <span className="text-[9px] text-[#5a6a7a] tracking-wider block mb-0.5">MIN INSATS</span>
              <span className="text-[10px] text-[#c8d6e5] font-bold">{minPledge > 0 ? `${minPledge.toLocaleString()} kr` : "—"}</span>
            </div>
            <div className="border border-[#1a2035] p-2">
              <span className="text-[9px] text-[#5a6a7a] tracking-wider block mb-0.5">MAX INSATS</span>
              <span className="text-[10px] text-[#c8d6e5] font-bold">{maxPledge ? `${maxPledge.toLocaleString()} kr` : "Ingen gräns"}</span>
            </div>
          </div>

          {/* Risk note */}
          {offerAny.risk_note && (
            <div className="border border-yellow-500/20 bg-yellow-500/5 p-3 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-[9px] text-yellow-500 tracking-wider font-bold block mb-0.5">RISKNOTERING</span>
                <span className="text-[10px] text-[#c8d6e5]">{offerAny.risk_note}</span>
              </div>
            </div>
          )}

          {/* Document link */}
          {offerAny.document_url && (
            <a href={offerAny.document_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-[10px] text-[#0066ff] hover:underline tracking-wider">
              <FileText className="h-3 w-3" /> VISA BIFOGAT DOKUMENT (PDF)
            </a>
          )}

          {/* Funding Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] text-[#5a6a7a] tracking-wider">
              <span>FUNDING PROGRESS</span>
              <span>{Number(offer.funded_amount).toLocaleString()} / {Number(offer.target_amount).toLocaleString()} kr ({progress.toFixed(1)}%)</span>
            </div>
            <div className="h-3 bg-[#1a2035] overflow-hidden relative">
              <div className="h-full bg-[#0066ff] transition-all" style={{ width: `${progress}%` }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[8px] font-bold text-white mix-blend-difference">{progress.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ROI Calculator */}
      <div className="border border-[#1a2035] bg-[#0d1220]">
        <div className="h-8 flex items-center px-3 border-b border-[#1a2035]">
          <Calculator className="h-3 w-3 text-[#0066ff] mr-1.5" />
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">AVKASTNINGSKALKYLATOR</span>
        </div>
        <div className="p-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[9px] text-[#5a6a7a] tracking-wider">ANGE BELOPP (KR)</label>
              <input
                type="number"
                value={calcAmount}
                onChange={(e) => setCalcAmount(e.target.value)}
                min={1}
                placeholder="0"
                className="w-full h-9 bg-[#0a0e1a] border border-[#1a2035] px-3 text-sm text-[#c8d6e5] font-bold focus:border-[#0066ff] focus:outline-none font-mono"
              />
            </div>
            <div className="flex-1 border border-[#1a2035] p-2 h-9 flex items-center">
              {calcResult > 0 ? (
                <span className="text-sm font-bold text-green-400">
                  Du får tillbaka: {calcResult.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr
                  <span className="text-[9px] text-[#5a6a7a] ml-1">på {offer.maturity_date}</span>
                </span>
              ) : (
                <span className="text-[10px] text-[#3a4a5a]">Ange belopp för att beräkna</span>
              )}
            </div>
          </div>
          {calcResult > 0 && (
            <div className="mt-2 text-[9px] text-[#5a6a7a]">
              Vinst: <span className="text-green-400 font-bold">{(calcResult - Number(calcAmount)).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr</span> ({interestRate.toFixed(1)}% ränta)
            </div>
          )}
        </div>
      </div>

      {/* Pledge form */}
      {offer.status === "Open" && (
        <div className="border border-[#1a2035] bg-[#0d1220]">
          <div className="h-8 flex items-center px-3 border-b border-[#1a2035]">
            <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">SUBMIT PLEDGE</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-[9px] text-[#5a6a7a] tracking-wider">AMOUNT (KR)</label>
                <input
                  type="number"
                  value={pledgeAmount}
                  onChange={(e) => setPledgeAmount(e.target.value)}
                  min={minPledge || 1}
                  max={maxPledge || undefined}
                  placeholder={minPledge > 0 ? `Min ${minPledge.toLocaleString()} kr` : "0"}
                  className="w-full h-9 bg-[#0a0e1a] border border-[#1a2035] px-3 text-sm text-[#c8d6e5] font-bold focus:border-[#0066ff] focus:outline-none font-mono"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    const amt = Number(pledgeAmount);
                    if (minPledge > 0 && amt < minPledge) {
                      toast.error(`Minsta insats är ${minPledge.toLocaleString()} kr`);
                      return;
                    }
                    if (maxPledge && amt > maxPledge) {
                      toast.error(`Högsta insats är ${maxPledge.toLocaleString()} kr`);
                      return;
                    }
                    if (amt > 0) pledgeMutation.mutate(amt);
                  }}
                  disabled={pledgeMutation.isPending || !pledgeAmount || Number(pledgeAmount) <= 0}
                  className="h-9 px-6 bg-[#0066ff] text-white text-[10px] font-bold tracking-wider hover:bg-[#0052cc] disabled:opacity-50 transition-colors"
                >
                  {pledgeMutation.isPending ? "SUBMITTING..." : "COMMIT"}
                </button>
              </div>
            </div>
            {(minPledge > 0 || maxPledge) && (
              <div className="text-[9px] text-[#5a6a7a]">
                {minPledge > 0 && <span>Min: {minPledge.toLocaleString()} kr</span>}
                {minPledge > 0 && maxPledge && <span> · </span>}
                {maxPledge && <span>Max: {maxPledge.toLocaleString()} kr</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
