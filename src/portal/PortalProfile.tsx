import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, Shield, User, CheckCircle } from "lucide-react";
import { format } from "date-fns";

export default function PortalProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [iban, setIban] = useState("");
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      setUser(u);

      const { data } = await supabase
        .from("investor_profiles")
        .select("*")
        .eq("user_id", u.id)
        .maybeSingle();

      if (data) {
        setProfile(data);
        setIban((data as any).iban || "");
      }
    };
    load();
  }, []);

  const isValidIban = useMemo(() => {
    const cleaned = iban.replace(/\s/g, "");
    if (cleaned.length < 15 || cleaned.length > 34) return false;
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleaned)) return false;
    return true;
  }, [iban]);

  const handleSaveIban = async () => {
    if (!profile) return;
    if (iban && !isValidIban) {
      toast({ title: "Invalid IBAN", description: "Please enter a valid IBAN format.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("investor_profiles")
      .update({ iban } as any)
      .eq("id", profile.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Payout details updated." });
    }
    setSaving(false);
  };

  if (!profile || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground animate-pulse">Loading profile…</div>
      </div>
    );
  }

  const fullName = `${profile.first_name} ${profile.last_name}`.trim();
  const memberSince = format(new Date(profile.created_at), "MMMM yyyy");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-lg font-bold text-foreground">My Profile</h1>

      {/* Personal Info */}
      <div className="bg-white border border-border rounded-lg p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="h-14 w-14 bg-[#1a3a4a] rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-lg">
              {profile.first_name?.[0]}{profile.last_name?.[0]}
            </span>
          </div>
          <div>
            <div className="font-semibold text-foreground">{fullName}</div>
            <div className="text-xs text-muted-foreground">Member since {memberSince}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Email</div>
            <div className="text-foreground">{profile.email}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Country</div>
            <div className="text-foreground">{(profile as any).country || "—"}</div>
          </div>
        </div>
      </div>

      {/* Payout Details */}
      <div className="bg-white border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Payout Details</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Your IBAN will be used for receiving payouts at maturity.
        </p>
        <div className="flex gap-3 items-start">
          <div className="flex-1 relative">
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase().replace(/[^A-Z0-9\s]/g, ""))}
              placeholder="SE00 0000 0000 0000 0000 0000"
              className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a4a]/20 font-mono pr-9 ${
                iban && isValidIban ? "border-green-400 focus:border-green-500" : iban ? "border-destructive focus:border-destructive" : "border-gray-300 focus:border-[#1a3a4a]"
              }`}
            />
            {iban && isValidIban && (
              <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
          </div>
          <button
            onClick={handleSaveIban}
            disabled={saving}
            className="px-4 py-2 bg-[#1a3a4a] text-white rounded text-sm font-medium hover:bg-[#1a3a4a]/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {iban && !isValidIban && (
          <p className="text-[11px] text-destructive mt-1">Please enter a valid IBAN (e.g. SE35 5000 0000 0549 1000 0003)</p>
        )}
      </div>

      {/* Security */}
      <div className="bg-white border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Security</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Manage your account security settings.
        </p>
        <button
          className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5"
          onClick={() => toast({ title: "Coming soon", description: "Password change will be available shortly." })}
        >
          <Shield className="h-3.5 w-3.5" />
          Change password
        </button>
      </div>
    </div>
  );
}
