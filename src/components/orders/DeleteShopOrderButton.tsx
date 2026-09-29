import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Order som ännu inte skickats har inte flyttat något lager och kan tas bort helt. */
export const DELETABLE_SHOP_ORDER_STATUSES = ["Öppen", "Ny", "Pågående", "Packad"];

export function DeleteShopOrderButton({ order, large = false }: { order: any; large?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!DELETABLE_SHOP_ORDER_STATUSES.includes(order.status)) return null;

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.from("shop_orders").delete().eq("id", order.id);
    setBusy(false);
    if (error) return toast.error(`Kunde inte ta bort ordern: ${error.message}`);
    await logActivity({
      action_type: "delete",
      description: `Butiksorder borttagen (${order.stores?.name ?? "butik"}, ${order.shop_order_lines?.length ?? 0} rader)`,
      entity_type: "shop_order",
      entity_id: order.id,
      store_id: order.store_id,
    });
    toast.success("Ordern togs bort");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
  };

  return (
    <>
      <Button
        variant="outline"
        size={large ? "default" : "sm"}
        aria-label="Ta bort order"
        className={large
          ? "h-14 w-full gap-2 text-[17px] border-destructive/40 text-destructive hover:bg-destructive/10"
          : "inline-flex h-5 w-5 min-w-5 shrink-0 aspect-square items-center justify-center gap-0 rounded p-0 leading-none border-destructive/40 text-destructive hover:bg-destructive/10 [&_svg]:size-3"}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      >
        <Trash2 className={large ? "h-5 w-5" : "h-3 w-3"} />
        {large && "Ta bort order"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort ordern?</AlertDialogTitle>
            <AlertDialogDescription>
              Ordern från {order.stores?.name ?? "butiken"} med {order.shop_order_lines?.length ?? 0} rader tas bort helt.
              Inget lager har flyttats eftersom ordern inte är skickad. Detta kan inte ångras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); remove(); }}
            >
              {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
