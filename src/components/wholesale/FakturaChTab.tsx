import { useMemo } from "react";
import { FileText, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";

const CATEGORIES = ["VARMKÖK", "KALLKÖK", "FISK / SKALDJUR"];

export default function FakturaChTab() {
  const { data: stores = [] } = useStores();
  const schweizStore = stores.find(s => s.name?.toLowerCase().includes("schweiz"));
  const { data: orders = [], isLoading } = useShopOrders(schweizStore?.id);

  // Build export lines from Schweiz orders
  const exportLines = useMemo(() => {
    const map = new Map<string, {
      name: string;
      quantity: number;
      unit: string;
      category: string;
      hsCode: string;
      weightPerPiece: number;
      netWeight: number;
      grossWeight: number;
      priceSek: number;
      totalSek: number;
    }>();

    for (const order of orders) {
      for (const line of ((order as any).shop_order_lines || [])) {
        const p = line.products;
        if (!p) continue;
        const name = p.name;
        const qty = Number(line.quantity_delivered || line.quantity_ordered);
        const unit = line.unit || p.unit || "ST";
        const wpk = Number(p.weight_per_piece || 0);
        
        let netWeight = 0;
        if (unit === "KG") {
          netWeight = qty;
        } else if (wpk > 0) {
          netWeight = qty * wpk;
        }

        if (!map.has(name)) {
          map.set(name, {
            name,
            quantity: 0,
            unit,
            category: p.category || "",
            hsCode: p.hs_code || "-",
            weightPerPiece: wpk,
            netWeight: 0,
            grossWeight: 0,
            priceSek: 0,
            totalSek: 0,
          });
        }
        const entry = map.get(name)!;
        entry.quantity += qty;
        entry.netWeight += netWeight;
        entry.grossWeight = entry.netWeight * 1.1;
      }
    }

    return Array.from(map.values());
  }, [orders]);

  const totalNet = exportLines.reduce((s, l) => s + l.netWeight, 0);
  const totalGross = exportLines.reduce((s, l) => s + l.grossWeight, 0);
  const totalSek = exportLines.reduce((s, l) => s + l.totalSek, 0);

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-heading">Faktura Schweiz — Exportunderlag</CardTitle>
              <CardDescription className="text-xs">
                Produkter & vikter hämtas automatiskt från Schweiz-beställningar. ST-produkter × vikt/styck. Bruttovikt = nettovikt +10%.
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={() => window.print()}>
            <Download className="h-3 w-3" /> Exportera
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {exportLines.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            {schweizStore ? "Inga beställningar från Schweiz-butiken ännu." : "Ingen butik med namnet 'Schweiz' hittades. Skapa en butik med det namnet för att aktivera exportunderlag."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">PRODUKTNAMN</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">ANTAL</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">ENHET</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">NETTOVIKT (KG)</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">BRUTTOVIKT (KG)<br /><span className="text-[9px]">+10%</span></th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">HS-KOD</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">PRIS SEK</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">TOTAL SEK</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map(cat => {
                  const catLines = exportLines.filter(l => l.category === cat);
                  if (catLines.length === 0) return null;
                  return (
                    <>
                      <tr key={cat}><td colSpan={8} className="pt-3 pb-1 text-[10px] font-bold text-muted-foreground">▸ {cat}</td></tr>
                      {catLines.map(line => (
                        <tr key={line.name} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="py-1.5 font-medium text-foreground">{line.name}</td>
                          <td className="py-1.5 text-right text-foreground">{line.quantity}</td>
                          <td className="py-1.5 text-muted-foreground">{line.unit}</td>
                          <td className="py-1.5 text-right text-foreground">{line.netWeight.toFixed(3)}</td>
                          <td className="py-1.5 text-right text-foreground">{line.grossWeight.toFixed(3)}</td>
                          <td className="py-1.5 font-mono text-muted-foreground">{line.hsCode}</td>
                          <td className="py-1.5 text-right text-muted-foreground">{line.priceSek || "–"}</td>
                          <td className="py-1.5 text-right font-medium text-foreground">{line.totalSek ? `${line.totalSek.toLocaleString("sv-SE")} SEK` : "–"}</td>
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-2 font-bold text-foreground" colSpan={3}>TOTALT</td>
                  <td className="py-2 text-right font-bold text-foreground">{totalNet.toFixed(3)}</td>
                  <td className="py-2 text-right font-bold text-foreground">{totalGross.toFixed(3)}</td>
                  <td></td>
                  <td></td>
                  <td className="py-2 text-right font-bold text-primary">{totalSek ? `${totalSek.toLocaleString("sv-SE")} SEK` : "0.00 SEK"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="mt-3 p-2 rounded-md bg-primary/5 border border-primary/10 text-[10px] text-foreground">
          <span className="font-semibold text-primary">Exportunderlag:</span> Nettovikt beräknas automatiskt. KG-produkter = direkt vikt. ST-produkter = antal × vikt/styck. Bruttovikt = netto + 10%. Pris SEK fylls i manuellt.
        </div>
      </CardContent>
    </Card>
  );
}
