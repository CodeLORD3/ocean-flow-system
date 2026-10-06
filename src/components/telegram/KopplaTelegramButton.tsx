import { useState } from "react";
import QRCode from "qrcode";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

/** Skapar en engångskod och visar länk + QR för att koppla en anställds Telegram. */
export default function KopplaTelegramButton({ employeeId, size = "sm" }: { employeeId: string | null | undefined; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!employeeId) return null;

  const create = async () => {
    setBusy(true);
    const { data, error } = await (supabase as any).rpc("telegram_create_link_code", { _employee_id: employeeId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const link = (data as any).url as string;
    setUrl(link);
    setQr(await QRCode.toDataURL(link, { margin: 1, width: 240 }));
    setOpen(true);
  };

  return (
    <>
      <Button type="button" size={size} variant="outline" className="gap-1" disabled={busy} onClick={create}>
        <Send className="h-4 w-4" /> Koppla Telegram
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Koppla Telegram</DialogTitle>
            <DialogDescription>Skanna QR-koden eller öppna länken i mobilen och tryck Starta. Koden gäller i 24 timmar och kan bara användas en gång.</DialogDescription>
          </DialogHeader>
          {qr && <img src={qr} alt="QR-kod för Telegram" className="mx-auto h-60 w-60" />}
          {url && <a href={url} target="_blank" rel="noreferrer" className="block break-all text-center text-sm underline">{url}</a>}
        </DialogContent>
      </Dialog>
    </>
  );
}
