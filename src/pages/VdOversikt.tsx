import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: any) => any };

const ENTITIES = [
  { code: "fsab-se", name: "FSAB" },
  { code: "de-no1", name: "DE No.1" },
];

const ymd = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const mondayOf = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const isoWeek = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 3 - ((x.getUTCDay() + 6) % 7)); const y = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return { year: x.getUTCFullYear(), week: 1 + Math.round(((x.getTime() - y.getTime()) / 864e5 - 3 + ((y.getUTCDay() + 6) % 7)) / 7) }; };
const fmt = (v: number) => Math.round(v).toLocaleString("sv-SE").replace(/\u00a0/g, " ");
const dLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

const Saknas = () => <span className="italic text-muted-foreground">saknas</span>;
const Money = ({ v }: { v: number | null | undefined }) => (v == null ? <Saknas /> : <span className="font-mono tabular-nums">{fmt(v)}</span>);
const Pct = ({ a, b }: { a: number | null; b: number | null }) => {
  if (a == null || b == null || b === 0) return <Saknas />;
  const p = ((a - b) / b) * 100;
  return <span className={`font-mono tabular-nums ${p < 0 ? "text-destructive" : "text-foreground"}`}>{p > 0 ? "+" : ""}{Math.round(p)} %</span>;
};

type Store = { id: string; name: string; currency: string | null };

async function loadData() {
  const today = ymd(new Date());
  const yest = addDays(today, -1);
  const mon = mondayOf(today);
  const from = addDays(today, -8);
  const { year, week } = isoWeek(today);
  const in4w = addDays(mon, 28);

  const [stores, reports, fx, targets, waiting, drafts, lastRun, devs, custInv, supInv, bank] = await Promise.all([
    db.from("stores").select("id,name,currency").eq("active", true).order("name"),
    db.from("daily_reports").select("store_id,report_date,net_sales,currency").gte("report_date", from < mon ? from : mon).lte("report_date", today),
    db.from("fx_daily_rates").select("base_currency,rate,rate_date").eq("quote_currency", "SEK").lte("rate_date", today).order("rate_date", { ascending: false }).limit(20),
    db.from("store_targets").select("store_id,target_sales_ex_vat").eq("iso_year", year).eq("iso_week", week),
    db.from("ai_uppgifter").select("id", { count: "exact", head: true }).eq("status", "väntar på vd"),
    db.from("ai_utkast").select("id", { count: "exact", head: true }).in("status", ["utkast", "redigerat"]),
    db.from("system_checks").select("run_at").order("run_at", { ascending: false }).limit(1),
    db.from("deviations").select("id,title,due_date,store_id,created_at").is("closed_at", null).order("created_at", { ascending: false }).limit(200),
    db.from("fortnox_invoice_jobs").select("id,legal_entity_code,fortnox_document_number,fortnox_balance,final_pay_date").gt("fortnox_balance", 0).is("cancelled_at", null).order("fortnox_balance", { ascending: false }).limit(3),
    db.from("fortnox_supplier_invoices").select("legal_entity_code,supplier_name,invoice_number,due_date,balance,currency").eq("paid", false).lt("due_date", today).order("balance", { ascending: false }).limit(3),
    db.from("bank_balances").select("legal_entity_code,balance_date,balance").order("balance_date", { ascending: false }),
  ]);

  const checks = lastRun.data?.[0]
    ? (await db.from("system_checks").select("check_name,count,status,run_at").eq("run_at", lastRun.data[0].run_at).eq("status", "fel").order("count", { ascending: false })).data ?? []
    : null;

  const liquidity = await Promise.all(ENTITIES.map(async (e) => {
    const opening = (bank.data ?? []).find((b: any) => b.legal_entity_code === e.code && b.balance_date <= mon)
      ?? (bank.data ?? []).find((b: any) => b.legal_entity_code === e.code);
    if (!opening) return { ...e, weeks: null as null | { week_start: string; saldo: number }[] };
    const { data } = await db.rpc("likviditet_veckor", { _entity: e.code, _start: mon });
    let run = Number(opening.balance);
    const weeks = [0, 1, 2, 3].map((i) => {
      const w = addDays(mon, i * 7);
      for (const l of (data ?? []) as any[]) if (l.week_start === w && l.amount != null) run += l.direction === "in" ? Number(l.amount) : -Number(l.amount);
      return { week_start: w, saldo: run };
    });
    return { ...e, weeks };
  }));

  return { today, yest, mon, in4w, week, stores: (stores.data ?? []) as Store[], reports: reports.data ?? [], fx: fx.data ?? [],
    targets: targets.data ?? [], waiting: waiting.count ?? null, drafts: drafts.count ?? null, checks, devs: devs.data ?? [],
    custInv: custInv.data ?? [], supInv: supInv.data ?? [], liquidity };
}

function Card({ title, link, linkText, children }: { title: string; link?: string; linkText?: string; children: React.ReactNode }) {
  return (
    <section className="border rounded-md p-3 bg-card space-y-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {link && <Link to={link} className="text-xs text-primary underline-offset-2 hover:underline">{linkText ?? "Öppna"}</Link>}
      </div>
      {children}
    </section>
  );
}

export default function VdOversikt() {
  const { user } = useStaffAuth() as any;
  const q = useQuery({ queryKey: ["vd-oversikt"], queryFn: loadData, refetchInterval: 5 * 60_000 });
  const pref = useQuery({
    queryKey: ["user-start-page", user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await db.from("user_start_page").select("vd_overview").eq("user_id", user.id).maybeSingle()).data,
  });
  const togglePref = async (v: boolean) => {
    const { error } = await db.from("user_start_page").upsert({ user_id: user.id, vd_overview: v, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else { toast.success(v ? "VD-översikt är din startsida" : "Startsida återställd"); pref.refetch(); }
  };

  if (q.isLoading) return <p className="p-4 text-sm text-muted-foreground">Laddar…</p>;
  if (q.error || !q.data) return <p className="p-4 text-sm text-destructive">{(q.error as Error)?.message}</p>;
  const d = q.data;

  const rateFor = (cur: string | null, date: string) => {
    if (!cur || cur === "SEK") return 1;
    const r = d.fx.find((f: any) => f.base_currency === cur && f.rate_date <= date) ?? d.fx.find((f: any) => f.base_currency === cur);
    return r ? Number(r.rate) : null;
  };
  const sales = (storeId: string, date: string, cur: string | null): number | null => {
    const r = d.reports.find((x: any) => x.store_id === storeId && x.report_date === date);
    if (!r || r.net_sales == null) return null;
    const rate = rateFor(r.currency ?? cur, date);
    return rate == null ? null : Number(r.net_sales) * rate;
  };
  const weekSales = (s: Store) => {
    const rows = d.reports.filter((x: any) => x.store_id === s.id && x.report_date >= d.mon && x.net_sales != null);
    if (!rows.length) return null;
    return rows.reduce((sum: number, r: any) => sum + Number(r.net_sales) * (rateFor(r.currency ?? s.currency, r.report_date) ?? 0), 0);
  };
  const target = (s: Store) => {
    const t = d.targets.find((x: any) => x.store_id === s.id);
    if (t?.target_sales_ex_vat == null) return null;
    return Number(t.target_sales_ex_vat) * (rateFor(s.currency, d.today) ?? 0);
  };
  const storeName = (id: string | null) => d.stores.find((s) => s.id === id)?.name ?? "—";
  const overdue = d.devs.filter((x: any) => x.due_date && x.due_date < d.today).length;

  return (
    <div className="p-3 md:p-5 space-y-3 max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">VD-översikt</h1>
          <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })} · vecka {d.week} · belopp i SEK ex moms</p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={!!pref.data?.vd_overview} onCheckedChange={togglePref} disabled={!user?.id} />
          Startsida: VD-översikt
        </label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Link to="/tavlan" className="border rounded-md p-3 bg-card hover:bg-accent">
          <div className="text-xs text-muted-foreground">Väntar på vd</div>
          <div className="text-2xl font-mono tabular-nums">{d.waiting ?? <Saknas />}</div>
        </Link>
        <Link to="/attestera" className="border rounded-md p-3 bg-card hover:bg-accent">
          <div className="text-xs text-muted-foreground">Att attestera</div>
          <div className="text-2xl font-mono tabular-nums">{d.drafts ?? <Saknas />}</div>
        </Link>
        <Link to="/systemkontroll" className="border rounded-md p-3 bg-card hover:bg-accent">
          <div className="text-xs text-muted-foreground">Systemfel</div>
          <div className={`text-2xl font-mono tabular-nums ${d.checks?.length ? "text-destructive" : ""}`}>{d.checks == null ? <Saknas /> : d.checks.length}</div>
        </Link>
        <div className="border rounded-md p-3 bg-card">
          <div className="text-xs text-muted-foreground">Öppna avvikelser</div>
          <div className="text-2xl font-mono tabular-nums">{d.devs.length}{overdue > 0 && <span className="text-xs text-destructive ml-1">({overdue} försenade)</span>}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card title="Försäljning per butik" link="/dagsrapport" linkText="Dagsrapporter">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-2 font-normal">Butik</th>
                  <th className="py-1 px-1 font-normal text-right">I dag <span className="block">mot {dLabel(addDays(d.today, -7))}</span></th>
                  <th className="py-1 pl-1 font-normal text-right">I går <span className="block">mot {dLabel(addDays(d.yest, -7))}</span></th>
                </tr>
              </thead>
              <tbody>
                {d.stores.map((s) => {
                  const t0 = sales(s.id, d.today, s.currency), t7 = sales(s.id, addDays(d.today, -7), s.currency);
                  const y0 = sales(s.id, d.yest, s.currency), y7 = sales(s.id, addDays(d.yest, -7), s.currency);
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="py-1 pr-2 truncate max-w-[9rem]">{s.name}</td>
                      <td className="py-1 px-1 text-right"><Money v={t0} /><div><Pct a={t0} b={t7} /></div></td>
                      <td className="py-1 pl-1 text-right"><Money v={y0} /><div><Pct a={y0} b={y7} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={`Veckan hittills mot mål (v. ${d.week})`} link="/veckomal" linkText="Veckomål">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-2 font-normal">Butik</th>
                  <th className="py-1 px-1 font-normal text-right">Utfall</th>
                  <th className="py-1 px-1 font-normal text-right">Mål</th>
                  <th className="py-1 pl-1 font-normal text-right">Uppnått</th>
                </tr>
              </thead>
              <tbody>
                {d.stores.map((s) => {
                  const w = weekSales(s), t = target(s);
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="py-1 pr-2 truncate max-w-[9rem]">{s.name}</td>
                      <td className="py-1 px-1 text-right"><Money v={w} /></td>
                      <td className="py-1 px-1 text-right"><Money v={t} /></td>
                      <td className="py-1 pl-1 text-right font-mono tabular-nums">{w != null && t ? `${Math.round((w / t) * 100)} %` : <Saknas />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Systemkontrollens senaste fel" link="/systemkontroll" linkText="Systemkontroll">
          {d.checks == null ? <Saknas /> : d.checks.length === 0 ? <p className="text-xs text-muted-foreground">Inga fel i senaste körningen.</p> : (
            <ul className="text-xs divide-y">
              {d.checks.map((c: any) => (
                <li key={c.check_name} className="py-1 flex justify-between gap-2"><span className="truncate">{c.check_name}</span><span className="font-mono tabular-nums text-destructive">{c.count ?? "—"}</span></li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Öppna avvikelser" link="/food-safety" linkText="Egenkontroll">
          {d.devs.length === 0 ? <Saknas /> : (
            <ul className="text-xs divide-y">
              {d.devs.slice(0, 5).map((x: any) => (
                <li key={x.id} className="py-1 flex justify-between gap-2">
                  <span className="truncate">{x.title} <span className="text-muted-foreground">· {storeName(x.store_id)}</span></span>
                  <span className={`shrink-0 ${x.due_date && x.due_date < d.today ? "text-destructive" : "text-muted-foreground"}`}>{x.due_date ? dLabel(x.due_date) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Största obetalda kundfakturor">
          {d.custInv.length === 0 ? <Saknas /> : (
            <ul className="text-xs divide-y">
              {d.custInv.map((x: any) => (
                <li key={x.id} className="py-1 flex justify-between gap-2">
                  <span className="truncate">Faktura {x.fortnox_document_number ?? "—"} · {x.legal_entity_code} · förfaller {x.final_pay_date ? dLabel(x.final_pay_date) : <Saknas />}</span>
                  <Money v={Number(x.fortnox_balance)} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Största förfallna leverantörsfakturor" link="/likviditet" linkText="Likviditet">
          {d.supInv.length === 0 ? <Saknas /> : (
            <ul className="text-xs divide-y">
              {d.supInv.map((x: any) => (
                <li key={`${x.legal_entity_code}-${x.invoice_number}`} className="py-1 flex justify-between gap-2">
                  <span className="truncate">{x.supplier_name ?? "—"} · {x.legal_entity_code} · förföll <span className="text-destructive">{dLabel(x.due_date)}</span></span>
                  <span><Money v={Number(x.balance)} />{x.currency && x.currency !== "SEK" ? ` ${x.currency}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Likviditet närmaste fyra veckorna" link="/likviditet" linkText="Likviditet">
          <div className="space-y-2">
            {d.liquidity.map((e) => (
              <div key={e.code} className="text-xs">
                <div className="font-medium">{e.name}</div>
                {e.weeks == null ? (
                  <Link to="/likviditet" className="italic text-destructive underline">banksaldo saknas – lägg in</Link>
                ) : (
                  <div className="grid grid-cols-4 gap-1">
                    {e.weeks.map((w) => (
                      <div key={w.week_start} className={`border rounded p-1 text-center ${w.saldo < 0 ? "border-destructive text-destructive" : ""}`}>
                        <div className="text-muted-foreground">v. {isoWeek(w.week_start).week}</div>
                        <Money v={w.saldo} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
