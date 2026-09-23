import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgePercent, Calculator, Play, Store as StoreIcon, Tags, Upload } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  useApplyMarkdowns,
  useCreateOverride,
  useEffectivePrice,
  useEndOverride,
  usePosMarkdownRules,
  usePosOverrides,
  usePosPriceListItems,
  usePosPriceLists,
  usePosVatRates,
  useSetMarkdownRuleActive,
} from "@/hooks/usePosPriceEngine";

const REASONS: { value: string; label: string }[] = [
  { value: "local_catch", label: "Lokal fångst" },
  { value: "clearance", label: "Utförsäljning" },
  { value: "competition", label: "Konkurrens" },
  { value: "campaign", label: "Kampanj" },
];

const REASON_LABEL = Object.fromEntries(REASONS.map((r) => [r.value, r.label]));

const SOURCE_LABEL: Record<string, string> = {
  store_override: "Butikspris (override)",
  list: "Central prislista",
  none: "Inget pris satt",
};

const amount = (n: number | null | undefined, currency = "SEK") =>
  n == null
    ? "saknas"
    : `${n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ")} ${currency}`;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

/** Butiker med kassa påslagen. */
function usePosStores() {
  return useQuery({
    queryKey: ["pos_stores_min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, region_country, currency, pos_enabled")
        .eq("pos_enabled", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; region_country: string | null; currency: string | null }[];
    },
  });
}

/** Sökbara varor för priskoll och överrides. */
function useProductSearch(q: string) {
  return useQuery({
    queryKey: ["pos_product_search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit")
        .eq("active", true)
        .ilike("name", `%${q.trim()}%`)
        .order("name")
        .limit(20);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; unit: string | null }[];
    },
  });
}

/**
 * POS-priser: central prislista, tidsbegränsade butikspriser och nedsättning nära bäst före.
 * Sidan skriver aldrig direkt i tabellerna: allt går via databasens egna funktioner som journalför ändringen.
 */
export default function PosPrices() {
  const { staff } = useStaffAuth();
  const staffId = (staff as any)?.id ?? null;
  const isAdmin = /admin/i.test(((staff as any)?.primary_role as string) || "");

  const stores = usePosStores();
  const lists = usePosPriceLists();
  const vat = usePosVatRates();
  const overrides = usePosOverrides();
  const rules = usePosMarkdownRules();

  const [listId, setListId] = useState<string>("");
  const activeList = useMemo(
    () => (lists.data ?? []).find((l) => l.id === (listId || (lists.data ?? [])[0]?.id)),
    [lists.data, listId],
  );
  const [itemSearch, setItemSearch] = useState("");
  const items = usePosPriceListItems(activeList?.id, itemSearch);

  /* Priskoll */
  const [checkStore, setCheckStore] = useState<string>("");
  const [checkQuery, setCheckQuery] = useState("");
  const [checkProduct, setCheckProduct] = useState<{ id: string; name: string } | null>(null);
  const checkHits = useProductSearch(checkQuery);
  const effective = useEffectivePrice(checkStore, checkProduct?.id);
  const checkCurrency = (stores.data ?? []).find((s) => s.id === checkStore)?.currency ?? "SEK";

  /* Publicering */
  const [paste, setPaste] = useState("");
  const publish = usePublishForm(activeList?.id, staffId);

  /* Ny override */
  const [ovStore, setOvStore] = useState("");
  const [ovQuery, setOvQuery] = useState("");
  const [ovProduct, setOvProduct] = useState<{ id: string; name: string } | null>(null);
  const ovHits = useProductSearch(ovQuery);
  const [ovPrice, setOvPrice] = useState("");
  const [ovReason, setOvReason] = useState("local_catch");
  const [ovDays, setOvDays] = useState("3");
  const createOverride = useCreateOverride();
  const endOverride = useEndOverride();

  const setRule = useSetMarkdownRuleActive();
  const runMarkdowns = useApplyMarkdowns();

  const now = Date.now();

  const savePublish = async () => {
    if (!activeList) return;
    const parsed = parsePaste(paste, items.data ?? []);
    if (parsed.length === 0) {
      toast.error("Hittade inga rader att publicera. Skriv en vara och ett pris per rad.");
      return;
    }
    try {
      const res = await publish.mutateAsync({ priceListId: activeList.id, items: parsed, staffId });
      toast.success(`${res.items} priser publicerade och journalförda på ${res.registers} kassor.`);
      setPaste("");
    } catch (e: any) {
      toast.error(e?.message ?? "Publiceringen gick inte igenom.");
    }
  };

  const saveOverride = async () => {
    if (!ovStore || !ovProduct || !ovPrice) {
      toast.error("Välj butik, vara och pris.");
      return;
    }
    const days = Math.min(7, Math.max(1, Number(ovDays) || 1));
    const validTo = new Date(now + days * 86400000).toISOString();
    try {
      await createOverride.mutateAsync({
        storeId: ovStore,
        productId: ovProduct.id,
        price: Number(ovPrice.replace(",", ".")),
        reason: ovReason,
        validTo,
        staffId,
      });
      toast.success(`Butikspris satt för ${ovProduct.name} i ${days} dagar.`);
      setOvProduct(null);
      setOvQuery("");
      setOvPrice("");
    } catch (e: any) {
      toast.error(e?.message ?? "Butikspriset kunde inte sparas.");
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">POS-priser</h1>
        <p className="text-sm text-muted-foreground">
          Central prislista, moms med giltighetstid och tidsbegränsade butikspriser. Varje ändring
          journalförs i kassans låsta journal.
        </p>
      </div>

      {/* Priskoll */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" /> Priskoll
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Butik</Label>
              <Select value={checkStore} onValueChange={setCheckStore}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj butik" />
                </SelectTrigger>
                <SelectContent>
                  {(stores.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Vara</Label>
              <Input
                value={checkProduct ? checkProduct.name : checkQuery}
                onChange={(e) => {
                  setCheckProduct(null);
                  setCheckQuery(e.target.value);
                }}
                placeholder="Sök vara"
              />
              {!checkProduct && (checkHits.data ?? []).length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-border">
                  {(checkHits.data ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCheckProduct({ id: p.id, name: p.name })}
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {checkStore && checkProduct && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-muted/50 p-3 text-sm">
              <span className="font-mono text-lg tabular-nums">
                {amount(effective.data?.price_inc_vat ?? null, checkCurrency)}
              </span>
              <span>Moms {effective.data?.vat_rate ?? 0} procent</span>
              <Badge variant="outline">{SOURCE_LABEL[effective.data?.price_source ?? "none"]}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="listor">
        <TabsList>
          <TabsTrigger value="listor">Prislistor</TabsTrigger>
          <TabsTrigger value="overrides">Butikspriser</TabsTrigger>
          <TabsTrigger value="nedsattning">Nedsättningsregler</TabsTrigger>
        </TabsList>

        {/* a) Prislistor */}
        <TabsContent value="listor" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Tags className="h-4 w-4" /> Prislistor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Lista</Label>
                  <Select value={activeList?.id ?? ""} onValueChange={setListId}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Välj lista" />
                    </SelectTrigger>
                    <SelectContent>
                      {(lists.data ?? []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} ({l.currency_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Sök vara</Label>
                  <Input
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Sök i listan"
                    className="w-56"
                  />
                </div>
                <Badge variant="secondary">{(items.data ?? []).length} artiklar</Badge>
              </div>

              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2">Vara</th>
                      <th className="py-1 pr-2 text-right">Pris inkl. moms</th>
                      <th className="py-1 pr-2">Momskategori</th>
                      <th className="py-1">Giltig från</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(items.data ?? []).slice(0, 400).map((i) => (
                      <tr key={i.product_id} className="border-t border-border/60">
                        <td className="py-1 pr-2">{i.products?.name ?? "vara"}</td>
                        <td className="py-1 pr-2 text-right font-mono tabular-nums">
                          {amount(i.price_inc_vat, activeList?.currency_code ?? "SEK")}
                        </td>
                        <td className="py-1 pr-2">{i.vat_category}</td>
                        <td className="py-1 font-mono text-xs tabular-nums">{fmtDateTime(i.valid_from)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" /> Publicera nya priser
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                En rad per vara: varunamn och nytt pris inklusive moms. Tabb, semikolon eller
                kommatecken går bra som skiljetecken. Varan måste redan finnas i listan.
              </p>
              <Textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={6}
                placeholder={"Lax filé; 249,00\nRäkor skalade; 189,50"}
                className="font-mono text-sm"
              />
              <div className="flex items-center gap-3">
                <Button onClick={savePublish} disabled={!isAdmin || publish.isPending}>
                  <Upload className="mr-2 h-4 w-4" /> Publicera
                </Button>
                {!isAdmin && (
                  <span className="text-xs text-muted-foreground">
                    Endast administratör kan publicera priser.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Momssatser</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <table className="w-full">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">Land</th>
                    <th className="py-1 pr-2">Kategori</th>
                    <th className="py-1 pr-2 text-right">Sats</th>
                    <th className="py-1 pr-2">Giltig från</th>
                    <th className="py-1 pr-2">Giltig till</th>
                    <th className="py-1">Notering</th>
                  </tr>
                </thead>
                <tbody>
                  {(vat.data ?? []).map((v) => (
                    <tr key={v.id} className="border-t border-border/60">
                      <td className="py-1 pr-2 font-mono">{v.country_code}</td>
                      <td className="py-1 pr-2">{v.category}</td>
                      <td className="py-1 pr-2 text-right font-mono tabular-nums">{v.rate} procent</td>
                      <td className="py-1 pr-2 font-mono text-xs tabular-nums">{v.valid_from}</td>
                      <td className="py-1 pr-2 font-mono text-xs tabular-nums">{v.valid_to ?? "gäller nu"}</td>
                      <td className="py-1 text-xs text-muted-foreground">{v.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* b) Överrides */}
        <TabsContent value="overrides" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <StoreIcon className="h-4 w-4" /> Nytt butikspris
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-5">
                <div className="space-y-1 md:col-span-1">
                  <Label className="text-xs">Butik</Label>
                  <Select value={ovStore} onValueChange={setOvStore}>
                    <SelectTrigger>
                      <SelectValue placeholder="Välj butik" />
                    </SelectTrigger>
                    <SelectContent>
                      {(stores.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">Vara</Label>
                  <Input
                    value={ovProduct ? ovProduct.name : ovQuery}
                    onChange={(e) => {
                      setOvProduct(null);
                      setOvQuery(e.target.value);
                    }}
                    placeholder="Sök vara"
                  />
                  {!ovProduct && (ovHits.data ?? []).length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-border">
                      {(ovHits.data ?? []).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setOvProduct({ id: p.id, name: p.name })}
                          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pris inkl. moms</Label>
                  <Input value={ovPrice} onChange={(e) => setOvPrice(e.target.value)} inputMode="decimal" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Antal dagar (max 7)</Label>
                  <Input value={ovDays} onChange={(e) => setOvDays(e.target.value)} inputMode="numeric" />
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Orsak</Label>
                  <Select value={ovReason} onValueChange={setOvReason}>
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={saveOverride} disabled={!isAdmin || createOverride.isPending}>
                  Spara butikspris
                </Button>
                {!isAdmin && (
                  <span className="text-xs text-muted-foreground">
                    Endast administratör kan sätta butikspris.
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Aktiva och kommande butikspriser</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {(overrides.data ?? []).length === 0 ? (
                <p className="text-muted-foreground">Inga butikspriser är satta just nu.</p>
              ) : (
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-2">Butik</th>
                        <th className="py-1 pr-2">Vara</th>
                        <th className="py-1 pr-2 text-right">Pris</th>
                        <th className="py-1 pr-2">Orsak</th>
                        <th className="py-1 pr-2">Gäller</th>
                        <th className="py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overrides.data ?? []).map((o) => {
                        const live = new Date(o.valid_from).getTime() <= now && new Date(o.valid_to).getTime() > now;
                        return (
                          <tr key={o.id} className="border-t border-border/60">
                            <td className="py-1 pr-2">{o.stores?.name ?? "butik"}</td>
                            <td className="py-1 pr-2">
                              {o.products?.name ?? "vara"}
                              {o.lot_number ? (
                                <span className="ml-1 font-mono text-xs text-muted-foreground">
                                  parti {o.lot_number}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-1 pr-2 text-right font-mono tabular-nums">
                              {amount(o.price_inc_vat)}
                              {o.percent_off ? (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  minus {o.percent_off} procent
                                </span>
                              ) : null}
                            </td>
                            <td className="py-1 pr-2">{REASON_LABEL[o.reason] ?? o.reason}</td>
                            <td className="py-1 pr-2 font-mono text-xs tabular-nums">
                              {fmtDateTime(o.valid_from)} till {fmtDateTime(o.valid_to)}
                            </td>
                            <td className="py-1 text-right">
                              {live ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!isAdmin || endOverride.isPending}
                                  onClick={async () => {
                                    try {
                                      await endOverride.mutateAsync({ overrideId: o.id, staffId });
                                      toast.success("Butikspriset avslutat och journalfört.");
                                    } catch (e: any) {
                                      toast.error(e?.message ?? "Kunde inte avsluta butikspriset.");
                                    }
                                  }}
                                >
                                  Avsluta nu
                                </Button>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">
                                  Avslutad
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* c) Nedsättningsregler */}
        <TabsContent value="nedsattning" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BadgePercent className="h-4 w-4" /> Nedsättning nära bäst före
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(rules.data ?? []).map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-2 last:border-0"
                >
                  <Badge variant="outline" className="font-mono">
                    {r.country_code}
                  </Badge>
                  <span className="font-mono tabular-nums">{r.percent_off} procent</span>
                  <span className="min-w-0 flex-1">
                    {r.trigger_type === "last_day"
                      ? "Sista dagen före bäst före"
                      : `Sista ${r.hours_before} timmarna före bäst före`}
                  </span>
                  <Switch
                    checked={r.active}
                    disabled={!isAdmin || setRule.isPending}
                    onCheckedChange={async (v) => {
                      try {
                        await setRule.mutateAsync({ ruleId: r.id, active: v });
                        toast.success(v ? "Regeln är aktiv." : "Regeln är avstängd.");
                      } catch (e: any) {
                        toast.error(e?.message ?? "Kunde inte ändra regeln.");
                      }
                    }}
                  />
                  <span className="w-20 text-xs text-muted-foreground">{r.active ? "Aktiv" : "Avstängd"}</span>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="outline"
                  disabled={!isAdmin || runMarkdowns.isPending}
                  onClick={async () => {
                    try {
                      const n = await runMarkdowns.mutateAsync();
                      toast.success(
                        n === 0
                          ? "Inga nya nedsättningar behövdes."
                          : `${n} nedsättningar skapade och journalförda.`,
                      );
                    } catch (e: any) {
                      toast.error(e?.message ?? "Körningen gick inte igenom.");
                    }
                  }}
                >
                  <Play className="mr-2 h-4 w-4" /> Kör nu
                </Button>
                <span className="text-xs text-muted-foreground">
                  Körs automatiskt varje timme, men bara när minst en regel är aktiv.
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* Publiceringen tar emot namn och pris. Varan matchas mot listans befintliga rader. */
function parsePaste(
  text: string,
  known: { product_id: string; products: { name: string } | null }[],
): { product_id: string; price_inc_vat: number }[] {
  const byName = new Map<string, string>();
  for (const k of known) if (k.products?.name) byName.set(k.products.name.trim().toLowerCase(), k.product_id);
  const out: { product_id: string; price_inc_vat: number }[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split(/[\t;]|,(?=\s*\d)|\s{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const price = Number(parts[parts.length - 1].replace(/\s/g, "").replace(",", "."));
    const id = byName.get(parts.slice(0, -1).join(" ").trim().toLowerCase());
    if (!id || !Number.isFinite(price) || price <= 0) continue;
    out.push({ product_id: id, price_inc_vat: price });
  }
  return out;
}

/* Liten omslagsfunktion så publiceringsknappen kan använda listans id direkt. */
function usePublishForm(_listId: string | undefined, _staffId: string | null) {
  return usePublishPricesHook();
}

import { usePublishPrices as usePublishPricesHook } from "@/hooks/usePosPriceEngine";
