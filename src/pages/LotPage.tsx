import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Printer, MoveRight, Shuffle, Trash2, ClipboardCheck } from "lucide-react";
import { printLotLabelById } from "@/lib/lotQrLabelPdf";
import { recordMovement, transferStock, lotUnitCost } from "@/lib/stockLedger";
import { performTransformation, suggestTransformKind } from "@/lib/stockTransform";

const kg1 = (n: number) => Number(n || 0).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const r1 = (s: string) => Math.round(Number(String(s).replace(",", ".")) * 10) / 10;
const svDT = (v: string) => new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
const svD = (v: string) => new Date(v).toLocaleDateString("sv-SE");

const MOVE_LABEL: Record<string, string> = {
  inleverans: "Inleverans", overforing_in: "Flytt in", overforing_ut: "Flytt ut", tillverkning_in: "Omvandling in",
  tillverkning_ut: "Omvandling ut", forsaljning: "Försäljning", kundorder: "Kundorder", kundorder_reversering: "Kundorder åter",
  svinn: "Svinn", inventering: "Inventering", justering: "Justering",
};
const WASTE_REASONS = ["Bäst före passerat", "Skadad", "Kvalitet", "Temperatur", "Spill", "Övrigt"];

type Action = null | "flytta" | "omvandla" | "svinn" | "rakna";

interface ChainLot { id: string; lot_number: string; name: string; kind: string; }

async function loadChain(lotId: string) {
  const back: ChainLot[] = [];
  const fwd: ChainLot[] = [];
  const seen = new Set<string>([lotId]);
  const fetchLots = async (ids: string[]) => {
    if (!ids.length) return [];
    const { data } = await supabase.from("lots").select("id, lot_number, parent_lot_id, commercial_name, products(name)").in("id", ids);
    return (data ?? []) as any[];
  };
  // Bakåt
  let frontier = [lotId];
  for (let d = 0; d < 10 && frontier.length; d++) {
    const { data: tr } = await supabase.from("lot_transformations").select("from_lot_id").in("to_lot_id", frontier);
    const self = await fetchLots(frontier);
    const ids = new Set<string>();
    (tr ?? []).forEach((t: any) => t.from_lot_id && ids.add(t.from_lot_id));
    self.forEach((l) => l.parent_lot_id && ids.add(l.parent_lot_id));
    const next = [...ids].filter((i) => !seen.has(i));
    next.forEach((i) => seen.add(i));
    (await fetchLots(next)).forEach((l) => back.push({ id: l.id, lot_number: l.lot_number, name: l.commercial_name || l.products?.name || "", kind: d === 0 ? "Direkt källa" : `Källa nivå ${d + 1}` }));
    frontier = next;
  }
  // Framåt
  frontier = [lotId];
  for (let d = 0; d < 10 && frontier.length; d++) {
    const { data: tr } = await supabase.from("lot_transformations").select("to_lot_id").in("from_lot_id", frontier);
    const { data: kids } = await supabase.from("lots").select("id").in("parent_lot_id", frontier);
    const ids = new Set<string>();
    (tr ?? []).forEach((t: any) => t.to_lot_id && ids.add(t.to_lot_id));
    (kids ?? []).forEach((k: any) => ids.add(k.id));
    const next = [...ids].filter((i) => !seen.has(i));
    next.forEach((i) => seen.add(i));
    (await fetchLots(next)).forEach((l) => fwd.push({ id: l.id, lot_number: l.lot_number, name: l.commercial_name || l.products?.name || "", kind: d === 0 ? "Direkt" : `Nivå ${d + 1}` }));
    frontier = next;
  }
  return { back, fwd };
}

export default function LotPage({ lotId }: { lotId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [locId, setLocId] = useState("");
  const [toLocId, setToLocId] = useState("");
  const [qty, setQty] = useState("");
  const [qtyOut, setQtyOut] = useState("");
  const [reason, setReason] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [targetProd, setTargetProd] = useState<{ id: string; name: string } | null>(null);

  const lotQ = useQuery({
    queryKey: ["lot_page", lotId],
    queryFn: async () => {
      const { data, error } = await supabase.from("lots")
        .select("*, suppliers(name), products(id, name, category)").eq("id", lotId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const movQ = useQuery({
    queryKey: ["lot_page_mov", lotId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements")
        .select("id, movement_type, quantity_kg, created_at, note, location_id, storage_locations(name, stores(name))")
        .eq("lot_id", lotId).order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const originQ = useQuery({
    queryKey: ["lot_page_origin", lotId],
    queryFn: async () => {
      const [a, d] = await Promise.all([
        supabase.from("auction_purchases").select("*").eq("lot_id", lotId).limit(5),
        supabase.from("incoming_delivery_lines").select("id, quantity, delivery_id, incoming_deliveries(*)").eq("lot_id", lotId).limit(5),
      ]);
      return { auctions: (a.data ?? []) as any[], deliveries: (d.data ?? []) as any[] };
    },
  });
  const chainQ = useQuery({ queryKey: ["lot_page_chain", lotId], queryFn: () => loadChain(lotId) });
  const locsQ = useQuery({
    queryKey: ["lot_page_locs"],
    enabled: action === "flytta",
    queryFn: async () => {
      const { data } = await supabase.from("storage_locations").select("id, name, stores(name)").eq("active", true).order("name");
      return (data ?? []) as any[];
    },
  });
  const prodQ = useQuery({
    queryKey: ["lot_page_prod", prodSearch],
    enabled: action === "omvandla" && prodSearch.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name").ilike("name", `%${prodSearch.trim()}%`).limit(20);
      return (data ?? []) as any[];
    },
  });

  const balances = useMemo(() => {
    const m = new Map<string, { id: string; name: string; qty: number }>();
    (movQ.data ?? []).forEach((r) => {
      const name = `${r.storage_locations?.stores?.name ? r.storage_locations.stores.name + " · " : ""}${r.storage_locations?.name ?? ""}`;
      const cur = m.get(r.location_id) ?? { id: r.location_id, name, qty: 0 };
      cur.qty = Math.round((cur.qty + Number(r.quantity_kg || 0)) * 1000) / 1000;
      m.set(r.location_id, cur);
    });
    return [...m.values()].filter((b) => b.qty > 0.0005);
  }, [movQ.data]);

  const lot = lotQ.data;
  const total = balances.reduce((s, b) => s + b.qty, 0);
  const locBal = balances.find((b) => b.id === locId)?.qty ?? 0;

  const open = (a: Action) => {
    setAction(a); setQty(""); setQtyOut(""); setReason(""); setToLocId(""); setTargetProd(null); setProdSearch("");
    setLocId(balances.length === 1 ? balances[0].id : "");
  };
  const refresh = () => {
    ["lot_page", "lot_page_mov", "lot_page_chain"].forEach((k) => qc.invalidateQueries({ queryKey: [k, lotId] }));
  };
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ title: ok }); setAction(null); refresh(); }
    catch (e: any) { toast({ title: "Det gick inte", description: e?.message ?? String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const need = (cond: boolean, msg: string) => { if (!cond) throw new Error(msg); };

  const doMove = () => run(async () => {
    const q = r1(qty);
    need(!!locId && !!toLocId && locId !== toLocId, "Välj från- och till-plats.");
    need(q > 0 && q <= locBal + 0.05, "Ange vikt som finns på platsen.");
    await transferStock({ productId: lot.product_id, fromLocationId: locId, toLocationId: toLocId, quantityKg: q, lotId, referenceType: "parti_skanning", note: "Flytt från partisidan" });
  }, "Flyttat");

  const doWaste = () => run(async () => {
    const q = r1(qty);
    need(!!locId, "Välj plats."); need(!!reason, "Välj orsak.");
    need(q > 0 && q <= locBal + 0.05, "Ange vikt som finns på platsen.");
    await recordMovement({ productId: lot.product_id, locationId: locId, quantityKg: q, movementType: "svinn", lotId, unitCost: await lotUnitCost(lotId), referenceType: "parti_skanning", note: `Svinn: ${reason}` });
  }, "Svinn registrerat");

  const doCount = () => run(async () => {
    const counted = r1(qty);
    need(!!locId, "Välj plats."); need(counted >= 0 && qty !== "", "Ange räknad vikt.");
    const delta = Math.round((counted - locBal) * 1000) / 1000;
    if (delta === 0) return;
    await recordMovement({ productId: lot.product_id, locationId: locId, quantityKg: delta, movementType: "inventering", lotId, unitCost: await lotUnitCost(lotId), referenceType: "parti_skanning", note: `Räknat på partiet: ${kg1(counted)} kg` });
  }, "Räkning sparad");

  const doTransform = () => run(async () => {
    const qin = r1(qty), qout = r1(qtyOut);
    need(!!locId, "Välj plats."); need(!!targetProd, "Välj ny produkt.");
    need(qin > 0 && qin <= locBal + 0.05, "Ange vikt in som finns på platsen.");
    need(qout > 0, "Ange vikt ut.");
    const { data: loc } = await supabase.from("storage_locations").select("store_id").eq("id", locId).maybeSingle();
    const res = await performTransformation({
      storeId: (loc as any)?.store_id ?? null, locationId: locId,
      sourceProductId: lot.product_id, sourceProductName: lot.products?.name, sourceLotId: lotId,
      sourceQuantity: qin, sourceUnitCost: await lotUnitCost(lotId),
      targetProductId: targetProd!.id, targetProductName: targetProd!.name, targetQuantity: qout,
      kind: suggestTransformKind(targetProd!.name),
    });
    toast({ title: `Utbyte ${res.yieldPct.toLocaleString("sv-SE")} %` });
    if (res.targetLotId) {
      await printLotLabelById(res.targetLotId, qout).catch(() => undefined);
      navigate(`/lot/${res.targetLotId}`);
    }
  }, "Omvandlat");

  if (lotQ.isLoading) return <div className="p-4 text-muted-foreground">Laddar…</div>;
  if (!lot) return <div className="p-4 text-muted-foreground">Partiet hittades inte eller saknar behörighet.</div>;

  const name = lot.commercial_name || lot.products?.name || "Parti";
  const yieldPreview = r1(qty) > 0 && r1(qtyOut) > 0 ? Math.round((r1(qtyOut) / r1(qty)) * 1000) / 10 : null;

  const locSelect = (
    <Select value={locId} onValueChange={setLocId}>
      <SelectTrigger><SelectValue placeholder="Plats" /></SelectTrigger>
      <SelectContent>{balances.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} – {kg1(b.qty)} kg</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-3xl">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold break-words">{name}</h1>
        <p className="font-mono text-sm text-muted-foreground break-all">{lot.lot_number}</p>
        <div className="flex flex-wrap gap-1.5">
          {lot.status && <Badge variant="secondary">{lot.status}</Badge>}
          <Badge variant="outline" className="font-mono tabular-nums">Kvar {kg1(total)} kg</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Button className="h-12" onClick={() => open("flytta")}><MoveRight className="h-4 w-4 mr-1" />Flytta</Button>
        <Button className="h-12" onClick={() => open("omvandla")}><Shuffle className="h-4 w-4 mr-1" />Omvandla</Button>
        <Button className="h-12" variant="secondary" onClick={() => open("svinn")}><Trash2 className="h-4 w-4 mr-1" />Svinn</Button>
        <Button className="h-12" variant="secondary" onClick={() => open("rakna")}><ClipboardCheck className="h-4 w-4 mr-1" />Räkna</Button>
        <Button className="h-12 col-span-2 sm:col-span-1" variant="outline" onClick={() => printLotLabelById(lotId, total || lot.quantity_kg).catch((e) => toast({ title: e.message, variant: "destructive" }))}>
          <Printer className="h-4 w-4 mr-1" />Skriv ut etikett
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Uppgifter</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>Latinskt namn: <i>{lot.latin_name || "–"}</i></div>
          <div>Fångstområde: {lot.catch_area || "–"}</div>
          <div>Leverantör: {lot.suppliers?.name || "–"}</div>
          <div>Bäst före: {lot.best_before ? svD(lot.best_before) : "–"}</div>
          <div>Fartyg: {lot.vessel_name || "–"}</div>
          <div>Redskap: {lot.fishing_gear || "–"}</div>
          {balances.map((b) => <div key={b.id} className="font-mono tabular-nums">{b.name}: {kg1(b.qty)} kg</div>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Spårbarhet bakåt</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>Leverantör: {lot.suppliers?.name || "–"}</div>
          {(originQ.data?.auctions ?? []).map((a) => (
            <div key={a.id}>Auktionsköp {a.purchase_date ? svD(a.purchase_date) : svD(a.created_at)}{a.price_per_kg ? ` · ${Number(a.price_per_kg).toLocaleString("sv-SE")} kr/kg` : ""}</div>
          ))}
          {(originQ.data?.deliveries ?? []).map((d) => (
            <div key={d.id}>Inleverans {d.incoming_deliveries?.delivery_number || ""} {d.incoming_deliveries?.received_date ? svD(d.incoming_deliveries.received_date) : ""}</div>
          ))}
          {(chainQ.data?.back ?? []).map((c) => (
            <button key={c.id} className="block text-left underline break-words" onClick={() => navigate(`/lot/${c.id}`)}>
              {c.kind}: {c.name} · <span className="font-mono">{c.lot_number}</span>
            </button>
          ))}
          {!chainQ.isLoading && !chainQ.data?.back.length && !originQ.data?.auctions.length && !originQ.data?.deliveries.length && (
            <div className="text-muted-foreground">Inga tidigare led registrerade.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Spårbarhet framåt</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {(chainQ.data?.fwd ?? []).map((c) => (
            <button key={c.id} className="block text-left underline break-words" onClick={() => navigate(`/lot/${c.id}`)}>
              Omvandlat till ({c.kind}): {c.name} · <span className="font-mono">{c.lot_number}</span>
            </button>
          ))}
          {(movQ.data ?? []).map((m) => (
            <div key={m.id} className="flex flex-wrap gap-x-2 border-b border-border py-1">
              <span className="font-mono tabular-nums">{svDT(m.created_at)}</span>
              <span>{MOVE_LABEL[m.movement_type] ?? m.movement_type}</span>
              <span className="font-mono tabular-nums">{kg1(m.quantity_kg)} kg</span>
              <span className="text-muted-foreground break-words">{m.storage_locations?.stores?.name ? `${m.storage_locations.stores.name} · ` : ""}{m.storage_locations?.name}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{action === "flytta" ? "Flytta" : action === "omvandla" ? "Omvandla" : action === "svinn" ? "Svinn" : "Räkna"} – {lot.lot_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {locSelect}
            {action === "flytta" && (
              <>
                <Select value={toLocId} onValueChange={setToLocId}>
                  <SelectTrigger><SelectValue placeholder="Till plats" /></SelectTrigger>
                  <SelectContent>{(locsQ.data ?? []).filter((l) => l.id !== locId).map((l) => <SelectItem key={l.id} value={l.id}>{l.stores?.name ? `${l.stores.name} · ` : ""}{l.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input inputMode="decimal" placeholder="Vikt kg" value={qty} onChange={(e) => setQty(e.target.value)} />
                <Button className="w-full" disabled={busy} onClick={doMove}>Flytta</Button>
              </>
            )}
            {action === "svinn" && (
              <>
                <Input inputMode="decimal" placeholder="Vikt kg" value={qty} onChange={(e) => setQty(e.target.value)} />
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="Orsak" /></SelectTrigger>
                  <SelectContent>{WASTE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
                <Button className="w-full" disabled={busy} onClick={doWaste}>Registrera svinn</Button>
              </>
            )}
            {action === "rakna" && (
              <>
                <p className="text-sm text-muted-foreground">I systemet: {kg1(locBal)} kg</p>
                <Input inputMode="decimal" placeholder="Räknad vikt kg" value={qty} onChange={(e) => setQty(e.target.value)} />
                <Button className="w-full" disabled={busy} onClick={doCount}>Spara räkning</Button>
              </>
            )}
            {action === "omvandla" && (
              <>
                <Input inputMode="decimal" placeholder="Vikt in kg" value={qty} onChange={(e) => setQty(e.target.value)} />
                <Input inputMode="decimal" placeholder="Vikt ut kg" value={qtyOut} onChange={(e) => setQtyOut(e.target.value)} />
                {yieldPreview != null && <p className="text-sm font-mono tabular-nums">Utbyte {yieldPreview.toLocaleString("sv-SE")} %</p>}
                {targetProd ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="break-words">Ny produkt: <b>{targetProd.name}</b></span>
                    <Button size="sm" variant="ghost" onClick={() => setTargetProd(null)}>Byt</Button>
                  </div>
                ) : (
                  <>
                    <Input placeholder="Sök ny produkt" value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} />
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {(prodQ.data ?? []).map((p) => (
                        <button key={p.id} className="block w-full text-left text-sm p-2 rounded hover:bg-muted break-words" onClick={() => setTargetProd(p)}>{p.name}</button>
                      ))}
                    </div>
                  </>
                )}
                <Button className="w-full" disabled={busy} onClick={doTransform}>Omvandla och skriv ut etikett</Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
