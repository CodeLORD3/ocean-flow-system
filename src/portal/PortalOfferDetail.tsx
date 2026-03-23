import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, TrendingUp, Calendar, Target, DollarSign } from "lucide-react";
import { toast } from "sonner";

export default function PortalOfferDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pledgeAmount, setPledgeAmount] = useState("");

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

  if (isLoading || !offer) {
    return <div className="text-[#0066ff] text-xs animate-pulse">LOADING...</div>;
  }

  const progress = Number(offer.target_amount) > 0
    ? Math.min(100, (Number(offer.funded_amount) / Number(offer.target_amount)) * 100)
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <button
        onClick={() => navigate("/portal")}
        className="flex items-center gap-1 text-[10px] text-[#5a6a7a] hover:text-[#0066ff] tracking-wider transition-colors"
      >
        <ArrowLeft className="h-3 w-3" /> BACK TO OFFERS
      </button>

      {/* Header */}
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
          <h2 className="text-base font-bold text-[#c8d6e5]">{offer.title}</h2>
          {offer.description && (
            <p className="text-[11px] text-[#5a6a7a] leading-relaxed">{offer.description}</p>
          )}

          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: Target, label: "TARGET", value: `${Number(offer.target_amount).toLocaleString()} kr` },
              { icon: TrendingUp, label: "RATE", value: `${Number(offer.interest_rate).toFixed(1)}%` },
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

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] text-[#5a6a7a] tracking-wider">
              <span>FUNDING PROGRESS</span>
              <span>{progress.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-[#1a2035] overflow-hidden">
              <div className="h-full bg-[#0066ff] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Pledge form */}
      {offer.status === "Open" && (
        <div className="border border-[#1a2035] bg-[#0d1220]">
          <div className="h-8 flex items-center px-3 border-b border-[#1a2035]">
            <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">SUBMIT PLEDGE</span>
          </div>
          <div className="p-4 flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[9px] text-[#5a6a7a] tracking-wider">AMOUNT (KR)</label>
              <input
                type="number"
                value={pledgeAmount}
                onChange={(e) => setPledgeAmount(e.target.value)}
                min={1}
                placeholder="0"
                className="w-full h-9 bg-[#0a0e1a] border border-[#1a2035] px-3 text-sm text-[#c8d6e5] font-bold focus:border-[#0066ff] focus:outline-none font-mono"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  const amt = Number(pledgeAmount);
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
      )}
    </div>
  );
}
