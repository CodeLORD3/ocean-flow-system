import { useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Upload, Check, X, Loader2 } from "lucide-react";
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
  matchType?: "sku" | "namn" | "liknande";
  url?: string;
}

const skuFromFileName = (name: string) => name.replace(/\.[^.]+$/, "").trim();

/** tar bort filändelse, kopiesuffix (-2, _1, (1), " kopia") och normaliserar */
const baseFromFileName = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\((\d+)\)\s*$/, "")
    .replace(/[-_\s]+(kopia|copy)\s*\d*$/i, "")
    .replace(/[-_\s]+\d{1,2}$/, "")
    .trim();

const norm = (v: string) =>
  v
    .normalize("NFC")
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]/g, "");

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
    const { data } = await supabase.from("products").select("id, sku, name");
    const products = data ?? [];
    const bySku = new Map(products.map((p) => [norm(String(p.sku ?? "")), p]));
    const byName = new Map(products.map((p) => [norm(String(p.name ?? "")), p]));

    setRows(
      list.map((file) => {
        const raw = skuFromFileName(file.name);
        const base = baseFromFileName(file.name);
        const keyRaw = norm(raw);
        const keyBase = norm(base);

        // 1) exakt SKU (med eller utan kopiesuffix)
        let match = bySku.get(keyRaw) ?? bySku.get(keyBase);
        let matchType: FileRow["matchType"] = match ? "sku" : undefined;

        // 2) exakt produktnamn
        if (!match) {
          match = byName.get(keyRaw) ?? byName.get(keyBase);
          if (match) matchType = "namn";
        }

        // 3) liknande namn (prefix/innehåll eller hög likhet)
        if (!match && keyBase.length >= 4) {
          let best: { p: (typeof products)[number]; score: number } | null = null;
          for (const p of products) {
            const nk = norm(String(p.name ?? ""));
            if (nk.length < 3) continue;
            let score = similarity(keyBase, nk);
            if (nk.startsWith(keyBase) || keyBase.startsWith(nk)) {
              score = Math.max(score, 0.93 - Math.abs(nk.length - keyBase.length) / 100);
            }
            if (!best || score > best.score) best = { p, score };
          }
          if (best && best.score >= 0.82) {
            match = best.p;
            matchType = "liknande";
          }
        }

        return match
          ? {
              file,
              sku: String(match.sku ?? raw),
              status: "pending" as const,
              productName: match.name,
              productId: match.id,
              productSku: String(match.sku ?? ""),
              matchType,
            }
          : { file, sku: raw, status: "skipped" as const, message: "ingen matchande produkt" };
      }),
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
        const key = `${row.sku.replace(/[^a-zA-Z0-9ÅÄÖåäö\-_.]/g, "_")}.${ext}`;
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
            Filnamnet tolkas först som SKU (t.ex. <span className="font-mono">FS-045.jpg</span>), annars matchas det
            mot produktnamn — även liknande namn och kopiesuffix (t.ex. <span className="font-mono">bergtungafil-2.jpg</span>{" "}
            → Bergtungafilé). Bilderna är endast för internt bruk.
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
                    <td className="px-2">{r.productName ?? <span className="text-muted-foreground">—</span>}</td>
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
                      {r.status === "pending" && <span className="text-muted-foreground">klar att ladda upp</span>}
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
