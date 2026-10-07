import React, { useMemo } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductionBadge, ProductionDoneControls } from "@/components/orders/ProductionDone";
import { esc, fmtDay, fmtQty, isActiveOrder, isOpenLine, isProductionDone, isProductionLine, orderDeliveryDate, printHtml } from "@/lib/productionDone";

const sortOrders = (a: any, b: any) =>
  orderDeliveryDate(a).localeCompare(orderDeliveryDate(b)) || (a.stores?.name || "").localeCompare(b.stores?.name || "", "sv");

const unitOf = (l: any) => l.unit || l.products?.unit || "";
const remainingOf = (l: any) => Math.max(0, Number(l.quantity_ordered || 0) - Number(l.quantity_delivered || 0));

/** Produktionslista: bara produktionens rader på aktiva ordrar. */
export function ProductionListView({ orders }: { orders: any[] }) {
  const active = useMemo(() => orders.filter(isActiveOrder)
    .map((o) => ({ o, lines: (o.shop_order_lines || []).filter(isProductionLine).sort((a: any, b: any) => (a.products?.name || "").localeCompare(b.products?.name || "", "sv")) }))
    .filter((x) => x.lines.length > 0), [orders]);
  const open = active.filter((x) => !isProductionDone(x.o) || x.o.production_changed_after_done).sort((a, b) => sortOrders(a.o, b.o));
  const done = active.filter((x) => isProductionDone(x.o) && !x.o.production_changed_after_done).sort((a, b) => sortOrders(a.o, b.o));

  const summary = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; days: Map<string, number>; total: number }>();
    for (const { o, lines } of open) {
      const day = orderDeliveryDate(o);
      for (const l of lines) {
        if (!isOpenLine(l)) continue;
        const rem = remainingOf(l);
        if (rem <= 0.005) continue;
        const key = `${l.product_id}|${unitOf(l)}`;
        const e = map.get(key) ?? { name: l.products?.name || "Okänd vara", unit: unitOf(l), days: new Map(), total: 0 };
        e.days.set(day, (e.days.get(day) || 0) + rem); e.total += rem; map.set(key, e);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [open]);

  const print = () => {
    const sum = summary.map((s) => `<tr><td>${esc(s.name)}</td><td>${[...s.days.entries()].sort().map(([d, q]) => `${esc(fmtDay(d))}: ${fmtQty(q)}`).join("<br>")}</td><td class="n">${fmtQty(s.total)} ${esc(s.unit)}</td></tr>`).join("");
    const block = (list: typeof open) => list.map(({ o, lines }) => `<h2>${esc(fmtDay(orderDeliveryDate(o)))} · ${esc(o.stores?.name)}</h2><table><tr><th>Vara</th><th class="n">Beställt</th><th class="n">Packat</th><th>Status</th><th>Anteckning</th></tr>${lines.map((l: any) => `<tr><td>${esc(l.products?.name)}</td><td class="n">${fmtQty(l.quantity_ordered)} ${esc(unitOf(l))}</td><td class="n">${fmtQty(l.quantity_delivered || 0)}</td><td>${esc(l.status || "Ny")}${l.production_missing ? " · Saknas" : ""}</td><td>${esc(l.deviation || l.priority_note || "")}</td></tr>`).join("")}</table>`).join("");
    printHtml("Produktionslista", `<h1>Produktionslista</h1><p class="m">Utskriven ${esc(new Date().toLocaleString("sv-SE"))}</p><h2>Kvar att packa per vara</h2><table><tr><th>Vara</th><th>Per leveransdag</th><th class="n">Totalt</th></tr>${sum}</table>${block(open)}${done.length ? `<h1 style="margin-top:20px">Klara</h1>${block(done)}` : ""}`);
  };

  const orderCard = ({ o, lines }: { o: any; lines: any[] }) => (
    <div key={o.id} className="rounded-md border border-grid-line bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold">{o.stores?.name || "Okänd butik"}</p>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{fmtDay(orderDeliveryDate(o))} · {o.status}</p>
          <ProductionBadge order={o} className="mt-1" />
        </div>
        <ProductionDoneControls order={o} />
      </div>
      <div className="mt-2 divide-y divide-grid-line">
        {lines.map((l: any) => (
          <div key={l.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-1.5 text-sm">
            <span className="min-w-0 break-words">{l.products?.name || "Okänd vara"}</span>
            <span className="text-right font-mono tabular-nums">{fmtQty(l.quantity_ordered)} {unitOf(l)}</span>
            <span className="text-[11px] text-muted-foreground">{l.status || "Ny"}{l.production_missing && <span className="ml-1 font-semibold text-row-warn-text">· Saknas från produktionen</span>}{(l.deviation || l.priority_note) && <span className="block break-words">{l.deviation || l.priority_note}</span>}</span>
            <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">Packat {fmtQty(l.quantity_delivered || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Endast varor märkta som produktionens. Sorterat på leveransdag och butik.</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={print}><Printer className="h-4 w-4" /> Skriv ut</Button>
      </div>
      <div className="rounded-md border border-grid-line bg-card p-3 shadow-sm">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Kvar att packa per vara</p>
        {summary.length === 0 ? <p className="text-sm text-muted-foreground">Inget kvar att packa.</p> : (
          <div className="divide-y divide-grid-line">
            {summary.map((s) => (
              <div key={s.name + s.unit} className="flex flex-wrap justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0 break-words font-medium">{s.name}<span className="block font-mono text-[11px] font-normal tabular-nums text-muted-foreground">{[...s.days.entries()].sort().map(([d, q]) => `${fmtDay(d)}: ${fmtQty(q)}`).join(" · ")}</span></span>
                <span className="font-mono font-semibold tabular-nums">{fmtQty(s.total)} {s.unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {open.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Inga ordrar väntar på produktionen.</p>}
      <div className="grid gap-2 lg:grid-cols-2">{open.map(orderCard)}</div>
      {done.length > 0 && <>
        <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Klara</h3>
        <div className="grid gap-2 lg:grid-cols-2">{done.map(orderCard)}</div>
      </>}
    </div>
  );
}

/** Kvar att köpa in: öppna inköpsrader på ordrar där produktionen är klar. */
export function BuyRemainingView({ orders }: { orders: any[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; total: number; parts: { store: string; day: string; qty: number }[] }>();
    for (const o of orders.filter((x) => isActiveOrder(x) && isProductionDone(x))) {
      for (const l of o.shop_order_lines || []) {
        if (!isOpenLine(l) || isProductionLine(l)) continue;
        const rem = remainingOf(l); if (rem <= 0.005) continue;
        const key = `${l.product_id}|${unitOf(l)}`;
        const e = map.get(key) ?? { name: l.products?.name || "Okänd vara", unit: unitOf(l), total: 0, parts: [] };
        e.total += rem; e.parts.push({ store: o.stores?.name || "Okänd butik", day: orderDeliveryDate(o), qty: rem }); map.set(key, e);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [orders]);
  const partsSorted = (p: { store: string; day: string; qty: number }[]) => [...p].sort((a, b) => a.day.localeCompare(b.day) || a.store.localeCompare(b.store, "sv"));

  const print = () => printHtml("Kvar att köpa in", `<h1>Kvar att köpa in (Fiskhamnen)</h1><p class="m">Ordrar där produktionen är klarmarkerad · ${esc(new Date().toLocaleString("sv-SE"))}</p><table><tr><th>Vara</th><th>Butik och leveransdag</th><th class="n">Totalt</th></tr>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${partsSorted(r.parts).map((p) => `${esc(p.store)} · ${esc(fmtDay(p.day))}: ${fmtQty(p.qty)}`).join("<br>")}</td><td class="n">${fmtQty(r.total)} ${esc(r.unit)}</td></tr>`).join("")}</table>`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Öppna rader som inte är produktionens varor, på ordrar där produktionen är klar. Radernas status ändras inte.</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={print}><Printer className="h-4 w-4" /> Skriv ut</Button>
      </div>
      <div className="rounded-md border border-grid-line bg-card p-3 shadow-sm">
        {rows.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Inget kvar att köpa in.</p> : (
          <div className="divide-y divide-grid-line">
            {rows.map((r) => (
              <div key={r.name + r.unit} className="py-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words font-medium">{r.name}</span><span className="font-mono font-semibold tabular-nums">{fmtQty(r.total)} {r.unit}</span></div>
                {partsSorted(r.parts).map((p, i) => <div key={i} className="flex flex-wrap justify-between gap-2 text-[12px] text-muted-foreground"><span className="min-w-0 break-words">{p.store} · {fmtDay(p.day)}</span><span className="font-mono tabular-nums">{fmtQty(p.qty)}</span></div>)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
