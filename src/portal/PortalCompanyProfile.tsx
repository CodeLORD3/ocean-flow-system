import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Globe, Calendar, Users, TrendingUp, FileText, Mail, User, ArrowRight, Award, Clock, ExternalLink, Briefcase } from "lucide-react";
import { usePortalTabs } from "./PortalTabsContext";
import CountryFlag from "@/components/CountryFlag";
import { getCurrency } from "@/lib/currency";
import { differenceInDays, parseISO, format } from "date-fns";

export default function PortalCompanyProfile({ companyId }: { companyId: string }) {
  const { openOfferTab } = usePortalTabs();

  const { data: company, isLoading } = useQuery({
    queryKey: ["portal-company-profile", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: offers = [] } = useQuery({
    queryKey: ["portal-company-offers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["portal-company-documents", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_documents")
        .select("*")
        .eq("company_id", companyId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: pledges = [] } = useQuery({
    queryKey: ["portal-company-pledges", companyId],
    queryFn: async () => {
      const offerIds = offers.map(o => o.id);
      if (offerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("pledges")
        .select("amount, status, offer_id")
        .in("offer_id", offerIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: offers.length > 0,
  });

  if (isLoading || !company) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading company profile...</div>;
  }

  const cur = getCurrency(company.country);
  const activeOffers = offers.filter(o => o.status === "Open");
  const completedOffers = offers.filter(o => o.status === "Paid Out" || o.status === "Matured");
  const totalDeals = offers.length;
  const totalCapitalRaised = offers.reduce((sum: number, o: any) => sum + Number(o.funded_amount || 0), 0);
  const paidOutPledges = pledges.filter(p => p.status === "Paid Out");
  const activePledges = pledges.filter(p => p.status === "Active" || p.status === "Paid Out");
  const repaymentRate = activePledges.length > 0 ? Math.round((paidOutPledges.length / activePledges.length) * 100) : null;
  const avgReturn = offers.length > 0 ? (offers.reduce((s: number, o: any) => s + Number(o.interest_rate || 0), 0) / offers.length) : null;
  const yearsActive = company.founded_year ? new Date().getFullYear() - company.founded_year : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border border-border bg-white p-5">
        <div className="flex items-start gap-4">
          {company.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-16 w-16 object-contain border border-border shrink-0" />
          ) : (
            <div className="h-16 w-16 bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground shrink-0">
              {company.name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-foreground">{company.name}</h1>
              {company.ticker && (
                <span className="px-1.5 py-0.5 bg-muted text-[10px] font-mono font-semibold text-muted-foreground border border-border">{company.ticker}</span>
              )}
              <CountryFlag country={company.country} size={18} />
              {company.industry && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-semibold border border-primary/20">{company.industry}</span>
              )}
            </div>
            {company.description && (
              <p className="text-xs text-muted-foreground mt-1">{company.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground flex-wrap">
              {company.founded_year && (
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Founded {company.founded_year}</span>
              )}
              {company.city && company.country && (
                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {company.city}, {company.country}</span>
              )}
              {company.website_url && (
                <a href={company.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                  <Globe className="h-3 w-3" /> Website <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      {company.description_long && (
        <div className="border border-border bg-white p-4">
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-primary" /> About {company.name}
          </h2>
          <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{company.description_long}</div>
        </div>
      )}

      {/* Key Figures */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {company.revenue_range && (
          <div className="border border-border bg-white p-3">
            <div className="text-[10px] text-muted-foreground">Annual Revenue</div>
            <div className="text-sm font-bold text-foreground font-mono mt-0.5">{company.revenue_range}</div>
          </div>
        )}
        {company.employee_count && (
          <div className="border border-border bg-white p-3">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Employees</div>
            <div className="text-sm font-bold text-foreground font-mono mt-0.5">{company.employee_count}</div>
          </div>
        )}
        {yearsActive !== null && (
          <div className="border border-border bg-white p-3">
            <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Years Active</div>
            <div className="text-sm font-bold text-foreground font-mono mt-0.5">{yearsActive}</div>
          </div>
        )}
        <div className="border border-border bg-white p-3">
          <div className="text-[10px] text-muted-foreground">HQ Location</div>
          <div className="text-sm font-bold text-foreground mt-0.5 flex items-center gap-1">
            <CountryFlag country={company.country} size={14} />
            {company.city || company.country}
          </div>
        </div>
      </div>

      {/* Platform Track Record */}
      <div className="border border-border bg-white p-4">
        <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" /> Platform Track Record
        </h2>
        {totalDeals === 0 ? (
          <div className="flex items-center gap-2 text-xs">
            <Award className="h-4 w-4 text-mackerel-gold" />
            <span className="px-2 py-1 bg-mackerel-gold/10 text-mackerel-gold font-semibold border border-mackerel-gold/20 text-[11px]">First deal on platform</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] text-muted-foreground">Total Deals</div>
              <div className="text-lg font-bold text-foreground font-mono">{totalDeals}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Capital Raised</div>
              <div className="text-lg font-bold text-foreground font-mono">{totalCapitalRaised.toLocaleString()} {cur}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Repayment Rate</div>
              <div className="text-lg font-bold text-mackerel font-mono">{repaymentRate !== null ? `${repaymentRate}%` : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Avg. Return</div>
              <div className="text-lg font-bold text-mackerel font-mono">{avgReturn !== null ? `${avgReturn.toFixed(1)}%` : "—"}</div>
            </div>
          </div>
        )}
      </div>

      {/* Active Offers */}
      {activeOffers.length > 0 && (
        <div className="border border-border bg-white p-4">
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-primary" /> Active Offers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeOffers.map((offer) => {
              const target = Number(offer.target_amount) || 0;
              const funded = Number(offer.funded_amount) || 0;
              const rate = Number(offer.interest_rate) || 0;
              const confirmedPct = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
              const maturity = offer.maturity_date ? parseISO(offer.maturity_date) : null;
              const daysToMaturity = maturity ? differenceInDays(maturity, new Date()) : null;
              return (
                <div
                  key={offer.id}
                  className="border border-border bg-white hover:border-primary cursor-pointer transition-all p-3 space-y-2"
                  onClick={() => openOfferTab(offer.id, offer.title)}
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-xs font-semibold text-foreground leading-snug flex-1 pr-2">{offer.title}</h3>
                    <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold border text-mackerel bg-mackerel-light border-mackerel/30">OPEN</span>
                  </div>
                  <div className="h-1.5 bg-muted overflow-hidden">
                    <div className="h-full bg-mackerel" style={{ width: `${confirmedPct}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div><span className="text-muted-foreground">Return</span><div className="font-bold text-mackerel">{rate.toFixed(1)}%</div></div>
                    <div><span className="text-muted-foreground">Target</span><div className="font-mono font-medium">{target.toLocaleString()} {cur}</div></div>
                    <div><span className="text-muted-foreground">Maturity</span><div className="font-medium">{daysToMaturity !== null ? `${daysToMaturity}d` : "—"}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <div className="border border-border bg-white p-4">
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" /> Company Documents
          </h2>
          <div className="divide-y divide-border">
            {documents.map((doc: any) => (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 py-2 hover:bg-muted/20 px-2 transition-colors"
              >
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{doc.file_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {doc.document_type !== "general" && <span className="capitalize">{doc.document_type} · </span>}
                    {doc.file_size_bytes ? `${(doc.file_size_bytes / 1024).toFixed(0)} KB` : ""}
                  </div>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Contact */}
      {(company.contact_person || company.contact_email) && (
        <div className="border border-border bg-white p-4">
          <h2 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5 text-primary" /> Investor Enquiries
          </h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {company.contact_person && (
              <span className="flex items-center gap-1"><User className="h-3 w-3" /> {company.contact_person}</span>
            )}
            {company.contact_email && (
              <a href={`mailto:${company.contact_email}`} className="flex items-center gap-1 text-primary hover:underline">
                <Mail className="h-3 w-3" /> {company.contact_email}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
