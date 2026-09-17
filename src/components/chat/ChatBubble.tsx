import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useChatUnread } from "@/hooks/useChat";

/**
 * Flytande chattknapp nere till höger (som chattbubblan på Facebook).
 * Chatten tar ingen plats på sidan — den öppnas i ett fönster ovanpå innehållet.
 */
export function ChatBubble() {
  const [open, setOpen] = useState(false);
  const unread = useChatUnread();
  const count = unread.total ?? 0;

  return (
    <>
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl",
            "inset-x-2 bottom-20 top-16 sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-20 sm:h-[560px] sm:w-[380px]"
          )}
          role="dialog"
          aria-label="Chatt"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="h-4 w-4 text-primary" /> Chatt
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Stäng chatten"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatPanel className="h-full border-0 shadow-none" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Stäng chatten" : "Öppna chatten"}
        className={cn(
          "fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-lg transition hover:brightness-110 sm:bottom-8"
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
        {!open && count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </>
  );
}
