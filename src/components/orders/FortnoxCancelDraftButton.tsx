import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";

/** Annullerar ett Fortnox-utkast och återför lageruttaget. Visas bara för status "created". */
export function FortnoxCancelDraftButton({
  orderId,
  documentNumber,
  status,
  size = "sm",
  className,
}: {
  orderId: string;
  documentNumber?: string | null;
  status?: string | null;
  size?: "sm" | "default";
  className?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status !== "created" || !documentNumber) return null;

  const cancel = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("fortnox-cancel-invoice", {
      body: { order_id: orderId },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    toast.success(
      data?.already
        ? `Faktura ${documentNumber} var redan annullerad`
        : `Faktura ${documentNumber} annullerad i Fortnox – lager återfört`,
    );
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["fortnox_invoice_job", orderId] });
    qc.invalidateQueries({ queryKey: ["fortnox_invoice_jobs"] });
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        className={className ?? "h-7 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"}
        onClick={() => setOpen(true)}
      >
        <Ban className="mr-1 h-3 w-3" />
        Annullera utkast
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullera faktura {documentNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Utkastet annulleras i Fortnox och lageruttaget återförs i Makrilltrade. Ordern kan sedan
              faktureras om. Bokförda fakturor kan inte annulleras – då krävs kreditfaktura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                cancel();
              }}
            >
              {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Annullera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
