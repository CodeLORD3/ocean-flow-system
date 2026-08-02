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
  url?: string;
}

const skuFromFileName = (name: string) => name.replace(/\.[^.]+$/, "").trim();

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
    const skus = list.map((f) => skuFromFileName(f.name));
    const { data } = await supabase
      .from("products")
      .select("id, sku, name")
      .in("sku", skus);
    const bySku = new Map((data ?? []).map((p) => [String(p.sku).toLowerCase(), p]));
    setRows(
      list.map((file) => {
        const sku = skuFromFileName(file.name);
        const match = bySku.get(sku.toLowerCase());
        return match
          ? { file, sku, status: "pending" as const, productName: match.name, productId: match.id }
          : { file, sku, status: "skipped" as const, message: "ingen produkt med detta SKU" };
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
      description: `${ok} bilder kopplade, ${next.filter((r) => r.status === "skipped").length} utan matchande SKU.`,
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
            Filnamnet utan ändelse tolkas som SKU (t.ex. <span className="font-mono">FS-045.jpg</span>) och kopplas
            till produkten med samma SKU. Bilderna är endast för internt bruk.
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
                <Badge variant="outline" className="text-[10px] text-amber-600">{counts.unmatched} utan SKU-match</Badge>
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
