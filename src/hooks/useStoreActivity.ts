import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useChatConversations, useChatUnread, useCurrentPortal } from "@/hooks/useChat";
import { storePortalKey } from "@/lib/portalProfiles";

export type StoreActivity = {
  /** Olästa chattmeddelanden från butiken */
  messages: number;
  /** Nya (obehandlade) ordrar från butiken */
  orders: number;
  /** Öppna önskemål från butiken */
  wishes: number;
};

const EMPTY: StoreActivity = { messages: 0, orders: 0, wishes: 0 };

/**
 * Notissignaler per butik för grossist-/adminportalen:
 * nya meddelanden, nya ordrar och öppna önskemål.
 */
export function useStoreActivity() {
  const portal = useCurrentPortal();
  const { data: conversations = [] } = useChatConversations(portal?.key);
  const unread = useChatUnread();

  const { data: rows } = useQuery({
    queryKey: ["store-activity-counts"],
    queryFn: async () => {
      const [{ data: orders, error: oErr }, { data: wishes, error: wErr }] = await Promise.all([
        supabase.from("shop_orders").select("store_id").eq("status", "Ny"),
        supabase.from("shop_wishes").select("store_id, status, archived").neq("status", "Klar"),
      ]);
      if (oErr) throw oErr;
      if (wErr) throw wErr;

      const byStore: Record<string, { orders: number; wishes: number }> = {};
      const bump = (id: string | null, key: "orders" | "wishes") => {
        if (!id) return;
        byStore[id] = byStore[id] || { orders: 0, wishes: 0 };
        byStore[id][key] += 1;
      };
      (orders || []).forEach((o: any) => bump(o.store_id, "orders"));
      (wishes || []).filter((w: any) => !w.archived).forEach((w: any) => bump(w.store_id, "wishes"));
      return byStore;
    },
    enabled: !!portal && portal.kind !== "store",
    refetchInterval: 30000,
  });

  const messagesByStore: Record<string, number> = {};
  conversations.forEach((c) => {
    const count = unread.byConv[c.id] || 0;
    if (!count) return;
    c.participants
      .filter((p) => p.portal_key.startsWith("store:"))
      .forEach((p) => {
        const storeId = p.portal_key.slice("store:".length);
        messagesByStore[storeId] = (messagesByStore[storeId] || 0) + count;
      });
  });

  const get = (storeId: string): StoreActivity => ({
    messages: messagesByStore[storeId] || 0,
    orders: rows?.[storeId]?.orders || 0,
    wishes: rows?.[storeId]?.wishes || 0,
  });

  return { get, empty: EMPTY, portalKeyForStore: storePortalKey };
}
