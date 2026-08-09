import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useChatUnread } from "@/hooks/useChat";
import { playChatPing } from "@/lib/notificationSound";

/**
 * Spelar upp en notisljud-ping när antalet olästa chattmeddelanden ökar.
 * Monteras en gång i AppLayout så att ljudet hörs oavsett vilken sida man är på.
 * Lyssnar även på realtime så notisen (och ljudet) kommer direkt.
 */
export function useChatSound() {
  const unread = useChatUnread();
  const qc = useQueryClient();
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("chat-sound-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["chat-unread"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  useEffect(() => {
    const total = unread.total;
    if (previous.current !== null && total > previous.current) {
      playChatPing();
    }
    previous.current = total;
  }, [unread.total]);
}
