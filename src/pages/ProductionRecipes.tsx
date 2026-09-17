import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChefHat, Clock, ImagePlus, Package, Plus, Search, Thermometer, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useUploadGuideImage } from "@/hooks/useGuideImage";
import {
  RECIPE_CATEGORIES,
  useDeleteProductionRecipe,
  useProductionRecipes,
  useSaveProductionRecipe,
  type ProductionRecipe,
  type RecipeIngredient,
  type RecipeStep,
} from "@/hooks/useProductionRecipes";

type Draft = {
  id?: string;
  name: string;
  product_id: string;
  category: string;
  batch_yield: string;
  prep_minutes: string;
  temperature: string;
  shelf_life_days: string;
  allergens: string;
  tips: string;
  image_url: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

const EMPTY: Draft = {
  name: "",
  product_id: "",
  category: "Varmrätter",
  batch_yield: "",
  prep_minutes: "",
  temperature: "",
  shelf_life_days: "",
  allergens: "",
  tips: "",
  image_url: "",
  ingredients: [{ name: "", amount: "" }],
  steps: [{ text: "" }],
};

/**
 * Produktion: samlingen av hur vi tillagar och producerar våra produkter.
 * Varje recept har ingredienser, arbetsgång med bilder och kan kopplas till
 * en produkt så man når beskrivningen direkt från produktregistret.
 */
export default function ProductionRecipes() {
  const [params, setParams] = useSearchParams();
  const { data: recipes = [], isLoading } = useProductionRecipes();
  const { data: products = [] } = useProducts();
  const save = useSaveProductionRecipe();
  const remove = useDeleteProductionRecipe();
  const upload = useUploadGuideImage();

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ kind: "cover" } | { kind: "step"; index: number } | null>(null);

  const productParam = params.get("product");
  const recipeParam = params.get("recept");

  useEffect(() => {
    if (!productParam || recipes.length === 0) return;
    const hit = recipes.find((r) => r.product_id === productParam);
    if (hit) setOpenId(hit.id);
  }, [productParam, recipes]);

  useEffect(() => {
    if (!recipeParam || recipes.length === 0) return;
    if (recipes.some((r) => r.id === recipeParam)) setOpenId(recipeParam);
  }, [recipeParam, recipes]);

  const productOptions = useMemo(
    () => [...products].sort((a: any, b: any) => a.name.localeCompare(b.name, "sv")),
    [products],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (cat !== "all" && r.category !== cat) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.product?.name ?? "").toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    });
  }, [recipes, search, cat]);

  const groups = useMemo(() => {
    const map = new Map<string, ProductionRecipe[]>();
    filtered.forEach((r) => map.set(r.category, [...(map.get(r.category) ?? []), r]));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "sv"));
  }, [filtered]);

  const openNew = (productId?: string) => {
    setDraft({ ...EMPTY, product_id: productId ?? "" });
    setEditOpen(true);
  };

  const openEdit = (r: ProductionRecipe) => {
    setDraft({
      id: r.id,
      name: r.name,
      product_id: r.product_id ?? "",
      category: r.category,
      batch_yield: r.batch_yield ?? "",
      prep_minutes: r.prep_minutes?.toString() ?? "",
      temperature: r.temperature ?? "",
      shelf_life_days: r.shelf_life_days?.toString() ?? "",
      allergens: r.allergens ?? "",
      tips: r.tips ?? "",
      image_url: r.image_url ?? "",
      ingredients: r.ingredients.length ? r.ingredients : [{ name: "", amount: "" }],
      steps: r.steps.length ? r.steps : [{ text: "" }],
    });
    setEditOpen(true);
  };

  const pickImage = (target: { kind: "cover" } | { kind: "step"; index: number }) => {
    setUploadTarget(target);
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !uploadTarget) return;
    try {
      const url = await upload.mutateAsync({ file, taskId: `recipes/${draft.id ?? "ny"}` });
      setDraft((d) => {
        if (uploadTarget.kind === "cover") return { ...d, image_url: url };
        const steps = [...d.steps];
        steps[uploadTarget.index] = { ...steps[uploadTarget.index], image: url };
        return { ...d, steps };
      });
    } catch (e: any) {
      toast({ title: "Bilden kunde inte laddas upp", description: e.message, variant: "destructive" });
    } finally {
      setUploadTarget(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!draft.name.trim()) {
      toast({ title: "Skriv ett namn", variant: "destructive" });
      return;
    }
    try {
      await save.mutateAsync({
        id: draft.id,
        name: draft.name,
        product_id: draft.product_id || null,
        category: draft.category,
        batch_yield: draft.batch_yield,
        prep_minutes: draft.prep_minutes ? Number(draft.prep_minutes) : null,
        temperature: draft.temperature,
        shelf_life_days: draft.shelf_life_days ? Number(draft.shelf_life_days) : null,
        allergens: draft.allergens,
        tips: draft.tips,
        image_url: draft.image_url,
        ingredients: draft.ingredients,
        steps: draft.steps,
      });
      toast({ title: "Receptet sparat" });
      setEditOpen(false);
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    }
  };

  const del = async (r: ProductionRecipe) => {
    await remove.mutateAsync(r.id);
    toast({ title: "Receptet borttaget" });
    if (openId === r.id) setOpenId(null);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-xl font-semibold">
            <ChefHat className="h-5 w-5 text-primary" /> Produktion
          </h1>
          <p className="text-xs text-muted-foreground">
            Så tillagar och producerar vi våra produkter — ingredienser, arbetsgång och bilder.
          </p>
        </div>
        <Button onClick={() => openNew()} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nytt recept
        </Button>
      </div>

      {productParam && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <Package className="h-4 w-4 text-primary" />
          <span>
            Visar produktion för{" "}
            <span className="font-medium">
              {recipes.find((r) => r.product_id === productParam)?.product?.name ??
                (products as any[]).find((p) => p.id === productParam)?.name ??
                "valda produkten"}
            </span>
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => openNew(productParam)}>
            Nytt recept för produkten
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              params.delete("product");
              setParams(params, { replace: true });
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Visa alla
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Sök recept, produkt eller ingrediens"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="h-9 w-52 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla kategorier</SelectItem>
            {RECIPE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Hämtar recept…</p>}

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Inga recept ännu. Lägg upp det första, t.ex. fiskgratäng eller kokning av havskräftor.
          </CardContent>
        </Card>
      )}

      <div className="space-y-5">
        {groups.map(([group, list]) => (
          <section key={group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group} · {list.length}
            </h2>
            <div className="grid gap-2 lg:grid-cols-2">
              {list.map((r) => {
                const open = openId === r.id;
                return (
                  <Card key={r.id} className={open ? "border-primary/50 shadow-card lg:col-span-2" : "shadow-card"}>
                    <CardContent className="p-0">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : r.id)}
                        className="flex w-full items-center gap-3 p-3 text-left"
                      >
                        {r.image_url ? (
                          <img src={r.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
                            <ChefHat className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{r.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            {r.product && (
                              <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
                                <Package className="h-3 w-3" /> {r.product.name}
                              </Badge>
                            )}
                            {r.batch_yield && <span>{r.batch_yield}</span>}
                            {r.prep_minutes ? (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {r.prep_minutes} min
                              </span>
                            ) : null}
                            {r.temperature && (
                              <span className="flex items-center gap-1">
                                <Thermometer className="h-3 w-3" /> {r.temperature}
                              </span>
                            )}
                            <span>
                              {r.ingredients.length} ingredienser · {r.steps.length} steg
                            </span>
                          </div>
                        </div>
                      </button>

                      {open && (
                        <div className="space-y-4 border-t p-4">
                          <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
                            <div>
                              <h3 className="mb-2 text-sm font-semibold">Ingredienser</h3>
                              <ul className="space-y-1">
                                {r.ingredients.length === 0 && (
                                  <li className="text-xs text-muted-foreground">Inga ingredienser angivna.</li>
                                )}
                                {r.ingredients.map((i, k) => (
                                  <li key={k} className="flex justify-between gap-2 border-b border-dashed py-1 text-sm">
                                    <span>
                                      {i.name}
                                      {i.note && <span className="text-xs text-muted-foreground"> · {i.note}</span>}
                                    </span>
                                    <span className="font-mono text-sm tabular-nums">{i.amount}</span>
                                  </li>
                                ))}
                              </ul>
                              {r.allergens && (
                                <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
                                  Allergener: {r.allergens}
                                </p>
                              )}
                              {r.shelf_life_days != null && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Hållbarhet: {r.shelf_life_days} dagar
                                </p>
                              )}
                            </div>

                            <div>
                              <h3 className="mb-2 text-sm font-semibold">Arbetsgång</h3>
                              <ol className="space-y-3">
                                {r.steps.map((s, k) => (
                                  <li key={k} className="flex gap-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold">
                                      {k + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm">{s.text}</p>
                                      {s.image && (
                                        <a href={s.image} target="_blank" rel="noreferrer">
                                          <img src={s.image} alt="" className="mt-1 h-28 w-28 rounded-lg object-cover" />
                                        </a>
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ol>
                              {r.tips && (
                                <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs">Tips: {r.tips}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                              Redigera
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => del(r)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" /> Ta bort
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{draft.id ? "Redigera recept" : "Nytt recept"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Namn</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Fiskgratäng"
                />
              </div>
              <div>
                <Label className="text-xs">Kategori</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECIPE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Kopplad produkt</Label>
                <Select
                  value={draft.product_id || "none"}
                  onValueChange={(v) => setDraft({ ...draft, product_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ingen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen produkt</SelectItem>
                    {productOptions.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sats / utbyte</Label>
                <Input
                  value={draft.batch_yield}
                  onChange={(e) => setDraft({ ...draft, batch_yield: e.target.value })}
                  placeholder="10 kg / 24 portioner"
                />
              </div>
              <div>
                <Label className="text-xs">Tid (minuter)</Label>
                <Input
                  type="number"
                  value={draft.prep_minutes}
                  onChange={(e) => setDraft({ ...draft, prep_minutes: e.target.value })}
                  placeholder="45"
                />
              </div>
              <div>
                <Label className="text-xs">Temperatur</Label>
                <Input
                  value={draft.temperature}
                  onChange={(e) => setDraft({ ...draft, temperature: e.target.value })}
                  placeholder="175 °C eller kokning 100 °C"
                />
              </div>
              <div>
                <Label className="text-xs">Hållbarhet (dagar)</Label>
                <Input
                  type="number"
                  value={draft.shelf_life_days}
                  onChange={(e) => setDraft({ ...draft, shelf_life_days: e.target.value })}
                  placeholder="3"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Allergener</Label>
                <Input
                  value={draft.allergens}
                  onChange={(e) => setDraft({ ...draft, allergens: e.target.value })}
                  placeholder="Fisk, mjölk, gluten"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Bild på färdig produkt</Label>
              <div className="mt-1 flex items-center gap-2">
                {draft.image_url && (
                  <img src={draft.image_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                )}
                <Button variant="outline" size="sm" onClick={() => pickImage({ kind: "cover" })}>
                  <ImagePlus className="mr-1 h-4 w-4" /> {draft.image_url ? "Byt bild" : "Lägg till bild"}
                </Button>
                {draft.image_url && (
                  <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, image_url: "" })}>
                    Ta bort
                  </Button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">Ingredienser</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, { name: "", amount: "" }] })}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Rad
                </Button>
              </div>
              <div className="space-y-2">
                {draft.ingredients.map((i, k) => (
                  <div key={k} className="flex gap-2">
                    <Input
                      className="flex-1"
                      placeholder="Torskrygg"
                      value={i.name}
                      onChange={(e) => {
                        const list = [...draft.ingredients];
                        list[k] = { ...list[k], name: e.target.value };
                        setDraft({ ...draft, ingredients: list });
                      }}
                    />
                    <Input
                      className="w-28"
                      placeholder="3 kg"
                      value={i.amount}
                      onChange={(e) => {
                        const list = [...draft.ingredients];
                        list[k] = { ...list[k], amount: e.target.value };
                        setDraft({ ...draft, ingredients: list });
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setDraft({ ...draft, ingredients: draft.ingredients.filter((_, n) => n !== k) })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="text-xs">Arbetsgång — ett moment per rad</Label>
                <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, steps: [...draft.steps, { text: "" }] })}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Steg
                </Button>
              </div>
              <div className="space-y-2">
                {draft.steps.map((s, k) => (
                  <div key={k} className="flex items-start gap-2">
                    <span className="mt-2 w-5 text-xs font-semibold text-muted-foreground">{k + 1}.</span>
                    <div className="flex-1 space-y-1">
                      <Textarea
                        rows={2}
                        placeholder="Koka upp saltat vatten, lägg i kräftorna 6 minuter."
                        value={s.text}
                        onChange={(e) => {
                          const list = [...draft.steps];
                          list[k] = { ...list[k], text: e.target.value };
                          setDraft({ ...draft, steps: list });
                        }}
                      />
                      <div className="flex items-center gap-2">
                        {s.image && <img src={s.image} alt="" className="h-14 w-14 rounded object-cover" />}
                        <Button variant="outline" size="sm" onClick={() => pickImage({ kind: "step", index: k })}>
                          <ImagePlus className="mr-1 h-3.5 w-3.5" /> Bild
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, n) => n !== k) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Tips</Label>
              <Textarea
                rows={2}
                value={draft.tips}
                onChange={(e) => setDraft({ ...draft, tips: e.target.value })}
                placeholder="Kyl ner direkt efter kokning."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={submit} disabled={save.isPending || upload.isPending}>
              {save.isPending ? "Sparar…" : "Spara recept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
