import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Building2,
  CheckCircle2,
  Clock,
  Play,
  ShieldCheck,
  Store as StoreIcon,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  usePosJournal,
  usePosRegions,
  usePosRegisters,
  useDemoSequence,
  useVerifyJournal,
  type PosRegisterRow,
} from "@/hooks/usePosFoundation";

const ETAPPER: { key: string; title: string; done?: boolean }[] = [
  { key: "P0", title: "Förstudie och regelkrav (SKVFS 2021:17)" },
  { key: "P1", title: "Fundament: bolag, butik, register, journalminne", done: true },
  { key: "P2", title: "Kvittoflöde och kassapass i kassan" },
  { key: "P3", title: "Betalning via Worldline" },
  { key: "P4", title: "Kontrollenhet och molnbaserat kontrollsystem" },
  { key: "P5", title: "X- och Z-rapporter, dagsavslut" },
  { key: "P6", title: "Returer, kvittokopia och lådöppning" },
  { key: "P7", title: "Journalexport till Skatteverket" },
  { key: "P8", title: "Tillverkardeklaration och certifiering" },
  { key: "P9", title: "Utrullning i alla butiker" },
];

const DEADLINES = [
  "Nimpos DUMMY-kontrollenheter ersätts senast 2027.01.01.",
  "Nya kassaregisterregler gäller från 2027.01.01.",
];

const EVENT_LABEL: Record<string, string> = {
  session_open: "Kassapass öppnat",
  session_close: "Kassapass stängt",
  receipt_finalized: "Kvitto klart",
  receipt_return: "Retur",
  receipt_copy: "Kvittokopia",
  training_on: "Övningsläge på",
  training_off: "Övningsläge av",
  drawer_open_no_sale: "Lådöppning utan köp",
  x_report: "X-rapport",
  z_report: "Z-rapport",
  config_changed: "Inställning ändrad",
  journal_export: "Journalexport",
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "medium" });

const short = (h: string | null) => (h ? h.slice(0, 12) : "saknas");

/**
 * POS-fundament: hierarki, journalminne och etappstatus för Makrilltrade POS.
 * Sidan skriver inget själv: journalen fylls bara av databasens egna funktioner.
 */
export default function PosFoundation() {
  const { staff } = useStaffAuth();
  const isAdmin = /admin/i.test(((staff as any)?.primary_role as string) || "");
  const regions = usePosRegions();
  const registers = usePosRegisters();
  const journal = usePosJournal(50);
  const verify = useVerifyJournal();
  const demo = useDemoSequence();
  const [results, setResults] = useState<Record<string, { ok: boolean; seq: number | null }>>({});

  const lastByRegister = useMemo(() => {
    const m = new Map<string, { time: string; type: string }>();
    for (const j of journal.data ?? []) {
      if (!m.has(j.register_id)) m.set(j.register_id, { time: j.event_time, type: j.event_type });
    }
    return m;
  }, [journal.data]);

  const registerLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of registers.data ?? []) m.set(r.id, r.register_number);
    return m;
  }, [registers.data]);

  const tree = useMemo(() => {
    const byEntity = new Map<string, { name: string; country: string; stores: Map<string, { name: string; city: string | null; country: string | null; regs: PosRegisterRow[] }> }>();
    for (const r of registers.data ?? []) {
      const ent = byEntity.get(r.legal_entity_id) ?? {
        name: r.legal_entities?.legal_name || r.legal_entity_id,
        country: r.legal_entities?.country || "",
        stores: new Map(),
      };
      const st = ent.stores.get(r.store_id) ?? {
        name: r.stores?.name || "Butik",
        city: r.stores?.city ?? null,
        country: r.stores?.region_country ?? null,
        regs: [],
      };
      st.regs.push(r);
      ent.stores.set(r.store_id, st);
      byEntity.set(r.legal_entity_id, ent);
    }
    return Array.from(byEntity.values());
  }, [registers.data]);

  const alsten = (registers.data ?? []).find((r) => r.register_number.includes("alsten"));

  const runVerify = async (registerId: string) => {
    try {
      const res = await verify.mutateAsync(registerId);
      setResults((p) => ({ ...p, [registerId]: { ok: res.ok, seq: res.firstBadSeq } }));
      toast[res.ok ? "success" : "error"](
        res.ok ? "Kedjan är obruten." : `Brott i kedjan vid sekvens ${res.firstBadSeq}.`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte verifiera kedjan.");
    }
  };

  const runDemo = async () => {
    if (!alsten) {
      toast.error("Hittar inget register på Ålstens Fisk.");
      return;
    }
    try {
      const res = await demo.mutateAsync(alsten.id);
      toast.success(`Demosekvensen är körd i ÖVNINGSLÄGE: ${res.events} händelser, sekvens ${res.journal_seq}.`);
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte köra demosekvensen.");
    }
  };

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">POS-fundament</h1>
        <p className="text-sm text-muted-foreground">
          Etapp P1 av Makrilltrade POS: bolag, butiker, kassaregister och journalminne med låst
          hashkedja. Journalen är append only: ingen kan ändra eller ta bort en post.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* a) Hierarkiträd */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Hierarki: bolag, land, butik, register
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {(regions.data ?? []).map((r: any) => (
                <Badge key={r.country_code} variant="secondary" className="font-mono text-[11px]">
                  {r.country_code} {r.currency_code} {r.locale} avrundning {Number(r.cash_rounding).toFixed(2)}
                </Badge>
              ))}
            </div>
            {tree.map((ent) => (
              <div key={ent.name} className="rounded-xl border border-border p-3">
                <p className="font-semibold">
                  {ent.name} <span className="text-muted-foreground">({ent.country})</span>
                </p>
                <div className="mt-2 space-y-2">
                  {Array.from(ent.stores.values()).map((st) => (
                    <div key={st.name} className="rounded-lg bg-muted/40 p-2">
                      <p className="flex items-center gap-2 font-medium">
                        <StoreIcon className="h-3.5 w-3.5" /> {st.name}
                        <span className="text-xs text-muted-foreground">
                          {st.city} {st.country}
                        </span>
                      </p>
                      {st.regs.map((r) => {
                        const last = lastByRegister.get(r.id);
                        const res = results[r.id];
                        return (
                          <div
                            key={r.id}
                            className="mt-1 flex flex-wrap items-center gap-2 border-t border-border/60 pt-1"
                          >
                            <span className="font-mono text-xs">{r.register_number}</span>
                            <Badge variant={r.is_active ? "default" : "secondary"} className="text-[10px]">
                              {r.is_active ? "Aktivt" : "Vilande"}
                            </Badge>
                            <span className="font-mono text-xs tabular-nums text-muted-foreground">
                              seq {r.journal_seq}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {last ? `senast ${EVENT_LABEL[last.type] ?? last.type} ${fmtTime(last.time)}` : "ingen händelse ännu"}
                            </span>
                            {r.pos_grand_totals && r.pos_grand_totals.training_count > 0 && (
                              <Badge variant="outline" className="text-[10px]">
                                ÖVNING {r.pos_grand_totals.training_count}
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="ml-auto h-7 text-xs"
                              onClick={() => runVerify(r.id)}
                              disabled={verify.isPending}
                            >
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Verifiera kedja
                            </Button>
                            {res && (
                              <span
                                className={`flex items-center gap-1 text-xs font-semibold ${res.ok ? "text-primary" : "text-destructive"}`}
                              >
                                {res.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                {res.ok ? "OK" : `Brott vid ${res.seq}`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!registers.isLoading && (registers.data ?? []).length === 0 && (
              <p className="text-muted-foreground">Inga kassaregister syns med din behörighet.</p>
            )}
          </CardContent>
        </Card>

        {/* b) Journalvy */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> Journalminne: senaste 50 händelserna
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {(journal.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">
                Journalen är tom. Kör demosekvensen för att visa hashkedjan live.
              </p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">Tid</th>
                      <th className="py-1 pr-2">Register</th>
                      <th className="py-1 pr-2">Händelse</th>
                      <th className="py-1 pr-2 text-right">Seq</th>
                      <th className="py-1">Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(journal.data ?? []).map((j) => (
                      <tr key={`${j.register_id}-${j.sequence_no}`} className="border-t border-border/60">
                        <td className="py-1 pr-2 whitespace-nowrap font-mono tabular-nums">{fmtTime(j.event_time)}</td>
                        <td className="py-1 pr-2 font-mono">{registerLabel.get(j.register_id) ?? "register"}</td>
                        <td className="py-1 pr-2">
                          {EVENT_LABEL[j.event_type] ?? j.event_type}
                          {j.payload?.training ? (
                            <Badge variant="outline" className="ml-1 text-[9px]">
                              ÖVNING
                            </Badge>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2 text-right font-mono tabular-nums">{j.sequence_no}</td>
                        <td className="py-1 font-mono">{short(j.hash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* c) Etappstatus */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" /> Etappstatus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {ETAPPER.map((e) => (
              <div key={e.key} className="flex items-center gap-2 border-b border-border/50 pb-1.5 last:border-0">
                <span className="w-8 font-mono text-xs text-muted-foreground">{e.key}</span>
                <span className="min-w-0 flex-1">{e.title}</span>
                <Badge variant={e.done ? "default" : "secondary"} className="text-[10px]">
                  {e.done ? "Klar" : "Ej påbörjad"}
                </Badge>
              </div>
            ))}
            <div className="mt-3 space-y-1 rounded-xl bg-muted/50 p-3 text-xs">
              {DEADLINES.map((d) => (
                <p key={d}>{d}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* d) Demoknapp */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4" /> Demosekvens i övningsläge
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Kör en full sekvens på {alsten?.register_number ?? "Ålstens register"}: övningsläge på,
              kassapass öppnas, tre övningskvitton, kassapass stängs, övningsläge av. Allt märks
              ÖVNING i journalen, beloppen är noll och försäljningssummorna rörs aldrig.
            </p>
            <Button onClick={runDemo} disabled={!isAdmin || demo.isPending}>
              <Play className="mr-2 h-4 w-4" /> Kör demosekvens
            </Button>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">Endast administratör kan köra demosekvensen.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
