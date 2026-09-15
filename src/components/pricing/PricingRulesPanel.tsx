import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Calculator, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useStores } from "@/hooks/useStores";
import { useCategories } from "@/hooks/useCategories";
import { useProducts, useUpdateProduct } from "@/hooks/useProducts";
import { effectiveCost } from "@/lib/effectiveCost";
import {
  usePricingRules,
  useSavePricingRule,
  useDeletePricingRule,
  applyRule,
  pickRule,
  METHOD_LABEL,
  ROUNDING_LABEL,
  STAGE_LABEL,
  type PricingRule,
  type PricingStage,
  type PricingMethod,
  type PricingRounding,
} from "@/hooks/usePricingRules";

const VAT_FOOD = 12;

type Draft = {
  id?: string;
  stage: PricingStage;
  scope_type: "global" | "category" | "product";
  category: string | null;
  product_id: string | null;
  store_id: string | null;
  method: PricingMethod;
  value: number;
  rounding: PricingRounding;
  yield_pct: number | null;
  labour_per_unit: number;
  vat_rate: number;
  active: boolean;
  note: string;
};

const emptyDraft = (stage: PricingStage): Draft => ({
  stage,
  scope_type: "category",
  category: null,
  product_id: null,
  store_id: null,
  method: stage === "inkop_till_gross" ? "margin_pct" : "markup_pct",
  value: stage === "inkop_till_gross" ? 22 : 35,
  rounding: "krona",
  yield_pct: null,
  labour_per_unit: 0,
  vat_rate: VAT_FOOD,
  active: true,
  note: "",
});

const kr = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : `${Number(n).toFixed(2).replace(".", ",")} kr`;

export default function PricingRulesPanel({ isShop = false }: { isShop?: boolean }) {
  const { data: rules = [] } = usePricingRules();
  const { data: stores = [] } = useStores();
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useProducts();
  const saveRule = useSavePricingRule();
  const deleteRule = useDeletePricingRule();
  const updateProduct = useUpdateProduct();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewStore, setPreviewStore] = useState<string>("all");
  const [previewCat, setPreviewCat] = useState<string>("all");
  const [applying, setApplying] = useState(false);

  const storeId = previewStore === "all" ? null : previewStore;

  const preview = useMemo(() => {
    const list = products
      .filter((p: any) => previewCat === "all" || p.category === previewCat)
      .map((p: any) => {
        const base = effectiveCost(p).value || null;
        const r1 = pickRule(rules, "inkop_till_gross", p.id, p.category, null);
        const r2 = pickRule(rules, "gross_till_butik", p.id, p.category, storeId);
        const gross = applyRule(base, r1) ?? (p.wholesale_price ? Number(p.wholesale_price) : null);
        const retail = applyRule(gross, r2) ?? (p.retail_suggested ? Number(p.retail_suggested) : null);
        const vat = r2?.vat_rate ?? VAT_FOOD;
        return {
          product: p,
          base,
          gross,
          retail,
          retailInclVat: retail === null ? null : Math.round(retail * (1 + vat / 100) * 100) / 100,
          vat,
          grossMargin: gross && base ? Math.round(((gross - base) / gross) * 100) : null,
          retailMargin: retail && gross ? Math.round(((retail - gross) / retail) * 100) : null,
          r1,
          r2,
        };
      });
    return list.sort((a, b) => a.product.name.localeCompare(b.product.name, "sv"));
  }, [products, rules, storeId, previewCat]);

  const grouped = useMemo(() => {
    const byStage: Record<PricingStage, PricingRule[]> = { inkop_till_gross: [], gross_till_butik: [] };
    rules.forEach((r) => byStage[r.stage]?.push(r));
    return byStage;
  }, [rules]);

  const storeName = (id: string | null) => (id ? stores.find((s: any) => s.id === id)?.name || "Butik" : "Alla butiker");

  const scopeText = (r: PricingRule) => {
    if (r.scope_type === "global") return "Alla produkter";
    if (r.scope_type === "category") return r.category || "Utan kategori";
    return products.find((p: any) => p.id === r.product_id)?.name || "Produkt";
  };

  const startNew = (stage: PricingStage) => {
    setDraft(emptyDraft(stage));
    setOpen(true);
  };

  const startEdit = (r: PricingRule) => {
    setDraft({
      id: r.id,
      stage: r.stage,
      scope_type: r.scope_type,
      category: r.category,
      product_id: r.product_id,
      store_id: r.store_id,
      method: r.method,
      value: Number(r.value),
      rounding: r.rounding,
      yield_pct: r.yield_pct === null ? null : Number(r.yield_pct),
      labour_per_unit: Number(r.labour_per_unit || 0),
      vat_rate: Number(r.vat_rate ?? VAT_FOOD),
      active: r.active,
      note: r.note || "",
    });
    setOpen(true);
  };

  const save = () => {
    if (!draft) return;
    if (draft.scope_type === "category" && !draft.category) {
      toast({ title: "Välj kategori", variant: "destructive" });
      return;
    }
    if (draft.scope_type === "product" && !draft.product_id) {
      toast({ title: "Välj produkt", variant: "destructive" });
      return;
    }
    saveRule.mutate(
      {
        ...draft,
        category: draft.scope_type === "category" ? draft.category : null,
        product_id: draft.scope_type === "product" ? draft.product_id : null,
        store_id: draft.stage === "gross_till_butik" ? draft.store_id : null,
        note: draft.note || null,
      } as any,
      {
        onSuccess: () => {
          toast({ title: "Regel sparad" });
          setOpen(false);
          setDraft(null);
        },
        onError: (e: any) => toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" }),
      },
    );
  };

  const applyToProducts = async () => {
    setApplying(true);
    let changed = 0;
    try {
      for (const row of preview) {
        const p = row.product;
        const nextGross = isShop ? Number(p.wholesale_price || 0) : row.gross;
        const nextRetail = row.retail;
        if (nextGross === null && nextRetail === null) continue;
        const grossChanged = !isShop && nextGross !== null && Number(p.wholesale_price || 0) !== nextGross;
        const retailChanged = nextRetail !== null && Number(p.retail_suggested || 0) !== nextRetail;
        if (!grossChanged && !retailChanged) continue;
        await updateProduct.mutateAsync({
          id: p.id,
          cost_price: Number(p.cost_price || 0),
          wholesale_price: grossChanged ? (nextGross as number) : Number(p.wholesale_price || 0),
          retail_suggested: retailChanged ? (nextRetail as number) : Number(p.retail_suggested || 0),
          reason: "Prisregler applicerade",
        } as any);
        changed++;
      }
      toast({ title: "Priser uppdaterade", description: `${changed} produkter fick nya priser.` });
    } catch (e: any) {
      toast({ title: "Kunde inte uppdatera alla", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const [showRules, setShowRules] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  const renderRuleRows = (stage: PricingStage) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{STAGE_LABEL[stage]}</span>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startNew(stage)}>
          <Plus className="h-3 w-3 mr-1" /> Ny regel
        </Button>
      </div>
      <div className="rounded-md border divide-y">
        {grouped[stage].length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">Ingen regel – priserna sätts manuellt.</div>
        )}
        {grouped[stage].map((r) => (
          <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
            <Badge variant={r.scope_type === "global" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
              {scopeText(r)}
            </Badge>
            {stage === "gross_till_butik" && (
              <span className="text-muted-foreground">{storeName(r.store_id)}</span>
            )}
            <span className="ml-auto font-medium tabular-nums">
              {r.method === "fixed_price"
                ? kr(Number(r.value))
                : `${Number(r.value).toFixed(0)} % ${r.method === "margin_pct" ? "marginal" : "påslag"}`}
            </span>
            <span className="text-muted-foreground">{ROUNDING_LABEL[r.rounding]}</span>
            {r.yield_pct ? <span className="text-muted-foreground">utbyte {Number(r.yield_pct).toFixed(0)} %</span> : null}
            {Number(r.labour_per_unit) > 0 ? (
              <span className="text-muted-foreground">+{kr(Number(r.labour_per_unit))}/enhet</span>
            ) : null}
            {!r.active && <Badge variant="destructive" className="text-[10px] px-1 py-0">Pausad</Badge>}
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => startEdit(r)}>
              Ändra
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1 text-destructive"
              onClick={() => deleteRule.mutate(r.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4" /> Prissättningsregler
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Inköp → grossistpris (marginal) → butikspris (påslag per butik). Moms visas bara i butiksledet mot privatkund.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <button
          className="flex w-full items-center gap-1 text-xs font-medium"
          onClick={() => setShowRules((v) => !v)}
        >
          {showRules ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Regler ({rules.length})
        </button>
        {showRules && (
          <div className="space-y-3">
            {renderRuleRows("inkop_till_gross")}
            {renderRuleRows("gross_till_butik")}
          </div>
        )}

        <button
          className="flex w-full items-center gap-1 text-xs font-medium"
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Förhandsvisning och applicering ({preview.length} produkter)
        </button>

        {showPreview && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={previewStore} onValueChange={setPreviewStore}>
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue placeholder="Butik" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla butiker (grundregel)</SelectItem>
                  {stores.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={previewCat} onValueChange={setPreviewCat}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla kategorier</SelectItem>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 text-xs" disabled={applying} onClick={applyToProducts}>
                <Wand2 className="h-3.5 w-3.5 mr-1" />
                {applying ? "Uppdaterar…" : "Applicera på produkterna"}
              </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Produkt</TableHead>
                    <TableHead className="text-right">Inköp</TableHead>
                    <TableHead className="text-right">Grossist</TableHead>
                    <TableHead className="text-right">Marg.</TableHead>
                    <TableHead className="text-right">Butikspris</TableHead>
                    <TableHead className="text-right">Påsl.</TableHead>
                    <TableHead className="text-right">Inkl. moms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 200).map((row) => (
                    <TableRow key={row.product.id} className="text-xs">
                      <TableCell className="py-1">
                        {row.product.name}
                        <span className="ml-2 text-[10px] text-muted-foreground">{row.product.category}</span>
                      </TableCell>
                      <TableCell className="py-1 text-right tabular-nums">{kr(row.base)}</TableCell>
                      <TableCell className="py-1 text-right tabular-nums font-medium">{kr(row.gross)}</TableCell>
                      <TableCell className="py-1 text-right tabular-nums text-muted-foreground">
                        {row.grossMargin === null ? "–" : `${row.grossMargin} %`}
                      </TableCell>
                      <TableCell className="py-1 text-right tabular-nums font-medium">{kr(row.retail)}</TableCell>
                      <TableCell className="py-1 text-right tabular-nums text-muted-foreground">
                        {row.retailMargin === null ? "–" : `${row.retailMargin} %`}
                      </TableCell>
                      <TableCell className="py-1 text-right tabular-nums">{kr(row.retailInclVat)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.length > 200 && (
              <p className="text-[10px] text-muted-foreground">Visar 200 av {preview.length} produkter – appliceringen gäller alla.</p>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Ändra regel" : "Ny regel"} – {draft ? STAGE_LABEL[draft.stage] : ""}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Gäller</Label>
                  <Select
                    value={draft.scope_type}
                    onValueChange={(v) => setDraft({ ...draft, scope_type: v as Draft["scope_type"] })}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Alla produkter</SelectItem>
                      <SelectItem value="category">En kategori</SelectItem>
                      <SelectItem value="product">En produkt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.scope_type === "category" && (
                  <div>
                    <Label className="text-xs">Kategori</Label>
                    <Select value={draft.category || ""} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Välj" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c: any) => (
                          <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {draft.scope_type === "product" && (
                  <div>
                    <Label className="text-xs">Produkt</Label>
                    <Select value={draft.product_id || ""} onValueChange={(v) => setDraft({ ...draft, product_id: v })}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Välj" /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        {products.slice(0, 400).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {draft.stage === "gross_till_butik" && (
                  <div>
                    <Label className="text-xs">Butik</Label>
                    <Select
                      value={draft.store_id || "all"}
                      onValueChange={(v) => setDraft({ ...draft, store_id: v === "all" ? null : v })}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alla butiker</SelectItem>
                        {stores.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Metod</Label>
                  <Select value={draft.method} onValueChange={(v) => setDraft({ ...draft, method: v as PricingMethod })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(METHOD_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{draft.method === "fixed_price" ? "Pris (kr)" : "Procent"}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.value}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Avrundning</Label>
                  <Select value={draft.rounding} onValueChange={(v) => setDraft({ ...draft, rounding: v as PricingRounding })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROUNDING_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Utbyte % (valfritt)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.yield_pct ?? ""}
                    placeholder="t.ex. 55"
                    onChange={(e) => setDraft({ ...draft, yield_pct: e.target.value === "" ? null : Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Arbete kr/enhet</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.labour_per_unit}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setDraft({ ...draft, labour_per_unit: Number(e.target.value) })}
                    className="h-9"
                  />
                </div>
                {draft.stage === "gross_till_butik" && (
                  <div>
                    <Label className="text-xs">Moms % (butik→kund)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={draft.vat_rate}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setDraft({ ...draft, vat_rate: Number(e.target.value) })}
                      className="h-9"
                    />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">Anteckning</Label>
                <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="h-9" />
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
                <span className="text-xs">Aktiv</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button onClick={save} disabled={saveRule.isPending}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
