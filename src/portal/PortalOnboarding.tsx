import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  userId: string;
  onComplete: () => void;
}

export default function PortalOnboarding({ userId, onComplete }: Props) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    address: "",
    telephone: "",
    email: "",
    account_type: "private" as "private" | "company",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("investor_profiles" as any).insert({
      user_id: userId,
      first_name: form.first_name,
      last_name: form.last_name,
      date_of_birth: form.date_of_birth,
      address: form.address,
      telephone: form.telephone,
      email: form.email,
      account_type: form.account_type,
      status: "pending",
    } as any);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="border border-[#1a2035] bg-[#0d1220] p-8 max-w-md text-center space-y-4">
          <div className="text-[#0066ff] text-4xl">✓</div>
          <h2 className="text-[#c8d6e5] text-lg font-bold tracking-wider">APPLICATION SUBMITTED</h2>
          <p className="text-[#5a6a7a] text-xs leading-relaxed">
            Your application is under review.<br />
            Approval may take up to <span className="text-[#c8d6e5] font-bold">3 business days</span>.
          </p>
          <p className="text-[#5a6a7a] text-[10px]">
            You will receive an email confirmation once your account has been reviewed.
          </p>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full h-9 bg-[#0a0e1a] border border-[#1a2035] px-3 text-xs text-[#c8d6e5] focus:border-[#0066ff] focus:outline-none transition-colors";

  return (
    <div className="max-w-lg mx-auto py-8">
      <div className="border border-[#1a2035] bg-[#0d1220]">
        <div className="h-8 flex items-center px-3 border-b border-[#1a2035]">
          <span className="text-[10px] text-[#3a4a5a] tracking-wider">INVESTOR REGISTRATION</span>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-[10px] text-[#5a6a7a] tracking-wider mb-4">
            Complete your profile to access investment opportunities. All fields are required.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-[#5a6a7a] tracking-wider">FIRST NAME *</label>
              <input required value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-[#5a6a7a] tracking-wider">LAST NAME *</label>
              <input required value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[#5a6a7a] tracking-wider">DATE OF BIRTH *</label>
            <input type="date" required value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[#5a6a7a] tracking-wider">ADDRESS *</label>
            <input required value={form.address} onChange={(e) => set("address", e.target.value)} className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[#5a6a7a] tracking-wider">TELEPHONE *</label>
            <input type="tel" required value={form.telephone} onChange={(e) => set("telephone", e.target.value)} className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[#5a6a7a] tracking-wider">EMAIL *</label>
            <input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[#5a6a7a] tracking-wider">ACCOUNT TYPE *</label>
            <div className="flex gap-3">
              {(["private", "company"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("account_type", t)}
                  className={`flex-1 h-9 text-[11px] tracking-wider border transition-colors ${
                    form.account_type === t
                      ? "border-[#0066ff] text-[#0066ff] bg-[#0066ff]/10"
                      : "border-[#1a2035] text-[#5a6a7a] hover:text-[#c8d6e5]"
                  }`}
                >
                  {t === "private" ? "PRIVATE" : "COMPANY"}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-[#0066ff] text-white text-[11px] font-bold tracking-wider hover:bg-[#0052cc] disabled:opacity-50 transition-colors mt-4"
          >
            {loading ? "SUBMITTING..." : "SUBMIT APPLICATION"}
          </button>
        </form>
      </div>
    </div>
  );
}
