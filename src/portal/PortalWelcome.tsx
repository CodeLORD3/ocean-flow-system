import { useState } from "react";
import { Search, Shield, TrendingUp, ArrowRight } from "lucide-react";

interface Props {
  onComplete: () => void;
}

const STEPS = [
  {
    icon: Search,
    title: "Browse Opportunities",
    description: "Explore curated trade finance deals sourced from real commodity transactions. Each offer is backed by physical inventory with transparent pricing and risk assessment.",
  },
  {
    icon: Shield,
    title: "Invest With Confidence",
    description: "Review detailed deal structures, collateral information, and risk notes before committing. Choose your investment amount within the specified range and track funding progress in real-time.",
  },
  {
    icon: TrendingUp,
    title: "Earn Returns",
    description: "Once the trade cycle completes, receive your principal plus the agreed return. Monitor your portfolio performance and maturity dates from your personal dashboard.",
  },
];

export default function PortalWelcome({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-lg w-full border border-[#d0d7e2] bg-white">
        {/* Header */}
        <div className="h-10 flex items-center justify-between px-4 border-b border-[#d0d7e2]">
          <span className="text-[#0066ff] font-bold text-xs tracking-[0.2em]">WELCOME TO TRADE PORTAL</span>
          <div className="flex items-center gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 transition-colors ${i === step ? "bg-[#0066ff]" : i < step ? "bg-[#0066ff]/40" : "bg-[#d0d7e2]"}`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-8 text-center space-y-6">
          <div className="w-14 h-14 mx-auto border border-[#0066ff]/30 bg-[#0066ff]/5 flex items-center justify-center">
            {(() => {
              const Icon = STEPS[step].icon;
              return <Icon className="h-7 w-7 text-[#0066ff]" />;
            })()}
          </div>

          <div className="space-y-2">
            <h2 className="text-[16px] font-bold text-[#1a2035] tracking-wider">{STEPS[step].title}</h2>
            <p className="text-[11px] text-[#6b7a8d] leading-relaxed max-w-sm mx-auto">
              {STEPS[step].description}
            </p>
          </div>

          <div className="text-[9px] text-[#8a95a5] tracking-wider">
            STEP {step + 1} OF {STEPS.length}
          </div>
        </div>

        {/* Actions */}
        <div className="px-8 pb-8 flex justify-between items-center">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="text-[10px] text-[#6b7a8d] hover:text-[#0066ff] tracking-wider transition-colors"
            >
              ← BACK
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="text-[10px] text-[#6b7a8d] hover:text-[#0066ff] tracking-wider transition-colors"
            >
              SKIP
            </button>
          )}

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="h-9 px-6 bg-[#0066ff] text-white text-[10px] font-bold tracking-wider hover:bg-[#0052cc] transition-colors flex items-center gap-1.5"
            >
              NEXT <ArrowRight className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="h-9 px-6 bg-[#0066ff] text-white text-[10px] font-bold tracking-wider hover:bg-[#0052cc] transition-colors"
            >
              GET STARTED
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
