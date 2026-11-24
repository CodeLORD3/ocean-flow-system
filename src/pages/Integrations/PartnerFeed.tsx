import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, ShieldOff, ShieldCheck, History } from "lucide-react";
import { useStores } from "@/hooks/useStores";

const db = supabase as any;
const FEED_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/partner-feed`;

type Partner = {
  id: string; namn: string; aktiv: boolean; butiksurval: string[];
  skapad: string; senast_hamtad: string | null; nyckel_skapad: string | null;
};

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "medium" }) : "aldrig";

export default function PartnerFeed() {
  const qc = useQueryClient();
  const { data: stores = [] } = useStores();
  const shops = stores.filter((s: any) => s.unit_type === "butik" && s.active);
  const storeName = (id: string) => stores.find((s: any) => s.id === id)?.name ?? "Okänd butik";

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ["feed_partners"],
    queryFn: async () => {
      const { data, error } = await db.from("feed_partners")
        .select("id, namn, aktiv, butiksurval, skapad, senast_hamtad, nyckel_skapad").order("skapad");
      if (error) throw error;
      return data as Partner[];
    },
  });

  const [shownKey, setShownKey] = useState<{ namn: string; key: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [namn, setNamn] = useState("");
  const [urval, setUrval] = useState<string[]>([]);
  const [logFor, setLogFor] = useState<Partner | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["feed_partners"] });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("feed_partner_create", { _namn: namn, _butiksurval: urval });
      if (error) throw error;
      return data as { id: string; nyckel: string };
    },
    onSuccess: (d) => { setShownKey({ namn, key: d.nyckel }); setCreateOpen(false); setNamn(""); setUrval([]); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const rotate = useMutation({
    mutationFn: async (p: Partner) => {
      const { data, error } = await db.rpc("feed_partner_rotate_key", { _id: p.id });
      if (error) throw error;
      return { namn: p.namn, key: data as string };
    },
    onSuccess: (d) => { setShownKey(d); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (p: Partner) => {
      const { error } = await db.rpc("feed_partner_update", { _id: p.id, _aktiv: !p.aktiv, _butiksurval: null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sparat"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: log = [] } = useQuery({
    queryKey: ["feed_hamtningar", logFor?.id],
    enabled: !!logFor,
    queryFn: async () => {
      const { data, error } = await db.from("feed_hamtningar").select("id, tidpunkt, ip, http_status")
        .eq("partner_id", logFor!.id).order("tidpunkt", { ascending: false }).limit(200);
      if (error) throw error;
      return data as { id: number; tidpunkt: string; ip: string | null; http_status: number }[];
    },
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-xl">Partnerfeed</h1>
          <p className="text-xs text-muted-foreground">
            Partners hämtar priser, sortiment och lagerstatus (i lager / slut) från oss. Inga kostnader eller antal skickas.
          </p>
          <p className="break-all font-mono text-[11px] text-muted-foreground">GET {FEED_URL}</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />Ny partner</Button>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Laddar…</p> : partners.length === 0 ? (
        <p className="text-sm text-muted-foreground">Inga partners ännu.</p>
      ) : partners.map((p) => (
        <Card key={p.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {p.namn}
              {p.aktiv ? <Badge variant="secondary">Aktiv</Badge> : <Badge variant="destructive">Spärrad</Badge>}
              {!p.nyckel_skapad && <Badge variant="outline">Ingen nyckel</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-1">
              {p.butiksurval.map((id) => <Badge key={id} variant="outline">{storeName(id)}</Badge>)}
            </div>
            <div className="text-xs text-muted-foreground">
              Senaste hämtning: {fmt(p.senast_hamtad)} · Nyckel skapad: {fmt(p.nyckel_skapad)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={rotate.isPending}
                onClick={() => { if (!p.nyckel_skapad || confirm(`Skapa ny nyckel för ${p.namn}? Den gamla slutar gälla direkt.`)) rotate.mutate(p); }}>
                <KeyRound className="mr-1 h-4 w-4" />{p.nyckel_skapad ? "Rotera nyckel" : "Skapa nyckel"}
              </Button>
              <Button size="sm" variant="outline" disabled={toggle.isPending}
                onClick={() => { if (p.aktiv ? confirm(`Spärra ${p.namn}? Hämtningar nekas direkt.`) : true) toggle.mutate(p); }}>
                {p.aktiv ? <><ShieldOff className="mr-1 h-4 w-4" />Spärra</> : <><ShieldCheck className="mr-1 h-4 w-4" />Aktivera</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLogFor(p)}><History className="mr-1 h-4 w-4" />Hämtlogg</Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny partner</DialogTitle>
            <DialogDescription>Nyckeln skapas och visas en gång när du sparar.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Namn" value={namn} onChange={(e) => setNamn(e.target.value)} />
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {shops.map((s: any) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={urval.includes(s.id)}
                  onCheckedChange={(v) => setUrval((u) => v ? [...u, s.id] : u.filter((x) => x !== s.id))} />
                {s.name}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button disabled={!namn.trim() || urval.length === 0 || create.isPending} onClick={() => create.mutate()}>Skapa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!shownKey} onOpenChange={(o) => !o && setShownKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nyckel för {shownKey?.namn}</DialogTitle>
            <DialogDescription>
              Kopiera nyckeln nu och skicka den säkert till partnern. Den visas bara den här gången – vi sparar den inte.
            </DialogDescription>
          </DialogHeader>
          <p className="break-all rounded border bg-muted p-2 font-mono text-xs" data-testid="feed-key">{shownKey?.key}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(shownKey?.key ?? ""); toast.success("Kopierad"); }}>
              <Copy className="mr-1 h-4 w-4" />Kopiera
            </Button>
            <Button onClick={() => setShownKey(null)}>Klar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hämtlogg – {logFor?.namn}</DialogTitle>
            <DialogDescription>Senaste 200 hämtningarna. Loggen sparas i 90 dagar.</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {log.length === 0 ? <p className="text-sm text-muted-foreground">Inga hämtningar.</p> : log.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1 text-xs">
                <span className="font-mono tabular-nums">{fmt(r.tidpunkt)}</span>
                <span className="break-all text-muted-foreground">{r.ip ?? "–"}</span>
                <Badge variant={r.http_status === 200 ? "secondary" : "destructive"}>{r.http_status}</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
