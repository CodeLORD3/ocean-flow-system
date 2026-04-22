import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Fish, Anchor, MapPin, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { scomberClient } from "../adapters/scomberClient";
import { CountryFlag, countryName } from "./CountryBadge";

interface TraceabilityModalProps {
  open: boolean;
  onClose: () => void;
  sku: string | null;
  storeId: string | null;
  productName: string;
}

export default function TraceabilityModal({
  open,
  onClose,
  sku,
  storeId,
  productName,
}: TraceabilityModalProps) {
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["traceability", sku, storeId],
    enabled: open && !!sku,
    staleTime: 5 * 60 * 1000,
    queryFn: () => scomberClient.traceability({ sku: sku!, store_id: storeId }),
  });

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast({ title: "Kopierat", description: text });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fish className="h-4 w-4 text-primary" />
            Spårbarhet · {productName}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {isError && (
          <div className="text-sm text-destructive">
            Kunde inte hämta spårbarhetsdata. Försök igen.
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-4 text-sm">
            {data.article ? (
              <div className="rounded-md border border-border p-3 bg-muted/40">
                <div className="font-medium">{data.article.name}</div>
                <div className="text-xs text-muted-foreground">
                  {data.article.category ?? "—"} · Moms {Number(data.article.vat_rate)}%
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Ingen artikeldata i Makrilltrade-cachen för SKU <code>{sku}</code>.
                Spårbarhet visas så snart batcher synkroniseras.
              </div>
            )}

            {data.batches.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Inga aktiva batcher tillgängliga.
              </div>
            ) : (
              <ul className="space-y-2">
                {data.batches.map((b) => {
                  const raw = (b.raw ?? {}) as Record<string, unknown>;
                  const country =
                    (raw.country_of_origin as string | undefined) ??
                    (raw.origin as string | undefined) ??
                    null;
                  const vessel = (raw.vessel as string | undefined) ?? null;
                  const fao = (raw.fao_zone as string | undefined) ?? null;
                  const msc = Boolean(raw.msc_certified ?? raw.msc);
                  const asc = Boolean(raw.asc_certified ?? raw.asl_certified);
                  const species = (raw.species as string | undefined) ?? null;

                  return (
                    <li
                      key={b.batch_id}
                      className="rounded-md border border-border p-3 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {country && <CountryFlag iso={country} />}
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {b.supplier_name ?? "Okänd leverantör"}
                            </div>
                            {species && (
                              <div className="text-xs italic text-muted-foreground">
                                {species}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {msc && <Badge variant="secondary" className="text-[10px]">MSC</Badge>}
                          {asc && <Badge variant="secondary" className="text-[10px]">ASC</Badge>}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {b.caught_at && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Fångad {b.caught_at}
                          </div>
                        )}
                        {vessel && (
                          <div className="flex items-center gap-1">
                            <Anchor className="h-3 w-3" /> {vessel}
                          </div>
                        )}
                        {fao && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {fao}
                          </div>
                        )}
                        {country && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] uppercase tracking-wide">Ursprung</span>
                            {countryName(country)}
                          </div>
                        )}
                        {b.best_before && (
                          <div className="col-span-2">BBD: {b.best_before}</div>
                        )}
                      </div>

                      <button
                        onClick={() => copy(b.batch_id)}
                        className="font-mono text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        title="Kopiera batch-ID"
                      >
                        <Copy className="h-2.5 w-2.5" /> {b.batch_id}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
