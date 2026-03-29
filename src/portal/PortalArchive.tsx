import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function PortalArchive() {
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["portal-archive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*")
        .in("status", ["Closed", "Repaid"])
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
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">OFFER ARCHIVE</span>
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#d0d7e2] text-[9px] text-[#6b7a8d] tracking-wider">
              <th className="text-left p-2 pl-3">PRODUCT</th>
              <th className="text-right p-2">TARGET</th>
              <th className="text-right p-2">FUNDED</th>
              <th className="text-right p-2">RATE</th>
              <th className="text-left p-2">MATURITY</th>
              <th className="text-center p-2 pr-3">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.id} className="border-b border-[#d0d7e2]/50 hover:bg-[#0066ff]/5 transition-colors">
                <td className="p-2 pl-3 text-[#1a2035]">{offer.title}</td>
                <td className="p-2 text-right text-[#1a2035]">{Number(offer.target_amount).toLocaleString()} kr</td>
                <td className="p-2 text-right text-[#1a2035]">{Number(offer.funded_amount).toLocaleString()} kr</td>
                <td className="p-2 text-right text-green-400">{Number(offer.interest_rate).toFixed(1)}%</td>
                <td className="p-2 text-[#6b7a8d]">{offer.maturity_date}</td>
                <td className="p-2 pr-3 text-center">
                  <span className={`inline-block px-2 py-0.5 text-[9px] tracking-wider border ${
                    offer.status === "Repaid" ? "text-green-400 border-green-400/30 bg-green-400/10" :
                    "text-red-400 border-red-400/30 bg-red-400/10"
                  }`}>
                    {offer.status.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
            {offers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[#8a95a5] text-xs">
                  NO ARCHIVED OFFERS
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
