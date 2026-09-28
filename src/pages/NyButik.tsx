import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Circle, SkipForward, X } from "lucide-react";

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: any) => any };

type StepKey = "butik" | "oppettider" | "kassa" | "personalkollen" | "checklistor" | "veckomal" | "hyra" | "fortnox" | "uppgift";
type Status = "väntar" | "klar" | "hoppad" | "fel";
const STEPS: { key: StepKey; title: string }[] = [
  { key: "butik", title: "1. Butik" },
  { key: "oppettider", title: "2. Öppettider" },
  { key: "kassa", title: "3. Kassa" },
  { key: "personalkollen", title: "4. Personalkollen" },
  { key: "checklistor", title: "5. Checklistmallar" },
  { key: "veckomal", title: "6. Veckomål (8 veckor)" },
  { key: "hyra", title: "7. Hyra" },
  { key: "fortnox", title: "8. Fortnox-kostnadsställe" },
  { key: "uppgift", title: "9. Uppgift till Driftchef" },
];
// Veckodagar visas måndag först; lagras 0 = söndag.
const DAYS = [
  { wd: 1, label: "Måndag" }, { wd: 2, label: "Tisdag" }, { wd: 3, label: "Onsdag" }, { wd: 4, label: "Torsdag" },
  { wd: 5, label: "Fredag" }, { wd: 6, label: "Lördag" }, { wd: 0, label: "Söndag" },
];
const ENTITIES = [
  { id: "fsab-se", label: "Fisk & Skaldjursspecialisten No.1 AB", country: "SE", currency: "SEK" },
  { id: "de-no1", label: "DE No.1 AB", country: "SE", currency: "SEK" },
  { id: "fsab-ch", label: "Componia AG", country: "CH", currency: "CHF" },
];
const REGIONS = ["stockholm", "vast", "schweiz"];
const todayStr = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

export default function NyButik() {
  const [status, setStatus] = useState<Record<StepKey, Status>>(Object.fromEntries(STEPS.map((s) => [s.key, "väntar"])) as any);
  const [errors, setErrors] = useState<Partial<Record<StepKey, string>>>({});
  const [busy, setBusy] = useState<StepKey | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  const [b, setB] = useState({ name: "", store_code: "", legal_entity_id: "fsab-se", region: "vast", address: "", city: "", manager: "", latitude: "", longitude: "", active: true });
  const entity = ENTITIES.find((e) => e.id === b.legal_entity_id)!;
  const [hours, setHours] = useState(DAYS.map((d) => ({ weekday: d.wd, open_time: "10:00", close_time: "18:00", closed: d.wd === 0 })));
  const [kassa, setKassa] = useState({ nimpos_store_code: "", register_id: "", merchant_code: "" });
  const [costgroup, setCostgroup] = useState("");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState({ target_sales_ex_vat: "", target_staff_cost_pct: "20", from_date: todayStr() });
  const [rent, setRent] = useState({ amount: "", valid_from: todayStr() });
  const [cc, setCc] = useState("");
  const [note, setNote] = useState("");

  const { data: costgroups } = useQuery({
    queryKey: ["ny-butik-costgroups"],
    queryFn: async () => (await db.from("pk_costgroups").select("id,name,short_identifier").is("store_id", null).eq("is_company_group", false).order("name")).data ?? [],
  });
  const { data: sources } = useQuery({
    queryKey: ["ny-butik-mallbutiker"],
    queryFn: async () => {
      const { data: t } = await db.from("checklist_templates").select("store_id").eq("active", true).not("store_id", "is", null);
      const ids = [...new Set((t ?? []).map((x: any) => x.store_id))];
      if (!ids.length) return [];
      return (await db.from("stores").select("id,name").in("id", ids).order("name")).data ?? [];
    },
  });

  const geocode = async () => {
    const q = [b.address, b.city, entity.country === "CH" ? "Schweiz" : "Sverige"].filter(Boolean).join(", ");
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "sv" } });
      const hit = (await res.json())?.[0];
      if (!hit) return toast.error("Adressen hittades inte – ange koordinater manuellt");
      setB((x) => ({ ...x, latitude: Number(hit.lat).toFixed(5), longitude: Number(hit.lon).toFixed(5) }));
      toast.success("Koordinater hämtade");
    } catch { toast.error("Geokodning misslyckades"); }
  };

  const run = async (key: StepKey, payload: Record<string, unknown>) => {
    if (key !== "butik" && !storeId) return toast.error("Skapa butiken först (steg 1)");
    setBusy(key);
    const { data, error } = await db.rpc("ny_butik_steg", { _step: key, _store_id: storeId, _p: payload });
    setBusy(null);
    if (error) {
      setStatus((s) => ({ ...s, [key]: "fel" }));
      setErrors((e) => ({ ...e, [key]: error.message }));
      return toast.error(error.message);
    }
    if (key === "butik") setStoreId(data.store_id);
    setStatus((s) => ({ ...s, [key]: "klar" }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const skip = (key: StepKey) => setStatus((s) => ({ ...s, [key]: "hoppad" }));

  const underlag = () => [
    `Butik: ${b.name} (${b.store_code})`, `Bolag: ${entity.label}`, `Region: ${b.region}`,
    `Adress: ${b.address}, ${b.city}`, `Butikschef: ${b.manager || "saknas"}`,
    `Öppettider: ${hours.map((h) => `${DAYS.find((d) => d.wd === h.weekday)!.label} ${h.closed ? "stängt" : `${h.open_time}–${h.close_time}`}`).join("; ")}`,
    `Veckomål: ${target.target_sales_ex_vat || "saknas"} ${entity.currency}`, `Hyra: ${rent.amount || "saknas"} ${entity.currency}/mån från ${rent.valid_from}`,
    `Fortnox-kostnadsställe: ${cc || "saknas"}`,
    `Guidestatus: ${STEPS.map((s) => `${s.title} ${status[s.key]}`).join(", ")}`,
    note && `Anteckning: ${note}`,
  ].filter(Boolean).join("\n");

  const done = (k: StepKey) => status[k] === "klar";
  const actions = (key: StepKey, payload: () => Record<string, unknown>, disabled = false) => (
    <div className="flex items-center gap-2 pt-2">
      <Button size="sm" disabled={busy !== null || done(key) || disabled} onClick={() => run(key, payload())}>{done(key) ? "Klart" : "Spara steg"}</Button>
      {key !== "butik" && !done(key) && <Button size="sm" variant="ghost" onClick={() => skip(key)}><SkipForward className="h-4 w-4 mr-1" />Hoppa över</Button>}
      {errors[key] && <span className="text-sm text-destructive">{errors[key]}</span>}
    </div>
  );
  const card = (key: StepKey, children: React.ReactNode) => {
    const st = status[key];
    return (
      <section key={key} className="rounded-md border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{STEPS.find((s) => s.key === key)!.title}</h2>
          <Badge variant={st === "klar" ? "default" : st === "fel" ? "destructive" : "secondary"}>{st}</Badge>
        </div>
        {children}
      </section>
    );
  };
  const field = (label: string, el: React.ReactNode) => <div className="space-y-1"><Label className="text-xs">{label}</Label>{el}</div>;
  const butikValid = b.name && /^[a-z0-9-]+$/.test(b.store_code) && b.city;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Ny butik</h1>
        <p className="text-sm text-muted-foreground">Varje steg sparas för sig och kan hoppas över och göras senare. Ett misslyckat steg påverkar inte de som redan är klara.</p>
      </div>

      {card("butik", <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field("Namn", <Input value={b.name} disabled={done("butik")} onChange={(e) => setB({ ...b, name: e.target.value })} placeholder="Fiskskaldjur …" />)}
          {field("Butikskod (små bokstäver, bindestreck)", <Input value={b.store_code} disabled={done("butik")} onChange={(e) => setB({ ...b, store_code: e.target.value.toLowerCase() })} />)}
          {field("Bolag", <Select value={b.legal_entity_id} disabled={done("butik")} onValueChange={(v) => setB({ ...b, legal_entity_id: v, region: v === "fsab-ch" ? "schweiz" : b.region })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ENTITIES.map((e) => <SelectItem key={e.id} value={e.id}>{e.label} ({e.currency})</SelectItem>)}</SelectContent>
          </Select>)}
          {field("Region", <Select value={b.region} disabled={done("butik")} onValueChange={(v) => setB({ ...b, region: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>)}
          {field("Adress", <Input value={b.address} disabled={done("butik")} onChange={(e) => setB({ ...b, address: e.target.value })} />)}
          {field("Ort", <Input value={b.city} disabled={done("butik")} onChange={(e) => setB({ ...b, city: e.target.value })} />)}
          {field("Butikschef (fullständigt namn)", <Input value={b.manager} disabled={done("butik")} onChange={(e) => setB({ ...b, manager: e.target.value })} />)}
          {field("Valuta", <Input value={entity.currency} disabled />)}
          {field("Latitud", <Input className="font-mono" value={b.latitude} disabled={done("butik")} onChange={(e) => setB({ ...b, latitude: e.target.value })} />)}
          {field("Longitud", <Input className="font-mono" value={b.longitude} disabled={done("butik")} onChange={(e) => setB({ ...b, longitude: e.target.value })} />)}
        </div>
        <div className="flex items-center gap-4">
          <Button size="sm" variant="outline" disabled={done("butik") || !b.city} onClick={geocode}>Geokoda från adressen</Button>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={b.active} disabled={done("butik")} onCheckedChange={(v) => setB({ ...b, active: v === true })} />Aktiv direkt</label>
        </div>
        {actions("butik", () => ({ ...b, country: entity.country, currency: entity.currency }), !butikValid)}
      </>)}

      {card("oppettider", <>
        <div className="space-y-1">
          {hours.map((h, i) => (
            <div key={h.weekday} className="grid grid-cols-[6rem_1fr_1fr_auto] items-center gap-2">
              <span className="text-sm">{DAYS.find((d) => d.wd === h.weekday)!.label}</span>
              <Input type="time" value={h.open_time} disabled={h.closed} onChange={(e) => setHours(hours.map((x, j) => j === i ? { ...x, open_time: e.target.value } : x))} />
              <Input type="time" value={h.close_time} disabled={h.closed} onChange={(e) => setHours(hours.map((x, j) => j === i ? { ...x, close_time: e.target.value } : x))} />
              <label className="flex items-center gap-1 text-sm"><Checkbox checked={h.closed} onCheckedChange={(v) => setHours(hours.map((x, j) => j === i ? { ...x, closed: v === true } : x))} />Stängt</label>
            </div>
          ))}
        </div>
        {actions("oppettider", () => ({ days: hours }))}
      </>)}

      {card("kassa", <>
        <p className="text-sm text-muted-foreground">Skapar kassaregister {b.store_code ? `MKR-POS-${b.store_code}-01` : ""} och {entity.country === "CH" ? "SumUp-koppling" : "Nimpos-koppling"}.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {entity.country === "CH"
            ? field("SumUp merchant code", <Input value={kassa.merchant_code} onChange={(e) => setKassa({ ...kassa, merchant_code: e.target.value })} />)
            : <>
              {field("Nimpos butikskod", <Input value={kassa.nimpos_store_code} onChange={(e) => setKassa({ ...kassa, nimpos_store_code: e.target.value })} />)}
              {field("Nimpos kassa-id (valfritt)", <Input value={kassa.register_id} onChange={(e) => setKassa({ ...kassa, register_id: e.target.value })} />)}
            </>}
        </div>
        {actions("kassa", () => kassa, entity.country === "CH" ? !kassa.merchant_code : !kassa.nimpos_store_code)}
      </>)}

      {card("personalkollen", <>
        {field("Omappad kostnadsgrupp", <Select value={costgroup} onValueChange={setCostgroup}>
          <SelectTrigger><SelectValue placeholder={(costgroups ?? []).length ? "Välj" : "Inga omappade kostnadsgrupper"} /></SelectTrigger>
          <SelectContent>{(costgroups ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name ?? c.short_identifier}</SelectItem>)}</SelectContent>
        </Select>)}
        {actions("personalkollen", () => ({ costgroup_id: costgroup }), !costgroup)}
      </>)}

      {card("checklistor", <>
        {field("Kopiera mallar från", <Select value={source} onValueChange={setSource}>
          <SelectTrigger><SelectValue placeholder="Välj mallbutik" /></SelectTrigger>
          <SelectContent>{(sources ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>)}
        <p className="text-xs text-muted-foreground">Kartplacering och tilldelad person kopieras inte, eftersom de hör till mallbutiken.</p>
        {actions("checklistor", () => ({ source_store_id: source }), !source)}
      </>)}

      {card("veckomal", <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {field(`Veckomål försäljning ex moms (${entity.currency})`, <Input className="font-mono" inputMode="numeric" value={target.target_sales_ex_vat} onChange={(e) => setTarget({ ...target, target_sales_ex_vat: e.target.value.replace(/[^\d]/g, "") })} />)}
          {field("Personalkostnad mål %", <Input className="font-mono" value={target.target_staff_cost_pct} onChange={(e) => setTarget({ ...target, target_staff_cost_pct: e.target.value })} />)}
          {field("Första veckan (datum)", <Input type="date" value={target.from_date} onChange={(e) => setTarget({ ...target, from_date: e.target.value })} />)}
        </div>
        {actions("veckomal", () => target, !target.target_sales_ex_vat)}
      </>)}

      {card("hyra", <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field(`Hyra per månad (${entity.currency})`, <Input className="font-mono" inputMode="numeric" value={rent.amount} onChange={(e) => setRent({ ...rent, amount: e.target.value.replace(/[^\d]/g, "") })} />)}
          {field("Från och med", <Input type="date" value={rent.valid_from} onChange={(e) => setRent({ ...rent, valid_from: e.target.value })} />)}
        </div>
        {actions("hyra", () => rent, !rent.amount)}
      </>)}

      {card("fortnox", <>
        {field("Kostnadsställe i Fortnox", <Input value={cc} onChange={(e) => setCc(e.target.value)} />)}
        {actions("fortnox", () => ({ cost_center: cc }), !cc.trim())}
      </>)}

      {card("uppgift", <>
        {field("Anteckning till Driftchef (valfri)", <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />)}
        <p className="text-xs text-muted-foreground">Butikens uppgifter och guidens status bifogas som underlag.</p>
        {actions("uppgift", () => ({ underlag: underlag() }))}
      </>)}

      <section className="rounded-md border bg-muted/40 p-4">
        <h2 className="font-semibold mb-2">Sammanfattning</h2>
        <ul className="space-y-1 text-sm">
          {STEPS.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              {status[s.key] === "klar" ? <Check className="h-4 w-4 text-primary" /> : status[s.key] === "fel" ? <X className="h-4 w-4 text-destructive" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <span>{s.title}</span>
              <span className="text-muted-foreground">– {status[s.key] === "klar" ? "klart" : status[s.key] === "hoppad" ? "saknas (hoppades över)" : status[s.key] === "fel" ? `misslyckades: ${errors[s.key]}` : "saknas"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
