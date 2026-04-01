import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Award, Linkedin, Mail } from "lucide-react";

const DEFAULT_TEAM = [
  { name: "Erik Lindgren", role: "Founder & CEO", desc: "15+ years in commodity trading and structured finance across Nordic and European markets.", bio: "Erik founded Makrill Trade to bridge the gap between institutional trade finance and everyday investors. He previously led commodity desks at two major Nordic banks.", experience: "15 years in commodity trading", linkedin: "#" },
  { name: "Sofia Andersson", role: "Head of Operations", desc: "Former supply-chain director with deep expertise in seafood logistics and quality assurance.", bio: "Sofia oversees all deal operations from sourcing to settlement. Before joining, she managed logistics for one of Scandinavia's largest seafood exporters.", experience: "12 years in seafood logistics", linkedin: "#" },
  { name: "Marcus Johansson", role: "Chief Risk Officer", desc: "Background in institutional risk management and credit analysis for trade finance portfolios.", bio: "Marcus leads credit assessment and portfolio risk monitoring. He brings experience from structured finance teams at SEB and Handelsbanken.", experience: "10 years in risk & credit analysis", linkedin: "#" },
];

const DEFAULT_MISSION = "To democratise access to trade-finance investments that were traditionally reserved for institutions. We make it simple for individual investors to participate in real, tangible trades — from fresh Atlantic salmon to premium shellfish — while providing the supply chain with much-needed working capital.";

export default function PortalTeam() {
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

  const missionText = settings?.mission_text || DEFAULT_MISSION;
  const team = (Array.isArray(settings?.team_json) && (settings.team_json as any[]).length > 0)
    ? (settings.team_json as unknown as { name: string; role: string; desc: string; image_url?: string; image_position?: string; bio?: string; linkedin?: string; email?: string; experience?: string; year?: string }[])
    : DEFAULT_TEAM;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Leadership Team */}
      <div className="border border-border bg-white p-6 space-y-4">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" /> Leadership Team
        </h1>
        <p className="text-xs text-muted-foreground">The people behind Makrill Trade — driving transparency and performance in commodity trade finance.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {team.map((person: any, i: number) => (
            <div key={i} className="border border-border p-4 text-center space-y-2 flex flex-col">
              {person.image_url ? (
                <img
                  src={person.image_url}
                  alt={person.name}
                  className="h-16 w-16 rounded-full object-cover mx-auto border border-border"
                  style={{ objectPosition: person.image_position || "center" }}
                />
              ) : (
                <div className="h-16 w-16 bg-muted mx-auto flex items-center justify-center rounded-full">
                  <Users className="h-7 w-7 text-muted-foreground" />
                </div>
              )}
              <h3 className="text-sm font-semibold text-foreground">{person.name}</h3>
              <p className="text-[11px] text-primary font-medium">{person.role}</p>
              {person.experience ? (
                <p className="text-[10px] text-muted-foreground">{person.experience}</p>
              ) : person.year ? (
                <p className="text-[10px] text-muted-foreground">Industry since {person.year}</p>
              ) : null}
              <p className="text-xs text-muted-foreground leading-relaxed">{person.desc}</p>
              <div className="flex-1" />
              {person.bio && (
                <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-2 mt-1">{person.bio}</p>
              )}
              <div className="flex-1" />
              <div className="flex items-center justify-center gap-2 pt-1">
                {person.linkedin && (
                  <a href={person.linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <Linkedin className="h-3.5 w-3.5" />
                  </a>
                )}
                {person.email && (
                  <a href={`mailto:${person.email}`} className="text-muted-foreground hover:text-primary transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mission */}
      <div className="border border-border bg-white p-6 space-y-2">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" /> Our Mission
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">{missionText}</p>
      </div>
    </div>
  );
}
