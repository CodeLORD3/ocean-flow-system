import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, Shield, File } from "lucide-react";

export default function PortalDocuments() {
  // Fetch offers with documents
  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["portal-documents-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("id, title, document_url, status")
        .not("document_url", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.filter(o => o.document_url);
    },
  });

  // Fetch user's pledges for investment confirmations
  const { data: pledges = [] } = useQuery({
    queryKey: ["portal-documents-pledges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("*, trade_offers(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return <div className="text-[#0066ff] text-xs animate-pulse p-8 text-center">LOADING DOCUMENTS...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Platform documents */}
      <div className="border border-[#d0d7e2] bg-white">
        <div className="h-8 flex items-center px-3 border-b border-[#d0d7e2]">
          <Shield className="h-3 w-3 text-[#0066ff] mr-1.5" />
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">PLATFORM DOCUMENTS</span>
        </div>
        <div className="divide-y divide-[#d0d7e2]">
          <div className="flex items-center justify-between p-3 hover:bg-[#f4f6f9] transition-colors">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#6b7a8d]" />
              <div>
                <div className="text-[11px] text-[#1a2035] font-medium">Terms of Use</div>
                <div className="text-[9px] text-[#6b7a8d]">Platform terms and conditions</div>
              </div>
            </div>
            <span className="text-[9px] text-[#6b7a8d]">Coming soon</span>
          </div>
          <div className="flex items-center justify-between p-3 hover:bg-[#f4f6f9] transition-colors">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#6b7a8d]" />
              <div>
                <div className="text-[11px] text-[#1a2035] font-medium">Privacy Policy</div>
                <div className="text-[9px] text-[#6b7a8d]">Data handling and privacy</div>
              </div>
            </div>
            <span className="text-[9px] text-[#6b7a8d]">Coming soon</span>
          </div>
          <div className="flex items-center justify-between p-3 hover:bg-[#f4f6f9] transition-colors">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#6b7a8d]" />
              <div>
                <div className="text-[11px] text-[#1a2035] font-medium">Investment Guidelines</div>
                <div className="text-[9px] text-[#6b7a8d]">How the platform works</div>
              </div>
            </div>
            <span className="text-[9px] text-[#6b7a8d]">Coming soon</span>
          </div>
        </div>
      </div>

      {/* Investment confirmations */}
      <div className="border border-[#d0d7e2] bg-white">
        <div className="h-8 flex items-center px-3 border-b border-[#d0d7e2]">
          <File className="h-3 w-3 text-[#0066ff] mr-1.5" />
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">INVESTMENT CONFIRMATIONS</span>
        </div>
        {pledges.length > 0 ? (
          <div className="divide-y divide-[#d0d7e2]">
            {pledges.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-3 hover:bg-[#f4f6f9] transition-colors">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <div>
                    <div className="text-[11px] text-[#1a2035] font-medium">
                      Investment — {p.trade_offers?.title || "Offer"}
                    </div>
                    <div className="text-[9px] text-[#6b7a8d]">
                      {Number(p.amount).toLocaleString()} kr · {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <span className={`inline-block px-2 py-0.5 text-[8px] tracking-wider border ${
                  p.status === "Active" ? "text-green-600 border-green-200 bg-green-50" : "text-[#6b7a8d] border-gray-200 bg-gray-50"
                }`}>
                  {p.status?.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-[#8a95a5] text-xs">No investment confirmations yet.</div>
        )}
      </div>

      {/* Offer documents */}
      <div className="border border-[#d0d7e2] bg-white">
        <div className="h-8 flex items-center px-3 border-b border-[#d0d7e2]">
          <Download className="h-3 w-3 text-[#0066ff] mr-1.5" />
          <span className="text-[10px] text-[#0066ff] tracking-wider font-bold">OFFER DOCUMENTS</span>
        </div>
        {offers.length > 0 ? (
          <div className="divide-y divide-[#d0d7e2]">
            {offers.map((offer: any) => (
              <a
                key={offer.id}
                href={offer.document_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3 hover:bg-[#f4f6f9] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-red-500" />
                  <div>
                    <div className="text-[11px] text-[#1a2035] font-medium">{offer.title}</div>
                    <div className="text-[9px] text-[#6b7a8d]">PDF Document</div>
                  </div>
                </div>
                <Download className="h-3.5 w-3.5 text-[#0066ff]" />
              </a>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-[#8a95a5] text-xs">No offer documents available.</div>
        )}
      </div>
    </div>
  );
}
