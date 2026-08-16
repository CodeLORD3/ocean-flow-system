import { useMemo, useState } from "react";
import { AlertTriangle, Check, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useProducts } from "@/hooks/useProducts";
import {
  useAcceptPosLineUnit,
  usePosReviewLines,
  useResolvePosLine,
  type PosReviewLine,
} from "@/hooks/useNimposHealth";

const kr = (ore: number) =>
  Math.round((ore || 0) / 100)
    .toLocaleString("sv-SE")
    .replace(/\u00a0/g, " ");

const norm = (v?: string | null) =>
  (v ?? "")
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9 ]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Rankning: exakt SKU/streckkod väger tyngst, sedan ordöverlapp i namnet. */
function score(line: PosReviewLine, p: { name: string; sku: string | null; barcode?: string | null }) {
  let s = 0;
  if (line.sku && p.sku && line.sku.toLowerCase() === p.sku.toLowerCase()) s += 100;
  if (line.barcode && p.barcode && line.barcode === p.barcode) s += 100;
  if (line.sku && p.sku && p.sku.toLowerCase().includes(line.sku.toLowerCase())) s += 20;
  const a = norm(line.product_name);
  const b = norm(p.name);
  const hits = a.filter((w) => b.some((x) => x.startsWith(w) || w.startsWith(x)));
  s += hits.length * 10;
  if (b.join(" ") === a.join(" ")) s += 30;
  return s;
}

/**
 * Granskningsvy för kassarader: kronorna är alltid bokförda, här knyts raden
 * till rätt produkt så lagret följer med och matchningen sparas för framtiden.
 */
export function PosLineReview() {
  const { data: lines = [], isLoading } = usePosReviewLines();
  const { data: products = [] } = useProducts();
  const resolve = useResolvePosLine();
  const acceptUnit = useAcceptPosLineUnit();
  const [search, setSearch] = useState("");
  const [manual, setManual] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) =>
      [l.product_name, l.sku, l.barcode].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [lines, search]);

  const suggestionsFor = (line: PosReviewLine) =>
    products
      .map((p) => ({ p, s: score(line, p as any) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);

  const link = async (line: PosReviewLine, productId: string) => {
    try {
      await resolve.mutateAsync({ line, productId });
      toast.success("Raden kopplad — samma artikel matchas automatiskt nästa gång");
    } catch (e: any) {
      toast.error(e.message ?? "Kunde inte koppla raden");
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-heading flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-warning" /> Kassarader att granska
        </CardTitle>
        <Badge variant="outline" className="text-[10px]">
          {lines.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Sök artikelnamn, SKU eller streckkod"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-sm"
        />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Hämtar rader…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Inget att granska — alla kassarader är matchade med rätt produkt och enhet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((l) => {
              const sugg = suggestionsFor(l);
              const q = manual[l.id] ?? "";
              const manualHits = q.trim()
                ? products
                    .filter((p) =>
                      [p.name, p.sku].some((v) => v?.toLowerCase().includes(q.trim().toLowerCase())),
                    )
                    .slice(0, 5)
                : [];
              return (
                <div key={l.id} className="py-2 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex-1 min-w-[10rem] truncate text-foreground font-medium">
                      {l.product_name}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground w-32 truncate">
                      {l.sku || l.barcode || "—"}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {l.quantity} {l.pos_unit || l.unit}
                    </span>
                    <span className="font-mono tabular-nums w-20 text-right text-foreground">
                      {kr(l.line_total_ore)} kr
                    </span>
                    {l.unit_mismatch && (
                      <Badge variant="outline" className="text-[10px] text-warning border-warning/40">
                        <Scale className="h-3 w-3 mr-1" /> enhet {l.pos_unit} ≠ {l.unit}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {l.review_status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {sugg.map(({ p }) => (
                      <Button
                        key={p.id}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => link(l, p.id)}
                        disabled={resolve.isPending}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {p.name}
                        {p.sku ? ` · ${p.sku}` : ""}
                      </Button>
                    ))}
                    <Input
                      placeholder="Sök annan produkt"
                      value={q}
                      onChange={(e) => setManual((m) => ({ ...m, [l.id]: e.target.value }))}
                      className="h-7 w-48 text-xs"
                    />
                    {manualHits.map((p) => (
                      <Button
                        key={`m-${p.id}`}
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => link(l, p.id)}
                      >
                        {p.name}
                      </Button>
                    ))}
                    {l.unit_mismatch && l.product_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => acceptUnit.mutate(l.id)}
                      >
                        Godkänn som den kom
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PosLineReview;
