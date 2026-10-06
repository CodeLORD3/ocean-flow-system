import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { edgeErrorMessage } from "@/lib/edgeError";

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: any) => any };

export const TG_CATEGORIES: Record<string, string> = {
  schema_pass: "Schema och pass", fraga: "Fråga", lager_rapport: "Lager och rapport", ide_klagomal: "Idé och klagomål", ovrigt: "Övrigt",
};
const STATUSES = ["ny", "pågår", "väntar på svar", "klar"] as const;
const STATUS_ORDER: Record<string, number> = { ny: 0, pågår: 1, "väntar på svar": 2, klar: 3 };
const QUICK = [
  "Tack, vi tittar på det och återkommer.",
  "Tack för att du hör av dig! Din butikschef kontaktar dig.",
  "Schemat finns i Makrill-appen under Schema.",
  "Klart, tack!",
];
const ALL = "__alla";

interface Msg {
  id: string; conv_key: string; chat_id: number; chat_type: string; thread_id: number | null; telegram_user_id: number | null;
  employee_id: string | null; store_id: string | null; legal_entity_id: string | null; direction: "in" | "ut"; kind: string;
  body: string | null; file_id: string | null; status: string; error: string | null; sent_by: string | null; ai_generated: boolean;
  category: string | null; conversation_status: string; assigned_to: string | null; created_at: string; business_connection_id: string | null;
}

const fmt = (v: string) => new Date(v).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" });

function MediaView({ fileId, kind }: { fileId: string; kind: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true; let made: string | null = null;
    supabase.functions.invoke("telegram-send", { body: { action: "file", file_id: fileId } }).then(async ({ data, error }) => {
      if (!alive) return;
      if (error) { setErr(await edgeErrorMessage(error, "Filen kunde inte hämtas")); return; }
      made = URL.createObjectURL(data as Blob); setUrl(made);
    });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [fileId]);
  if (err) return <p className="text-xs text-muted-foreground">{err}</p>;
  if (!url) return <p className="text-xs text-muted-foreground">Hämtar fil…</p>;
  if (kind === "voice") return <audio controls src={url} className="w-full max-w-xs" />;
  if (kind === "photo") return <img src={url} alt="Bild från Telegram" className="max-h-64 max-w-full rounded" />;
  return <a href={url} target="_blank" rel="noreferrer" className="text-sm underline">Öppna dokument</a>;
}

export default function TelegramInbox() {
  const qc = useQueryClient();
  const [company, setCompany] = useState(ALL);
  const [store, setStore] = useState(ALL);
  const [cat, setCat] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [bcOpen, setBcOpen] = useState(false);
  const [bcType, setBcType] = useState<"all" | "company" | "store" | "group">("all");
  const [bcId, setBcId] = useState("");
  const [bcText, setBcText] = useState("");
  const [bcCount, setBcCount] = useState<number | null>(null);

  const msgs = useQuery({
    queryKey: ["telegram_messages"],
    queryFn: async () => {
      const { data, error } = await db.from("telegram_messages").select("*").order("created_at", { ascending: false }).limit(3000);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
    refetchInterval: 30000,
  });
  const lookups = useQuery({
    queryKey: ["telegram_lookups"],
    queryFn: async () => {
      const [e, s, l, a, st] = await Promise.all([
        db.from("employees").select("id, first_name, last_name"),
        db.from("stores").select("id, name, legal_entity_id").order("name"),
        db.from("legal_entities").select("legal_entity_id, legal_name").order("legal_name"),
        db.rpc("telegram_assignees"),
        db.from("staff").select("user_id, first_name, last_name").not("user_id", "is", null),
      ]);
      return {
        emp: new Map<string, string>((e.data ?? []).map((x: any) => [x.id, `${x.first_name ?? ""} ${x.last_name ?? ""}`.trim()])),
        stores: (s.data ?? []) as { id: string; name: string; legal_entity_id: string | null }[],
        companies: (l.data ?? []) as { legal_entity_id: string; legal_name: string }[],
        assignees: (a.data ?? []) as { user_id: string; full_name: string; label: string }[],
        users: new Map<string, string>((st.data ?? []).map((x: any) => [x.user_id, `${x.first_name} ${x.last_name}`])),
      };
    },
  });
  const L = lookups.data;
  const storeName = (id: string | null) => L?.stores.find((s) => s.id === id)?.name ?? "–";
  const companyName = (id: string | null) => L?.companies.find((c) => c.legal_entity_id === id)?.legal_name ?? id ?? "–";

  const convs = useMemo(() => {
    const m = new Map<string, Msg[]>();
    (msgs.data ?? []).forEach((r) => { if (!m.has(r.conv_key)) m.set(r.conv_key, []); m.get(r.conv_key)!.push(r); });
    return [...m.entries()].map(([key, rows]) => {
      const last = rows[0];
      const withEmp = rows.find((r) => r.employee_id);
      const isGroup = key.startsWith("g:");
      return {
        key, rows, last, isGroup,
        name: isGroup ? `Personalgruppen${last.thread_id ? ` · ämne ${last.thread_id}` : ""}` : (withEmp && L?.emp.get(withEmp.employee_id!)) || `Okänd (${last.chat_id})`,
        store_id: withEmp?.store_id ?? null, legal_entity_id: withEmp?.legal_entity_id ?? null,
      };
    })
      .filter((c) => company === ALL || c.legal_entity_id === company)
      .filter((c) => store === ALL || c.store_id === store)
      .filter((c) => cat === ALL || c.last.category === cat)
      .filter((c) => status === ALL || c.last.conversation_status === status)
      .sort((a, b) => (STATUS_ORDER[a.last.conversation_status] - STATUS_ORDER[b.last.conversation_status]) || b.last.created_at.localeCompare(a.last.created_at));
  }, [msgs.data, L, company, store, cat, status]);

  const cur = convs.find((c) => c.key === open) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["telegram_messages"] });

  const setConv = async (patch: { _status?: string; _category?: string }) => {
    if (!cur) return;
    const { error } = await db.rpc("telegram_set_conversation", { _conv_key: cur.key, _status: patch._status ?? null, _category: patch._category ?? null });
    error ? toast.error(error.message) : refresh();
  };
  const assign = async (uid: string) => {
    if (!cur) return;
    const { error } = await db.rpc("telegram_assign", { _conv_key: cur.key, _user_id: uid });
    error ? toast.error(error.message) : (toast.success("Tilldelad, notis skickad"), refresh());
  };
  const send = async () => {
    if (!cur || !text.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("telegram-send", { body: { target: { type: "conversation", id: cur.key }, text } });
    setBusy(false);
    if (error) { toast.error(await edgeErrorMessage(error)); return; }
    if ((data as any)?.failed) toast.error("Meddelandet kunde inte skickas"); else toast.success("Skickat");
    setText(""); refresh();
  };
  const bcTarget = () => (bcType === "all" ? { type: "all" } : bcType === "group" ? { type: "group", thread_id: bcId ? Number(bcId) : null } : { type: bcType, id: bcId });
  const preview = async () => {
    const { data, error } = await supabase.functions.invoke("telegram-send", { body: { target: bcTarget(), preview: true } });
    if (error) { toast.error(await edgeErrorMessage(error)); return; }
    setBcCount((data as any).recipients);
  };
  const broadcast = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("telegram-send", { body: { target: bcTarget(), text: bcText } });
    setBusy(false);
    if (error) { toast.error(await edgeErrorMessage(error)); return; }
    toast.success(`Skickat till ${(data as any).sent}, misslyckade ${(data as any).failed}`);
    setBcOpen(false); setBcText(""); setBcCount(null); refresh();
  };

  const filters = (
    <div className="flex flex-wrap gap-2">
      <Select value={company} onValueChange={setCompany}><SelectTrigger className="w-48"><SelectValue placeholder="Bolag" /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>Alla bolag</SelectItem>{L?.companies.map((c) => <SelectItem key={c.legal_entity_id} value={c.legal_entity_id}>{c.legal_name}</SelectItem>)}</SelectContent></Select>
      <Select value={store} onValueChange={setStore}><SelectTrigger className="w-48"><SelectValue placeholder="Butik" /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>Alla butiker</SelectItem>{L?.stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
      <Select value={cat} onValueChange={setCat}><SelectTrigger className="w-44"><SelectValue placeholder="Kategori" /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>Alla kategorier</SelectItem>{Object.entries(TG_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>Alla statusar</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      <Button variant="outline" onClick={() => setBcOpen(true)}>Nytt utskick</Button>
    </div>
  );

  if (cur) {
    const rows = [...cur.rows].reverse();
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>← Inkorgen</Button>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold break-words">{cur.name}</h2>
          <p className="text-sm text-muted-foreground">{storeName(cur.store_id)} · {companyName(cur.legal_entity_id)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={cur.last.conversation_status} onValueChange={(v) => setConv({ _status: v })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <Select value={cur.last.category ?? ""} onValueChange={(v) => setConv({ _category: v })}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Kategori" /></SelectTrigger>
            <SelectContent>{Object.entries(TG_CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={cur.last.assigned_to ?? ""} onValueChange={assign}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Tilldela" /></SelectTrigger>
            <SelectContent>{L?.assignees.map((a) => <SelectItem key={a.user_id} value={a.user_id}>{a.full_name} ({a.label})</SelectItem>)}</SelectContent></Select>
        </div>
        <Card><CardContent className="space-y-2 p-3">
          {rows.map((r) => (
            <div key={r.id} className={`rounded p-2 ${r.direction === "ut" ? "ml-6 bg-muted" : "mr-6 border border-border"}`}>
              <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{fmt(r.created_at)}</span>
                <span>{r.direction === "in" ? (r.employee_id ? L?.emp.get(r.employee_id) : "Avsändare") : r.ai_generated ? "AI-utkast (godkänt)" : r.sent_by ? L?.users.get(r.sent_by) ?? "Personal" : r.business_connection_id ? "Kontoret" : "Automatsvar"}</span>
                {r.status === "fel" && <Badge variant="destructive">Fel: {r.error}</Badge>}
              </div>
              {r.body && <p className="whitespace-pre-wrap break-words text-sm">{r.body}</p>}
              {r.file_id && <MediaView fileId={r.file_id} kind={r.kind} />}
            </div>
          ))}
        </CardContent></Card>
        <div className="flex flex-wrap gap-1">{QUICK.map((q) => <Button key={q} size="sm" variant="outline" className="h-auto whitespace-normal text-left" onClick={() => setText(q)}>{q}</Button>)}</div>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv svar…" />
        <Button disabled={busy || !text.trim()} onClick={send}>Skicka svar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filters}
      {msgs.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
      {!msgs.isLoading && !convs.length && <p className="text-sm text-muted-foreground">Inga Telegram-meddelanden ännu.</p>}
      <div className="space-y-2">
        {convs.map((c) => (
          <button key={c.key} onClick={() => setOpen(c.key)} className="block w-full rounded border border-border p-3 text-left hover:bg-muted">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-words">{c.name}</span>
              <Badge variant={c.last.conversation_status === "ny" ? "default" : "secondary"}>{c.last.conversation_status}</Badge>
              {c.last.category && <Badge variant="outline">{TG_CATEGORIES[c.last.category]}</Badge>}
              {c.last.assigned_to && <span className="text-xs text-muted-foreground">→ {L?.users.get(c.last.assigned_to) ?? "tilldelad"}</span>}
            </div>
            <div className="text-xs text-muted-foreground">{c.isGroup ? "" : `${storeName(c.store_id)} · ${companyName(c.legal_entity_id)} · `}{fmt(c.last.created_at)}</div>
            <p className="line-clamp-2 break-words text-sm">{c.last.body ?? (c.last.kind === "voice" ? "Röstmeddelande" : c.last.kind === "photo" ? "Bild" : "Dokument")}</p>
          </button>
        ))}
      </div>

      <Dialog open={bcOpen} onOpenChange={(o) => { setBcOpen(o); setBcCount(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nytt utskick</DialogTitle><DialogDescription>Går bara till anställda som kopplat Telegram och gett samtycke.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Select value={bcType} onValueChange={(v: any) => { setBcType(v); setBcId(""); setBcCount(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Alla</SelectItem><SelectItem value="company">Ett bolag</SelectItem><SelectItem value="store">En butik</SelectItem><SelectItem value="group">Personalgruppen (ämne)</SelectItem></SelectContent>
            </Select>
            {bcType === "company" && <Select value={bcId} onValueChange={(v) => { setBcId(v); setBcCount(null); }}><SelectTrigger><SelectValue placeholder="Bolag" /></SelectTrigger>
              <SelectContent>{L?.companies.map((c) => <SelectItem key={c.legal_entity_id} value={c.legal_entity_id}>{c.legal_name}</SelectItem>)}</SelectContent></Select>}
            {bcType === "store" && <Select value={bcId} onValueChange={(v) => { setBcId(v); setBcCount(null); }}><SelectTrigger><SelectValue placeholder="Butik" /></SelectTrigger>
              <SelectContent>{L?.stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>}
            {bcType === "group" && <input className="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Ämnets id (tomt = allmänt)" value={bcId} onChange={(e) => setBcId(e.target.value.replace(/\D/g, ""))} />}
            <Textarea rows={5} value={bcText} onChange={(e) => { setBcText(e.target.value); setBcCount(null); }} placeholder="Meddelande" />
            {bcText.trim() && <div className="rounded bg-muted p-2 text-sm whitespace-pre-wrap break-words">{bcText}</div>}
            {bcCount == null ? (
              <Button className="w-full" variant="outline" disabled={!bcText.trim() || ((bcType === "company" || bcType === "store") && !bcId)} onClick={preview}>Förhandsvisa mottagare</Button>
            ) : (
              <Button className="w-full" disabled={busy || bcCount === 0} onClick={broadcast}>Bekräfta och skicka till {bcCount} {bcType === "group" ? "grupp" : "mottagare"}</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
