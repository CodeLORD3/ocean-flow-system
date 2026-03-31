import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, Shield, User, CheckCircle, Trash2, Mail } from "lucide-react";
import { format } from "date-fns";

export default function PortalProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [iban, setIban] = useState("");
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [formData, setFormData] = useState({ first_name: "", last_name: "", country: "", telephone: "", address: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user;
      if (!u) {
        setProfileLoaded(true);
        return;
      }
      setUser(u);

      const { data } = await supabase
        .from("investor_profiles")
        .select("*")
        .eq("user_id", u.id)
        .maybeSingle();

      if (data) {
        setProfile(data);
        setIban((data as any).iban || "");
        setFormData({
          first_name: (data as any).first_name || "",
          last_name: (data as any).last_name || "",
          country: (data as any).country || "",
          telephone: (data as any).telephone || "",
          address: (data as any).address || "",
        });
      } else {
        // Profile doesn't exist yet — show empty form
        setProfileMissing(true);
        const meta = u.user_metadata || {};
        setFormData({
          first_name: meta.first_name || "",
          last_name: meta.last_name || "",
          country: meta.country || "Sweden",
          telephone: "",
          address: "",
        });
      }
      setProfileLoaded(true);
    };
    load();
  }, []);

  const isValidIban = useMemo(() => {
    const cleaned = iban.replace(/\s/g, "");
    if (cleaned.length < 15 || cleaned.length > 34) return false;
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleaned)) return false;
    return true;
  }, [iban]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const payload = {
      user_id: user.id,
      email: user.email,
      first_name: formData.first_name,
      last_name: formData.last_name,
      country: formData.country,
      telephone: formData.telephone || null,
      address: formData.address || null,
    };
    const { data, error } = await supabase
      .from("investor_profiles")
      .upsert(payload as any, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setProfile(data);
      setProfileMissing(false);
      toast({ title: "Saved", description: "Profile updated successfully." });
    }
    setSavingProfile(false);
  };

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

  if (!profileLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground animate-pulse">Loading profile…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Could not load profile. Please try logging in again.</div>
      </div>
    );
  }

  const displayProfile = profile || { first_name: formData.first_name, last_name: formData.last_name, email: user.email, created_at: new Date().toISOString(), country: formData.country };
  const fullName = `${displayProfile.first_name} ${displayProfile.last_name}`.trim() || user.email;
  const memberSince = format(new Date(displayProfile.created_at), "MMMM yyyy");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-lg font-bold text-foreground">My Profile</h1>

      {/* Personal Info */}
      <div className="bg-white border border-border rounded-lg p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="h-14 w-14 bg-[#1a3a4a] rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-lg">
              {displayProfile.first_name?.[0]}{displayProfile.last_name?.[0]}
            </span>
          </div>
          <div>
            <div className="font-semibold text-foreground">{fullName}</div>
            <div className="text-xs text-muted-foreground">Member since {memberSince}</div>
          </div>
        </div>

        {profileMissing && (
          <div className="bg-amber-50 border border-amber-200 p-3 mb-4 text-xs text-amber-800">
            Your profile is incomplete. Please fill in your details below and save.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">First Name</label>
            <input
              type="text"
              value={formData.first_name}
              onChange={(e) => setFormData(p => ({ ...p, first_name: e.target.value }))}
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a4a]/20 focus:border-[#1a3a4a]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Last Name</label>
            <input
              type="text"
              value={formData.last_name}
              onChange={(e) => setFormData(p => ({ ...p, last_name: e.target.value }))}
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a4a]/20 focus:border-[#1a3a4a]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <div className="text-sm text-foreground py-2">{user.email}</div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Country</label>
            <input
              type="text"
              value={formData.country}
              onChange={(e) => setFormData(p => ({ ...p, country: e.target.value }))}
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a4a]/20 focus:border-[#1a3a4a]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Telephone</label>
            <input
              type="text"
              value={formData.telephone}
              onChange={(e) => setFormData(p => ({ ...p, telephone: e.target.value }))}
              placeholder="Optional"
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a4a]/20 focus:border-[#1a3a4a]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
              placeholder="Optional"
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a4a]/20 focus:border-[#1a3a4a]"
            />
          </div>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={savingProfile || !formData.first_name || !formData.last_name}
          className="mt-4 px-4 py-2 bg-[#1a3a4a] text-white rounded text-sm font-medium hover:bg-[#1a3a4a]/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          {savingProfile ? "Saving…" : "Save Profile"}
        </button>
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
            disabled={saving || !profile}
            className="px-4 py-2 bg-[#1a3a4a] text-white rounded text-sm font-medium hover:bg-[#1a3a4a]/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {iban && !isValidIban && (
          <p className="text-[11px] text-destructive mt-1">Please enter a valid IBAN (e.g. SE35 5000 0000 0549 1000 0003)</p>
        )}
        {!profile && (
          <p className="text-[11px] text-muted-foreground mt-1">Save your profile first to enable IBAN settings.</p>
        )}
      </div>

      {/* Security */}
      <div className="bg-white border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Security</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Manage your account security settings.
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            className="px-4 py-2 border border-border rounded text-sm font-medium text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5"
            onClick={async () => {
              const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/portal/reset-password` });
              if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
              else toast({ title: "Email sent", description: "Check your inbox for a password reset link." });
            }}
          >
            <Shield className="h-3.5 w-3.5" />
            Change password
          </button>
          <button
            className="px-4 py-2 border border-border rounded text-sm font-medium text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5"
            onClick={async () => {
              const newEmail = window.prompt("Enter your new email address:");
              if (!newEmail || !newEmail.includes("@")) return;
              const { error } = await supabase.auth.updateUser({ email: newEmail });
              if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
              else toast({ title: "Confirmation sent", description: "Check both your old and new email to confirm the change." });
            }}
          >
            <Mail className="h-3.5 w-3.5" />
            Update email
          </button>
        </div>
      </div>

      {/* Delete account */}
      <div className="bg-white border border-destructive/20 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-destructive mb-1">Delete Account</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <button
          className="px-4 py-2 border border-destructive/30 rounded text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-1.5"
          onClick={async () => {
            const confirmed = window.confirm("Are you sure you want to request account deletion? This will send a request to our team to process within 30 days as required by GDPR.");
            if (!confirmed) return;
            await supabase.from("notifications").insert({
              portal: "trade",
              target_page: "/investor-list",
              message: `Account deletion requested by ${formData.first_name} ${formData.last_name} (${user.email})`,
              entity_type: "account_deletion",
              entity_id: user.id,
            });
            toast({ title: "Request submitted", description: "Your account deletion request has been sent. Our team will process it within 30 days." });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Request account deletion
        </button>
      </div>
    </div>
  );
}
