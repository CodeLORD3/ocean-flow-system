import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Download, FileSpreadsheet, AlertTriangle, Check, Loader2, Info } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCategories } from "@/hooks/useCategories";
import { useSuppliers } from "@/hooks/useSuppliers";
import { logActivity } from "@/hooks/useActivityLog";
import {
  buildDiff,
  buildSupplierIndex,
  buildTemplateCsv,
  IMPORT_COLUMNS,
  lookupSupplier,
  parseProductFile,
  supplierAliasKeys,
  toPayload,
  type DiffRow,
  type ExistingProduct,
} from "@/lib/productImport";
import ImportHistory from "@/components/products/ImportHistory";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusLabel: Record<string, string> = {
  new: "Ny",
  changed: "Ändrad",
  unchanged: "Oförändrad",
  error: "Fel",
};

export default function ProductImportDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: categories = [] } = useCategories();
  const { data: suppliers = [] } = useSuppliers();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [missingOptional, setMissingOptional] = useState<string[]>([]);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);

  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [existing, setExisting] = useState<ExistingProduct[]>([]);

  const counts = useMemo(() => {
    const c = { new: 0, changed: 0, unchanged: 0, error: 0 };
    (diff ?? []).forEach((d) => {
      c[d.status] += 1;
    });
    return c;
  }, [diff]);

  const reset = () => {
    setFileName(null);
    setDiff(null);
    setFatal(null);
    setMissingOptional([]);
    setUnknownColumns([]);
    setExisting([]);
    if (fileRef.current) fileRef.current.value = "";
  };


  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setFatal(null);
    setDiff(null);
    setFileName(file.name);
    try {
      const parsed = await parseProductFile(file);
      if (parsed.fatal) {
        setFatal(parsed.fatal);
        return;
      }
      setMissingOptional(parsed.missingOptionalColumns);
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, sku, name, category, unit, cost_price, wholesale_price, retail_suggested, origin, producer, supplier_id, barcode, hs_code, weight_per_piece, shelf_life_days, parent_product_id, active, image_url, latin_name, species_group, fao_code",
        );
      if (error) throw error;
      const existingRows = (data ?? []) as unknown as ExistingProduct[];
      setExisting(existingRows);
      setDiff(
        buildDiff({
          rows: parsed.rows,
          existing: existingRows,
          categories: categories.map((c) => c.name),
          suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
        }),
      );
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "Kunde inte läsa filen.");
    } finally {
      setParsing(false);
    }
  };

  const rejectedRows = useMemo(() => (diff ?? []).filter((d) => d.status === "error"), [diff]);

  const buildRejectedPayload = () =>
    rejectedRows.slice(0, 200).map((d) => ({
      line: d.row.rowNumber,
      sku: d.row.sku,
      name: d.row.name,
      errors: d.errors,
    }));

  /** Komplett lista från valideringen i webbläsaren — aldrig trunkerad som loggen */
  const downloadRejectedCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ["rad", "sku", "name", "fel"].join(","),
      ...rejectedRows.map((d) =>
        [String(d.row.rowNumber), d.row.sku, d.row.name, d.errors.join("; ")].map(esc).join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `avvisade_rader_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const runImport = async () => {
    if (!diff) return;
    const importable = diff.filter((d) => d.status === "new" || d.status === "changed");
    if (importable.length === 0) {
      if (rejectedRows.length === 0) return;
      // Inget kunde importeras — logga ändå de avvisade raderna så de kan spåras i efterhand
      await logActivity({
        action_type: "product_import",
        description: `Produktimport: 0 nya, 0 uppdaterade, ${rejectedRows.length} avvisade (${fileName ?? "fil"})`,
        entity_type: "products",
        details: {
          inserted: 0,
          updated: 0,
          skipped: rejectedRows.length,
          rejected_total: rejectedRows.length,
          rejected: buildRejectedPayload(),
          file: fileName,
        },
      });
      toast({ title: "Inget importerat", description: `${rejectedRows.length} rader avvisades.` });
      handleClose(false);
      return;
    }
    setImporting(true);
    try {

      const supplierIndex = buildSupplierIndex(suppliers.map((s) => ({ id: s.id, name: s.name })));
      const existingBySku = new Map(existing.map((p) => [p.sku.toLowerCase(), p]));

      // Skapa leverantörer som saknas i registret
      const missingSuppliers = new Map<string, string>();
      importable.forEach((d) => {
        const raw = d.row.supplier?.trim();
        if (!raw) return;
        if (lookupSupplier(supplierIndex, raw)) return;
        missingSuppliers.set(raw.toLowerCase(), raw);
      });
      if (missingSuppliers.size > 0) {
        const { data: created, error: supErr } = await supabase
          .from("suppliers")
          .insert([...missingSuppliers.values()].map((name) => ({ name })))
          .select("id, name");
        if (supErr) throw supErr;
        (created ?? []).forEach((s) => {
          supplierAliasKeys(s.name).forEach((k) => {
            if (!supplierIndex.has(k)) supplierIndex.set(k, { id: s.id, name: s.name });
          });
        });
      }


      // Ensure new categories exist
      const knownCats = new Set(categories.map((c) => c.name.toLowerCase()));
      const newCats = [
        ...new Set(
          importable
            .map((d) => d.row.category)
            .filter((c) => c && !knownCats.has(c.toLowerCase())),
        ),
      ];
      if (newCats.length > 0) {
        await supabase.from("categories").insert(newCats.map((name) => ({ name })));
      }

      // Step 1: parents (rows without parent_sku)
      const parents = importable.filter((d) => !d.row.parent_sku);
      const variants = importable.filter((d) => d.row.parent_sku);

      const buildRow = (d: DiffRow, parentId: string | null) => {
        const payload = toPayload(d.row);
        const supplierId = d.row.supplier
          ? lookupSupplier(supplierIndex, d.row.supplier)?.id ??
            existingBySku.get(d.row.sku.toLowerCase())?.supplier_id ??
            null
          : existingBySku.get(d.row.sku.toLowerCase())?.supplier_id ?? null;

        return { ...payload, supplier_id: supplierId, parent_product_id: parentId };
      };

      const chunk = <T,>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      let inserted = 0;
      let updated = 0;

      for (const batch of chunk(parents, 200)) {
        const { error } = await supabase
          .from("products")
          .upsert(batch.map((d) => buildRow(d, null)) as never, { onConflict: "sku" });
        if (error) throw error;
        batch.forEach((d) => (d.status === "new" ? inserted++ : updated++));
      }

      // Refresh sku -> id map so variants can resolve parents created above
      const { data: refreshed } = await supabase.from("products").select("id, sku");
      const idBySku = new Map((refreshed ?? []).map((p) => [String(p.sku).toLowerCase(), p.id]));

      for (const batch of chunk(variants, 200)) {
        const rows = batch.map((d) => buildRow(d, idBySku.get((d.row.parent_sku ?? "").toLowerCase()) ?? null));
        const { error } = await supabase.from("products").upsert(rows as never, { onConflict: "sku" });
        if (error) throw error;
        batch.forEach((d) => (d.status === "new" ? inserted++ : updated++));
      }

      await logActivity({
        action_type: "product_import",
        description: `Produktimport: ${inserted} nya, ${updated} uppdaterade${
          rejectedRows.length ? `, ${rejectedRows.length} avvisade` : ""
        } (${fileName ?? "fil"})`,
        entity_type: "products",
        details: {
          inserted,
          updated,
          skipped: counts.error,
          rejected_total: rejectedRows.length,
          rejected: buildRejectedPayload(),
          file: fileName,
        },
      });

      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["product-import-history"] });


      toast({
        title: "Import klar",
        description: `${inserted} nya, ${updated} uppdaterade, ${counts.error} hoppade över.`,
      });
      handleClose(false);
    } catch (e) {
      toast({
        title: "Import misslyckades",
        description: e instanceof Error ? e.message : "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const exportProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select(
        "sku, name, category, unit, cost_price, wholesale_price, retail_suggested, origin, producer, supplier_id, barcode, hs_code, weight_per_piece, shelf_life_days, parent_product_id, active, image_url, latin_name, species_group",
      )
      .order("category")
      .order("name");
    if (error || !data) {
      toast({ title: "Export misslyckades", variant: "destructive" });
      return;
    }
    const { data: all } = await supabase.from("products").select("id, sku");
    const skuById = new Map((all ?? []).map((p) => [p.id, p.sku]));
    const supplierById = new Map(suppliers.map((s) => [s.id, s.name]));
    const rows = data.map((p) => ({
      sku: p.sku,
      name: p.name,
      category: p.category,
      unit: p.unit,
      cost_price: Number(p.cost_price ?? 0).toFixed(2),
      wholesale_price: Number(p.wholesale_price ?? 0).toFixed(2),
      retail_suggested: Number(p.retail_suggested ?? 0).toFixed(2),
      origin: p.origin ?? "",
      producer: p.producer ?? "",
      supplier: p.supplier_id ? supplierById.get(p.supplier_id) ?? "" : "",
      barcode: p.barcode ?? "",
      hs_code: p.hs_code ?? "",
      weight_per_piece: p.weight_per_piece ?? "",
      shelf_life_days: p.shelf_life_days ?? "",
      parent_sku: p.parent_product_id ? skuById.get(p.parent_product_id) ?? "" : "",
      active: p.active === false ? "FALSE" : "TRUE",
      image_url: (p as any).image_url ?? "",
      latin_name: (p as any).latin_name ?? "",
      species_group: (p as any).species_group ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...IMPORT_COLUMNS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produkter");
    XLSX.writeFile(wb, `produkter_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "produktimport_mall.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleRows = (diff ?? []).filter((d) => showUnchanged || d.status !== "unchanged");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Produkter — import & export</DialogTitle>
          <DialogDescription className="text-xs">
            Ladda upp en .csv- eller .xlsx-fil. Inget sparas förrän du granskat och bekräftat.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => fileRef.current?.click()} disabled={parsing}>
            {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Välj fil
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={exportProducts}>
            <Download className="h-3.5 w-3.5" /> Exportera sortiment
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={downloadTemplate}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Ladda ner mall
          </Button>
          {fileName && <span className="text-xs text-muted-foreground self-center">{fileName}</span>}
        </div>

        {fatal && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{fatal}</span>
          </div>
        )}

        {missingOptional.length > 0 && !fatal && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Filen saknar kolumnerna <span className="font-mono">{missingOptional.join(", ")}</span>. Dessa fält lämnas
              orörda på befintliga produkter och tomma på nya.
            </span>
          </div>
        )}

        {!diff && !fatal && <ImportHistory />}


        {!diff && !fatal && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p>
                Obligatoriska kolumner: <code>sku</code>, <code>name</code>, <code>category</code>. Övriga kolumner:{" "}
                <code>unit, cost_price, wholesale_price, retail_suggested, stock, origin, producer, supplier, hs_code, barcode, weight_per_piece, shelf_life_days, active, parent_sku, image_url, latin_name, species_group</code>.
                Kolumnordningen spelar ingen roll och <code>stock</code> ignoreras alltid.
              </p>
              <p>
                <code>hs_code</code> = 6-siffrigt internationellt HS-nummer. Schweiziska 8-siffriga tulltaxenummer för
                export verifieras mot tares.ch. <code>weight_per_piece</code> fylls bara i för st-varor.
              </p>
              <p>
                <code>active = FALSE</code> inaktiverar raden (den raderas inte) — utfasade SKU:er och rader märkta
                "UTGÅTT:" är alltså inte fel. Nya kategorier visas som varning, inte fel.
              </p>
              <p>
                <code>image_url</code> = produktbild. Måste vara en publik https-länk till .jpg, .png eller .webp
                (filändelsen behålls som den är). Tomt fält lämnar befintlig bild orörd.
              </p>
              <p>
                <code>sku</code> är nyckeln — befintlig SKU uppdateras, ny skapas. Produkter som saknas i filen rörs
                inte. Lagersaldon importeras aldrig.
              </p>
            </div>
          </div>
        )}

        {diff && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                {counts.new} nya
              </Badge>
              <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                {counts.changed} ändrade
              </Badge>
              <Badge variant="outline">{counts.unchanged} oförändrade</Badge>
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                {counts.error} fel
              </Badge>
              {rejectedRows.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={downloadRejectedCsv}
                >
                  <Download className="mr-1 h-3 w-3" />
                  Alla avvisade rader (CSV)
                </Button>
              )}

              <label className="ml-auto flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={showUnchanged}
                  onCheckedChange={(v) => setShowUnchanged(v === true)}
                  className="h-3.5 w-3.5"
                />
                Visa oförändrade
              </label>
            </div>

            <div className="flex-1 overflow-auto border border-border rounded-md">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted">
                  <tr className="h-7 border-b border-border">
                    <th className="px-2 text-left font-medium text-[9px] uppercase tracking-wider text-muted-foreground">Rad</th>
                    <th className="px-2 text-left font-medium text-[9px] uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-2 text-left font-medium text-[9px] uppercase tracking-wider text-muted-foreground">SKU</th>
                    <th className="px-2 text-left font-medium text-[9px] uppercase tracking-wider text-muted-foreground">Namn</th>
                    <th className="px-2 text-left font-medium text-[9px] uppercase tracking-wider text-muted-foreground">Ändringar / meddelande</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((d) => (
                    <tr key={`${d.row.rowNumber}-${d.row.sku}`} className="border-b border-border/50 align-top">
                      <td className="px-2 py-1 font-mono tabular-nums text-muted-foreground">{d.row.rowNumber}</td>
                      <td className="px-2 py-1">
                        <span
                          className={
                            d.status === "new"
                              ? "text-emerald-600"
                              : d.status === "changed"
                                ? "text-amber-600"
                                : d.status === "error"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                          }
                        >
                          {statusLabel[d.status]}
                        </span>
                      </td>
                      <td className="px-2 py-1 font-mono">{d.row.sku}</td>
                      <td className="px-2 py-1">{d.row.name}</td>
                      <td className="px-2 py-1 space-y-0.5">
                        {d.errors.map((e) => (
                          <div key={e} className="text-destructive">
                            {e}
                          </div>
                        ))}
                        {d.warnings.map((w) => (
                          <div key={w} className="text-amber-600">
                            {w}
                          </div>
                        ))}
                        {d.changes.map((c) => (
                          <div key={c.field} className="text-muted-foreground">
                            <span className="font-medium text-foreground">{c.field}</span>: {String(c.from) || "—"} →{" "}
                            {String(c.to) || "—"}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                        Inga rader att visa.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => handleClose(false)}>
            Stäng
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!diff || importing || counts.new + counts.changed === 0}
            onClick={runImport}
          >
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Importera {counts.new + counts.changed} rader
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
