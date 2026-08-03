import { motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useCurrentPortal } from "@/hooks/useChat";

export default function Chat() {
  const portal = useCurrentPortal();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2 sm:space-y-4 max-w-full overflow-x-hidden"
    >
      <div className="hidden sm:block">
        <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" /> Chatt
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Alla aktuella chattar för {portal?.name || "portalen"} — skapa chattar med andra portaler.
        </p>
      </div>
      <ChatPanel />
    </motion.div>
  );
}
