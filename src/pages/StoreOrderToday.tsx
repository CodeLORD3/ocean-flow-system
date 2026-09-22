import { StaffName } from "@/components/staff/StaffNameAvatar";
import { useEffect, useMemo, useState } from "react";
import { PackageCheck, Send, ShoppingBasket, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSite } from "@/contexts/SiteContext";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStoreOrderSettings } from "@/hooks/useStoreOrderSettings";
import {
  useAutoSend,
  useDraftOrder,
  useReceiveOrder,
  useRemoveOrderLine,
  useSendOrder,
  useStoreOrders,
  useUpdateOrderLine,
} from "@/hooks/useStoreReplenishment";
import { STATUS_LABEL, SUPPLIER_LABEL } from "@/lib/storeReplenishment";
import { useNextDeliveryDay } from "@/hooks/useNextDeliveryDay";
import { fmtQty } from "@/lib/mobileCount";
import { KvitteraInget } from "@/components/dagsavslut/KvitteraInget";

const MANAGER_ROLES = [
  "store_manager",
  "multi_store_manager",
  "company_admin",
  "region_admin",
  "group_admin",
  "platform_admin",
];

/**
 * Dagens beställning i butiken: utkastet med alla rader, vem som lagt dem och
 * knappen som skickar den. Här flyttas inget lager — det sker vid avsändning
 * och mottagning.
 */
export default function StoreOrderToday() {
  const { activeStoreId: selectedStoreId } = useSite();
  const { activeUser } = useActiveUser();
  const { staff } = useStaffAuth();
  const delivery = useNextDeliveryDay(selectedStoreId);
  const wantedDate = delivery.date;
  const draft = useDraftOrder(selectedStoreId, wantedDate);
  const orders = useStoreOrders(selectedStoreId);
  const settings = useStoreOrderSettings(selectedStoreId);
  const updateLine = useUpdateOrderLine();
  const removeLine = useRemoveOrderLine();
  const send = useSendOrder();
  const autoSend = useAutoSend();
  const receive = useReceiveOrder();

  const [receiveOrderId, setReceiveOrderId] = useState<string | null>(null);
  const [received, setReceived] = useState<Record<string, string>>({});

  // Automatskicket körs när vyn öppnas — tomma utkast rörs aldrig.
  useEffect(() => {
    autoSend.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const role = (staff as any)?.primary_role as string | null;
  const onlyManager = (settings.data as any)?.replenish_send_role === "butikschef";
  const maySend = !onlyManager || (role ? MANAGER_ROLES.includes(role) : false);

  const lines = draft.data?.store_replenishment_lines ?? [];
  const openReceive = orders.data?.filter((o) => o.status === "avsand" || o.status === "delvis_mottagen") ?? [];
  const receiveTarget = openReceive.find((o) => o.id === receiveOrderId) ?? null;

  const doSend = async () => {
    if (!draft.data) return;
    try {
      await send.mutateAsync(draft.data.id);
      toast.success("Beställningen är skickad");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte skicka beställningen.");
    }
  };

  const doReceive = async () => {
    if (!receiveTarget) return;
    try {
      const rows = (receiveTarget.store_replenishment_lines ?? [])
        .filter((l) => l.line_status !== "avvisad")
        .map((l) => ({
          id: l.id,
          quantity: Number(
            (received[l.id] ?? String(l.quantity_shipped ?? 0)).replace(",", "."),
          ),
        }))
        .filter((r) => r.quantity > 0);
      const res = await receive.mutateAsync({ orderId: receiveTarget.id, lines: rows });
      setReceiveOrderId(null);
      setReceived({});
      toast.success(res.outstanding ? "Delvis mottagen — lagret uppdaterat" : "Leveransen är mottagen");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte ta emot leveransen.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-4">
      <header>
        <h1 className="font-heading text-[26px] font-semibold leading-tight">Dagens beställning</h1>
        <p className="text-[18px] text-muted-foreground">
          Leverans {delivery.label} ({wantedDate}) från {SUPPLIER_LABEL.grossist}
        </p>
        <p className="text-[16px] text-muted-foreground">
          Butiken beställer minst {delivery.leadDays} {delivery.leadDays === 1 ? "dag" : "dagar"} i
          förväg.
          {delivery.lastChanceThisWeek
            ? " Det här är veckans sista beställning — nästa leverans är i nästa vecka."
            : ""}
        </p>
      </header>

      {lines.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-5">
          <ShoppingBasket className="h-9 w-9 text-muted-foreground/60" />
          <p className="mt-2 text-[18px] text-muted-foreground">
            Inget beställt ännu. Lägg varor på beställningen medan du räknar.
          </p>
          <div className="mt-3">
            <KvitteraInget storeId={selectedStoreId} vad="grossist" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <div
              key={l.id}
              className="flex min-h-[72px] items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[19px] font-semibold leading-tight">
                  {l.products?.name ?? "Vara"}
                </p>
                <p className="flex flex-wrap items-center gap-1 text-[17px] text-muted-foreground">
                  {l.created_by_name ? (
                    <>
                      Lagd av <StaffName name={l.created_by_name} faceClassName="h-7 w-7 text-[11px]" />
                    </>
                  ) : (
                    "Lagd i butiken"
                  )}
                  {l.comment ? ` · ${l.comment}` : ""}
                </p>
              </div>
              <Input
                defaultValue={String(l.quantity_ordered).replace(".", ",")}
                onBlur={(e) => {
                  const v = Number(e.target.value.replace(",", "."));
                  if (v > 0) updateLine.mutate({ lineId: l.id, quantity: v, comment: l.comment });
                }}
                className="h-14 w-24 min-h-[56px] text-center text-[19px] tabular-nums"
              />
              <span className="w-8 shrink-0 text-[17px] text-muted-foreground">{l.unit}</span>
              <button
                type="button"
                aria-label="Ta bort raden"
                onClick={() => removeLine.mutate(l.id)}
                className="flex h-14 w-14 min-h-[56px] shrink-0 items-center justify-center rounded-xl border border-border"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          ))}

          <button
            type="button"
            disabled={!maySend || send.isPending}
            onClick={doSend}
            className="flex h-16 min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-6 w-6" /> Skicka beställningen
          </button>
          {!maySend && (
            <p className="text-[17px] text-muted-foreground">
              Butikschefen skickar beställningen i den här butiken.
            </p>
          )}
          <p className="text-[17px] text-muted-foreground">
            Skickas automatiskt kl{" "}
            {String((settings.data as any)?.replenish_auto_send_time ?? "15:00").slice(0, 5)} om något
            ligger kvar.
          </p>
        </div>
      )}

      {openReceive.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-[22px] font-semibold">På väg till butiken</h2>
          {openReceive.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setReceiveOrderId(o.id)}
              className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 text-left"
            >
              <Truck className="h-7 w-7 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[19px] font-semibold">{o.order_number}</span>
                <span className="block text-[17px] text-muted-foreground">
                  {STATUS_LABEL[o.status]} · leverans {o.wanted_date}
                </span>
              </span>
              <PackageCheck className="h-6 w-6 shrink-0" />
            </button>
          ))}
        </section>
      )}

      {orders.data && orders.data.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-[22px] font-semibold">Tidigare beställningar</h2>
          {orders.data.slice(0, 10).map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="text-[18px] font-semibold">{o.order_number}</p>
              <p className="text-[17px] text-muted-foreground">
                {STATUS_LABEL[o.status]} · {o.wanted_date} ·{" "}
                {o.store_replenishment_lines?.length ?? 0} varor
                {o.auto_sent ? " · skickad automatiskt" : ""}
              </p>
            </div>
          ))}
        </section>
      )}

      <Dialog open={!!receiveTarget} onOpenChange={(v) => !v && setReceiveOrderId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[22px]">Ta emot leveransen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[17px] text-muted-foreground">
              Väg varorna och ändra siffran om den skiljer sig från det som skickades.
            </p>
            {(receiveTarget?.store_replenishment_lines ?? [])
              .filter((l) => l.line_status !== "avvisad")
              .map((l) => (
                <div key={l.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[18px]">
                    {l.products?.name ?? "Vara"}
                    <span className="block text-[16px] text-muted-foreground">
                      Skickat {fmtQty(Number(l.quantity_shipped ?? 0), l.unit)}
                    </span>
                  </span>
                  <Input
                    value={received[l.id] ?? String(l.quantity_shipped ?? 0).replace(".", ",")}
                    onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })}
                    className="h-14 w-24 min-h-[56px] text-center text-[19px] tabular-nums"
                  />
                </div>
              ))}
            <button
              type="button"
              onClick={doReceive}
              disabled={receive.isPending}
              className="flex h-16 min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              <PackageCheck className="h-6 w-6" /> Ta emot och uppdatera lagret
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
