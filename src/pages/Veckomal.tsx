import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useStores } from "@/hooks/useStores";
import {
  isoWeekOf, isoWeekMonday, shiftWeek, targetKey, useSaveStoreTargets, useStoreTargets, type StoreTarget,
} from "@/hooks/useStoreTargets";

type Row = { sales: string; pct: string; fromPrev: boolean; saved: boolean };
const fmtDate = (d: Date) => d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

/** Veckomål per butik. Veckor utan mål förifylls med föregående veckas mål. */
export default function Veckomal() {
  const { data: stores = [] } = useStores(true);
  const { data: targets = [], isLoading } = useStoreTargets();
  const save = useSaveStoreTargets();
  const now = shiftWeek(isoWeekOf(new Date()).iso_year, isoWeekOf(new Date()).iso_week, 1);
  const [week, setWeek] = useState(now);
  const [rows, setRows] = useState<Record<string, Row>>({});

  const shops = useMemo(
    () => (stores as any[]).filter((s) => s.active !== false && !s.is_wholesale && !String(s.name).startsWith("Administration")),
    [stores],
  );
  const byKey = useMemo(() => new Map(targets.map((t) => [targetKey(t.store_id, t.iso_year, t.iso_week), t])), [targets]);

  useEffect(() => {
    const prev = shiftWeek(week.iso_year, week.iso_week, -1);
    const next: Record<string, Row> = {};
    for (const s of shops) {
      const own = byKey.get(targetKey(s.id, week.iso_year, week.iso_week));
      const p = byKey.get(targetKey(s.id, prev.iso_year, prev.iso_week));
      const src = own ?? p;
      next[s.id] = {
        sales: src?.target_sales_ex_vat != null ? String(src.target_sales_ex_vat) : "",
        pct: src?.target_staff_cost_pct != null ? String(src.target_staff_cost_pct) : "",
        fromPrev: !own && !!p,
        saved: !!own,
      };
    }
    setRows(next);
  }, [week, shops, byKey]);

  const copyPrev = () => {
    const prev = shiftWeek(week.iso_year, week.iso_week, -1);
    setRows((r) => {
      const n = { ...r };
      for (const s of shops) {
        const p = byKey.get(targetKey(s.id, prev.iso_year, prev.iso_week));
        if (p) n[s.id] = { sales: String(p.target_sales_ex_vat ?? ""), pct: String(p.target_staff_cost_pct ?? ""), fromPrev: true, saved: false };
      }
      return n;
    });
  };

  const submit = async () => {
    const payload: StoreTarget[] = shops
      .filter((s) => rows[s.id]?.sales !== "")
      .map((s) => ({
        store_id: s.id, iso_year: week.iso_year, iso_week: week.iso_week,
        target_sales_ex_vat: Number(rows[s.id].sales.replace(/\s/g, "").replace(",", ".")),
        target_staff_cost_pct: rows[s.id].pct === "" ? null : Number(rows[s.id].pct.replace(",", ".")),
        source: rows[s.id].fromPrev ? `kopierat från vecka ${shiftWeek(week.iso_year, week.iso_week, -1).iso_week}` : "manuellt",
      }));
    if (payload.some((p) => !Number.isFinite(p.target_sales_ex_vat))) return toast.error("Ogiltigt belopp.");
    try {
      await save.mutateAsync(payload);
      toast.success(`Mål sparade för vecka ${week.iso_week}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const mon = isoWeekMonday(week.iso_year, week.iso_week);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-lg">Veckomål per butik</h1>
          <p className="text-xs text-muted-foreground">Försäljning exkl. moms i butikens valuta. Veckor utan mål förifylls med föregående vecka.</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Föregående vecka" onClick={() => setWeek(shiftWeek(week.iso_year, week.iso_week, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[160px] text-center text-sm">Vecka {week.iso_week} · {fmtDate(mon)}–{fmtDate(sun)}</span>
          <Button variant="outline" size="icon" aria-label="Nästa vecka" onClick={() => setWeek(shiftWeek(week.iso_year, week.iso_week, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Butik</th>
                <th className="px-3 py-2 text-right">Försäljningsmål</th>
                <th className="px-3 py-2 text-right">Personalkostnad %</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((s) => {
                const r = rows[s.id] ?? { sales: "", pct: "", fromPrev: false, saved: false };
                const set = (patch: Partial<Row>) => setRows((x) => ({ ...x, [s.id]: { ...r, ...patch, saved: false } }));
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-1.5">{s.name}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <Input className="h-8 w-32 text-right font-mono tabular-nums" inputMode="decimal" value={r.sales} onChange={(e) => set({ sales: e.target.value })} />
                        <span className="w-8 text-xs text-muted-foreground">{s.currency === "CHF" ? "CHF" : "kr"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Input className="ml-auto h-8 w-20 text-right font-mono tabular-nums" inputMode="decimal" value={r.pct} onChange={(e) => set({ pct: e.target.value })} />
                    </td>
                    <td className="px-3 py-1.5">
                      {r.saved ? <Badge variant="outline" className="border-success/40 text-[10px] text-success">Sparat</Badge>
                        : r.fromPrev ? <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">Från föregående vecka – ej sparat</Badge>
                        : r.sales ? <Badge variant="outline" className="text-[10px]">Ändrat</Badge>
                        : <span className="text-xs text-muted-foreground">Inget mål</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={copyPrev}><Copy className="mr-1 h-4 w-4" />Kopiera från föregående vecka</Button>
        <Button onClick={submit} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Spara vecka {week.iso_week}</Button>
      </div>
    </div>
  );
}
