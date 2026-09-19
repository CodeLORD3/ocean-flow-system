import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { edgeErrorMessage } from "@/lib/edgeError";

/**
 * Inloggning direkt från personalregistret.
 *
 * Registret (employees) är master för personen. Inloggningen bor i staff, som
 * är aktörsnyckeln i alla andra flöden. Saknas personalkortet skapas det här,
 * så att admin bara behöver en sida för att ge någon åtkomst.
 */

/** Tillfälligt lösenord: förnamn + Fisk + fyra slumpsiffror. Enkla varianter nekas som svaga. */
export function tempPassword(firstName: string) {
  const raw = String(firstName || "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "");
  const base = raw.length >= 2 ? raw : "Makrill";
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `${base.charAt(0).toUpperCase()}${base.slice(1).toLowerCase()}Fisk${rnd}!`;
}

export function useLoginStatus(staffId: string | null) {
  return useQuery({
    queryKey: ["staff-login-status", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, user_id, email")
        .eq("id", staffId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; user_id: string | null; email: string | null } | null;
    },
  });
}

interface Props {
  employeeId: string;
  staffId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone?: string | null;
  profileImageUrl?: string | null;
}

export function EmployeeLoginSection({
  employeeId, staffId, firstName, lastName, email, phone, profileImageUrl,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: staffRow } = useLoginStatus(staffId);
  const [mail, setMail] = useState(email ?? "");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const hasLogin = !!staffRow?.user_id;

  const createLogin = async () => {
    const addr = mail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      toast({ title: "Ogiltig e-postadress", description: "Skriv adressen personen ska logga in med.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // 1. Personalkort (aktörsnyckel) — skapas om det saknas och kopplas till registret.
      let sid = staffId;
      if (!sid) {
        const { data, error } = await supabase
          .from("staff")
          .insert({
            first_name: firstName,
            last_name: lastName,
            email: addr,
            phone: phone ?? null,
            profile_image_url: profileImageUrl ?? null,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        sid = data.id as string;
        const { error: linkErr } = await supabase
          .from("employees").update({ staff_id: sid }).eq("id", employeeId);
        if (linkErr) throw linkErr;
      }

      // 2. Själva kontot
      const password = tempPassword(firstName);
      const { data, error } = await supabase.functions.invoke("staff-account-email", {
        body: { staff_id: sid, email: addr, password },
      });
      if (error || (data as any)?.error) {
        throw new Error(await edgeErrorMessage(error, data));
      }
      await supabase.from("staff").update({ must_change_password: true } as any).eq("id", sid);
      setCreated({ email: addr, password });
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["staff-login-status"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Inloggning klar", description: `${addr} kan logga in nu.` });
    } catch (e: any) {
      toast({ title: "Kunde inte skapa inloggning", description: e?.message ?? "Okänt fel", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(`${created.email} · ${created.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-primary" /> Inloggning
        </p>
        {hasLogin
          ? <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Har inloggning</Badge>
          : <Badge variant="outline">Ingen inloggning</Badge>}
      </div>

      {hasLogin ? (
        <p className="text-xs text-muted-foreground">
          Loggar in med <span className="font-mono">{staffRow?.email ?? mail}</span>.
          Nytt lösenord kan ges genom att skapa inloggningen igen.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Ge personen åtkomst till appen. Ett tillfälligt lösenord skapas och måste bytas vid första inloggningen.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`login-mail-${employeeId}`} className="text-xs">E-post för inloggning</Label>
        <Input
          id={`login-mail-${employeeId}`}
          value={mail}
          onChange={(e) => setMail(e.target.value)}
          placeholder="namn@exempel.se"
        />
      </div>

      <Button type="button" onClick={createLogin} disabled={busy} className="w-full">
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
        {hasLogin ? "Skapa nytt lösenord" : "Skapa inloggning"}
      </Button>

      {created && (
        <div className="flex items-center justify-between gap-2 rounded border border-emerald-600/40 bg-emerald-600/10 p-3 text-xs">
          <div className="min-w-0">
            <p className="truncate font-mono">{created.email}</p>
            <p className="truncate font-mono font-semibold">{created.password}</p>
            <p className="text-muted-foreground">Ge uppgifterna till personen — lösenordet byts vid första inloggningen.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
