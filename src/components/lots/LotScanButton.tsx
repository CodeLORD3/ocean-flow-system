import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BarcodeScanner from "@/components/barcode/BarcodeScanner";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Löser en skannad QR-länk eller ett partinummer till parti-id. */
export async function resolveLotCode(code: string): Promise<string | null> {
  const m = code.match(UUID);
  if (m) return m[0];
  const { data } = await supabase.from("lots").select("id").eq("lot_number", code.trim()).maybeSingle();
  return (data as any)?.id ?? null;
}

export default function LotScanButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const onScan = async (code: string) => {
    const id = await resolveLotCode(code);
    setOpen(false);
    if (id) navigate(`/lot/${id}`);
    else toast({ title: "Okänt parti", description: code, variant: "destructive" });
  };
  return (
    <>
      <Button size="icon" variant="ghost" className={className} aria-label="Skanna parti" onClick={() => setOpen(true)}>
        <QrCode className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Skanna parti</DialogTitle></DialogHeader>
          {open && <BarcodeScanner onScan={onScan} helpText="Rikta kameran mot QR-koden på lådan" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
