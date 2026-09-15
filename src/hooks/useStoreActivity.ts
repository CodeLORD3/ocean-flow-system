import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreActivity = {
  /** Olästa meddelanden från butiken. */
  messages: number;
  /** Nya, ej hanterade butiksordrar. */
  orders: number;
  /** Öppna önskemål från butiken. */
  wishes: number;
};

const EMPTY: StoreActivity = { messages: 0, orders: 0, wishes: 0 };

/**
 * Notissiffror per butik i grossistens butikslista: nya meddelanden,
 * nya ordrar och öppna önskemål.
 */
export function useStoreActivity() {
  return useQuery({
    queryKey: ["store-activity-counts"],
    queryFn: async () => {
      const [messages, reads, orders, wishes] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("conversation_id, sender_portal_key, created_at")
          .like("sender_portal_key", "store:%")
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase.from("chat_reads").select("conversation_id, portal_key, last_read_at"),
        supabase.from("shop_orders").select("store_id, status"),
        supabase.from("shop_wishes").select("store_id, status, archived"),
      ]);
      if (messages.error) throw messages.error;
      if (reads.error) throw reads.error;
      if (orders.error) throw orders.error;
      if (wishes.error) throw wishes.error;

      const map = new Map<string, StoreActivity>();
      const ensure = (id: string) => {
        let e = map.get(id);
        if (!e) {
          e = { ...EMPTY };
          map.set(id, e);
        }
        return e;
      };

      /** Grossistens/adminens senaste läsning per konversation. */
      const readAt = new Map<string, string>();
      (reads.data || []).forEach((r: any) => {
        if (r.portal_key !== "grossist" && r.portal_key !== "admin") return;
        const prev = readAt.get(r.conversation_id);
        if (!prev || new Date(r.last_read_at) > new Date(prev)) {
          readAt.set(r.conversation_id, r.last_read_at);
        }
      });

      (messages.data || []).forEach((m: any) => {
        const storeId = String(m.sender_portal_key || "").slice("store:".length);
        if (!storeId) return;
        const read = readAt.get(m.conversation_id);
        if (read && new Date(m.created_at) <= new Date(read)) return;
        ensure(storeId).messages += 1;
      });

      (orders.data || []).forEach((o: any) => {
        if (!o.store_id) return;
        if (o.status !== "Ny") return;
        ensure(o.store_id).orders += 1;
      });

      (wishes.data || []).forEach((w: any) => {
        if (!w.store_id || w.archived) return;
        if (w.status && !["Inget", "Ny", "Öppen"].includes(w.status)) return;
        ensure(w.store_id).wishes += 1;
      });

      return map;
    },
    staleTime: 60_000,
  });
}
