import { useMemo, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useStores } from "@/hooks/useStores";
import { useProducts } from "@/hooks/useProducts";
import {
  useDeleteNimposStoreMap,
  useLinkNimposProduct,
  useNimposProductMap,
  useNimposStoreMap,
  useSaveNimposStoreMap,
} from "@/hooks/usePosLive";

/** Kassakod → butik. Utan mappning parkeras kvittot som "unmapped_store". */
export function NimposStoreMapping() {
  const { data: stores = [] } = useStores(true);
  const { data: rows = [] } = useNimposStoreMap();
  const save = useSaveNimposStoreMap();
  const del = useDeleteNimposStoreMap();
  const [code, setCode] = useState("");
  const [storeId, setStoreId] = useState("");

  const add = async () => {
    if (!code.trim() || !storeId) {
      toast.error("Fyll i kassakod och butik");
      return;
    }
    await save.mutateAsync({ store_code: code.trim(), store_id: storeId, active: true });
    setCode("");
    setStoreId("");
    toast.success("Kassakod kopplad");
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-heading">Kassor → butik</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Kassakod från Nimpos"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-9 w-52"
          />
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue placeholder="Välj butik" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={add} disabled={save.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Koppla
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga kassor kopplade ännu.</p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="font-mono text-xs w-40 truncate">{r.store_code}</span>
                {r.register_id && (
                  <Badge variant="outline" className="text-[10px]">
                    kassa {r.register_id}
                  </Badge>
                )}
                <span className="flex-1 truncate text-foreground">
                  {stores.find((s) => s.id === r.store_id)?.name ?? "Okänd butik"}
                </span>
                {!r.active && <Badge variant="secondary" className="text-[10px]">inaktiv</Badge>}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => del.mutate(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Omatchade kassaartiklar → produkt i registret. */
export function NimposProductMapping() {
  const [onlyUnmatched, setOnlyUnmatched] = useState(true);
  const { data: rows = [] } = useNimposProductMap(onlyUnmatched);
  const { data: products = [] } = useProducts();
  const link = useLinkNimposProduct();
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.external_name, r.external_sku, r.barcode].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-heading">Kassaartiklar → produkter</CardTitle>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setOnlyUnmatched((v) => !v)}>
          {onlyUnmatched ? "Visa alla" : "Visa bara omatchade"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Sök artikel, SKU eller streckkod"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-sm"
        />
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inget att koppla — alla artiklar är matchade.</p>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className="flex-1 min-w-[10rem] truncate text-foreground">
                  {r.external_name || r.external_sku || r.barcode}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground w-32 truncate">
                  {r.external_sku || r.barcode || "—"}
                </span>
                {r.unmatched_count > 0 && (
                  <Badge variant="outline" className="text-[10px] text-warning border-warning/40">
                    {r.unmatched_count} kvitton
                  </Badge>
                )}
                <Select
                  value={r.product_id ?? ""}
                  onValueChange={(v) => link.mutate({ id: r.id, productId: v || null })}
                >
                  <SelectTrigger className="h-8 w-64">
                    <SelectValue placeholder="Välj produkt" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.sku ? ` · ${p.sku}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {r.product_id && <Link2 className="h-3.5 w-3.5 text-success" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
