import React, { useMemo, useState } from "react";
import { CheckCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrentStaff, staffFullName } from "@/hooks/useCurrentStaff";
import { useIsHrAdmin, useMarkProductionDone, useMarkProductsAsProduction, useUndoProductionDone } from "@/hooks/useProductionDone";
import { fmtQty, fmtTime, isActiveOrder, isOpenLine, isProductionDone, isProductionLine, productionBadgeState } from "@/lib/productionDone";

export function ProductionBadge({ order, className = "" }: { order: any; className?: string }) {
  const state = productionBadgeState(order);
  if (state === "none") return null;
  const who = [fmtTime(order.production_done_at), order.production_done_by_name].filter(Boolean).join(" · ");
  const tone = state === "done" ? "border-row-ok-edge bg-row-ok text-row-ok-text" : "border-row-warn-edge bg-row-warn text-row-warn-text";
  const label = state === "changed" ? "Ändrad efter klarmarkering" : state === "missing" ? `Produktion klar, ${order.production_missing_count} saknas` : "Produktion klar";
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${tone} ${className}`} title={who}>
      {label}{who && <span className="font-mono font-normal tabular-nums">· {who}</span>}
    </span>
  );
}

/** Visas när ordern är aktiv och inte (giltigt) klarmarkerad. */
export const canMarkProduction = (o: any) => isActiveOrder(o) && (!isProductionDone(o) || !!o.production_changed_after_done);

export function ProductionDoneControls({ order, size = "sm" }: { order: any; size?: "sm" | "lg" }) {
  const { toast } = useToast();
  const { data: staff } = useCurrentStaff();
  const { data: isAdmin } = useIsHrAdmin();
  const byName = staffFullName(staff);
  const mark = useMarkProductionDone();
  const undo = useUndoProductionDone();
  const markProducts = useMarkProductsAsProduction();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [askProducts, setAskProducts] = useState<{ id: string; name: string }[]>([]);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  React.useEffect(() => { supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id ?? null)); }, []);

  const openLines = useMemo(() => (order.shop_order_lines || []).filter(isOpenLine), [order]);
  const prodLines = openLines.filter(isProductionLine);
  const otherLines = openLines.filter((l: any) => !isProductionLine(l));
  const missing = prodLines.filter((l: any) => !checked[l.id]).length;

  const start = () => {
    const c: Record<string, boolean> = {}; const q: Record<string, string> = {};
    for (const l of openLines) {
      c[l.id] = isProductionLine(l);
      const saved = Number(l.quantity_delivered || 0);
      q[l.id] = fmtQty(saved > 0 ? saved : Number(l.quantity_ordered || 0)).replace(/\s/g, "");
    }
    setChecked(c); setQty(q); setOpen(true);
  };

  const submit = async () => {
    try {
      const lines = openLines.map((l: any) => ({
        lineId: l.id, productId: l.product_id, checked: !!checked[l.id], isProduction: isProductionLine(l),
        qty: Number(String(qty[l.id] ?? "0").replace(",", ".")) || 0,
      }));
      await mark.mutateAsync({ order, lines, byName });
      setOpen(false);
      toast({ title: missing ? `Färdigpackad, ${missing} saknas` : "Färdigpackad, inget saknas" });
      const extra: { id: string; name: string }[] = otherLines.filter((l: any) => checked[l.id]).map((l: any) => ({ id: l.product_id, name: l.products?.name || "Okänd vara" }));
      const uniq = Array.from(new Map(extra.map((e) => [e.id, e])).values());
      if (uniq.length) setAskProducts(uniq);
    } catch (e: any) {
      toast({ title: "Kunde inte klarmarkera", description: e?.message, variant: "destructive" });
    }
  };

  const doUndo = async () => {
    try { await undo.mutateAsync({ order, byName }); toast({ title: "Klarmarkeringen är ångrad" }); }
    catch (e: any) { toast({ title: "Kunde inte ångra", description: e?.message, variant: "destructive" }); }
    setConfirmUndo(false);
  };

  const canUndo = isProductionDone(order) && !["Skickad", "Levererad", "Klar / Levererad"].includes(order.status)
    && (isAdmin || order.production_done_by === uid);

  const lineRow = (l: any) => (
    <div key={l.id} className="flex flex-wrap items-center gap-2 border-b border-grid-line py-2 last:border-b-0">
      <Checkbox checked={!!checked[l.id]} onCheckedChange={(v) => setChecked((c) => ({ ...c, [l.id]: !!v }))} aria-label={`Bocka ${l.products?.name}`} />
      <span className="min-w-0 flex-1 break-words text-sm">{l.products?.name || "Okänd vara"}<span className="block font-mono text-[11px] tabular-nums text-muted-foreground">Beställt {fmtQty(l.quantity_ordered)} {l.unit || l.products?.unit}</span></span>
      <Input inputMode="decimal" className="h-9 w-24 text-right font-mono tabular-nums" value={qty[l.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))} aria-label="Packad mängd" />
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canMarkProduction(order) && (
          <Button size={size === "lg" ? "default" : "sm"} className="gap-1.5" onClick={start}><CheckCheck className="h-4 w-4" /> Produktionen färdigpackad</Button>
        )}
        {canUndo && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirmUndo(true)}><Undo2 className="h-4 w-4" /> Ångra klarmarkering</Button>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Produktionen färdigpackad</DialogTitle>
            <DialogDescription>{order.stores?.name} · rader som ännu inte är packade.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Produktionens varor</p>
              {prodLines.length ? prodLines.map(lineRow) : <p className="py-2 text-sm text-muted-foreground">Inga öppna rader.</p>}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Övriga varor</p>
              {otherLines.length ? otherLines.map(lineRow) : <p className="py-2 text-sm text-muted-foreground">Inga öppna rader.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button onClick={submit} disabled={mark.isPending}>{missing ? `Färdigpackad, ${missing} saknas` : "Färdigpackad, inget saknas"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={askProducts.length > 0} onOpenChange={(o) => !o && setAskProducts([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Produktionens varor framöver?</AlertDialogTitle>
            <AlertDialogDescription>Ska {askProducts.map((p) => p.name).join(", ")} räknas som produktionens varor framöver?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Nej</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { await markProducts.mutateAsync(askProducts.map((p) => p.id)); setAskProducts([]); }}>Ja</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ångra klarmarkering?</AlertDialogTitle>
            <AlertDialogDescription>Stämpeln tas bort och raderna som klarmarkeringen packade går tillbaka till sin tidigare status och mängd.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={doUndo}>Ångra</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** I utfälld order: kvarvarande inköpsrader när produktionen är klar. */
export function BuyRemainingSection({ order }: { order: any }) {
  if (!isProductionDone(order)) return null;
  const lines = (order.shop_order_lines || []).filter((l: any) => isOpenLine(l) && !isProductionLine(l));
  const missingLines = (order.shop_order_lines || []).filter((l: any) => l.production_missing && isOpenLine(l));
  return (
    <div className="space-y-2 rounded-md border border-grid-line bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Kvar att köpa in (Fiskhamnen)</p>
      {lines.length === 0 ? <p className="text-sm text-muted-foreground">Inget kvar att köpa in.</p> : lines.map((l: any) => (
        <div key={l.id} className="flex flex-wrap justify-between gap-2 text-sm"><span className="min-w-0 break-words">{l.products?.name}</span><span className="font-mono tabular-nums">{fmtQty(Number(l.quantity_ordered || 0) - Number(l.quantity_delivered || 0))} {l.unit || l.products?.unit}</span></div>
      ))}
      {missingLines.length > 0 && (
        <div className="border-t border-grid-line pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-row-warn-text">Saknas från produktionen</p>
          {missingLines.map((l: any) => <div key={l.id} className="text-sm">{l.products?.name} · <span className="font-mono tabular-nums">{fmtQty(l.quantity_ordered)} {l.unit || l.products?.unit}</span></div>)}
        </div>
      )}
    </div>
  );
}
