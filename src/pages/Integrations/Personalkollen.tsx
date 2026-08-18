import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { RefreshCw, Building2, Users, Activity, Coins } from "lucide-react";
import {
  usePkConnections,
  usePkSyncState,
  usePkSyncLog,
  usePkCostgroups,
  usePkWorkplaces,
  usePkStaff,
  usePkDailyLaborCost,
  usePkSetMapping,
  usePkSetStaffLink,
  usePkRunSync,
  pkHours,
} from "@/hooks/usePersonalkollen";
import { useStores } from "@/hooks/useStores";
import { useStaff } from "@/hooks/useStaff";

const NONE = "__none__";

const RESOURCE_LABEL: Record<string, string> = {
  "logged-times": "Stämplingar",
  "work-periods": "Schemalagda pass",
  staffs: "Personal",
  workplaces: "Arbetsplatser",
  costgroups: "Kostnadsgrupper",
};

function timeAgo(iso?: string | null): string {
  if (!iso) return "aldrig";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "nyss";
  if (mins < 60) return `${mins} min sedan`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} h sedan` : `${Math.floor(h / 24)} dygn sedan`;
}

function money(v?: number | null): string {
  return (v ?? 0).toLocaleString("sv-SE", { maximumFractionDigits: 0 }).replace(/\u00a0/g, " ");
}

/** Personalkollen: driftstatus, mappning mot butiker och personal, samt dagens personalkostnad. */
export default function Personalkollen() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const connections = usePkConnections();
  const syncState = usePkSyncState();
  const syncLog = usePkSyncLog();
  const costgroups = usePkCostgroups();
  const workplaces = usePkWorkplaces();
  const pkStaff = usePkStaff();
  const stores = useStores();
  const staff = useStaff();
  const cost = usePkDailyLaborCost(null, date);
  const setMapping = usePkSetMapping();
  const setStaffLink = usePkSetStaffLink();
  const runSync = usePkRunSync();
  const addCostgroup = usePkAddCostgroup();
  const [newCg, setNewCg] = useState({ connectionId: "", shortIdentifier: "", name: "", storeId: NONE });

  const connName = useMemo(() => {
    const m = new Map<string, string>();
    (connections.data ?? []).forEach((c) => m.set(c.id, c.label));
    return m;
  }, [connections.data]);

  const storeName = useMemo(() => {
    const m = new Map<string, string>();
    (stores.data ?? []).forEach((s) => m.set(s.id, s.name));
    return m;
  }, [stores.data]);

  const unmappedCostgroups = (costgroups.data ?? []).filter((c) => !c.store_id).length;
  const unlinkedStaff = (pkStaff.data ?? []).filter((s) => !s.employee_id).length;

  const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

  /** Ej kopplade personer, med namnförslag som måste bekräftas manuellt. */
  const unlinked = useMemo(() => {
    const cards = staff.data ?? [];
    const takenIds = new Set((pkStaff.data ?? []).map((p) => p.employee_id).filter(Boolean) as string[]);
    return (pkStaff.data ?? [])
      .filter((p) => !p.employee_id)
      .map((p) => {
        const suggestion =
          cards.find(
            (s: any) =>
              norm(s.first_name) === norm(p.first_name) &&
              norm(s.last_name) === norm(p.last_name) &&
              !takenIds.has(s.id),
          ) ?? null;
        return { pk: p, suggestion };
      });
  }, [pkStaff.data, staff.data]);

  const doSync = (resource?: string) => {
    runSync.mutate(
      { resource },
      {
        onSuccess: (d) => {
          const rows = d?.results ?? [];
          const failed = rows.filter((r: any) => r.error);
          if (failed.length) toast.error(`Synk klar med fel: ${failed[0].error}`);
          else toast.success(`Synk klar — ${rows.reduce((a: number, r: any) => a + (r.upserts ?? 0), 0)} poster`);
        },
        onError: (e: any) => toast.error(e?.message ?? "Synken misslyckades"),
      },
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Personalkollen</h1>
          <p className="text-sm text-muted-foreground">
            Personal, scheman och stämplingar hämtas automatiskt och mappas mot butikerna.
          </p>
        </div>
        <Button onClick={() => doSync()} disabled={runSync.isPending} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${runSync.isPending ? "animate-spin" : ""}`} />
          Synka nu
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" /> Bolag
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl tabular-nums">{connections.data?.length ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" /> Personal
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl tabular-nums">{pkStaff.data?.length ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Activity className="h-4 w-4" /> Omappade kostnadsgrupper
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl tabular-nums">{unmappedCostgroups}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" /> Utan personalkort
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl tabular-nums">{unlinkedStaff}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="status">
        <TabsList>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="mapping">Butiksmappning</TabsTrigger>
          <TabsTrigger value="staff">Personal</TabsTrigger>
          <TabsTrigger value="unlinked">Ej kopplade{unlinked.length ? ` (${unlinked.length})` : ""}</TabsTrigger>
          <TabsTrigger value="cost">Personalkostnad</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Synkstatus per resurs</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {syncState.isLoading ? (
                <Skeleton className="m-4 h-24" />
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">Bolag</th>
                      <th className="px-4 py-2 text-left font-medium">Resurs</th>
                      <th className="px-4 py-2 text-left font-medium">Senast</th>
                      <th className="px-4 py-2 text-left font-medium">Poster</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-left font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(syncState.data ?? []).map((s) => (
                      <tr key={`${s.connection_id}-${s.resource}`} className="border-b last:border-0">
                        <td className="px-4 py-2">{connName.get(s.connection_id) ?? "—"}</td>
                        <td className="px-4 py-2">{RESOURCE_LABEL[s.resource] ?? s.resource}</td>
                        <td className="px-4 py-2 text-muted-foreground">{timeAgo(s.last_run_at)}</td>
                        <td className="px-4 py-2 font-mono tabular-nums">{s.records_upserted ?? 0}</td>
                        <td className="px-4 py-2">
                          <Badge variant={s.last_status === "ok" ? "outline" : "destructive"}>
                            {s.last_status ?? "—"}
                          </Badge>
                          {s.last_error ? (
                            <span className="ml-2 text-xs text-destructive">{s.last_error}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => doSync(s.resource)}>
                            Synka
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Synklogg</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(syncLog.data ?? []).length === 0 ? (
                <p className="text-muted-foreground">Ingen körning loggad ännu.</p>
              ) : (
                (syncLog.data ?? []).map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-2 border-b py-1 last:border-0">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {new Date(l.created_at).toLocaleString("sv-SE")}
                    </span>
                    <span>{connName.get(l.connection_id) ?? "—"}</span>
                    <span className="text-muted-foreground">{RESOURCE_LABEL[l.resource] ?? l.resource}</span>
                    <Badge variant={l.status === "ok" ? "outline" : "destructive"}>{l.status}</Badge>
                    <span className="font-mono text-xs tabular-nums">{l.upserts ?? 0} poster</span>
                    {l.error ? <span className="text-xs text-destructive">{l.error}</span> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapping" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kostnadsgrupper → butik</CardTitle>
              <p className="text-sm text-muted-foreground">
                Kostnadsgruppen är butiksnivån i Personalkollen. Ändrar du här låses valet mot automatiken.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Bolag</th>
                    <th className="px-4 py-2 text-left font-medium">Kostnadsgrupp</th>
                    <th className="px-4 py-2 text-left font-medium">Butik</th>
                    <th className="px-4 py-2 text-left font-medium">Källa</th>
                  </tr>
                </thead>
                <tbody>
                  {(costgroups.data ?? []).map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-2">{connName.get(c.connection_id) ?? "—"}</td>
                      <td className="px-4 py-2">{c.name ?? c.url}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={c.store_id ?? NONE}
                          onValueChange={(v) =>
                            setMapping.mutate(
                              { table: "pk_costgroups", id: c.id, storeId: v === NONE ? null : v },
                              { onError: (e: any) => toast.error(e?.message ?? "Kunde inte spara") },
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[240px]">
                            <SelectValue placeholder="Ingen butik" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Ingen butik</SelectItem>
                            {(stores.data ?? []).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline">{c.store_id_manual ? "Manuell" : "Automatisk"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-2 border-t p-4">
                <p className="text-sm font-medium">Lägg till kostnadsställe manuellt</p>
                <p className="text-xs text-muted-foreground">
                  Personalkollens kostnadsställe-endpoint är stängd för våra nycklar, så nya grupper upptäcks
                  först vid första passet eller stämplingen. Lägg in id och namn här för att mappa i förväg.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={newCg.connectionId} onValueChange={(v) => setNewCg((s) => ({ ...s, connectionId: v }))}>
                    <SelectTrigger className="h-8 w-[240px]">
                      <SelectValue placeholder="Bolag" />
                    </SelectTrigger>
                    <SelectContent>
                      {(connections.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 w-[120px]"
                    placeholder="Id"
                    value={newCg.shortIdentifier}
                    onChange={(e) => setNewCg((s) => ({ ...s, shortIdentifier: e.target.value }))}
                  />
                  <Input
                    className="h-8 w-[200px]"
                    placeholder="Namn i Personalkollen"
                    value={newCg.name}
                    onChange={(e) => setNewCg((s) => ({ ...s, name: e.target.value }))}
                  />
                  <Select value={newCg.storeId} onValueChange={(v) => setNewCg((s) => ({ ...s, storeId: v }))}>
                    <SelectTrigger className="h-8 w-[240px]">
                      <SelectValue placeholder="Butik" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Ingen butik</SelectItem>
                      {(stores.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={addCostgroup.isPending}
                    onClick={() => {
                      const id = Number(newCg.shortIdentifier);
                      if (!newCg.connectionId || !Number.isFinite(id) || id <= 0 || !newCg.name.trim()) {
                        toast.error("Välj bolag och ange id och namn");
                        return;
                      }
                      const wp =
                        (workplaces.data ?? []).find((w) => w.connection_id === newCg.connectionId)?.url ?? null;
                      addCostgroup.mutate(
                        {
                          connectionId: newCg.connectionId,
                          shortIdentifier: id,
                          name: newCg.name.trim(),
                          workplaceUrl: wp,
                          storeId: newCg.storeId === NONE ? null : newCg.storeId,
                        },
                        {
                          onSuccess: () => {
                            toast.success("Kostnadsställe tillagt");
                            setNewCg({ connectionId: "", shortIdentifier: "", name: "", storeId: NONE });
                          },
                          onError: (e: any) => toast.error(e?.message ?? "Kunde inte spara"),
                        },
                      );
                    }}
                  >
                    Lägg till
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Arbetsplatser (bolagsnivå)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Används som reserv när en stämpling saknar kostnadsgrupp.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Bolag</th>
                    <th className="px-4 py-2 text-left font-medium">Arbetsplats</th>
                    <th className="px-4 py-2 text-left font-medium">Butik</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(workplaces.data ?? []).map((w) => (
                    <tr key={w.id} className="border-b last:border-0">
                      <td className="px-4 py-2">{connName.get(w.connection_id) ?? "—"}</td>
                      <td className="px-4 py-2">{w.name ?? w.url}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={w.store_id ?? NONE}
                          onValueChange={(v) =>
                            setMapping.mutate(
                              { table: "pk_workplaces", id: w.id, storeId: v === NONE ? null : v },
                              { onError: (e: any) => toast.error(e?.message ?? "Kunde inte spara") },
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[240px]">
                            <SelectValue placeholder="Ingen butik" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Ingen butik</SelectItem>
                            {(stores.data ?? []).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        {w.is_missing_since ? (
                          <Badge variant="destructive">Saknas i API sedan {timeAgo(w.is_missing_since)}</Badge>
                        ) : (
                          <Badge variant="outline">Aktiv</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unlinked" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ej kopplade personer</CardTitle>
              <p className="text-sm text-muted-foreground">
                Automatisk koppling sker enbart på e-post. Namnträffar visas som förslag och måste bekräftas.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {unlinked.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Alla personer är kopplade.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">Personalkollen</th>
                      <th className="px-4 py-2 text-left font-medium">Bolag</th>
                      <th className="px-4 py-2 text-left font-medium">E-post</th>
                      <th className="px-4 py-2 text-left font-medium">Förslag (namnträff)</th>
                      <th className="px-4 py-2 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unlinked.map(({ pk, suggestion }) => (
                      <tr key={pk.id} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          {`${pk.first_name ?? ""} ${pk.last_name ?? ""}`.trim() || "—"}
                        </td>
                        <td className="px-4 py-2">{connName.get(pk.connection_id) ?? "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{pk.email || "saknas"}</td>
                        <td className="px-4 py-2">
                          {suggestion ? (
                            <span>
                              {`${suggestion.first_name} ${suggestion.last_name}`}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {(suggestion as any).email || "utan e-post"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Inget förslag</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {suggestion ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setStaffLink.mutate(
                                  { id: pk.id, employeeId: suggestion.id },
                                  {
                                    onSuccess: () => toast.success("Koppling bekräftad"),
                                    onError: (e: any) => toast.error(e?.message ?? "Kunde inte spara"),
                                  },
                                )
                              }
                            >
                              Bekräfta koppling
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Personal och koppling till personalkort</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {pkStaff.isLoading ? (
                <Skeleton className="m-4 h-40" />
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">Namn</th>
                      <th className="px-4 py-2 text-left font-medium">Bolag</th>
                      <th className="px-4 py-2 text-left font-medium">Grupp</th>
                      <th className="px-4 py-2 text-left font-medium">Personnr</th>
                      <th className="px-4 py-2 text-left font-medium">Personalkort</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pkStaff.data ?? []).map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          {`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"}
                          {p.is_active_employment === false ? (
                            <Badge variant="secondary" className="ml-2">Avslutad</Badge>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">{connName.get(p.connection_id) ?? "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{p.group_name ?? "—"}</td>
                        <td className="px-4 py-2 font-mono tabular-nums">{p.pnr_masked ?? "—"}</td>
                        <td className="px-4 py-2">
                          <Select
                            value={p.employee_id ?? NONE}
                            onValueChange={(v) =>
                              setStaffLink.mutate(
                                { id: p.id, employeeId: v === NONE ? null : v },
                                { onError: (e: any) => toast.error(e?.message ?? "Kunde inte spara") },
                              )
                            }
                          >
                            <SelectTrigger className="h-8 w-[240px]">
                              <SelectValue placeholder="Ingen koppling" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Ingen koppling</SelectItem>
                              {(staff.data ?? []).map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {`${s.first_name} ${s.last_name}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cost" className="pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="h-4 w-4" /> Personalkostnad per butik
              </CardTitle>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-[160px]"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {cost.isLoading ? (
                <Skeleton className="m-4 h-24" />
              ) : (cost.data ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Ingen personalkostnad registrerad för dagen.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium">Butik</th>
                      <th className="px-4 py-2 text-right font-medium">Rörlig</th>
                      <th className="px-4 py-2 text-right font-medium">Fast</th>
                      <th className="px-4 py-2 text-right font-medium">Faktisk</th>
                      <th className="px-4 py-2 text-right font-medium">Schemalagd</th>
                      <th className="px-4 py-2 text-right font-medium">Arbetad tid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cost.data ?? []).map((r) => (
                      <tr key={`${r.store_id}-${r.day}`} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          {r.store_id ? storeName.get(r.store_id) ?? "Okänd butik" : "Utan butiksmappning"}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{money(r.variable_cost)}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{money(r.fixed_cost)}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{money(r.actual_cost)}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{money(r.scheduled_cost)}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums">{pkHours(r.work_time_sec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
