import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Search, ArrowRight } from "lucide-react";
import { usePortalTabs } from "./PortalTabsContext";
import CountryFlag from "@/components/CountryFlag";

export default function PortalCompanies() {
  const { switchTab } = usePortalTabs();
  const [search, setSearch] = useState("");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["portal-companies-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("status", "Active").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: offerCounts = {} } = useQuery({
    queryKey: ["portal-company-offer-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trade_offers").select("company_id, status");
      if (error) throw error;
      const counts: Record<string, { active: number; total: number }> = {};
      (data || []).forEach((o: any) => {
        if (!o.company_id) return;
        if (!counts[o.company_id]) counts[o.company_id] = { active: 0, total: 0 };
        counts[o.company_id].total++;
        if (o.status === "Open") counts[o.company_id].active++;
      });
      return counts;
    },
  });

  // Only show companies that have at least one deal
  const companiesWithDeals = companies.filter(c => (offerCounts as any)[c.id]?.total > 0);
  const filtered = companiesWithDeals.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.industry || "").toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading companies...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-sm font-bold text-foreground">Partner Companies</h1>
        <p className="text-[10px] text-muted-foreground">Browse companies with active or past deals on Makrill Trade.</p>
      </div>

      <div className="border border-border bg-white px-3 py-1.5 flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search companies..."
          className="flex-1 h-7 bg-muted/50 border border-border px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(c => {
          const counts = (offerCounts as any)[c.id] || { active: 0, total: 0 };
          return (
            <div
              key={c.id}
              className="border border-border bg-white hover:border-primary cursor-pointer transition-all p-4 flex flex-col"
              onClick={() => switchTab(`/portal/company/${c.id}`)}
            >
              <div className="flex items-center gap-3 mb-3">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="h-10 w-10 object-contain border border-border shrink-0" />
                ) : (
                  <div className="h-10 w-10 bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                    {c.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate">{c.name}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <CountryFlag country={c.country} size={12} /> {c.country}
                    {c.industry && <span>· {c.industry}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-auto pt-2 border-t border-border">
                <span>{counts.active > 0 ? `${counts.active} active deal${counts.active > 1 ? "s" : ""}` : `${counts.total} past deal${counts.total > 1 ? "s" : ""}`}</span>
                <span className="text-primary font-semibold flex items-center gap-0.5">View Profile <ArrowRight className="h-3 w-3" /></span>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="border border-border bg-white p-10 text-center text-muted-foreground text-sm">
          No companies found.
        </div>
      )}
    </div>
  );
}
