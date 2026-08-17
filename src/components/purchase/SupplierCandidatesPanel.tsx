/**
 * Leverantörsförslag ur mejlinloppet.
 *
 * Går igenom alla mejl i mail_intake_messages, grupperar per avsändardomän och
 * lyfter fram varje tänkbar leverantör. Redan vitlistade domäner filtreras bort.
 * Matchar mot befintliga leverantörer på domän/namn — annars kan en ny skapas
 * med förifyllda uppgifter från företagsregistret (se supplierRegistry).
 */
import { useMemo, useState } from "react";
import { Building2, Check, ExternalLink, Loader2, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useSuppliers, useCreateSupplier } from "@/hooks/useSuppliers";
import { useMailMessages, useMailSenders, useMailIntakeActions } from "@/hooks/useSupplierDocuments";
import { SUPPLIER_REGISTRY, type RegistryEntry } from "@/lib/supplierRegistry";

const SUPPLIER_TYPES = ["Färsk fisk", "Skaldjur", "Rökt fisk", "Emballage", "Kryddor & Tillbehör", "Transport", "Övrigt"];

const domainOf = (email?: string | null) => (email || "").split("@")[1]?.toLowerCase() || "";
const norm = (v: string) =>
  v.toLowerCase().replace(/\b(ab|as|a\/s|oy|gmbh|sa|sarl|group|sweden)\b/g, "").replace(/[^a-z0-9]/g, "");

type Candidate = {
  /** Nyckel: avsändardomän, eller "namn:x" för dokument via förmedlare (Fortnox). */
  key: string;
  domain: string;
  emails: string[];
  names: string[];
  subjects: string[];
  count: number;
  /** Förmedlarpost: avsändaren är redan vitlistad, leverantören avgörs per dokument. */
  viaPortal?: boolean;
  match?: { id: string; name: string };
  registry?: RegistryEntry;
};


export function SupplierCandidatesPanel() {
  const { data: messages = [] } = useMailMessages();
  const { data: senders = [] } = useMailSenders();
  const { data: suppliers = [] } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const { saveSender, invalidate } = useMailIntakeActions();

  const [openDomain, setOpenDomain] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", contact_person: "", email: "", phone: "", country: "Sverige",
    address: "", supplier_type: "Övrigt", currency: "SEK", org_nr: "",
  });
  const [busy, setBusy] = useState(false);

  const whitelisted = useMemo(
    () => new Set(senders.filter((s: any) => s.active !== false).map((s: any) => (s.pattern || "").toLowerCase())),
    [senders],
  );

  // Förmedlare (Fortnox m.fl.): avsändaren är vitlistad, men varje företagsnamn
  // i mejlen är en egen tänkbar leverantör.
  const portals = useMemo(
    () => new Set(senders.filter((s: any) => s.is_portal).map((s: any) => (s.pattern || "").toLowerCase())),
    [senders],
  );

  const candidates = useMemo<Candidate[]>(() => {
    const map = new Map<string, Candidate>();
    for (const m of messages as any[]) {
      const email = (m.from_email || "").toLowerCase();
      const domain = domainOf(email);
      if (!domain) continue;
      const viaPortal = portals.has(email) || portals.has(domain) || portals.has(`@${domain}`);
      if (!viaPortal && (whitelisted.has(email) || whitelisted.has(domain) || whitelisted.has(`@${domain}`))) continue;
      // Förmedlarmejl utan företagsnamn går inte att koppla till någon leverantör.
      if (viaPortal && !m.from_name) continue;
      const key = viaPortal ? `namn:${norm(String(m.from_name))}` : domain;
      const c = map.get(key) ?? { key, domain, emails: [], names: [], subjects: [], count: 0, viaPortal };
      if (!c.emails.includes(email)) c.emails.push(email);
      if (m.from_name && !c.names.includes(m.from_name)) c.names.push(m.from_name);
      if (m.subject && c.subjects.length < 3) c.subjects.push(m.subject);
      c.count += 1;
      map.set(key, c);
    }
    return [...map.values()]
      .map((c) => {
        const registry = c.viaPortal
          ? SUPPLIER_REGISTRY.find((r) => norm(r.name) === norm(c.names[0] || ""))
          : SUPPLIER_REGISTRY.find((r) => r.domain === c.domain);
        const hints = [registry?.name, ...c.names, ...(c.viaPortal ? [] : [c.domain.split(".")[0]])].filter(Boolean) as string[];
        const match = suppliers.find((s) => {
          if (!c.viaPortal && s.email && domainOf(s.email) === c.domain) return true;
          const sn = norm(s.name);
          return sn.length > 3 && hints.some((h) => {
            const hn = norm(h);
            return hn.length > 3 && (hn.includes(sn) || sn.includes(hn));
          });
        });
        return { ...c, registry, match: match ? { id: match.id, name: match.name } : undefined };
      })
      .sort((a, b) => b.count - a.count);
  }, [messages, whitelisted, portals, suppliers]);


  const openCreate = (c: Candidate) => {
    const r = c.registry;
    setForm({
      name: r?.name || c.names[0] || c.domain,
      contact_person: "",
      // Förmedlarens adress (t.ex. Fortnox) är inte leverantörens e-post.
      email: r?.email || (c.viaPortal ? "" : c.emails[0] || ""),
      phone: r?.phone || "",
      country: r?.country || "Sverige",
      address: r?.address || "",
      supplier_type: r?.supplier_type || "Övrigt",
      currency: r?.currency || "SEK",
      org_nr: r?.org_nr || "",
    });
    setOpenDomain(c.key);
  };


  const linkSender = async (pattern: string, supplierId: string, note?: string) => {
    await saveSender.mutateAsync({ pattern, kind: "email", supplier_id: supplierId, is_portal: false, note } as any);
    invalidate();
  };

  const handleMatch = async (c: Candidate) => {
    if (!c.match) return;
    setBusy(true);
    try {
      // Förmedlaravsändare får aldrig låsas till en enskild leverantör.
      if (!c.viaPortal) for (const e of c.emails) await linkSender(e, c.match.id);
      toast({
        title: c.viaPortal ? "Redan i registret" : "Vitlistad",
        description: `${c.names[0] || c.domain} → ${c.match.name}`,
      });
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (c: Candidate) => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const created = await createSupplier.mutateAsync({
        name: form.name.trim(),
        contact_person: form.contact_person || null,
        email: form.email || null,
        phone: form.phone || null,
        country: form.country || null,
        address: form.address || null,
        supplier_type: form.supplier_type,
        currency: form.currency,
        is_intercompany: false,
      } as any);
      if (!c.viaPortal) {
        for (const e of c.emails) {
          await linkSender(e, created.id, form.org_nr ? `Org.nr ${form.org_nr}` : undefined);
        }
      }
      toast({
        title: "Leverantör skapad",
        description: c.viaPortal
          ? `${form.name} matchas nu automatiskt i dokument via förmedlare`
          : `${form.name} är vitlistad för ${c.domain}`,
      });
      setOpenDomain(null);
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };


  return (
    <ScrollArea className="h-full">
      <div className="divide-y">
        <div className="px-3 py-2 text-[11px] text-muted-foreground">
          {candidates.length} tänkbara leverantörer hittade i mejlinloppet (vitlistade domäner visas inte).
        </div>
        {candidates.length === 0 && (
          <p className="p-8 text-center text-xs text-muted-foreground">
            Alla avsändare i mejlinloppet är redan kopplade till leverantörer.
          </p>
        )}
        {candidates.map((c) => (
          <div key={c.key} className="p-3 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {c.registry?.name || c.names[0] || c.domain}
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">{c.count} mejl</Badge>
                  {c.viaPortal && <Badge variant="outline" className="h-4 px-1 text-[10px]">Via förmedlare</Badge>}
                  {c.registry && <Badge variant="secondary" className="h-4 px-1 text-[10px]">Uppgifter förifyllda</Badge>}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{c.emails.join(", ")}</p>
                {c.subjects.length > 0 && (
                  <p className="text-[10px] text-muted-foreground truncate">Ex: {c.subjects[0]}</p>
                )}
                {c.registry?.org_nr && (
                  <p className="text-[10px] text-muted-foreground font-mono">Org.nr {c.registry.org_nr}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {c.match ? (
                  c.viaPortal ? (
                    <Badge variant="secondary" className="h-6 px-2 text-[10px] gap-1">
                      <ShieldCheck className="h-3 w-3" /> Finns som {c.match.name}
                    </Badge>
                  ) : (
                    <Button size="sm" className="h-7 text-xs gap-1" disabled={busy} onClick={() => handleMatch(c)}>
                      <ShieldCheck className="h-3.5 w-3.5" /> Matcha {c.match.name}
                    </Button>
                  )
                ) : null}
                <Button
                  size="sm"
                  variant={c.match ? "outline" : "default"}
                  className="h-7 text-xs gap-1"
                  onClick={() => (openDomain === c.key ? setOpenDomain(null) : openCreate(c))}
                >
                  <Plus className="h-3.5 w-3.5" /> Skapa ny
                </Button>
                {c.registry?.website && (
                  <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                    <a href={c.registry.website} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                  </Button>
                )}
              </div>
            </div>

            {openDomain === c.key && (

              <div className="rounded-md border bg-muted/20 p-2 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Företagsnamn *</Label>
                    <Input className="h-7 text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Organisationsnummer</Label>
                    <Input className="h-7 text-xs font-mono" value={form.org_nr} onChange={(e) => setForm({ ...form, org_nr: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">E-post</Label>
                    <Input className="h-7 text-xs" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Telefon</Label>
                    <Input className="h-7 text-xs" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Adress</Label>
                    <Input className="h-7 text-xs" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Land</Label>
                    <Input className="h-7 text-xs" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Typ</Label>
                    <Select value={form.supplier_type} onValueChange={(v) => setForm({ ...form, supplier_type: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUPPLIER_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Fakturavaluta</Label>
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["SEK", "NOK", "DKK", "EUR", "CHF", "GBP", "USD"].map((x) => (
                          <SelectItem key={x} value={x} className="text-xs">{x}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpenDomain(null)}>Avbryt</Button>
                  <Button size="sm" className="h-7 text-xs gap-1" disabled={busy || !form.name.trim()} onClick={() => handleCreate(c)}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Spara och vitlista
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export default SupplierCandidatesPanel;
