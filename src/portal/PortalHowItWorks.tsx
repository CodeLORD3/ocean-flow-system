import { Search, FileCheck, DollarSign, TrendingUp, Shield, Clock, HelpCircle, ChevronRight } from "lucide-react";
import { usePortalTabs } from "./PortalTabsContext";

const steps = [
  {
    step: 1,
    icon: Search,
    title: "Browse Opportunities",
    desc: "Explore curated trade-finance deals in our marketplace. Each opportunity details the product being traded, expected returns, duration, risk profile, and collateral backing. All deals are pre-vetted by our team.",
    detail: "Filter by return rate, duration, minimum investment amount, or sector to find deals that match your investment criteria.",
  },
  {
    step: 2,
    icon: FileCheck,
    title: "Review & Commit",
    desc: "Select an opportunity and review the full offer memorandum including supplier information, purchase terms, exit strategy, and risk factors. When ready, enter your investment amount and confirm.",
    detail: "You'll see a clear summary of your expected return in currency, the exact maturity date, and all terms before you commit.",
  },
  {
    step: 3,
    icon: DollarSign,
    title: "Fund Your Investment",
    desc: "Transfer your committed amount directly to the company's designated bank account using the IBAN and unique reference number provided after you commit. Your transfer is tracked and confirmed by our team.",
    detail: "Each investment has a unique payment reference so your funds are matched accurately and promptly.",
  },
  {
    step: 4,
    icon: TrendingUp,
    title: "Earn Returns",
    desc: "Once the trade completes and goods are sold, your principal plus returns are paid back to you. Track the status of every investment in real-time through your portfolio dashboard.",
    detail: "Typical deal durations range from 30 to 120 days, with returns distributed upon maturity.",
  },
];

const faqs = [
  { q: "What is the minimum investment?", a: "Each opportunity has its own minimum, typically starting from 10,000 kr. This is clearly stated on every offer card." },
  { q: "How are returns calculated?", a: "Returns are based on the gross margin of the underlying trade. The expected annual return and exact currency amount are shown before you commit." },
  { q: "What happens if a trade goes wrong?", a: "All trades are backed by physical inventory as collateral. Our risk team monitors every deal, and we maintain reserve buffers to protect investor capital." },
  { q: "How long are funds locked?", a: "Each deal has a defined tenor (duration). You can see the exact maturity date before investing. Most deals range from 30–120 days." },
  { q: "Can I withdraw early?", a: "Investments are committed for the deal duration. We are working on a secondary market feature for future releases." },
];

export default function PortalHowItWorks() {
  const { switchTab } = usePortalTabs();

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="border border-border bg-white p-8">
        <h1 className="text-xl font-bold text-foreground mb-2">How Ocean Trade Works</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Ocean Trade connects you directly with short-term commodity trades in the Nordic food sector.
          Here's how the process works from start to finish.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((s, i) => (
          <div key={s.step} className="border border-border bg-white p-6 flex gap-5">
            <div className="shrink-0">
              <div className="h-11 w-11 bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">{s.step}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="w-px h-6 bg-border mx-auto mt-2" />
              )}
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">{s.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              <p className="text-xs text-muted-foreground/70 italic">{s.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Key benefits */}
      <div className="border border-border bg-white p-8 space-y-5">
        <h2 className="text-base font-bold text-foreground">Why Invest with Ocean Trade?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Shield, title: "Asset-Backed", desc: "Every investment is secured by physical inventory — real products with real market value." },
            { icon: Clock, title: "Short Duration", desc: "Deals typically mature in 30–120 days, keeping your capital agile and liquid." },
            { icon: TrendingUp, title: "Attractive Returns", desc: "Earn competitive, risk-adjusted returns from the margins of real commodity trades." },
          ].map((b) => (
            <div key={b.title} className="border border-border p-5 space-y-2">
              <div className="h-9 w-9 bg-primary/10 flex items-center justify-center">
                <b.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{b.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="border border-border bg-white p-8 space-y-5">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-primary" /> Frequently Asked Questions
        </h2>
        <div className="divide-y divide-border">
          {faqs.map((faq) => (
            <div key={faq.q} className="py-4 first:pt-0 last:pb-0">
              <h3 className="text-sm font-semibold text-foreground mb-1">{faq.q}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="border border-primary/20 bg-primary/5 p-8 text-center space-y-3">
        <h2 className="text-base font-bold text-foreground">Ready to Start Investing?</h2>
        <p className="text-sm text-muted-foreground">Browse our current opportunities and make your first investment today.</p>
        <button
          onClick={() => switchTab("/portal/opportunities")}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          View Opportunities <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
