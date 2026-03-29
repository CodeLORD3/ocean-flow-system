import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function PortalCommitments() {
  const { data: pledges = [], isLoading } = useQuery({
    queryKey: ["portal-commitments"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("pledges")
        .select("*, trade_offers(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-[#0066ff] text-xs animate-pulse">LOADING...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="border border-[#d0d7e2] bg-white">
        <div className="h-8 flex items-center px-3 border-b border-[#d0d7e2]">
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">MY COMMITMENTS</span>
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#d0d7e2] text-[9px] text-[#6b7a8d] tracking-wider">
              <th className="text-left p-2 pl-3">OFFER</th>
              <th className="text-right p-2">AMOUNT</th>
              <th className="text-right p-2">RATE</th>
              <th className="text-right p-2">EXPECTED RETURN</th>
              <th className="text-left p-2">MATURITY</th>
              <th className="text-center p-2 pr-3">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {pledges.map((p: any) => {
              const offer = p.trade_offers;
              const rate = offer ? Number(offer.interest_rate) : 0;
              const expectedReturn = Number(p.amount) * (1 + rate / 100);
              return (
                <tr key={p.id} className="border-b border-[#d0d7e2]/50 hover:bg-[#0066ff]/5 transition-colors">
                  <td className="p-2 pl-3 text-[#1a2035] font-medium">{offer?.title || "—"}</td>
                  <td className="p-2 text-right text-[#1a2035]">{Number(p.amount).toLocaleString()} kr</td>
                  <td className="p-2 text-right text-green-400 font-bold">{rate.toFixed(1)}%</td>
                  <td className="p-2 text-right text-[#1a2035] font-bold">{expectedReturn.toLocaleString(undefined, { maximumFractionDigits: 0 })} kr</td>
                  <td className="p-2 text-[#6b7a8d]">{offer?.maturity_date || "—"}</td>
                  <td className="p-2 pr-3 text-center">
                    <span className={`inline-block px-2 py-0.5 text-[9px] tracking-wider border ${
                      p.status === "Active" ? "text-green-400 border-green-400/30 bg-green-400/10" :
                      "text-[#6b7a8d] border-[#d0d7e2] bg-[#1a2035]"
                    }`}>
                      {p.status?.toUpperCase() || "ACTIVE"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {pledges.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[#8a95a5] text-xs">
                  NO COMMITMENTS YET
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
