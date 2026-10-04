import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtDateTime } from "@/hooks/useAiTeam";
import { edgeErrorMessage } from "@/lib/edgeError";

const db = supabase as unknown as { from: (t: string) => any };
const CATS: Record<string, string> = { makrill_erp: "Makrill ERP", klagomal: "Klagomål", kvalitet: "Kvalitet", arbetsmiljo: "Arbetsmiljö", ide: "Idé" };
const NONE = "__ingen";

type Feedback = { id: string; store_id: string | null; sender_phone: string; message: string | null; received_at: string; category: string | null; handled: boolean; recipient: { name: string } | null };
type Recipient = { id: string; store_id: string | null; name: string; phone_e164: string; channel: string; active: boolean; consent_at: string | null };

export default function Meddelanden() {
  const qc = useQueryClient();
  const stores = useQuery({ queryKey: ["stores-names"], queryFn: async () => (await db.from("stores").select("id, name").order("name")).data as { id: string; name: string }[] });
  const storeName = (id: string | null) => stores.data?.find((s) => s.id === id)?.name ?? "–";
  const fb = useQuery({
    queryKey: ["staff_feedback"],
    queryFn: async () => {
      const { data, error } = await db.from("staff_feedback").select("*, recipient:notification_recipients(name)").order("received_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as Feedback[];
    },
  });
  const recs = useQuery({
    queryKey: ["notification_recipients"],
    queryFn: async () => {
      const { data, error } = await db.from("notification_recipients").select("*").order("name");
      if (error) throw error;
      return data as Recipient[];
    },
  });
  const [sending, setSending] = useState(false);
  const [nr, setNr] = useState({ name: "", phone_e164: "", store_id: "" });

  const updFb = async (id: string, patch: Partial<Feedback>) => {
    const { error } = await db.from("staff_feedback").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["staff_feedback"] });
  };
  const updRec = async (id: string, patch: Partial<Recipient>) => {
    const { error } = await db.from("notification_recipients").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["notification_recipients"] });
  };
  const addRec = async () => {
    if (!nr.name.trim() || !/^\+\d{8,15}$/.test(nr.phone_e164.trim())) return toast.error("Ange fullständigt namn och telefon som +46…");
    const { error } = await db.from("notification_recipients").insert({ name: nr.name.trim(), phone_e164: nr.phone_e164.trim(), store_id: nr.store_id || null });
    if (error) return toast.error(error.message);
    setNr({ name: "", phone_e164: "", store_id: "" });
    qc.invalidateQueries({ queryKey: ["notification_recipients"] });
  };
  const sendNow = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send_whatsapp", { body: {} });
    setSending(false);
    if (error) return toast.error(await edgeErrorMessage(error, data));
    toast.success(`Skickade ${data?.skickade ?? 0} av ${data?.total ?? 0} godkända utkast`);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold mr-auto">Meddelanden (WhatsApp)</h1>
        <Button onClick={sendNow} disabled={sending}>{sending ? "Skickar…" : "Skicka godkända utkast nu"}</Button>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Inkomna meddelanden</h2>
        {fb.isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
        {fb.data?.length === 0 && <p className="text-sm text-muted-foreground">Inga meddelanden ännu.</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="p-1">Tid</th><th className="p-1">Butik</th><th className="p-1">Avsändare</th><th className="p-1">Text</th><th className="p-1">Kategori</th><th className="p-1">Hanterad</th></tr></thead>
            <tbody>
              {fb.data?.map((f) => (
                <tr key={f.id} className="border-t align-top">
                  <td className="p-1 whitespace-nowrap">{fmtDateTime(f.received_at)}</td>
                  <td className="p-1">{storeName(f.store_id)}</td>
                  <td className="p-1"><div>{f.recipient?.name ?? "Okänd avsändare"}</div><div className="font-mono text-xs text-muted-foreground">{f.sender_phone}</div></td>
                  <td className="p-1 whitespace-pre-wrap max-w-md">{f.message}</td>
                  <td className="p-1">
                    <Select value={f.category ?? NONE} onValueChange={(v) => updFb(f.id, { category: v === NONE ? null : v })}>
                      <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Ingen</SelectItem>
                        {Object.entries(CATS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-1"><Switch checked={f.handled} onCheckedChange={(v) => updFb(f.id, { handled: v })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Mottagare</h2>
        <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
          <Input placeholder="Fullständigt namn" value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} />
          <Input placeholder="+46701234567" value={nr.phone_e164} onChange={(e) => setNr({ ...nr, phone_e164: e.target.value })} />
          <Select value={nr.store_id || NONE} onValueChange={(v) => setNr({ ...nr, store_id: v === NONE ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Butik" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ingen butik</SelectItem>
              {stores.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={addRec}>Lägg till</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="p-1">Namn</th><th className="p-1">Telefon</th><th className="p-1">Butik</th><th className="p-1">Samtycke</th><th className="p-1">Aktiv</th></tr></thead>
            <tbody>
              {recs.data?.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-1">{r.name}</td>
                  <td className="p-1 font-mono">{r.phone_e164}</td>
                  <td className="p-1">{storeName(r.store_id)}</td>
                  <td className="p-1">
                    {r.consent_at ? fmtDateTime(r.consent_at) : (
                      <Button size="sm" variant="outline" onClick={() => updRec(r.id, { consent_at: new Date().toISOString() })}>Registrera samtycke</Button>
                    )}
                  </td>
                  <td className="p-1"><Switch checked={r.active} onCheckedChange={(v) => updRec(r.id, { active: v })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
