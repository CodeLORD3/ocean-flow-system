import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Copy, Phone } from "lucide-react";
import { useTelefonStatus } from "@/components/admin/TelefonistStatusCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any; rpc: (n: string) => any };
const PROJECT_REF = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

type Samtal = {
  id: number; skapad: string; namn: string; foretag: string | null; telefon: string | null; arende: string;
  kategori: string; atgard: string; bradskande: boolean; basta_tid: string | null; status: string;
  vd_anteckning: string | null; sms_status: string | null;
};

const KAT: Record<string, string> = {
  kund: "Kund", personal: "Personal", leverantor: "Leverantör", saljare: "Säljare", myndighet: "Myndighet",
  bank_revisor_jurist: "Bank/revisor/jurist", privat: "Privat", ovrigt: "Övrigt",
};
const ATG: Record<string, string> = { koppla: "Kopplade", meddelande: "Meddelanden", hanvisad: "Hänvisade", avbojd: "Avböjda" };
const fmt = (v: string) => new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Stockholm" });

function startOfTodaySthlm(): Date {
  const d = new Date();
  const s = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const local = new Date(`${s}T00:00:00`);
  // justera för skillnad mellan webbläsarens zon och Stockholm
  const sthlm = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
  return new Date(local.getTime() - (sthlm.getTime() - d.getTime()));
}

/** SE-mobilnummer: samma regel som serverns normalizePhoneSe. */
function normalizePhoneSe(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("46")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^7\d{8}$/.test(d) ? `+46${d}` : null;
}

function Siffror({ rows, label }: { rows: Samtal[]; label: string }) {
  const per = (k: "atgard" | "kategori", v: string) => rows.filter((r) => r[k] === v).length;
  const kats = Object.keys(KAT).filter((k) => per("kategori", k) > 0);
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 text-sm font-semibold">{label} <span className="font-mono tabular-nums text-muted-foreground">({rows.length})</span></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(ATG).map(([k, l]) => (
          <div key={k} className="rounded bg-muted p-2">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="font-mono text-xl tabular-nums">{per("atgard", k)}</div>
          </div>
        ))}
      </div>
      {kats.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {kats.map((k) => <span key={k}>{KAT[k]} <span className="font-mono tabular-nums">{per("kategori", k)}</span></span>)}
        </div>
      )}
    </div>
  );
}

function Rad({ r, onSaved }: { r: Samtal; onSaved: () => void }) {
  const [note, setNote] = useState(r.vd_anteckning ?? "");
  const save = async (patch: Partial<Samtal>) => {
    const { error } = await db.from("telefonsamtal").update(patch).eq("id", r.id);
    if (error) toast.error("Kunde inte spara."); else { toast.success("Sparat."); onSaved(); }
  };
  return (
    <li className={`rounded-md border bg-card p-3 ${r.bradskande ? "border-l-4 border-l-destructive" : ""} ${r.status === "klar" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-mono tabular-nums text-muted-foreground">{fmt(r.skapad)}</span>
        <span className="break-words font-semibold">{r.namn}</span>
        {r.foretag && <span className="break-words text-muted-foreground">{r.foretag}</span>}
        {r.bradskande && <span className="rounded bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">Brådskande</span>}
        <span className="rounded bg-muted px-1.5 text-xs">{KAT[r.kategori] ?? r.kategori}</span>
        <span className="rounded bg-muted px-1.5 text-xs">{ATG[r.atgard] ?? r.atgard}</span>
        {r.atgard === "meddelande" && <span className="text-xs text-muted-foreground">Status: {r.status}</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-base">{r.arende}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {r.telefon && (
          <a href={`tel:${r.telefon.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline">
            <Phone className="h-4 w-4" /> {r.telefon}
          </a>
        )}
        {r.basta_tid && <span className="self-center">Bästa tid: {r.basta_tid}</span>}
        {r.atgard === "koppla" && r.sms_status && <span className="self-center text-muted-foreground">Sms: {r.sms_status}</span>}
      </div>
      {r.atgard === "meddelande" && (
        <div className="mt-2 space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Egen anteckning" className="text-base" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="min-h-11" disabled={r.status !== "ny"} onClick={() => save({ status: "läst", vd_anteckning: note || null })}>Markera läst</Button>
            <Button size="sm" className="min-h-11" disabled={r.status === "klar"} onClick={() => save({ status: "klar", vd_anteckning: note || null })}>Klar</Button>
            {note !== (r.vd_anteckning ?? "") && <Button size="sm" variant="ghost" className="min-h-11" onClick={() => save({ vd_anteckning: note || null })}>Spara anteckning</Button>}
          </div>
        </div>
      )}
    </li>
  );
}

function KopplaPanel() {
  const qc = useQueryClient();
  const status = useTelefonStatus();
  const inst = useQuery({
    queryKey: ["telefon_installningar"],
    queryFn: async () => {
      const { data, error } = await db.from("telefon_installningar").select("*").maybeSingle();
      if (error) throw error;
      return data as { vd_sms_nummer: string | null; sms_vid_koppling: boolean } | null;
    },
  });
  const [nr, setNr] = useState<string | null>(null);
  const [adress, setAdress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nrVal = nr ?? inst.data?.vd_sms_nummer ?? "";

  const skapa = async () => {
    if (status.data && (status.data as unknown as { aktiv_nyckel?: boolean }).aktiv_nyckel &&
      !window.confirm("Den gamla adressen slutar gälla direkt. Fortsätta?")) return;
    setBusy(true);
    const { data, error } = await db.rpc("skapa_telefonnyckel");
    setBusy(false);
    if (error || !data) return toast.error("Kunde inte skapa adress.");
    setAdress(`https://${PROJECT_REF}.supabase.co/functions/v1/telefon-mcp/${data}`);
    qc.invalidateQueries({ queryKey: ["telefon_status"] });
  };
  const upd = async (patch: Record<string, unknown>) => {
    const { error } = await db.from("telefon_installningar").update(patch).eq("id", true);
    if (error) toast.error("Kunde inte spara."); else { toast.success("Sparat."); qc.invalidateQueries({ queryKey: ["telefon_installningar"] }); }
  };
  const sparaNr = () => {
    if (!nrVal.trim()) return upd({ vd_sms_nummer: null });
    const n = normalizePhoneSe(nrVal);
    if (!n) return toast.error("Ange ett svenskt mobilnummer, t.ex. 070-123 45 67.");
    setNr(n);
    upd({ vd_sms_nummer: n });
  };

  return (
    <section className="space-y-3 rounded-md border p-3">
      <h2 className="text-base font-semibold">Koppla telefonist</h2>
      <div className="space-y-2">
        <Button className="min-h-11" onClick={skapa} disabled={busy}>Skapa ny adress</Button>
        {adress && (
          <div className="space-y-2 rounded border border-primary bg-muted p-2 text-sm">
            <p className="break-all font-mono">{adress}</p>
            <Button size="sm" variant="outline" className="min-h-11" onClick={() => { navigator.clipboard.writeText(adress); toast.success("Kopierad."); }}>
              <Copy className="mr-1 h-4 w-4" /> Kopiera
            </Button>
            <p>Adressen visas bara nu. Den gamla adressen slutar gälla direkt.</p>
            <p>Klistra in adressen i Lynes under Upptäck MCP-verktyg, tryck Upptäck och spara.</p>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Nyckeln användes senast: {status.data?.senast_anvand ? fmt(status.data.senast_anvand) : "aldrig"}
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="vdnr">VD:s sms-nummer</label>
        <div className="flex flex-wrap gap-2">
          <Input id="vdnr" inputMode="tel" className="max-w-xs text-base" value={nrVal} onChange={(e) => setNr(e.target.value)} placeholder="+46701234567" />
          <Button variant="outline" className="min-h-11" onClick={sparaNr}>Spara</Button>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Switch checked={inst.data?.sms_vid_koppling ?? true} onCheckedChange={(v) => upd({ sms_vid_koppling: v })} />
          Sms vid koppling
        </label>
        <p className="text-sm text-muted-foreground">
          Senaste sms-utfall: {status.data?.senaste_sms_status ?? "inget skickat än"}
          {status.data?.senaste_sms_tid ? ` (${fmt(status.data.senaste_sms_tid)})` : ""}
        </p>
      </div>
    </section>
  );
}

export default function SamtalPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("meddelanden");
  const q = useQuery({
    queryKey: ["telefonsamtal"],
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString();
      const { data, error } = await db.from("telefonsamtal").select("*").gte("skapad", since).order("skapad", { ascending: false }).limit(2000);
      if (error) throw error;
      return data as Samtal[];
    },
    refetchInterval: 30_000,
  });
  const rows = q.data ?? [];
  const idag = startOfTodaySthlm().getTime();
  const vecka = Date.now() - 7 * 86400_000;
  const statusOrd: Record<string, number> = { ny: 0, "läst": 1, klar: 2 };
  const lista = useMemo(() => {
    if (tab === "meddelanden") return rows.filter((r) => r.atgard === "meddelande").sort((a, b) => (statusOrd[a.status] - statusOrd[b.status]) || b.skapad.localeCompare(a.skapad));
    if (tab === "kopplade") return rows.filter((r) => r.atgard === "koppla");
    if (tab === "ovriga") return rows.filter((r) => r.atgard === "hanvisad" || r.atgard === "avbojd");
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["telefonsamtal"] }); qc.invalidateQueries({ queryKey: ["telefon-nya-meddelanden"] }); };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4">
      <h1 className="text-xl font-semibold">Samtal</h1>
      {q.error && <p className="text-sm text-destructive">Kunde inte läsa samtal. Sidan är endast för administratörer.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <Siffror label="I dag" rows={rows.filter((r) => new Date(r.skapad).getTime() >= idag)} />
        <Siffror label="Senaste 7 dagarna" rows={rows.filter((r) => new Date(r.skapad).getTime() >= vecka)} />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="meddelanden" className="min-h-10">Meddelanden</TabsTrigger>
          <TabsTrigger value="kopplade" className="min-h-10">Kopplade</TabsTrigger>
          <TabsTrigger value="ovriga" className="min-h-10">Hänvisade och avböjda</TabsTrigger>
          <TabsTrigger value="alla" className="min-h-10">Alla</TabsTrigger>
        </TabsList>
      </Tabs>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Laddar…</p> : lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga samtal här.</p>
      ) : (
        <ul className="space-y-2">{lista.map((r) => <Rad key={`${r.id}-${r.status}-${r.vd_anteckning ?? ""}`} r={r} onSaved={refresh} />)}</ul>
      )}
      <KopplaPanel />
    </div>
  );
}
