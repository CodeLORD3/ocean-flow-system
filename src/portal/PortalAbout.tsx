import { Users, Shield, Globe, Target, Award, Heart } from "lucide-react";

const team = [
  { name: "Erik Lindgren", role: "Founder & CEO", desc: "15+ years in commodity trading and structured finance across Nordic and European markets." },
  { name: "Sofia Andersson", role: "Head of Operations", desc: "Former supply-chain director with deep expertise in seafood logistics and quality assurance." },
  { name: "Marcus Johansson", role: "Chief Risk Officer", desc: "Background in institutional risk management and credit analysis for trade finance portfolios." },
];

const values = [
  { icon: Shield, title: "Transparency", desc: "Every trade is documented with full visibility into pricing, margins, and risk factors." },
  { icon: Globe, title: "Sustainability", desc: "We prioritise responsibly sourced products and traceable supply chains." },
  { icon: Target, title: "Performance", desc: "Our deals are structured for attractive, risk-adjusted returns backed by physical assets." },
  { icon: Heart, title: "Trust", desc: "Built on long-standing supplier relationships and rigorous due diligence." },
];

export default function PortalAbout() {
  return (
    <div className="space-y-8 max-w-4xl">
      {/* Hero */}
      <div className="border border-border bg-white p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">OT</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">About Ocean Trade</h1>
            <p className="text-xs text-muted-foreground">Who we are and what drives us</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Ocean Trade is a specialised trade-finance platform connecting qualified investors with
          short-term commodity transactions in the Nordic seafood and food-distribution sector.
          We bridge the gap between real-economy supply chains and investors seeking transparent,
          asset-backed opportunities with attractive returns.
        </p>
      </div>

      {/* Mission */}
      <div className="border border-border bg-white p-8 space-y-3">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" /> Our Mission
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          To democratise access to trade-finance investments that were traditionally reserved for
          institutions. We make it simple for individual investors to participate in real, tangible
          trades — from fresh Atlantic salmon to premium shellfish — while providing the supply chain
          with much-needed working capital.
        </p>
      </div>

      {/* Values */}
      <div className="border border-border bg-white p-8 space-y-5">
        <h2 className="text-base font-bold text-foreground">Our Values</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {values.map((v) => (
            <div key={v.title} className="flex gap-3 p-4 bg-muted/30 border border-border">
              <div className="h-9 w-9 bg-primary/10 flex items-center justify-center shrink-0">
                <v.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{v.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Team */}
      <div className="border border-border bg-white p-8 space-y-5">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" /> Leadership Team
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {team.map((person) => (
            <div key={person.name} className="border border-border p-5 text-center space-y-2">
              <div className="h-14 w-14 bg-muted mx-auto flex items-center justify-center">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{person.name}</h3>
              <p className="text-[11px] text-primary font-medium">{person.role}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{person.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="border border-border bg-white p-8 space-y-3">
        <h2 className="text-base font-bold text-foreground">Contact</h2>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Email: <span className="text-foreground">investors@oceantrade.com</span></p>
          <p>Phone: <span className="text-foreground">+46 8 123 45 67</span></p>
          <p>Office: <span className="text-foreground">Strandvägen 7A, Stockholm, Sweden</span></p>
        </div>
      </div>
    </div>
  );
}
