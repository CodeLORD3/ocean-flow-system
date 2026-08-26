import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileUp, Loader2, ExternalLink } from "lucide-react";

/** Skickar en kundorder till Fortnox som faktura. Idempotent per ordernummer. */
export function FortnoxInvoiceButton({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);

  const job = useQuery({
    queryKey: ["fortnox_invoice_job", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fortnox_invoice_jobs")
        .select("status, fortnox_document_number, fortnox_url, last_error, stock_booked_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const send = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("fortnox-send-invoice", { body: { order_id: orderId } });
    setSending(false);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    toast.success(
      data.already_sent
        ? `Redan fakturerad i Fortnox (${data.document_number})`
        : `Faktura ${data.document_number} skapad i Fortnox`,
    );
    if (data?.stock_error) toast.warning(`Lagerbokning: ${data.stock_error}`);
    qc.invalidateQueries({ queryKey: ["fortnox_invoice_job", orderId] });
    qc.invalidateQueries({ queryKey: ["fortnox_invoice_jobs"] });
  };

  const sent =
    ["created", "bookkept", "sent"].includes(job.data?.status ?? "") && job.data?.fortnox_document_number;


  if (sent) {
    return (
      <div className="flex items-center gap-1.5">
        <Badge className="border-emerald-600/30 bg-emerald-600/15 text-emerald-400 text-[11px]">
          Fortnox {job.data!.fortnox_document_number}
        </Badge>
        {job.data?.fortnox_url && (
          <a
            href={job.data.fortnox_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-primary underline"
          >
            Öppna <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={sending} onClick={send}>
      {sending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-1 h-3.5 w-3.5" />}
      Skicka till Fortnox
    </Button>
  );
}
