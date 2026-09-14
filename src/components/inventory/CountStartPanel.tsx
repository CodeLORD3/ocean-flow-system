import { ClipboardCheck, Calendar, Store, Play, Package, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Startpanel för en ny inventeringsrapport. Guidar i tre tydliga steg:
 * välj plats, välj dag, starta räkningen.
 */
export default function CountStartPanel({
  stores,
  storeId,
  onStoreChange,
  date,
  onDateChange,
  dayName,
  productCount,
  onStart,
  onPrint,
}: {
  stores: any[];
  storeId: string;
  onStoreChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  dayName: string;
  productCount: number;
  onStart: () => void;
  onPrint: () => void;
}) {
  const steps = [
    {
      n: 1,
      title: "Välj butik och dag",
      body: "Rapporten hör till en plats och ett datum.",
    },
    {
      n: 2,
      title: "Räkna varorna",
      body: "Skriv in mängden per vara och lagerplats. Kategori för kategori.",
    },
    {
      n: 3,
      title: "Lås rapporten",
      body: "Det du räknat blir det nya lagersaldot. Efter låsning kan inget ändras.",
    },
  ];

  return (
    <Card className="overflow-hidden border-primary/25">
      <CardContent className="p-0">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Vänster: handling */}
          <div className="space-y-4 p-4 sm:p-6">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                <ClipboardCheck className="h-3 w-3" /> Ny inventeringsrapport
              </span>
              <h3 className="font-heading text-lg font-bold leading-tight text-foreground">
                Räkna av lagret
              </h3>
              <p className="text-xs text-muted-foreground">
                Tre steg. Du kan pausa när du vill — rapporten sparas medan du räknar.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Store className="h-3 w-3 text-muted-foreground" /> Butik
                </Label>
                <Select value={storeId} onValueChange={onStoreChange}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Välj butik" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s: any) => (
                      <SelectItem key={s.id} value={s.id} className="text-sm">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Calendar className="h-3 w-3 text-muted-foreground" /> Datum
                  {dayName && (
                    <span className="text-[10px] font-normal text-muted-foreground">{dayName}</span>
                  )}
                </Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => onDateChange(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="lg"
                className="h-11 flex-1 gap-2 text-sm font-semibold sm:flex-none"
                disabled={!storeId}
                onClick={onStart}
              >
                <Play className="h-4 w-4" /> Starta inventeringen
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-11 gap-2 text-sm"
                onClick={onPrint}
              >
                <Printer className="h-4 w-4" /> Räknelista på papper
              </Button>
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Package className="h-3 w-3" />
              {productCount > 0
                ? `${productCount} varor med saldo att gå igenom`
                : "Inga varor med saldo just nu — du kan ändå räkna och rapportera."}
            </p>
          </div>

          {/* Höger: så funkar det */}
          <div className="border-t bg-muted/30 p-4 sm:p-6 md:border-l md:border-t-0">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Så gör du
            </p>
            <ol className="space-y-3">
              {steps.map((s) => (
                <li key={s.n} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {s.n}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground">{s.title}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      {s.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
