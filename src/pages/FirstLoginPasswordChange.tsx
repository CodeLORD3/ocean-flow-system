import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, KeyRound, LogOut } from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useToast } from "@/hooks/use-toast";

export default function FirstLoginPasswordChange() {
  const { staff, refresh, signOut } = useStaffAuth();
  const { toast } = useToast();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!staff) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pwd.length < 8) return setErr("Lösenordet måste vara minst 8 tecken.");
    if (pwd !== pwd2) return setErr("Lösenorden matchar inte.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    await supabase.from("staff").update({ must_change_password: false }).eq("id", staff.id);
    await refresh();
    toast({ title: "Lösenordet är uppdaterat" });
    setBusy(false);
  };

  const keepCurrent = async () => {
    setBusy(true);
    await supabase.from("staff").update({ must_change_password: false }).eq("id", staff.id);
    await refresh();
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="p-6">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-xl font-semibold text-center text-foreground">
            Välkommen, {staff.first_name}!
          </h1>
          <p className="text-xs text-muted-foreground text-center mt-1 mb-5">
            Välj ett nytt lösenord eller fortsätt med det tilldelade.
          </p>

          {err && (
            <div className="mb-4 p-2.5 bg-destructive/10 border border-destructive/20 rounded text-destructive text-xs">
              {err}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="np" className="text-xs">Nytt lösenord</Label>
              <div className="relative">
                <Input
                  id="np"
                  type={show ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  className="pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="np2" className="text-xs">Bekräfta lösenord</Label>
              <Input
                id="np2"
                type={show ? "text" : "password"}
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={busy || !pwd || !pwd2}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Spara nytt lösenord"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-xs text-muted-foreground"
              onClick={keepCurrent}
              disabled={busy}
            >
              Behåll tilldelat lösenord
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t border-border text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={signOut}
              disabled={busy}
              className="text-xs text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Logga ut
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
