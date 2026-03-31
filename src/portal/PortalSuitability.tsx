import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  userId: string;
  onComplete: () => void;
}

export default function PortalSuitability({ userId, onComplete }: Props) {
  const [answers, setAnswers] = useState({ age18: false, notUS: false, riskAware: false });
  const [loading, setLoading] = useState(false);

  const allChecked = answers.age18 && answers.notUS && answers.riskAware;

  const handleSubmit = async () => {
    if (!allChecked) return;
    setLoading(true);
    const { error } = await supabase
      .from("investor_profiles")
      .update({ kyc_completed: true } as any)
      .eq("user_id", userId);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onComplete();
  };

  const checkboxClass = "h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/20 mt-0.5";

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-sm font-bold text-foreground">Investor Suitability Check</h1>
            <p className="text-[11px] text-muted-foreground">Required before you can invest</p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-relaxed">
              Investment in trade finance carries risk. Your capital is not covered by any deposit guarantee scheme. 
              Please confirm the following to continue.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={answers.age18}
              onChange={(e) => setAnswers((p) => ({ ...p, age18: e.target.checked }))}
              className={checkboxClass}
            />
            <div>
              <span className="text-sm font-medium text-foreground">I am 18 years of age or older</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">You must be at least 18 to invest on this platform.</p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={answers.notUS}
              onChange={(e) => setAnswers((p) => ({ ...p, notUS: e.target.checked }))}
              className={checkboxClass}
            />
            <div>
              <span className="text-sm font-medium text-foreground">I am not a US person or US tax resident</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Due to regulatory requirements, US persons cannot invest through this platform.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={answers.riskAware}
              onChange={(e) => setAnswers((p) => ({ ...p, riskAware: e.target.checked }))}
              className={checkboxClass}
            />
            <div>
              <span className="text-sm font-medium text-foreground">I understand the risks involved</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                I acknowledge that investments are not guaranteed and I may lose some or all of my invested capital. 
                Returns are not guaranteed and depend on the successful completion of the underlying trade.
              </p>
            </div>
          </label>

          <button
            onClick={handleSubmit}
            disabled={!allChecked || loading}
            className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Confirming…" : "Confirm & Continue"}
          </button>

          <p className="text-[10px] text-center text-muted-foreground">
            By proceeding you agree to the platform's Terms of Use and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
