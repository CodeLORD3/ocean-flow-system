import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, Check, X, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStores } from "@/hooks/useStores";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type OrderTransfer = {
  id: string;
  order_id: string;
  from_store_id: string;
  to_store_id: string;
  status: string;
  message: string | null;
  requested_by_name: string | null;
  requested_at: string;
  customer_orders?: {
    order_number: string | null;
    customer_name_snapshot: string | null;
    wanted_date: string | null;
    wanted_time: string | null;
    customer_order_lines?: { id: string }[];
  } | null;
};

const errMsg = (e: unknown) => (e as { message?: string })?.message || "Något gick fel.";

export function usePendingTransfers() {
  return useQuery({
    queryKey: ["customer_order_transfers", "pending"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_order_transfers")
        .select("*, customer_orders(order_number, customer_name_snapshot, wanted_date, wanted_time, customer_order_lines(id))")
        .eq("status", "vantar")
        .order("requested_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrderTransfer[];
    },
    refetchInterval: 60_000,
  });
}

function useTransferActions() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["customer_order_transfers"] });
    qc.invalidateQueries({ queryKey: ["customer_orders"] });
    qc.invalidateQueries({ queryKey: ["customer_order_events"] });
  };
  const request = useMutation({
    mutationFn: async (p: { orderId: string; toStoreId: string; message: string }) => {
      const { error } = await (supabase as any).rpc("request_customer_order_transfer", {
        _order_id: p.orderId, _to_store_id: p.toStoreId, _message: p.message,
      });
      if (error) throw error;
    },
    onSuccess: () => { done(); toast.success("Förfrågan skickad. Beställningen flyttas när butiken godkänner."); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const decide = useMutation({
    mutationFn: async (p: { id: string; approve: boolean; reason?: string }) => {
      const { error } = await (supabase as any).rpc("decide_customer_order_transfer", {
        _transfer_id: p.id, _approve: p.approve, _reason: p.reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, p) => { done(); toast.success(p.approve ? "Beställningen ligger nu i er lista." : "Flytten avböjd."); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("cancel_customer_order_transfer", { _transfer_id: id });
      if (error) throw error;
    },
    onSuccess: () => { done(); toast.success("Förfrågan återtagen."); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return { request, decide, cancel };
}

/** Sektion överst i Kundbeställningar: förfrågningar som andra butiker skickat till oss. */
export function IncomingTransfers({ storeId }: { storeId: string | null }) {
  const { data = [] } = usePendingTransfers();
  const { data: stores = [] } = useStores();
  const { decide } = useTransferActions();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const name = (id: string) => stores.find((s) => s.id === id)?.name ?? "Butik";
  const incoming = data.filter((t) => (storeId ? t.to_store_id === storeId : true));
  if (incoming.length === 0) return null;

  return (
    <div className="space-y-2 rounded-sm border border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ArrowRightLeft className="h-4 w-4" /> Förfrågningar från andra butiker ({incoming.length})
      </div>
      {incoming.map((t) => {
        const o = t.customer_orders;
        return (
          <div key={t.id} className="space-y-2 rounded-sm border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <span className="font-mono tabular-nums">{o?.order_number}</span>{" "}
                <span className="font-medium">{o?.customer_name_snapshot || "Kund"}</span>
              </div>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {o?.wanted_date} {o?.wanted_time?.slice(0, 5) ?? ""} · {o?.customer_order_lines?.length ?? 0} varor
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Från {name(t.from_store_id)}
              {!storeId && ` till ${name(t.to_store_id)}`} · {t.requested_by_name} ·{" "}
              {new Date(t.requested_at).toLocaleString("sv-SE")}
            </div>
            {t.message && <p className="rounded-sm bg-muted p-2">{t.message}</p>}
            {rejecting === t.id ? (
              <div className="space-y-2">
                <Textarea placeholder="Varför avböjer ni?" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="outline" className="h-11" onClick={() => setRejecting(null)}>Tillbaka</Button>
                  <Button variant="destructive" className="h-11" disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: t.id, approve: false, reason }, { onSuccess: () => { setRejecting(null); setReason(""); } })}>
                    Avböj flytten
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button className="h-11" disabled={decide.isPending} onClick={() => decide.mutate({ id: t.id, approve: true })}>
                  <Check className="mr-2 h-4 w-4" /> Godkänn
                </Button>
                <Button variant="outline" className="h-11" onClick={() => { setRejecting(t.id); setReason(""); }}>
                  <X className="mr-2 h-4 w-4" /> Avböj
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Ruta i orderkortet: begär flytt eller visa att flytten väntar. */
export function TransferOrderBox({
  orderId, storeId, locked,
}: { orderId: string; storeId: string; locked: boolean }) {
  const { data = [] } = usePendingTransfers();
  const { data: stores = [] } = useStores();
  const { request, cancel } = useTransferActions();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const pending = data.find((t) => t.order_id === orderId);
  const from = stores.find((s) => s.id === storeId);
  const targets = stores.filter(
    (s) => s.id !== storeId && s.active !== false && (s.legal_entity_id ?? "") === (from?.legal_entity_id ?? ""),
  );

  if (pending) {
    const target = stores.find((s) => s.id === pending.to_store_id)?.name ?? "annan butik";
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-amber-400 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
        <span className="flex items-center gap-2 font-medium">
          <ArrowRightLeft className="h-4 w-4" /> Väntar på {target}. Kan inte packas under tiden.
        </span>
        {pending.from_store_id === storeId && (
          <Button variant="outline" className="h-10" disabled={cancel.isPending} onClick={() => cancel.mutate(pending.id)}>
            <Undo2 className="mr-2 h-4 w-4" /> Ångra
          </Button>
        )}
      </div>
    );
  }
  if (locked) return null;
  if (!open)
    return (
      <Button variant="outline" className="h-12 w-full sm:w-auto" onClick={() => setOpen(true)}>
        <ArrowRightLeft className="mr-2 h-4 w-4" /> Flytta till annan butik
      </Button>
    );
  return (
    <div className="space-y-2 rounded-sm border border-border p-3">
      <Label>Flytta till butik</Label>
      <Select value={to} onValueChange={setTo}>
        <SelectTrigger className="h-12"><SelectValue placeholder="Välj butik" /></SelectTrigger>
        <SelectContent>
          {targets.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Label>Meddelande till butiken</Label>
      <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="T.ex. kunden hämtar hos er i stället" />
      <p className="text-xs text-muted-foreground">Beställningen flyttas först när butiken godkänner.</p>
      <div className="flex gap-2">
        <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>Avbryt</Button>
        <Button className="h-11" disabled={!to || request.isPending}
          onClick={() => request.mutate({ orderId, toStoreId: to, message: msg }, { onSuccess: () => { setOpen(false); setMsg(""); setTo(""); } })}>
          Skicka förfrågan
        </Button>
      </div>
    </div>
  );
}
