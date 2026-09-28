import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { parsePriceDraft } from "@/lib/priceDraft";

const kr = (v: number | null | undefined, cur = "kr") =>
  v == null ? "–" : `${Number(v).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ")} ${cur}`;

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("price-publish", { body });
  if (error) {
    const ctx = (error as any).context;
    const payload = ctx?.json ? await ctx.json().catch(() => null) : null;
    if (payload) return { status: ctx.status as number, data: payload };
    throw error;
  }
  return { status: 200, data };
}

/** Prisrader i ett pris-utkast: tolkning, gällande priser, stopp och godkännande. */
export function PrisUtkastPanel({ utkastId, innehall, kommentar, onApproved }: { utkastId: number; innehall: string; kommentar: string; onApproved: () => void }) {
  const qc = useQueryClient();
  const local = parsePriceDraft(innehall);
  const [debounced, setDebounced] = useState(innehall);
  useEffect(() => { const t = setTimeout(() => setDebounced(innehall), 600); return () => clearTimeout(t); }, [innehall]);
  const [confirm, setConfirm] = useState<{ sku: string; stop: string }[] | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useQuery({
    queryKey: ["pris-preview", utkastId, debounced],
    queryFn: async () => (await call({ action: "preview", utkast_id: utkastId, innehall: debounced })).data,
  });
  const active = preview.data?.active === true;

  const toggle = async (v: boolean) => {
    const r = await call({ action: "set_active", active: v });
    if (r.status !== 200) return toast.error(r.data?.error ?? "Kunde inte ändra");
    toast.success(v ? "Prisflöde aktivt" : "Prisflöde avstängt");
    qc.invalidateQueries({ queryKey: ["pris-preview"] });
  };

  const approve = async (confirmSkus: string[] = []) => {
    setBusy(true);
    try {
      const r = await call({ action: "approve", utkast_id: utkastId, innehall, vd_kommentar: kommentar || null, confirm_skus: confirmSkus });
      if (r.status === 409) { setConfirm(r.data.needs_confirmation); return; }
      if (r.status !== 200) throw new Error(r.data?.error ?? "Fel");
      const res = (r.data.result ?? []) as any[];
      toast.success(`Godkänt. ${res.map((x) => `${x.sku}: ${x.status ?? x.error}`).join(", ")}`);
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["ai_utkast"] });
      onApproved();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  const rows = (preview.data?.rows ?? []) as any[];
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Prisrader</h3>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={toggle} disabled={preview.isLoading} />
          Prisflöde aktivt
        </label>
      </div>
      {!active && <p className="text-xs text-muted-foreground">Avstängt: vid godkännande sparas bara prishistorik som "ej publicerad". Inget skickas till kassa eller Shopify.</p>}
      {!local.tableFound && <p className="text-sm text-destructive">Ingen pristabell hittades. Format: | SKU | nytt pris (kr inkl. moms) | giltigt från |</p>}
      {preview.isLoading && <p className="text-sm text-muted-foreground">Hämtar gällande priser…</p>}
      {preview.error && <p className="text-sm text-destructive">{(preview.error as Error).message}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead><TableHead>Produkt</TableHead><TableHead className="text-right">Kassa nu</TableHead>
                <TableHead>Shopify nu → nytt</TableHead><TableHead className="text-right">Nytt pris</TableHead>
                <TableHead className="text-right">Förändring</TableHead><TableHead>Giltigt från</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.line} className={r.error ? "bg-destructive/5" : r.stop ? "bg-accent/40" : ""}>
                  <TableCell className="font-mono text-xs">{r.sku ?? "–"}</TableCell>
                  <TableCell className="text-sm">{r.product_name ?? "–"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">{kr(r.old_price)}</TableCell>
                  <TableCell className="text-xs">
                    {r.shopify.length === 0 ? <span className="text-muted-foreground">ingen koppling</span> : r.shopify.map((t: any) => (
                      <div key={t.shop_id + t.shopify_sku}>{t.shop}: {kr(t.current_price, t.currency)} → {kr(t.new_price, t.currency)}{t.read_error && <span className="text-destructive"> ({t.read_error})</span>}</div>
                    ))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">{kr(r.new_price)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-sm">{r.change_pct == null ? "–" : `${r.change_pct > 0 ? "+" : ""}${r.change_pct.toFixed(1).replace(".", ",")} %`}</TableCell>
                  <TableCell className="text-sm">{r.valid_from ?? "–"}</TableCell>
                  <TableCell className="text-xs">
                    {r.error ? <span className="text-destructive">Publiceras inte: {r.error}</span> : r.stop ? <span className="font-medium">Stopp: {r.stop}</span> : "OK"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Button onClick={() => approve()} disabled={busy || !rows.some((r) => !r.error)}>Godkänn prisändring</Button>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekräfta stoppade rader</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                {(confirm ?? []).map((c) => <div key={c.sku}><span className="font-mono">{c.sku}</span>: {c.stop}</div>)}
                <p className="pt-2">Vill du ändå godkänna dessa priser?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => approve((confirm ?? []).map((c) => c.sku))}>Ja, godkänn</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Senaste tre prisändringarna från prisflödet för en produkt. */
export function SenastePrisandringar({ productId }: { productId: string }) {
  const q = useQuery({
    queryKey: ["price_history", "flow", productId],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_history").select("id, old_price, new_price, valid_from, publish_status, changed_by, created_at")
        .eq("product_id", productId).not("new_price", "is", null).order("created_at", { ascending: false }).limit(3);
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Senaste prisändringar</p>
      {(q.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Inga prisändringar ännu.</p> : (q.data ?? []).map((h) => (
        <div key={h.id} className="flex flex-wrap gap-x-3 text-xs">
          <span>{new Date(h.created_at).toLocaleDateString("sv-SE")}</span>
          <span className="font-mono tabular-nums">{kr(h.old_price)} → {kr(h.new_price)}</span>
          <span>från {h.valid_from}</span>
          <span className="text-muted-foreground">{h.publish_status} · {h.changed_by}</span>
        </div>
      ))}
    </div>
  );
}
