import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useLandingSettings } from "@/hooks/useLandingSettings";
import { LandingView } from "@/components/landing/LandingView";

export default function Landing() {
  const { session, loading } = useStaffAuth();
  const { data: settings } = useLandingSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session) return <Navigate to="/choose-portal" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (error) setError("Fel e-post eller lösenord");
  };

  return (
    <LandingView
      settings={settings}
      className="min-h-screen justify-center px-4 py-8 sm:p-6"
      footer={
        <p className="mt-6 text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Makrill Trade
        </p>
      }
    >
      {error && (
        <div className="mb-4 p-2.5 bg-destructive/10 border border-destructive/20 rounded text-destructive text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs">E-post</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs">Lösenord</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Logga in"}
        </Button>
      </form>

      <div className="mt-3 text-center">
        <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground underline">
          Glömt lösenord?
        </Link>
      </div>
    </LandingView>
  );
}
