import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  onComplete: () => void;
}

export default function PortalSuitability({ userId, onComplete }: Props) {
  const [answers, setAnswers] = useState({ capitalRisk: false, notUS: false, readGuidelines: false });
  const [loading, setLoading] = useState(false);

  const allChecked = answers.capitalRisk && answers.notUS && answers.readGuidelines;

  const handleSubmit = async () => {
    if (!allChecked) return;
    setLoading(true);

    const { error: suitError } = await supabase
      .from("suitability_responses" as any)
      .insert({
        user_id: userId,
        is_18_plus: true,
        is_not_us_person: true,
        understands_risk: true,
        understands_no_deposit_guarantee: true,
      } as any);
    if (suitError) {
      toast.error(suitError.message);
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("investor_profiles")
      .update({ kyc_completed: true, suitability_passed: true } as any)
      .eq("user_id", userId);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onComplete();
  };

  const checkboxClass =
    "h-4 w-4 rounded border-gray-300 text-[#0f2e3d] focus:ring-[#0f2e3d]/20 mt-0.5 shrink-0";

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-8 w-8 bg-[#0f2e3d] flex items-center justify-center rounded">
            <span className="text-[#2a9e7e] font-bold text-xs">MT</span>
          </div>
          <span className="text-[#0f2e3d] font-bold text-lg">
            Makrill <span className="text-[#2a9e7e]">Trade</span>
          </span>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-2.5 mb-1">
            <ShieldCheck className="h-5 w-5 text-[#0f2e3d]" />
            <h1 className="text-xl font-bold text-[#0f2e3d]">Before you start investing</h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Makrill Trade is a non-regulated investment platform. Investments made here are not
            covered by any deposit guarantee scheme, and returns are not guaranteed. Please read and
            acknowledge the following before continuing.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-2 mb-6">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Capital at risk — you should only invest money you can afford to lose.
            </p>
          </div>

          <div className="space-y-4 mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={answers.capitalRisk}
                onChange={(e) => setAnswers((p) => ({ ...p, capitalRisk: e.target.checked }))}
                className={checkboxClass}
              />
              <span className="text-sm text-gray-700">
                I understand that I may lose part or all of my invested capital.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={answers.notUS}
                onChange={(e) => setAnswers((p) => ({ ...p, notUS: e.target.checked }))}
                className={checkboxClass}
              />
              <span className="text-sm text-gray-700">
                I confirm I am not a US person for tax purposes.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={answers.readGuidelines}
                onChange={(e) => setAnswers((p) => ({ ...p, readGuidelines: e.target.checked }))}
                className={checkboxClass}
              />
              <span className="text-sm text-gray-700">
                I have read and understood the{" "}
                <a
                  href="/portal/guidelines"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2a9e7e] underline hover:text-[#2a9e7e]/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  Investment Guidelines
                </a>
                .
              </span>
            </label>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!allChecked || loading}
            className="w-full bg-[#0f2e3d] text-white py-2.5 rounded text-sm font-medium hover:bg-[#0f2e3d]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? "Saving…" : "Continue to platform"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-4">
          © {new Date().getFullYear()} Makrill Trade. All rights reserved.
        </p>
      </div>
    </div>
  );
}
