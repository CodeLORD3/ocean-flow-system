import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Link2, Plus, Trash2 } from "lucide-react";

const db = supabase as unknown as { from: (t: string) => any };
const STATUSES = ["öppen", "åtgärdad", "skickad", "avslutad"] as const;
const ENTITIES: Record<string, string> = { "fsab-se": "Fisk & Skaldjursspecialisten No.1 AB", "de-no1": "DE No.1 AB", "fsab-ch": "Componia AG" };
const ALL = "__alla";

type Case = {
  id: string; myndighet: string; diarienummer: string | null; legal_entity_id: string; store_id: string | null;
  beslutsdatum: string | null; krav: string; atgard: string | null; deadline: string | null; status: string;
  ansvarig: string | null; bevis: { url: string; text?: string }[]; skapad: string; uppdaterad: string;
};
type Linked = { link_id: string; link_type: string; datum: string | null; titel: string; status: string; photos: { url: string; caption: string | null }[] };

const todayStr = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
const daysLeft = (d: string | null) => d == null ? null : Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${todayStr()}T12:00:00Z`)) / 86400000);
const svDate = (d: string | null) => d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("sv-SE") : "–";
const active = (c: Case) => c.status === "öppen" || c.status === "åtgärdad";

function DeadlineFlag({ c }: { c: Case }) {
  const n = daysLeft(c.deadline);
  if (n == null || !active(c)) return null;
  if (n < 0) return <Badge variant="destructive">Passerad {-n} d</Badge>;
  if (n <= 14) return <Badge className="bg-warning text-warning-foreground">{n} d kvar</Badge>;
  return null;
}

async function toDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = data; });
    // Komprimera till JPEG för rimlig filstorlek.
    const c = document.createElement("canvas"); const s = Math.min(1, 1200 / Math.max(img.width, img.height));
    c.width = img.width * s; c.height = img.height * s; c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/jpeg", 0.8), w: c.width, h: c.height };
  } catch { return null; }
}

async function exportPdf(c: Case, storeName: string, links: Linked[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFontSize(16); doc.text(`Myndighetsärende – ${c.myndighet}`, 14, 18);
  doc.setFontSize(10);
  autoTable(doc, {
    startY: 24, theme: "plain", styles: { fontSize: 10, cellPadding: 1.5 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } },
    body: [
      ["Diarienummer", c.diarienummer ?? "–"], ["Bolag", ENTITIES[c.legal_entity_id] ?? c.legal_entity_id], ["Butik", storeName || "–"],
      ["Beslutsdatum", svDate(c.beslutsdatum)], ["Deadline", svDate(c.deadline)], ["Status", c.status], ["Ansvarig", c.ansvarig ?? "–"],
      ["Krav", c.krav], ["Åtgärd", c.atgard ?? "–"],
    ],
  });
  let y = (doc as any).lastAutoTable.finalY + 6;
  if (links.length) {
    autoTable(doc, { startY: y, head: [["Typ", "Datum", "Post", "Status"]], styles: { fontSize: 9 },
      body: links.map((l) => [l.link_type === "deviation" ? "Avvikelse" : "Kontroll", svDate(l.datum), l.titel, l.status]) });
    y = (doc as any).lastAutoTable.finalY + 6;
  }
  const photos = [...c.bevis.map((b) => ({ url: b.url, caption: b.text ?? null })), ...links.flatMap((l) => l.photos)];
  if (photos.length) {
    doc.setFontSize(12); doc.text("Bevisfoton", 14, y); y += 4;
    for (const p of photos) {
      const img = await toDataUrl(p.url);
      if (!img) continue;
      const w = 90, h = (img.h / img.w) * w;
      if (y + h + 8 > 285) { doc.addPage(); y = 16; }
      doc.addImage(img.data, "JPEG", 14, y, w, h); y += h + 2;
      if (p.caption) { doc.setFontSize(9); doc.text(p.caption.slice(0, 120), 14, y + 3); y += 5; }
      y += 4;
    }
  }
  doc.setFontSize(8); doc.text(`Exporterad ${new Date().toLocaleString("sv-SE")}`, 14, 292);
  doc.save(`myndighetsarende-${(c.diarienummer || c.id.slice(0, 8)).replace(/[^\w-]+/g, "_")}.pdf`);
}

export default function Myndighetsarenden() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState(ALL);
  const [fStore, setFStore] = useState(ALL);
  const [fMynd, setFMynd] = useState(ALL);

  const { data: stores } = useQuery({ queryKey: ["ma-stores"], queryFn: async () => (await db.from("stores").select("id,name,legal_entity_id").eq("active", true).order("name")).data ?? [] });
  const { data: cases } = useQuery({ queryKey: ["authority-cases"], queryFn: async () => ((await db.from("authority_cases").select("*").order("deadline", { ascending: true, nullsFirst: false })).data ?? []) as Case[] });
  const storeName = (id: string | null) => (stores ?? []).find((s: any) => s.id === id)?.name ?? "";
  const myndigheter = useMemo(() => [...new Set((cases ?? []).map((c) => c.myndighet))].sort(), [cases]);
  const list = (cases ?? []).filter((c) => (fStatus === ALL || c.status === fStatus) && (fStore === ALL || c.store_id === fStore) && (fMynd === ALL || c.myndighet === fMynd));

  const create = async () => {
    const { data, error } = await db.from("authority_cases").insert({ myndighet: "Miljöförvaltningen", legal_entity_id: "fsab-se", krav: "Nytt krav – fyll i", status: "öppen" }).select().single();
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["authority-cases"] }); setOpenId(data.id);
  };

  const open = (cases ?? []).find((c) => c.id === openId);
  if (open) return <CaseDetail key={open.id} c={open} stores={stores ?? []} onBack={() => setOpenId(null)} />;

  return (
    <div className="p-4 space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Myndighetsärenden</h1>
          <p className="text-sm text-muted-foreground">Förelägganden och krav från kontrollmyndigheter, med åtgärder och bevis.</p>
        </div>
        <Button onClick={create}><Plus className="h-4 w-4 mr-1" />Nytt ärende</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Alla statusar</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Select value={fStore} onValueChange={setFStore}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Alla butiker</SelectItem>{(stores ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
        <Select value={fMynd} onValueChange={setFMynd}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Alla myndigheter</SelectItem>{myndigheter.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
        <span className="self-center text-sm text-muted-foreground font-mono tabular-nums">{list.length} ärenden</span>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Myndighet</TableHead><TableHead>Diarienr</TableHead><TableHead>Butik</TableHead><TableHead>Krav</TableHead><TableHead>Deadline</TableHead><TableHead>Status</TableHead><TableHead>Ansvarig</TableHead></TableRow></TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Inga myndighetsärenden</TableCell></TableRow>}
            {list.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenId(c.id)}>
                <TableCell>{c.myndighet}</TableCell>
                <TableCell className="font-mono">{c.diarienummer ?? "–"}</TableCell>
                <TableCell>{storeName(c.store_id) || <span className="text-muted-foreground">Hela bolaget</span>}</TableCell>
                <TableCell className="max-w-xs truncate">{c.krav}</TableCell>
                <TableCell className="whitespace-nowrap"><span className="font-mono tabular-nums mr-2">{svDate(c.deadline)}</span><DeadlineFlag c={c} /></TableCell>
                <TableCell><Badge variant="secondary">{c.status}</Badge></TableCell>
                <TableCell>{c.ansvarig ?? "–"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CaseDetail({ c, stores, onBack }: { c: Case; stores: any[]; onBack: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Case>(c);
  const [newProof, setNewProof] = useState({ url: "", text: "" });
  const [linkType, setLinkType] = useState<"deviation" | "control_record">("deviation");
  const [linkId, setLinkId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: links } = useQuery({
    queryKey: ["authority-case-links", c.id],
    queryFn: async (): Promise<Linked[]> => {
      const { data: l } = await db.from("authority_case_links").select("link_type,link_id").eq("case_id", c.id);
      const devIds = (l ?? []).filter((x: any) => x.link_type === "deviation").map((x: any) => x.link_id);
      const crIds = (l ?? []).filter((x: any) => x.link_type === "control_record").map((x: any) => x.link_id);
      const ids = [...devIds, ...crIds];
      const [dev, cr, direct, viaLinks] = await Promise.all([
        devIds.length ? db.from("deviations").select("id,title,created_at,closed_at,due_date").in("id", devIds) : { data: [] },
        crIds.length ? db.from("control_records").select("id,measured_at,status,comment,value_numeric,value_text").in("id", crIds) : { data: [] },
        ids.length ? db.from("entity_images").select("entity_id,url,caption").in("entity_id", ids) : { data: [] },
        ids.length ? db.from("image_links").select("entity_id, entity_images(url,caption)").in("entity_id", ids) : { data: [] },
      ]);
      const photos = (id: string) => [
        ...(direct.data ?? []).filter((p: any) => p.entity_id === id).map((p: any) => ({ url: p.url, caption: p.caption })),
        ...(viaLinks.data ?? []).filter((p: any) => p.entity_id === id && p.entity_images).map((p: any) => ({ url: p.entity_images.url, caption: p.entity_images.caption })),
      ].filter((p, i, a) => a.findIndex((q) => q.url === p.url) === i);
      return [
        ...(dev.data ?? []).map((d: any) => ({ link_id: d.id, link_type: "deviation", datum: d.created_at, titel: d.title, status: d.closed_at ? "stängd" : "öppen", photos: photos(d.id) })),
        ...(cr.data ?? []).map((r: any) => ({ link_id: r.id, link_type: "control_record", datum: r.measured_at, titel: r.comment ?? r.value_text ?? String(r.value_numeric ?? "Kontroll"), status: r.status ?? "–", photos: photos(r.id) })),
      ];
    },
  });
  const { data: candidates } = useQuery({
    queryKey: ["ma-candidates", linkType, f.store_id],
    queryFn: async () => {
      if (linkType === "deviation") {
        let q = db.from("deviations").select("id,title,created_at").order("created_at", { ascending: false }).limit(100);
        if (f.store_id) q = q.eq("store_id", f.store_id);
        return ((await q).data ?? []).map((d: any) => ({ id: d.id, label: `${svDate(d.created_at)} – ${d.title}` }));
      }
      const { data } = await db.from("control_records").select("id,measured_at,status,comment").order("measured_at", { ascending: false }).limit(100);
      return (data ?? []).map((r: any) => ({ id: r.id, label: `${svDate(r.measured_at)} – ${r.status ?? ""} ${r.comment ?? ""}` }));
    },
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["authority-cases"] }); qc.invalidateQueries({ queryKey: ["authority-case-links", c.id] }); };
  const save = async (patch?: Partial<Case>) => {
    const row = { ...f, ...patch };
    setBusy(true);
    const { error } = await db.from("authority_cases").update({
      myndighet: row.myndighet, diarienummer: row.diarienummer || null, legal_entity_id: row.legal_entity_id, store_id: row.store_id,
      beslutsdatum: row.beslutsdatum || null, krav: row.krav, atgard: row.atgard || null, deadline: row.deadline || null,
      status: row.status, ansvarig: row.ansvarig || null, bevis: row.bevis,
    }).eq("id", c.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setF(row); toast.success("Sparat"); refresh();
  };
  const addLink = async () => {
    const { error } = await db.from("authority_case_links").insert({ case_id: c.id, link_type: linkType, link_id: linkId });
    if (error) return toast.error(error.message);
    setLinkId(""); refresh();
  };
  const removeLink = async (l: Linked) => {
    await db.from("authority_case_links").delete().eq("case_id", c.id).eq("link_type", l.link_type).eq("link_id", l.link_id); refresh();
  };
  const remove = async () => {
    if (!confirm("Ta bort ärendet?")) return;
    const { error } = await db.from("authority_cases").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    refresh(); onBack();
  };
  const field = (label: string, el: React.ReactNode) => <div className="space-y-1"><Label className="text-xs">{label}</Label>{el}</div>;
  const storeName = stores.find((s) => s.id === f.store_id)?.name ?? "";

  return (
    <div className="p-4 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Myndighetsärenden</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportPdf(f, storeName, links ?? []).catch((e) => toast.error(String(e)))}><FileDown className="h-4 w-4 mr-1" />Exportera PDF</Button>
          <Button variant="ghost" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{f.myndighet} {f.diarienummer && <span className="font-mono text-muted-foreground">{f.diarienummer}</span>}</h1><DeadlineFlag c={f} /></div>

      <section className="rounded-md border bg-card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field("Myndighet", <Input value={f.myndighet} onChange={(e) => setF({ ...f, myndighet: e.target.value })} />)}
        {field("Diarienummer", <Input className="font-mono" value={f.diarienummer ?? ""} onChange={(e) => setF({ ...f, diarienummer: e.target.value })} />)}
        {field("Bolag", <Select value={f.legal_entity_id} onValueChange={(v) => setF({ ...f, legal_entity_id: v })}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(ENTITIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>)}
        {field("Butik", <Select value={f.store_id ?? ALL} onValueChange={(v) => setF({ ...f, store_id: v === ALL ? null : v })}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Hela bolaget</SelectItem>{stores.filter((s) => s.legal_entity_id === f.legal_entity_id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>)}
        {field("Beslutsdatum", <Input type="date" value={f.beslutsdatum ?? ""} onChange={(e) => setF({ ...f, beslutsdatum: e.target.value })} />)}
        {field("Deadline", <Input type="date" value={f.deadline ?? ""} onChange={(e) => setF({ ...f, deadline: e.target.value })} />)}
        {field("Ansvarig (fullständigt namn)", <Input value={f.ansvarig ?? ""} onChange={(e) => setF({ ...f, ansvarig: e.target.value })} />)}
        {field("Status", <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>)}
        <div className="sm:col-span-2">{field("Krav", <Textarea rows={4} value={f.krav} onChange={(e) => setF({ ...f, krav: e.target.value })} />)}</div>
        <div className="sm:col-span-2">{field("Åtgärder", <Textarea rows={4} value={f.atgard ?? ""} onChange={(e) => setF({ ...f, atgard: e.target.value })} />)}</div>
        <div className="sm:col-span-2 flex justify-between text-xs text-muted-foreground">
          <span>Skapad {new Date(f.skapad).toLocaleString("sv-SE")} · uppdaterad {new Date(f.uppdaterad).toLocaleString("sv-SE")}</span>
          <Button size="sm" disabled={busy} onClick={() => save()}>Spara</Button>
        </div>
      </section>

      <section className="rounded-md border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Kopplade avvikelser och kontroller</h2>
        <div className="flex flex-wrap gap-2">
          <Select value={linkType} onValueChange={(v: any) => { setLinkType(v); setLinkId(""); }}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="deviation">Avvikelse</SelectItem><SelectItem value="control_record">Kontroll</SelectItem></SelectContent></Select>
          <Select value={linkId} onValueChange={setLinkId}><SelectTrigger className="flex-1 min-w-[16rem]"><SelectValue placeholder={(candidates ?? []).length ? "Välj post" : "Inga poster att koppla"} /></SelectTrigger>
            <SelectContent>{(candidates ?? []).map((x: any) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}</SelectContent></Select>
          <Button disabled={!linkId} onClick={addLink}><Link2 className="h-4 w-4 mr-1" />Koppla</Button>
        </div>
        {(links ?? []).length === 0 && <p className="text-sm text-muted-foreground">Inga kopplade poster.</p>}
        {(links ?? []).map((l) => (
          <div key={l.link_type + l.link_id} className="border-t pt-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span><Badge variant="outline" className="mr-2">{l.link_type === "deviation" ? "Avvikelse" : "Kontroll"}</Badge><span className="font-mono mr-2">{svDate(l.datum)}</span>{l.titel} <span className="text-muted-foreground">· {l.status}</span></span>
              <Button size="sm" variant="ghost" onClick={() => removeLink(l)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {l.photos.length > 0 && <div className="flex gap-2 flex-wrap mt-2">{l.photos.map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.caption ?? "Bevisfoto"} className="h-20 w-20 object-cover rounded" /></a>)}</div>}
          </div>
        ))}
      </section>

      <section className="rounded-md border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Övriga bevis (bildlänkar)</h2>
        <div className="flex gap-2 flex-wrap">
          {f.bevis.map((b, i) => (
            <div key={i} className="relative">
              <a href={b.url} target="_blank" rel="noreferrer"><img src={b.url} alt={b.text ?? "Bevis"} className="h-20 w-20 object-cover rounded" /></a>
              <button className="absolute top-0 right-0 bg-background/80 rounded p-0.5" onClick={() => save({ bevis: f.bevis.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input className="flex-1 min-w-[14rem]" placeholder="Bildadress" value={newProof.url} onChange={(e) => setNewProof({ ...newProof, url: e.target.value })} />
          <Input className="w-56" placeholder="Beskrivning" value={newProof.text} onChange={(e) => setNewProof({ ...newProof, text: e.target.value })} />
          <Button disabled={!newProof.url.startsWith("http")} onClick={() => { save({ bevis: [...f.bevis, newProof] }); setNewProof({ url: "", text: "" }); }}>Lägg till</Button>
        </div>
      </section>
    </div>
  );
}
