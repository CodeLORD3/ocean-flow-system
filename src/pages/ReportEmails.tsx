import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { svenskDatum, laggTillSvenskaDagar } from "@/lib/swedishTime";

const STATUS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  lyckad: "default", ej_skickad: "secondary", misslyckad: "destructive", hoppad: "outline", startad: "outline",
};
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }) : "—");

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("report-email", { body });
  if (error) {
    const ctx = (error as any).context;
    throw new Error(ctx?.text ? await ctx.text() : error.message);
  }
  return data;
}

export default function ReportEmails() {
  const qc = useQueryClient();
  const [date, setDate] = useState(laggTillSvenskaDagar(svenskDatum(), -1));
  const [html, setHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recipients, setRecipients] = useState("");
  const [sender, setSender] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");

  const settings = useQuery({
    queryKey: ["report_email_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_email_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (settings.data) {
      setRecipients(settings.data.recipients.join(", "));
      setSender(settings.data.smtp_user ?? settings.data.sender);
      setSmtpHost(settings.data.smtp_host ?? "mailcluster.loopia.se");
      setSmtpPort(String(settings.data.smtp_port ?? 465));
    }
  }, [settings.data]);

  const runs = useQuery({
    queryKey: ["report_email_runs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("report_email_runs")
        .select("id,report_type,report_date,is_test,status,stores_expected,stores_reported,missing_stores,error_stage,error,started_at,finished_at")
        .order("started_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from("report_email_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) toast.error(error.message); else { toast.success("Sparat"); qc.invalidateQueries({ queryKey: ["report_email_settings"] }); }
  };

  const act = async (mode: string, d = date) => {
    setBusy(mode);
    try {
      const r = await call({ mode, date: d });
      if (mode === "preview") setHtml(r.html);
      else { toast.success(`Status: ${r.status}`); qc.invalidateQueries({ queryKey: ["report_email_runs"] }); }
    } catch (e: any) { toast.error(String(e.message ?? e)); }
    setBusy(null);
  };

  const showHtml = async (id: string) => {
    const { data } = await supabase.from("report_email_runs").select("html").eq("id", id).maybeSingle();
    setHtml(data?.html ?? "<p>Ingen HTML sparad.</p>");
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">E-postrapporter</h1>
        <p className="text-sm text-muted-foreground">Dagsrapport tis–fre 19.00, lördag och söndag 17.00 med veckosammanfattning. Inget mejl på måndagar.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Inställningar</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3">
            <Switch checked={!!settings.data?.enabled} onCheckedChange={(v) => save({ enabled: v })} />
            <span className="text-sm">Schemat är {settings.data?.enabled ? "PÅ" : "AV"}</span>
          </label>
          <div className="space-y-1">
            <div className="text-sm">Mottagare (kommaseparerade)</div>
            <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-sm">Utgående server (Loopia)</div>
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-sm">Port (SSL/TLS)</div>
              <Input inputMode="numeric" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-sm">Användare och avsändare</div>
              <Input value={sender} onChange={(e) => setSender(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Lösenordet ligger säkert som hemligheten LOOPIA_SMTP_PASSWORD och visas aldrig här.</p>
          <Button onClick={() => save({
            recipients: recipients.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /.+@.+\..+/.test(s)),
            sender: sender.trim(),
            smtp_user: sender.trim(),
            smtp_host: smtpHost.trim(),
            smtp_port: Number(smtpPort) || 465,
          })}>Spara</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Förhandsvisning och test</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            <Button variant="outline" disabled={!!busy} onClick={() => act("preview")}>{busy === "preview" ? "Bygger…" : "Förhandsvisa"}</Button>
            <Button disabled={!!busy} onClick={() => act("test")}>{busy === "test" ? "Skickar…" : "Skicka testmejl"}</Button>
          </div>
          {html && <iframe title="Förhandsvisning" srcDoc={html} sandbox="" className="h-[70vh] w-full rounded border bg-background" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Körningar</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {runs.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
          {runs.data?.length === 0 && <p className="text-sm text-muted-foreground">Inga körningar än.</p>}
          {runs.data?.map((r: any) => (
            <div key={r.id} className="rounded border p-3 text-sm space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS[r.status] ?? "outline"}>{r.status}</Badge>
                {r.is_test && <Badge variant="outline">test</Badge>}
                <span className="font-medium">{r.report_type} {r.report_date}</span>
                <span className="text-muted-foreground">{fmt(r.started_at)}</span>
              </div>
              {r.stores_expected != null && <div>Butiker: {r.stores_reported} av {r.stores_expected} rapporterade{r.missing_stores?.length ? ` · saknas: ${r.missing_stores.join(", ")}` : ""}</div>}
              {r.error && <div className="break-words text-destructive">{r.error_stage ? `${r.error_stage}: ` : ""}{r.error}</div>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => showHtml(r.id)}>Visa mejl</Button>
                {!r.is_test && (r.status === "misslyckad" || r.status === "ej_skickad") && (
                  <Button size="sm" disabled={!!busy} onClick={() => act("send", r.report_date)}>Kör igen</Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
