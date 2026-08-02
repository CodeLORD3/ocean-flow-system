import { useMemo, useRef, useState } from "react";
import { compareKey, storageKey } from "@/lib/asciiFold";

import { Image as ImageIcon, Upload, Check, X, Loader2, ChevronsUpDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { ProductThumb } from "@/components/products/ProductThumb";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export const PRODUCT_IMAGE_BUCKET = "produktbilder";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FileRow {
  file: File;
  sku: string;
  status: "pending" | "uploading" | "done" | "skipped" | "error";
  message?: string;
  productName?: string;
  productId?: string;
  productSku?: string;
  matchType?: "sku" | "namn" | "liknande" | "manuell";
  tier?: Tier;
  productHasImage?: boolean;
  candidates?: ProductOption[];
  url?: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  hasImage?: boolean;
}

/** Kvalitetsnivå tolkad från filnamnet: premium > lyx > basic */
const TIERS = ["basic", "lyx", "premium"] as const;
type Tier = (typeof TIERS)[number];

const tierFromFileName = (name: string): Tier => {
  const n = name.toLowerCase();
  if (/premium/.test(n)) return "premium";
  if (/(lyx|lux|deluxe)/.test(n)) return "lyx";
  return "basic";
};

const tierRank = (t: Tier) => TIERS.indexOf(t);

const skuFromFileName = (name: string) => name.replace(/\.[^.]+$/, "").trim();

/** tar bort filändelse, kopiesuffix (-2, _1, (1), " kopia") och normaliserar */
const baseFromFileName = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\((\d+)\)\s*$/, "")
    .replace(/[-_\s]+(kopia|copy)\s*\d*$/i, "")
    .replace(/[-_\s]+\d{1,2}$/, "")
    .trim();

const norm = (v: string) => compareKey(v);


/** enkel likhet 0-1 (Levenshtein-baserad) */
const similarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
};

export default function ProductImageBulkUpload({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [running, setRunning] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState<number | null>(null);

  const counts = useMemo(() => {
    return {
      total: rows.length,
      matched: rows.filter((r) => r.productId).length,
      unmatched: rows.filter((r) => r.status === "skipped").length,
      done: rows.filter((r) => r.status === "done").length,
      error: rows.filter((r) => r.status === "error").length,
    };
  }, [rows]);

  const pickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const { data } = await supabase.from("products").select("id, sku, name, image_url");
    const all: ProductOption[] = (data ?? []).map((p) => ({
      id: String(p.id),
      sku: String(p.sku ?? ""),
      name: String(p.name ?? ""),
      hasImage: !!(p as any).image_url,
    }));
    setProducts(all);
    const bySku = new Map(all.map((p) => [norm(p.sku), p]));
    const byName = new Map(all.map((p) => [norm(p.name), p]));

    const prepared = list.map((file) => {
      const raw = skuFromFileName(file.name);
      const base = baseFromFileName(file.name);
      const keyRaw = norm(raw);
      const keyBase = norm(base);
      const tier = tierFromFileName(file.name);

      // 1) exakt SKU (med eller utan kopiesuffix)
      let match = bySku.get(keyRaw) ?? bySku.get(keyBase);
      let matchType: FileRow["matchType"] = match ? "sku" : undefined;

      // 2) exakt produktnamn
      if (!match) {
        match = byName.get(keyRaw) ?? byName.get(keyBase);
        if (match) matchType = "namn";
      }

      // 3) liknande namn — rangordna kandidater
      const scored = keyBase.length >= 3
        ? all
            .map((p) => {
              const nk = norm(p.name);
              if (nk.length < 3) return { p, score: 0 };
              let score = similarity(keyBase, nk);
              if (nk.startsWith(keyBase) || keyBase.startsWith(nk)) {
                score = Math.max(score, 0.93 - Math.abs(nk.length - keyBase.length) / 100);
              }
              return { p, score };
            })
            .filter((c) => c.score >= 0.6)
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
        : [];

      if (!match && scored.length > 0 && scored[0].score >= 0.82) {
        match = scored[0].p;
        matchType = "liknande";
      }

      const candidates = [
        ...(match ? [match] : []),
        ...scored.map((c) => c.p),
      ].filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx);

      if (!match) {
        return {
          file,
          sku: raw,
          tier,
          status: "skipped" as const,
          message: candidates.length > 0 ? "välj produkt manuellt" : "ingen matchande produkt",
          candidates,
        } as FileRow;
      }

      // Produkter som redan har en bild matchas aldrig automatiskt — kräver manuellt val
      if (match.hasImage) {
        return {
          file,
          sku: match.sku || raw,
          tier,
          status: "skipped" as const,
          message: "har redan bild — välj manuellt",
          candidates,
          productHasImage: true,
        } as FileRow;
      }

      return {
        file,
        sku: match.sku || raw,
        tier,
        status: "pending" as const,
        productName: match.name,
        productId: match.id,
        productSku: match.sku,
        matchType,
        candidates,
      } as FileRow;
    });

    // Samma produkt får bara en bild per omgång — högsta nivån vinner (premium > lyx > basic)
    const bestByProduct = new Map<string, number>();
    prepared.forEach((r, i) => {
      if (!r.productId) return;
      const cur = bestByProduct.get(r.productId);
      if (cur === undefined) return void bestByProduct.set(r.productId, i);
      const better = tierRank(r.tier ?? "basic") > tierRank(prepared[cur].tier ?? "basic");
      if (better) bestByProduct.set(r.productId, i);
    });

    setRows(
      prepared.map((r, i) => {
        if (!r.productId) return r;
        if (bestByProduct.get(r.productId) === i) return r;
        const winner = prepared[bestByProduct.get(r.productId)!];
        return {
          ...r,
          productId: undefined,
          productName: undefined,
          productSku: undefined,
          matchType: undefined,
          status: "skipped" as const,
          message: `produkten tas av ${winner.file.name} (${winner.tier}) — välj annan produkt manuellt`,
        };
      }),
    );
  };

  const assignProduct = (index: number, product: ProductOption) => {
    setRows((prev) =>
      prev.map((r, i) => {
        // Ta bort samma produkt från andra rader — en produkt kan bara få en bild per omgång
        if (i !== index && r.productId === product.id && r.status !== "done") {
          return {
            ...r,
            productId: undefined,
            productName: undefined,
            productSku: undefined,
            matchType: undefined,
            status: "skipped" as const,
            message: "produkten kopplad till en annan fil",
          };
        }
        return i === index
          ? {
              ...r,
              productId: product.id,
              productName: product.name,
              productSku: product.sku,
              sku: product.sku || r.sku,
              matchType: "manuell" as const,
              status: r.status === "done" ? r.status : ("pending" as const),
              productHasImage: product.hasImage,
              message: product.hasImage ? "ersätter befintlig bild" : undefined,
            }
          : r;
      }),
    );
    setPickerOpen(null);
  };

  const clearProduct = (index: number) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? { ...r, productId: undefined, productName: undefined, productSku: undefined, matchType: undefined, status: "skipped", message: "ingen produkt vald" }
          : r,
      ),
    );
  };

  const runUpload = async () => {
    setRunning(true);
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      const row = next[i];
      if (!row.productId) continue;
      next[i] = { ...row, status: "uploading" };
      setRows([...next]);
      try {
        const ext = row.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const key = `${storageKey(row.sku)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .upload(key, row.file, { upsert: true, contentType: row.file.type || undefined });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(key);
        const publicUrl = pub?.publicUrl;
        if (!publicUrl) throw new Error("Kunde inte skapa bildlänk");
        const { error: updErr } = await supabase
          .from("products")
          .update({ image_url: publicUrl })
          .eq("id", row.productId);
        if (updErr) throw updErr;
        next[i] = { ...row, status: "done", url: publicUrl };

      } catch (e) {
        next[i] = { ...row, status: "error", message: e instanceof Error ? e.message : "Okänt fel" };
      }
      setRows([...next]);
    }
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["products"] });
    const ok = next.filter((r) => r.status === "done").length;
    toast({
      title: "Bilduppladdning klar",
      description: `${ok} bilder kopplade, ${next.filter((r) => r.status === "skipped").length} utan matchande produkt.`,
    });
  };

  const close = (o: boolean) => {
    if (!o) setRows([]);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" /> Produktbilder — bulkuppladdning
          </DialogTitle>
          <DialogDescription className="text-xs">
            Produkter som redan har en bild matchas aldrig automatiskt — de måste väljas manuellt. Om flera filer pekar
            på samma produkt vinner högsta nivån i filnamnet (basic → lyx → premium) och övriga filer måste kopplas
            manuellt. Filnamnet tolkas först som SKU (t.ex. <span className="font-mono">FS-045.jpg</span>), annars matchas det
            mot produktnamn — även liknande namn och kopiesuffix (t.ex. <span className="font-mono">bergtungafil-2.jpg</span>{" "}
            → Bergtungafilé). Svenska tecken hanteras automatiskt: döp filen till{" "}
            <span className="font-mono">RO-013.png</span> även om SKU:n är <span className="font-mono">RÖ-013</span> — bilden
            sparas alltid med ASCII-filnamn. Klicka på produktnamnet i listan för att välja en annan produkt manuellt.
            Bilderna är endast för internt bruk.

          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => pickFiles(e.target.files)}
        />

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => inputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Välj bildfiler
          </Button>
          {counts.total > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">{counts.total} filer</Badge>
              <Badge variant="outline" className="text-[10px]">{counts.matched} matchade</Badge>
              {counts.unmatched > 0 && (
                <Badge variant="outline" className="text-[10px] text-amber-600">{counts.unmatched} utan match</Badge>
              )}
              {counts.error > 0 && (
                <Badge variant="destructive" className="text-[10px]">{counts.error} fel</Badge>
              )}
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div className="max-h-[50vh] overflow-auto border border-border rounded-md">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted">
                <tr className="h-7">
                  <th className="px-2 text-left font-medium text-muted-foreground">Fil</th>
                  <th className="px-2 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-2 text-left font-medium text-muted-foreground">Produkt</th>
                  <th className="px-2 text-left font-medium text-muted-foreground">Match</th>
                  <th className="px-2 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.file.name}-${i}`} className="border-t border-border/60 h-9">
                    <td className="px-2 font-mono text-[10px] text-muted-foreground">{r.file.name}</td>
                    <td className="px-2 font-mono">{r.sku}</td>
                    <td className="px-2">
                      <Popover open={pickerOpen === i} onOpenChange={(o) => setPickerOpen(o ? i : null)}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[11px] justify-between gap-1 max-w-[220px]"
                            disabled={running}
                          >
                            <span className={`truncate ${r.productName ? "" : "text-muted-foreground"}`}>
                              {r.productName ?? "Välj produkt"}
                            </span>
                            <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[320px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Sök produkt eller SKU..." className="h-8 text-xs" />
                            <CommandList>
                              <CommandEmpty className="py-4 text-center text-xs">Ingen produkt hittad</CommandEmpty>
                              {(r.candidates?.length ?? 0) > 0 && (
                                <CommandGroup heading="Föreslagna matchningar">
                                  {r.candidates!.map((c) => (
                                    <CommandItem
                                      key={`cand-${c.id}`}
                                      value={`${c.name} ${c.sku}`}
                                      onSelect={() => assignProduct(i, c)}
                                      className="text-xs"
                                    >
                                      <span className="truncate">{c.name}</span>
                                      {c.hasImage && (
                                        <Badge variant="outline" className="ml-1 text-[9px] text-amber-600">har bild</Badge>
                                      )}
                                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">{c.sku}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              <CommandGroup heading="Alla produkter">
                                {products.map((p) => (
                                  <CommandItem
                                    key={p.id}
                                    value={`${p.name} ${p.sku}`}
                                    onSelect={() => assignProduct(i, p)}
                                    className="text-xs"
                                  >
                                    <span className="truncate">{p.name}</span>
                                    {p.hasImage && (
                                      <Badge variant="outline" className="ml-1 text-[9px] text-amber-600">har bild</Badge>
                                    )}
                                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{p.sku}</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {r.productId && r.status !== "done" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground"
                          onClick={() => clearProduct(i)}
                          disabled={running}
                          aria-label="Ta bort koppling"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                    <td className="px-2">
                      {r.matchType ? (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${r.matchType === "liknande" ? "text-amber-600" : ""}`}
                        >
                          {r.matchType}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {r.tier && r.tier !== "basic" && (
                        <Badge variant="outline" className="ml-1 text-[9px]">{r.tier}</Badge>
                      )}
                    </td>
                    <td className="px-2">
                      {r.status === "uploading" && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> laddar upp
                        </span>
                      )}
                      {r.status === "done" && (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Check className="h-3 w-3" /> kopplad
                        </span>
                      )}
                      {r.status === "skipped" && <span className="text-amber-600">{r.message}</span>}
                      {r.status === "error" && (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <X className="h-3 w-3" /> {r.message}
                        </span>
                      )}
                      {r.status === "pending" && (
                        <span className={r.productHasImage ? "text-amber-600" : "text-muted-foreground"}>
                          {r.productHasImage ? "ersätter befintlig bild" : "klar att ladda upp"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {counts.done > 0 && (
          <div className="flex gap-2 flex-wrap">
            {rows
              .filter((r) => r.status === "done")
              .slice(0, 8)
              .map((r) => (
                <ProductThumb key={r.sku} src={r.url} alt={r.productName ?? r.sku} />
              ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => close(false)}>
            Stäng
          </Button>
          <Button size="sm" onClick={runUpload} disabled={running || counts.matched === 0}>
            {running ? "Laddar upp..." : `Ladda upp ${counts.matched} bilder`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
