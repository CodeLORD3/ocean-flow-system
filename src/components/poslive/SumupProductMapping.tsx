import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSumupHealth, useSumupMapProduct } from "@/hooks/useSumupHealth";

/**
 * SumUps kassarader saknar SKU och EAN — matchningen sker på namn.
 * Här bekräftas de namn som inte kunde matchas automatiskt.
 */
export function SumupProductMapping() {
  const { data, isLoading } = useSumupHealth();
  const mapProduct = useSumupMapProduct();
  const [search, setSearch] = useState<Record<string, string>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  const rows = data?.unmatched ?? [];
  const term = (openRow && search[openRow]) || "";

  const { data: products } = useQuery({
    queryKey: ["sumup-map-products", term],
    enabled: term.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, unit")
        .eq("active", true)
        .ilike("name", `%${term.trim()}%`)
        .order("name")
        .limit(12);
      return data ?? [];
    },
  });

  const total = useMemo(() => rows.reduce((a, r) => a + (r.unmatched_count ?? 0), 0), [rows]);

  const confirm = async (id: string, productId: string, unit: string | null) => {
    try {
      await mapProduct.mutateAsync({ id, productId, unit });
      setOpenRow(null);
      toast.success("Artikelnamnet är kopplat");
    } catch (e: any) {
      toast.error(e.message ?? "Kunde inte koppla artikeln");
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          SumUp-artiklar utan produkt
          {rows.length > 0 && (
            <Badge variant="destructive" className="h-5">
              {rows.length} namn / {total} rader
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {isLoading && <p className="text-muted-foreground">Hämtar…</p>}
        {!isLoading && rows.length === 0 && (
          <p className="text-muted-foreground">
            Alla kassarader matchar en produkt. Nya artiklar skapas alltid i Makrilltrade först, med
            samma namn i SumUp.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded-md border border-border/60 p-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.external_name}</span>
              <span className="text-muted-foreground tabular-nums">
                {r.unmatched_count} rader · {r.merchant_code ?? "—"}
              </span>
            </div>
            {openRow === r.id ? (
              <div className="space-y-1.5">
                <Input
                  autoFocus
                  value={search[r.id] ?? ""}
                  onChange={(e) => setSearch((s) => ({ ...s, [r.id]: e.target.value }))}
                  placeholder="Sök produkt i Makrilltrade"
                  className="h-8 text-xs"
                />
                {(products ?? []).map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => confirm(r.id, p.id, p.unit)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/60"
                  >
                    <span>{p.name}</span>
                    <span className="font-mono text-muted-foreground">
                      {p.sku} · {p.unit}
                    </span>
                  </button>
                ))}
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpenRow(null)}>
                  Avbryt
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setOpenRow(r.id)}
              >
                Koppla produkt
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
