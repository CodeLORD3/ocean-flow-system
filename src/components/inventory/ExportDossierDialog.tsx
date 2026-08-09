import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { documentTypeLabel } from "@/hooks/useLotDocuments";

interface Props {
  order: any;
  onOpenChange: (open: boolean) => void;
}

const nf = (v: any, dec = 3) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const dash = (v: any) => (v == null || v === "" ? "—" : String(v));

/**
 * Exportunderlag: allt som behövs för att fylla i fångstintyget för en
 * utleverans. Vyn skapar inga uppgifter, den samlar dem.
 */
export default function ExportDossierDialog({ order, onOpenChange }: Props) {
  const lines: any[] = order?.transfer_order_lines ?? [];
  const lotIds = lines.map((l) => l.lot_id).filter(Boolean);

  const { data: approvalNumber } = useQuery({
    queryKey: ["establishment_approval_number"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "establishment_approval_number")
        .maybeSingle();
      return ((data?.value as any)?.number as string) ?? null;
    },
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["export_dossier_docs", order?.id, lotIds.join(",")],
    enabled: lotIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lot_documents")
        .select("lot_id, document_type, document_number, issuer, valid_to")
        .in("lot_id", lotIds);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const docsFor = (lotId?: string | null) => docs.filter((d) => d.lot_id === lotId);

  return (
    <Dialog open onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto print:max-w-none">
        <DialogHeader>
          <DialogTitle className="text-base">Exportunderlag {order?.order_number}</DialogTitle>
          <DialogDescription className="text-xs">
            {order?.from_location?.name} → {order?.to_location?.name}
            {order?.export_country ? ` · ${order.export_country}` : ""} · Anläggningens godkännandenummer:{" "}
            {approvalNumber ?? "ej registrerat"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1 rounded-md border border-border bg-muted/40 p-2 text-xs sm:grid-cols-3">
          <p>Fångstintyg: <span className="font-mono">{dash(order?.catch_certificate_ref)}</span></p>
          <p>Validerat: <span className="font-mono">{dash(order?.catch_cert_validated)}</span></p>
          <p>Reexportintyg: <span className="font-mono">{dash(order?.reexport_cert)}</span></p>
          <p>Exportland: {dash(order?.export_country)}</p>
          <p>Plombnummer: <span className="font-mono">{dash(order?.seal_number)}</span></p>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Parti</th>
                <th className="p-2 text-left font-medium">Art / FAO / latin</th>
                <th className="p-2 text-left font-medium">Fångstområde</th>
                <th className="p-2 text-left font-medium">Fartyg</th>
                <th className="p-2 text-left font-medium">Fångstdatum</th>
                <th className="p-2 text-left font-medium">Redskap</th>
                <th className="p-2 text-right font-medium">Kg</th>
                <th className="p-2 text-left font-medium">KN-nr</th>
                <th className="p-2 text-left font-medium">Dokument</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => {
                const lot = l.lots ?? {};
                const qty = l.quantity_shipped ?? l.quantity_picked ?? l.quantity_ordered;
                return (
                  <tr key={l.id}>
                    <td className="p-2 font-mono">{dash(lot.lot_number)}</td>
                    <td className="p-2">
                      {dash(l.products?.name)}
                      <span className="block text-muted-foreground">
                        {dash(lot.species_fao_code)} · {dash(lot.latin_name)}
                      </span>
                    </td>
                    <td className="p-2">{dash(lot.catch_area)}</td>
                    <td className="p-2">
                      {dash(lot.vessel_name)}
                      {lot.vessel_reg ? <span className="block text-muted-foreground">{lot.vessel_reg}</span> : null}
                    </td>
                    <td className="p-2">
                      {dash(lot.catch_date_from)}
                      {lot.catch_date_to && lot.catch_date_to !== lot.catch_date_from ? `–${lot.catch_date_to}` : ""}
                    </td>
                    <td className="p-2">{dash(lot.fishing_gear)}</td>
                    <td className="p-2 text-right font-mono tabular-nums">{nf(qty)}</td>
                    <td className="p-2 font-mono">{dash(l.products?.hs_code)}</td>
                    <td className="p-2">
                      {docsFor(l.lot_id).length === 0 ? (
                        <span className="text-muted-foreground">saknas</span>
                      ) : (
                        docsFor(l.lot_id).map((d, i) => (
                          <span key={i} className="block">
                            {documentTypeLabel(d.document_type)} {d.document_number ?? ""}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="print:hidden">
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => window.print()}>
            <Printer className="h-3 w-3" /> Skriv ut
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
