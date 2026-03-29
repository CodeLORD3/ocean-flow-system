import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Shield, Globe, Target, Heart, Award } from "lucide-react";

const ICON_MAP: Record<string, any> = { Shield, Globe, Target, Heart };

const DEFAULT_VALUES = [
  { title: "Transparency", desc: "Every trade is documented with full visibility into pricing, margins, and risk factors." },
  { title: "Sustainability", desc: "We prioritise responsibly sourced products and traceable supply chains." },
  { title: "Performance", desc: "Our deals are structured for attractive, risk-adjusted returns backed by physical assets." },
  { title: "Trust", desc: "Built on long-standing supplier relationships and rigorous due diligence." },
];

const DEFAULT_TEAM = [
  { name: "Erik Lindgren", role: "Founder & CEO", desc: "15+ years in commodity trading and structured finance across Nordic and European markets." },
  { name: "Sofia Andersson", role: "Head of Operations", desc: "Former supply-chain director with deep expertise in seafood logistics and quality assurance." },
  { name: "Marcus Johansson", role: "Chief Risk Officer", desc: "Background in institutional risk management and credit analysis for trade finance portfolios." },
];

const VALUE_ICONS = [Shield, Globe, Target, Heart, Shield, Globe, Target, Heart];

export default function PortalAbout() {
  const { data: settings } = useQuery({
    queryKey: ["about-us-settings-portal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("about_us_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const heroTitle = settings?.hero_title || "About Ocean Trade";
  const heroSubtitle = settings?.hero_subtitle || "Who we are and what drives us";
  const heroDesc = settings?.hero_description || "Ocean Trade is a specialised trade-finance platform connecting qualified investors with short-term commodity transactions in the Nordic seafood and food-distribution sector. We bridge the gap between real-economy supply chains and investors seeking transparent, asset-backed opportunities with attractive returns.";
  const missionText = settings?.mission_text || "To democratise access to trade-finance investments that were traditionally reserved for institutions. We make it simple for individual investors to participate in real, tangible trades — from fresh Atlantic salmon to premium shellfish — while providing the supply chain with much-needed working capital.";
  const values = (Array.isArray(settings?.values_json) && (settings.values_json as any[]).length > 0)
    ? (settings.values_json as unknown as { title: string; desc: string }[])
    : DEFAULT_VALUES;
  const team = (Array.isArray(settings?.team_json) && (settings.team_json as any[]).length > 0)
    ? (settings.team_json as unknown as { name: string; role: string; desc: string }[])
    : DEFAULT_TEAM;

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Hero */}
      <div className="border border-border bg-white p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">OT</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{heroTitle}</h1>
            <p className="text-xs text-muted-foreground">{heroSubtitle}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{heroDesc}</p>
      </div>

      {/* Mission */}
      <div className="border border-border bg-white p-8 space-y-3">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" /> Our Mission
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{missionText}</p>
      </div>

      {/* Leadership Team */}
      <div className="border border-border bg-white p-8 space-y-5">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Leadership Team
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {team.map((person: any, i: number) => (
            <div key={i} className="border border-border p-4 text-center space-y-2">
              {person.image_url ? (
                <img
                  src={person.image_url}
                  alt={person.name}
                  className="h-14 w-14 rounded-full object-cover mx-auto border border-border"
                  style={{ objectPosition: person.image_position || "center" }}
                />
              ) : (
                <div className="h-14 w-14 bg-muted mx-auto flex items-center justify-center rounded-full">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <h3 className="text-sm font-semibold text-foreground">{person.name}</h3>
              <p className="text-[11px] text-primary font-medium">{person.role}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{person.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Values */}
      <div className="border border-border bg-white p-8 space-y-5">
        <h2 className="text-base font-bold text-foreground">Our Values</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {values.map((v, i) => {
            const Icon = VALUE_ICONS[i % VALUE_ICONS.length];
            return (
              <div key={i} className="flex gap-3 p-4 bg-muted/30 border border-border">
                <div className="h-9 w-9 bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{v.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{v.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
