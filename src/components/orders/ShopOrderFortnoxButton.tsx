import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileUp, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { fortnoxDraftCreatedText, fortnoxJobStatusLabel } from "@/lib/fortnoxStatus";
import { FortnoxCancelDraftButton } from "./FortnoxCancelDraftButton";

/**
 * Skickar en butiksorder (Ålsten, Zollikon m.fl.) till Fortnox som fakturautkast.
 * Säljare är Grossist Göteborg (FSAB SE), kund är butikens Fortnox-kundnummer.
 */
export function ShopOrderFortnoxButton({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const job = useQuery({
    queryKey: ["fortnox_invoice_job", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fortnox_invoice_jobs")
        .select("status, fortnox_document_number, fortnox_url, last_error, fortnox_balance, fortnox_total, status_synced_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fortnox_invoice_job", orderId] });
    qc.invalidateQueries({ queryKey: ["fortnox_invoice_jobs"] });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
  };

  const send = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("fortnox-send-shop-invoice", {
      body: { order_id: orderId },
    });
    setSending(false);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    toast.success(
      data.already_sent
        ? `Redan skickad till Fortnox (faktura nr ${data.document_number})`
        : fortnoxDraftCreatedText(data.document_number),
    );
    refresh();
  };

  const syncStatus = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("fortnox-sync-invoice-status", {
      body: { order_id: orderId },
    });
    setSyncing(false);
    if (error) return toast.error(error.message);
    if (data?.error) return toast.error(data.error);
    const r = data?.results?.[0];
    if (r?.error) return toast.error(r.error);
    toast.success(`Status i Fortnox: ${fortnoxJobStatusLabel(r?.status)}`);
    refresh();
  };

  const sent =
    ["created", "bookkept", "sent", "paid", "cancelled"].includes(job.data?.status ?? "") &&
    job.data?.fortnox_document_number;

  if (sent) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="border-emerald-600/30 bg-emerald-600/15 text-emerald-400 text-[11px]">
          Fortnox {job.data!.fortnox_document_number}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{fortnoxJobStatusLabel(job.data?.status)}</span>
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" disabled={syncing} onClick={syncStatus}>
          {syncing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Uppdatera status
        </Button>
        <FortnoxCancelDraftButton
          orderId={orderId}
          documentNumber={job.data?.fortnox_document_number}
          status={job.data?.status}
        />
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
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={sending} onClick={send}>
        {sending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-1 h-3.5 w-3.5" />}
        Skicka till Fortnox
      </Button>
      {job.data?.status === "failed" && job.data?.last_error && (
        <span className="text-[11px] text-destructive">{job.data.last_error}</span>
      )}
    </div>
  );
}
