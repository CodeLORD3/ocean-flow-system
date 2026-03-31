import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, ShieldCheck, Receipt, FolderOpen, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export default function PortalDocuments() {
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
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading documents...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">Access platform documents, investment confirmations, and offer attachments.</p>
      </div>

      {/* Platform documents */}
      <div className="border border-border bg-white">
        <div className="h-11 flex items-center gap-2 px-4 border-b border-border">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Platform Documents</h2>
        </div>
        <div className="divide-y divide-border">
          {[
            { title: "Terms of Use", desc: "Platform terms and conditions", to: "/portal/terms" },
            { title: "Privacy Policy", desc: "How we handle your data", to: "/portal/privacy" },
            { title: "Investment Guidelines", desc: "How the platform works and what to expect", to: "/portal/guidelines" },
          ].map((doc) => (
            <Link key={doc.title} to={doc.to} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm text-foreground font-medium">{doc.title}</div>
                  <div className="text-xs text-muted-foreground">{doc.desc}</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-primary" />
            </Link>
          ))}
        </div>
      </div>

      {/* Investment confirmations */}
      <div className="border border-border bg-white">
        <div className="h-11 flex items-center gap-2 px-4 border-b border-border">
          <Receipt className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Investment Confirmations</h2>
        </div>
        {pledges.length > 0 ? (
          <div className="divide-y divide-border">
            {pledges.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-mackerel" />
                  <div>
                    <div className="text-sm text-foreground font-medium">
                      {p.trade_offers?.title || "Investment"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {Number(p.amount).toLocaleString()} kr · {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 text-[10px] font-semibold border ${
                    p.status === "Active" ? "text-mackerel border-mackerel/30 bg-mackerel-light" : "text-muted-foreground border-border bg-muted/50"
                  }`}>
                    {p.status?.toUpperCase()}
                  </span>
                  <button
                    onClick={() => {
                      const refCode = `OT-${new Date(p.created_at).getFullYear()}-${p.id.slice(0, 4).toUpperCase()}`;
                      const content = [
                        "INVESTMENT CONFIRMATION",
                        "═══════════════════════════════════",
                        "",
                        `Date: ${new Date(p.created_at).toLocaleDateString("en-GB")}`,
                        `Reference: ${refCode}`,
                        "",
                        `Offer: ${p.trade_offers?.title || "—"}`,
                        `Amount: ${Number(p.amount).toLocaleString()} kr`,
                        `Status: ${p.status}`,
                        "",
                        `© ${new Date().getFullYear()} Makrill Trade.`,
                      ].join("\n");
                      const blob = new Blob([content], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `Confirmation-${refCode}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="text-primary hover:text-primary/80 transition-colors"
                    title="Download confirmation"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">No investment confirmations yet.</div>
        )}
      </div>

      {/* Offer documents */}
      <div className="border border-border bg-white">
        <div className="h-11 flex items-center gap-2 px-4 border-b border-border">
          <FolderOpen className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Offer Documents</h2>
        </div>
        {offers.length > 0 ? (
          <div className="divide-y divide-border">
            {offers.map((offer: any) => (
              <a
                key={offer.id}
                href={offer.document_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-destructive/70" />
                  <div>
                    <div className="text-sm text-foreground font-medium">{offer.title}</div>
                    <div className="text-xs text-muted-foreground">PDF Document</div>
                  </div>
                </div>
                <Download className="h-4 w-4 text-primary" />
              </a>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">No offer documents available.</div>
        )}
      </div>
    </div>
  );
}
