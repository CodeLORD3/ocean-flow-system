import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CookingPot, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import {
  TRANSFORM_TYPES,
  useDeleteTransformationRecipe,
  useTransformationRecipes,
  useUpsertTransformationRecipe,
} from "@/hooks/useTransformationRecipes";
import { fmt } from "@/lib/filletMath";

/**
 * Omvandlingsregistret: råvaru-SKU → färdigvaru-SKU med utbyte och typ.
 * Redigerbart, så nya kokningar (t.ex. signalkräftor) kan läggas upp utan kod.
 */
export default function TransformationRecipes() {
  const { data: recipes = [], isLoading } = useTransformationRecipes();
  const { data: products = [] } = useProducts();
  const upsert = useUpsertTransformationRecipe();
  const remove = useDeleteTransformationRecipe();

  const [rawId, setRawId] = useState("");
  const [outId, setOutId] = useState("");
  const [yieldPct, setYieldPct] = useState("90");
  const [surcharge, setSurcharge] = useState("35");
  const [type, setType] = useState("kokning");

  const options = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name, "sv")),
    [products],
  );

  const save = async () => {
    if (!rawId || !outId || rawId === outId) {
      toast({ title: "Ofullständigt", description: "Välj olika råvara och färdigvara.", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        raw_product_id: rawId,
        output_product_id: outId,
        yield_pct: Number(yieldPct),
        surcharge_per_kg: Number(surcharge),
        transform_type: type,
      });
      toast({ title: "Recept sparat" });
      setRawId("");
      setOutId("");
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Omvandlingsrecept</h1>
        <p className="text-xs text-muted-foreground">
          En råvaru-SKU blir en färdigvaru-SKU, i första hand kokning av skaldjur. Utbytet styr utvikten och
          kostpriset i produktionen.
        </p>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Plus className="h-4 w-4" /> Nytt recept
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-[11px]">Råvara</Label>
            <Select value={rawId} onValueChange={setRawId}>
              <SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Välj råvara" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {options.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.sku} · {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Färdigvara</Label>
            <Select value={outId} onValueChange={setOutId}>
              <SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Välj färdigvara" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {options.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.sku} · {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Utbyte (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={yieldPct}
              onChange={(e) => setYieldPct(e.target.value)}
              className="h-10 text-right font-mono text-xs tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Påslag (kr/kg)</Label>
            <Input
              type="number"
              step="1"
              value={surcharge}
              onChange={(e) => setSurcharge(e.target.value)}
              className="h-10 text-right font-mono text-xs tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Typ</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRANSFORM_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="mt-1 h-9 w-full gap-1.5 text-xs" onClick={save} disabled={upsert.isPending}>
              <CookingPot className="h-3.5 w-3.5" /> Spara recept
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Registret</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-[11px] text-muted-foreground">Hämtar…</p>
          ) : recipes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Inga recept upplagda ännu — lägg upp första omvandlingen ovan.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Råvara</TableHead>
                    <TableHead className="text-[11px]">Färdigvara</TableHead>
                    <TableHead className="text-[11px]">Typ</TableHead>
                    <TableHead className="text-right text-[11px]">Utbyte</TableHead>
                    <TableHead className="text-right text-[11px]">Påslag</TableHead>
                    <TableHead className="text-right text-[11px]">Hållbarhet</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipes.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="py-1.5 text-[11px]">
                        <span className="font-mono">{r.raw?.sku}</span> · {r.raw?.name}
                      </TableCell>
                      <TableCell className="py-1.5 text-[11px]">
                        <span className="font-mono">{r.output?.sku}</span> · {r.output?.name}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="outline" className="text-[10px]">{r.transform_type}</Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-[11px] tabular-nums">
                        {fmt(Number(r.yield_pct), 0)} %
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-[11px] tabular-nums">
                        {fmt(Number(r.surcharge_per_kg), 0)} kr/kg
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-[11px] tabular-nums">
                        {r.output?.shelf_life_days ? `${r.output.shelf_life_days} d` : "—"}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => remove.mutate(r.id)}
                          aria-label="Ta bort recept"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
