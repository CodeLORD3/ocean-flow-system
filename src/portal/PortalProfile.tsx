import { useState, useEffect, useMemo, useRef } from "react";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, Shield, User, CheckCircle, Trash2, Mail, AlertTriangle, Upload, FileCheck, Clock, XCircle, Bell, Copy, Check, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";

export default function PortalProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [iban, setIban] = useState("");
  const [ibanCopied, setIbanCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [formData, setFormData] = useState({ first_name: "", last_name: "", country: "", date_of_birth: "", telephone: "", address: "", base_currency: "SEK", investor_classification: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; url: string }[]>([]);
  const [notifPrefs, setNotifPrefs] = useState({
    new_opportunity: true,
    investment_confirmed: true,
    funds_received: true,
    payout_approaching: true,
    payout_completed: true,
  });
  const [notifPrefsLoaded, setNotifPrefsLoaded] = useState(false);
  const [savingNotifPref, setSavingNotifPref] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Security modal states
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", new: "", confirm: "" });
  const [pwShowCurrent, setPwShowCurrent] = useState(false);
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ newEmail: "", password: "" });
  const [emailSaving, setEmailSaving] = useState(false);

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
          date_of_birth: (data as any).date_of_birth || "",
          telephone: (data as any).telephone || "",
          address: (data as any).address || "",
          base_currency: (data as any).base_currency || "SEK",
          investor_classification: (data as any).investor_classification || "",
        });
      } else {
        // Profile doesn't exist yet — show empty form
        setProfileMissing(true);
        const meta = u.user_metadata || {};
        setFormData({
          first_name: meta.first_name || "",
          last_name: meta.last_name || "",
          country: meta.country || "Sweden",
          date_of_birth: "",
          telephone: "",
          address: "",
          base_currency: "SEK",
          investor_classification: "",
        });
      }
      // Load uploaded KYC documents
      if (u) {
        const { data: files } = await supabase.storage.from("kyc-documents").list(u.id);
        if (files && files.length > 0) {
          setUploadedFiles(files.map(f => ({
            name: f.name,
            url: supabase.storage.from("kyc-documents").getPublicUrl(`${u.id}/${f.name}`).data.publicUrl,
          })));
        }
      }
      // Load notification preferences
      if (u) {
        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select("*")
          .eq("user_id", u.id)
          .maybeSingle();
        if (prefs) {
          setNotifPrefs({
            new_opportunity: (prefs as any).new_opportunity ?? true,
            investment_confirmed: (prefs as any).investment_confirmed ?? true,
            funds_received: (prefs as any).funds_received ?? true,
            payout_approaching: (prefs as any).payout_approaching ?? true,
            payout_completed: (prefs as any).payout_completed ?? true,
          });
        }
        setNotifPrefsLoaded(true);
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
      date_of_birth: formData.date_of_birth || null,
      telephone: formData.telephone || null,
      address: formData.address || null,
      base_currency: formData.base_currency,
      investor_classification: formData.investor_classification || null,
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
          <div className="h-14 w-14 bg-[#0f2e3d] rounded-full flex items-center justify-center">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">First Name</label>
            <input
              type="text"
              value={formData.first_name}
              onChange={(e) => setFormData(p => ({ ...p, first_name: e.target.value }))}
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0f2e3d]/20 focus:border-[#0f2e3d]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Last Name</label>
            <input
              type="text"
              value={formData.last_name}
              onChange={(e) => setFormData(p => ({ ...p, last_name: e.target.value }))}
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0f2e3d]/20 focus:border-[#0f2e3d]"
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
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0f2e3d]/20 focus:border-[#0f2e3d]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Date of Birth <span className="text-muted-foreground">(optional)</span></label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "w-full h-9 px-3 border border-border rounded text-sm text-left flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#0f2e3d]/20 focus:border-[#0f2e3d] bg-white",
                    !formData.date_of_birth && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5 opacity-50" />
                  {formData.date_of_birth ? format(new Date(formData.date_of_birth), "PPP") : "Select date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  captionLayout="dropdown-buttons"
                  fromYear={1920}
                  toYear={new Date().getFullYear()}
                  selected={formData.date_of_birth ? new Date(formData.date_of_birth) : undefined}
                  onSelect={(date) => setFormData(p => ({ ...p, date_of_birth: date ? format(date, "yyyy-MM-dd") : "" }))}
                  disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                  defaultMonth={formData.date_of_birth ? new Date(formData.date_of_birth) : new Date(1990, 0)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Telephone</label>
            <input
              type="text"
              value={formData.telephone}
              onChange={(e) => setFormData(p => ({ ...p, telephone: e.target.value }))}
              placeholder="Optional"
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0f2e3d]/20 focus:border-[#0f2e3d]"
            />
          </div>
           <div>
            <label className="text-xs text-muted-foreground mb-1 block">Address</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))}
              placeholder="Optional"
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0f2e3d]/20 focus:border-[#0f2e3d]"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Base Currency</label>
            <select
              value={formData.base_currency}
              onChange={(e) => setFormData(p => ({ ...p, base_currency: e.target.value }))}
              className="w-full h-9 px-3 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0f2e3d]/20 focus:border-[#0f2e3d] bg-white"
            >
              <option value="SEK">SEK – Swedish Krona</option>
              <option value="CHF">CHF – Swiss Franc</option>
              <option value="EUR">EUR – Euro</option>
              <option value="USD">USD – US Dollar</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={savingProfile || !formData.first_name || !formData.last_name}
          className="mt-4 px-4 py-2 bg-[#0f2e3d] text-white rounded text-sm font-medium hover:bg-[#0f2e3d]/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          <Save className="h-3.5 w-3.5" />
          {savingProfile ? "Saving…" : "Save Profile"}
        </button>
      </div>

      {/* Investor Declaration */}
      <div className="bg-white border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Investor Declaration</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Select the classification that best describes your investor status.
        </p>
        <div className="space-y-2.5">
          {[
            { value: "retail", label: "Retail Investor", desc: "Individual investing with personal funds, without professional financial qualifications." },
            { value: "professional", label: "Professional Investor", desc: "Meets regulatory criteria such as portfolio size, transaction frequency, or professional experience." },
            { value: "sophisticated", label: "Sophisticated / Accredited Investor", desc: "High-net-worth individual or entity meeting accreditation thresholds set by applicable regulations." },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                formData.investor_classification === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <input
                type="radio"
                name="investor_classification"
                value={opt.value}
                checked={formData.investor_classification === opt.value}
                onChange={(e) => setFormData(p => ({ ...p, investor_classification: e.target.value }))}
                className="mt-0.5 accent-primary"
              />
              <div>
                <div className="text-sm font-medium text-foreground">{opt.label}</div>
                <div className="text-xs text-muted-foreground">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
        {formData.investor_classification && (
          <p className="text-[11px] text-muted-foreground mt-3">
            This will be saved when you click "Save Profile" above.
          </p>
        )}
      </div>

      {/* Verification Status */}
      <div className="bg-white border border-border rounded-lg p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Verification Status</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Your KYC/AML verification status. Required before your first investment payout.
        </p>

        {(() => {
          const status = (profile as any)?.verification_status || "action_required";
          if (status === "verified") {
            return (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-green-800">Verified</div>
                  <div className="text-xs text-green-700">Your identity has been verified. No further action needed.</div>
                </div>
              </div>
            );
          }
          if (status === "pending") {
            return (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded">
                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-amber-800">Pending Review</div>
                  <div className="text-xs text-amber-700">Your documents are being reviewed. This usually takes 1–2 business days.</div>
                </div>
              </div>
            );
          }
          // action_required
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded">
                <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-red-800">Action Required – Upload Documents</div>
                  <div className="text-xs text-red-700">Please upload a valid ID document and proof of address to complete verification.</div>
                </div>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Uploaded files:</div>
                  {uploadedFiles.map(f => (
                    <div key={f.name} className="flex items-center gap-2 text-xs text-foreground">
                      <FileCheck className="h-3.5 w-3.5 text-green-500" />
                      <span>{f.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || !user) return;
                  setUploading(true);
                  const newFiles: { name: string; url: string }[] = [];
                  for (const file of Array.from(files)) {
                    const path = `${user.id}/${Date.now()}-${file.name}`;
                    const { error } = await supabase.storage.from("kyc-documents").upload(path, file);
                    if (error) {
                      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
                    } else {
                      newFiles.push({ name: file.name, url: path });
                    }
                  }
                  if (newFiles.length > 0) {
                    setUploadedFiles(prev => [...prev, ...newFiles]);
                    // Update status to pending after upload
                    if (profile) {
                      await supabase.from("investor_profiles").update({ verification_status: "pending" } as any).eq("id", profile.id);
                      setProfile((p: any) => ({ ...p, verification_status: "pending" }));
                    }
                    toast({ title: "Uploaded", description: `${newFiles.length} document(s) submitted for review.` });
                  }
                  setUploading(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !profile}
                className="flex items-center gap-1.5 px-4 py-2 border border-border rounded text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Uploading…" : "Upload Documents"}
              </button>
              {!profile && (
                <p className="text-[11px] text-muted-foreground">Save your profile first to enable document uploads.</p>
              )}
            </div>
          );
        })()}
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
              placeholder="e.g. XX00 0000 0000 0000 0000 00"
              className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0f2e3d]/20 font-mono pr-16 ${
                iban && isValidIban ? "border-green-400 focus:border-green-500" : iban ? "border-destructive focus:border-destructive" : "border-gray-300 focus:border-[#0f2e3d]"
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {iban && isValidIban && (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              {iban && (
                <button
                  type="button"
                  title={ibanCopied ? "Copied!" : "Copy IBAN"}
                  onClick={() => {
                    navigator.clipboard.writeText(iban.trim());
                    setIbanCopied(true);
                    setTimeout(() => setIbanCopied(false), 2000);
                  }}
                  className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {ibanCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>
          <button
            onClick={handleSaveIban}
            disabled={saving || !profile}
            className="px-4 py-2 bg-[#0f2e3d] text-white rounded text-sm font-medium hover:bg-[#0f2e3d]/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {iban && !isValidIban && (
          <p className="text-[11px] text-destructive mt-1">Please enter a valid IBAN (e.g. XX00 0000 0000 0000 0000 00)</p>
        )}
        {!iban && profile && (
          <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Required to receive payouts. Please add your IBAN before your first investment matures.
          </p>
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
            onClick={() => { setPwForm({ current: "", new: "", confirm: "" }); setPwModalOpen(true); }}
          >
            <Shield className="h-3.5 w-3.5" />
            Change password
          </button>
          <button
            className="px-4 py-2 border border-border rounded text-sm font-medium text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5"
            onClick={() => { setEmailForm({ newEmail: "", password: "" }); setEmailModalOpen(true); }}
          >
            <Mail className="h-3.5 w-3.5" />
            Update email
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      <Dialog open={pwModalOpen} onOpenChange={setPwModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-primary" /> Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Current password</label>
              <div className="relative">
                <input
                  type={pwShowCurrent ? "text" : "password"}
                  value={pwForm.current}
                  onChange={(e) => setPwForm(f => ({ ...f, current: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 pr-9"
                  placeholder="Enter current password"
                />
                <button type="button" onClick={() => setPwShowCurrent(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {pwShowCurrent ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">New password</label>
              <div className="relative">
                <input
                  type={pwShowNew ? "text" : "password"}
                  value={pwForm.new}
                  onChange={(e) => setPwForm(f => ({ ...f, new: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 pr-9"
                  placeholder="Enter new password"
                />
                <button type="button" onClick={() => setPwShowNew(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {pwShowNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Confirm new password</label>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Re-enter new password"
              />
              {pwForm.confirm && pwForm.new !== pwForm.confirm && (
                <p className="text-[11px] text-destructive mt-1">Passwords do not match.</p>
              )}
            </div>
            {pwForm.new && pwForm.new.length < 6 && (
              <p className="text-[11px] text-destructive">Password must be at least 6 characters.</p>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setPwModalOpen(false)} className="px-4 py-2 border border-border rounded text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button
              disabled={pwSaving || !pwForm.current || pwForm.new.length < 6 || pwForm.new !== pwForm.confirm}
              onClick={async () => {
                setPwSaving(true);
                // Verify current password by re-signing in
                const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: pwForm.current });
                if (signInError) {
                  toast({ title: "Incorrect password", description: "Your current password is incorrect.", variant: "destructive" });
                  setPwSaving(false);
                  return;
                }
                const { error } = await supabase.auth.updateUser({ password: pwForm.new });
                if (error) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                } else {
                  toast({ title: "Password updated", description: "Your password has been changed successfully." });
                  setPwModalOpen(false);
                }
                setPwSaving(false);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {pwSaving ? "Saving…" : "Update Password"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Email Modal */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4 text-primary" /> Update Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Current email</label>
              <input type="text" value={user?.email || ""} disabled className="w-full px-3 py-2 border border-border rounded text-sm bg-muted/50 text-muted-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">New email address</label>
              <input
                type="email"
                value={emailForm.newEmail}
                onChange={(e) => setEmailForm(f => ({ ...f, newEmail: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Enter new email"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Current password (for verification)</label>
              <input
                type="password"
                value={emailForm.password}
                onChange={(e) => setEmailForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Enter your password"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">A confirmation email will be sent to both your current and new email addresses.</p>
          </div>
          <DialogFooter>
            <button onClick={() => setEmailModalOpen(false)} className="px-4 py-2 border border-border rounded text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button
              disabled={emailSaving || !emailForm.newEmail.includes("@") || !emailForm.password}
              onClick={async () => {
                setEmailSaving(true);
                // Verify password first
                const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: emailForm.password });
                if (signInError) {
                  toast({ title: "Incorrect password", description: "Please enter your correct password.", variant: "destructive" });
                  setEmailSaving(false);
                  return;
                }
                const { error } = await supabase.auth.updateUser({ email: emailForm.newEmail });
                if (error) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                } else {
                  toast({ title: "Confirmation sent", description: "Check both your old and new email to confirm the change." });
                  setEmailModalOpen(false);
                }
                setEmailSaving(false);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {emailSaving ? "Sending…" : "Update Email"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Notification Preferences */}
      <div className="bg-white border border-border rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Email Notification Preferences</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Choose which email notifications you'd like to receive.
        </p>
        <div className="space-y-3">
          {([
            { key: "new_opportunity", label: "New investment opportunity published", desc: "Get notified when a new deal is available on the platform." },
            { key: "investment_confirmed", label: "Investment confirmed", desc: "Confirmation when your investment commitment is registered." },
            { key: "funds_received", label: "Funds received / investment activated", desc: "Notification when your bank transfer is confirmed and investment goes active." },
            { key: "payout_approaching", label: "Payout approaching (7 days before maturity)", desc: "Reminder before your investment reaches its maturity date." },
            { key: "payout_completed", label: "Payout completed", desc: "Confirmation when your payout has been sent to your IBAN." },
          ] as { key: keyof typeof notifPrefs; label: string; desc: string }[]).map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-b-0">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
              <button
                disabled={savingNotifPref === item.key || !user}
                onClick={async () => {
                  if (!user) return;
                  const newVal = !notifPrefs[item.key];
                  setSavingNotifPref(item.key);
                  setNotifPrefs(prev => ({ ...prev, [item.key]: newVal }));
                  const payload = { user_id: user.id, ...notifPrefs, [item.key]: newVal };
                  const { error } = await supabase
                    .from("notification_preferences")
                    .upsert(payload as any, { onConflict: "user_id" });
                  if (error) {
                    setNotifPrefs(prev => ({ ...prev, [item.key]: !newVal }));
                    toast({ title: "Error", description: error.message, variant: "destructive" });
                  }
                  setSavingNotifPref(null);
                }}
                className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${
                  notifPrefs[item.key] ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  notifPrefs[item.key] ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
            </div>
          ))}
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
