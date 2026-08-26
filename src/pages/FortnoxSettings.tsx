import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Link2, RefreshCw, Check, AlertTriangle, Plug } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { FORTNOX_JOB_STATUS_LABEL } from "@/lib/fortnoxStatus";

const ENTITIES = [
  { code: "de-no1", name: "DE No.1 AB" },
  { code: "fsab-se", name: "Fisk & Skaldjursspecialisten AB" },
];

const JOB_STATUS_LABELS = FORTNOX_JOB_STATUS_LABEL;



const statusBadge = (status: string) => {
  if (status === "connected") return <Badge className="bg-emerald-600/15 text-emerald-400 border-emerald-600/30">Kopplad</Badge>;
  if (status === "needs_reauth") return <Badge variant="destructive">Måste kopplas om</Badge>;
  if (status === "error") return <Badge variant="destructive">Fel</Badge>;
  return <Badge variant="outline">Ej kopplad</Badge>;
};

export default function FortnoxSettings() {
  const qc = useQueryClient();
  const [entity, setEntity] = useState(ENTITIES[1].code);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const callbackUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fortnox-oauth-callback`;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected")) toast.success(`Fortnox kopplat för ${p.get("connected")}`);
    if (p.get("error")) toast.error(`Fortnox: ${p.get("error")}`);
    if (p.get("connected") || p.get("error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const connections = useQuery({
    queryKey: ["fortnox_connections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fortnox_connections").select("*").order("legal_entity_name");
      if (error) throw error;
      return data;
    },
  });

  const maps = useQuery({
    queryKey: ["fortnox_customer_map", entity],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fortnox_customer_map")
        .select("id, makrilltrade_customer_id, fortnox_customer_number, match_method, confirmed")
        .eq("legal_entity_code", entity)
        .limit(500);
      if (error) throw error;
      const ids = (data ?? []).map((m) => m.makrilltrade_customer_id);
      const numbers = (data ?? []).map((m) => m.fortnox_customer_number);
      const [{ data: custs }, { data: fnCusts }] = await Promise.all([
        ids.length
          ? supabase.from("customers_retail").select("id, name, company_name, org_number").in("id", ids)
          : Promise.resolve({ data: [] as any[] }),
        numbers.length
          ? supabase.from("fortnox_customers").select("customer_number, name, org_number")
              .eq("legal_entity_code", entity).in("customer_number", numbers)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const cMap = new Map((custs ?? []).map((c: any) => [c.id, c]));
      const fMap = new Map((fnCusts ?? []).map((c: any) => [c.customer_number, c]));
      return (data ?? []).map((m) => ({
        ...m,
        mkr: cMap.get(m.makrilltrade_customer_id),
        fn: fMap.get(m.fortnox_customer_number),
      }));
    },
  });

  const jobs = useQuery({
    queryKey: ["fortnox_invoice_jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fortnox_invoice_jobs")
        .select("id, order_id, legal_entity_code, status, fortnox_document_number, fortnox_url, last_error, stock_booked_at, created_at, fortnox_balance, fortnox_total, status_synced_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const syncStatus = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.functions.invoke("fortnox-sync-invoice-status", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (d) => {
      const r = d?.results?.[0];
      if (r?.error) toast.error(r.error);
      else toast.success(`Status uppdaterad: ${JOB_STATUS_LABELS[r?.status] ?? r?.status ?? "okänd"}`);
      qc.invalidateQueries({ queryKey: ["fortnox_invoice_jobs"] });
      qc.invalidateQueries({ queryKey: ["fortnox_invoice_job"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const connect = async (code: string) => {
    setBusy(code);
    const { data, error } = await supabase.functions.invoke("fortnox-oauth-start", { body: { legal_entity_code: code } });
    setBusy(null);
    if (error || !data?.url) return toast.error(error?.message ?? "Kunde inte starta kopplingen");
    window.location.href = data.url;
  };

  const sync = useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.functions.invoke("fortnox-sync-customers", { body: { legal_entity_code: code } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (d) => {
      toast.success(`${d.customers_synced} kunder hämtade, ${d.suggested_matches} förslag på matchning`);
      qc.invalidateQueries({ queryKey: ["fortnox_customer_map"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const autoBookkeep = useMutation({
    mutationFn: async ({ code, value }: { code: string; value: boolean }) => {
      const { error } = await supabase
        .from("fortnox_connections")
        .update({ auto_bookkeep: value })
        .eq("legal_entity_code", code);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fortnox_connections"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const confirmMatch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fortnox_customer_map").update({ confirmed: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fortnox_customer_map"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const removeMatch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fortnox_customer_map").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fortnox_customer_map"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const filteredMaps = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = maps.data ?? [];
    if (!q) return list;
    return list.filter((m: any) =>
      [m.mkr?.company_name, m.mkr?.name, m.mkr?.org_number, m.fn?.name, m.fortnox_customer_number]
        .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q)));
  }, [maps.data, search]);

  const connByCode = new Map((connections.data ?? []).map((c: any) => [c.legal_entity_code, c]));

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Plug className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Fortnox</h1>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Redirect-URI för Fortnox-appen</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-1 text-xs text-muted-foreground">
            Klistra in exakt den här adressen som Redirect URI i Fortnox Developer Portal innan du kopplar.
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly className="h-8 font-mono text-xs" value={callbackUrl} onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(callbackUrl); toast.success("Kopierad"); }}>
              Kopiera
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Bolagskopplingar</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {ENTITIES.map((e) => {
            const c: any = connByCode.get(e.code);
            return (
              <div key={e.code} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {e.name} {statusBadge(c?.status ?? "disconnected")}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono tabular-nums">
                    {c?.fortnox_company_name ? `${c.fortnox_company_name} · org ${c.fortnox_org_number ?? "–"} · db ${c.fortnox_database_number ?? "–"}` : "Ingen Fortnox-databas kopplad"}
                  </div>
                  {c?.last_error && (
                    <div className="mt-1 flex items-start gap-1 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="break-all">{c.last_error}</span>
                    </div>
                  )}
                  <div className="mt-2 flex items-start gap-2">
                    <Switch
                      checked={c?.auto_bookkeep === true}
                      disabled={!c || autoBookkeep.isPending}
                      onCheckedChange={(v) => autoBookkeep.mutate({ code: e.code, value: v })}
                      aria-label="Bokför och skicka automatiskt"
                    />
                    <div className="text-xs">
                      <div className="font-medium">Bokför och skicka automatiskt</div>
                      <div className="text-muted-foreground">
                        Av = fakturan skapas som utkast i Fortnox och bokförs/skickas där.
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy === e.code} onClick={() => connect(e.code)}>
                    {busy === e.code ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Link2 className="mr-1 h-3 w-3" />}
                    {c?.status === "connected" ? "Koppla om" : "Koppla"}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={c?.status !== "connected" || sync.isPending}
                    onClick={() => { setEntity(e.code); sync.mutate(e.code); }}>
                    {sync.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                    Synka kunder
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Kundmatchning</TabsTrigger>
          <TabsTrigger value="jobs">Fakturajobb</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {ENTITIES.map((e) => (
              <Button key={e.code} size="sm" variant={entity === e.code ? "default" : "outline"} onClick={() => setEntity(e.code)}>
                {e.name}
              </Button>
            ))}
            <Input className="h-8 max-w-xs" placeholder="Sök kund…" value={search} onChange={(ev) => setSearch(ev.target.value)} />
          </div>

          <Card>
            <CardContent className="p-0">
              {maps.isLoading ? (
                <div className="p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
              ) : filteredMaps.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Inga matchningar. Synka kunder från Fortnox för att få förslag.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredMaps.map((m: any) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{m.mkr?.company_name || m.mkr?.name || "Okänd kund"}</div>
                        <div className="truncate text-xs text-muted-foreground font-mono tabular-nums">
                          {m.mkr?.org_number || "–"} → Fortnox #{m.fortnox_customer_number} {m.fn?.name ? `(${m.fn.name})` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{m.match_method}</Badge>
                        {m.confirmed ? (
                          <Badge className="bg-emerald-600/15 text-emerald-400 border-emerald-600/30">Bekräftad</Badge>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => confirmMatch.mutate(m.id)}>
                            <Check className="mr-1 h-3 w-3" />Bekräfta
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => removeMatch.mutate(m.id)}>Ta bort</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardContent className="p-0">
              {jobs.isLoading ? (
                <div className="p-6 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
              ) : (jobs.data ?? []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Inga fakturor har skickats till Fortnox än.</div>
              ) : (
                <div className="divide-y divide-border">
                  {(jobs.data ?? []).map((j: any) => (
                    <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-mono tabular-nums text-xs">{new Date(j.created_at).toLocaleString("sv-SE")} · {j.legal_entity_code}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {j.fortnox_document_number ? `Faktura ${j.fortnox_document_number}` : "Ingen faktura"}
                          {j.stock_booked_at ? " · lager bokat" : ""}
                        </div>
                        <div className="truncate text-xs text-muted-foreground font-mono tabular-nums">
                          {j.fortnox_total != null ? `Total ${Number(j.fortnox_total).toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr` : "Total –"}
                          {" · "}
                          {j.fortnox_balance != null ? `Kvar ${Number(j.fortnox_balance).toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr` : "Kvar –"}
                          {" · "}
                          {j.status_synced_at ? `synkad ${new Date(j.status_synced_at).toLocaleString("sv-SE")}` : "aldrig synkad"}
                        </div>
                        {j.last_error && <div className="text-xs text-destructive break-all">{j.last_error}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={j.status === "bookkept" || j.status === "sent" ? "default" : j.status === "failed" ? "destructive" : "outline"}>{JOB_STATUS_LABELS[j.status] ?? j.status}</Badge>
                        {j.fortnox_document_number && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={syncStatus.isPending && syncStatus.variables === j.order_id}
                            onClick={() => syncStatus.mutate(j.order_id)}
                          >
                            {syncStatus.isPending && syncStatus.variables === j.order_id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3 w-3" />
                            )}
                            Uppdatera status
                          </Button>
                        )}
                        {j.fortnox_url && (
                          <a href={j.fortnox_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Öppna</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
