import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

/** Mottagande egen butik för en kund, om kunden är en av våra butiker. */
export function useInternalStore(customerId?: string | null) {
  return useQuery({
    queryKey: ["internal_store_for_customer", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers_retail")
        .select("internal_store_id, stores:internal_store_id(id, name)")
        .eq("id", customerId!)
        .maybeSingle();
      return ((data as any)?.stores ?? null) as { id: string; name: string } | null;
    },
  });
}

/**
 * Kundbeställning från en egen butik: i stället för "Levererad" skickas de
 * packade varorna som lageröverföring. Mottagaren tar emot under Inleveranser.
 */
export function SendToStoreButton({ order }: { order: any }) {
  const { data: store } = useInternalStore(order.customer_id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  if (!store) return null;
  if (order.internal_transfer_id) {
    return (
      <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
        Skickad till {store.name}. Väntar på att butiken tar emot leveransen.
      </p>
    );
  }
  if (order.status !== "packad") return null;

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("send_customer_order_to_store" as any, {
      _order_id: order.id,
      _to_store_id: store.id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Skickad till ${store.name} (${(data as any)?.lines ?? 0} rader)`);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["customer_orders"] });
    qc.invalidateQueries({ queryKey: ["customer_order"] });
    qc.invalidateQueries({ queryKey: ["transfer_orders"] });
    qc.invalidateQueries({ queryKey: ["incoming_transfers"] });
  };

  return (
    <>
      <Button className="h-12" onClick={() => setOpen(true)}>
        <Truck className="mr-2 h-4 w-4" /> Skicka till {store.name}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skicka till {store.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              De packade varorna flyttas med sina partier till transportlagret. Lagret hamnar i{" "}
              {store.name} först när butiken tar emot leveransen. Ingen försäljning eller faktura skapas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Avbryt</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); send(); }}>
              {busy ? "Skickar…" : "Skicka"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
