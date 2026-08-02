import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Plus, Send, ImagePlus, Loader2, Store, Factory, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PortalProfile } from "@/lib/portalProfiles";
import {
  ChatConversation,
  conversationTitle,
  useChatConversations,
  useChatMessages,
  useCreateConversation,
  useCurrentPortal,
  usePortalProfiles,
  useSendChatMessage,
} from "@/hooks/useChat";

function portalIcon(kind: PortalProfile["kind"]) {
  return kind === "admin" ? Shield : kind === "grossist" ? Factory : Store;
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("sv-SE", { day: "2-digit", month: "2-digit" }) +
        " " +
        d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

type Props = {
  /** Kompakt variant för översiktssidan */
  compact?: boolean;
  className?: string;
  onOpenFull?: () => void;
};

export function ChatPanel({ compact = false, className, onOpenFull }: Props) {
  const { toast } = useToast();
  const portal = useCurrentPortal();
  const profiles = usePortalProfiles();
  const { data: conversations = [], isLoading } = useChatConversations(portal?.key);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const createConv = useCreateConversation();
  const send = useSendChatMessage();

  const activeConv: ChatConversation | undefined =
    conversations.find((c) => c.id === activeId) ?? conversations[0];
  const { data: messages = [] } = useChatMessages(activeConv?.id);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, activeConv?.id]);

  const otherProfiles = useMemo(
    () => profiles.filter((p) => p.key !== portal?.key),
    [profiles, portal?.key]
  );

  const handleCreate = async () => {
    if (!portal) return;
    const chosen = otherProfiles.filter((p) => selectedKeys.includes(p.key));
    if (chosen.length === 0) {
      toast({ title: "Välj minst en portal", variant: "destructive" });
      return;
    }
    try {
      const id = await createConv.mutateAsync({ participants: [portal, ...chosen] });
      setActiveId(id);
      setSelectedKeys([]);
      setNewOpen(false);
    } catch (e: any) {
      toast({ title: "Kunde inte skapa chatt", description: e.message, variant: "destructive" });
    }
  };

  const handleSend = async (file?: File | null) => {
    if (!activeConv) return;
    if (!text.trim() && !file) return;
    try {
      await send.mutateAsync({ conversationId: activeConv.id, body: text, file });
      setText("");
    } catch (e: any) {
      toast({ title: "Kunde inte skicka", description: e.message, variant: "destructive" });
    }
  };

  if (!portal) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardContent className="p-6 text-xs text-muted-foreground text-center">
          Välj en portal för att använda chatten.
        </CardContent>
      </Card>
    );
  }

  const listHeight = compact ? "max-h-24" : "h-[520px]";
  const msgHeight = compact ? "h-56" : "h-[440px]";

  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-heading flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-primary" />
            {activeConv ? `Chatt – ${conversationTitle(activeConv, portal.key)}` : "Chatt"}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setNewOpen(true)}>
              <Plus className="h-3 w-3" /> Ny chatt
            </Button>
            {compact && onOpenFull && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onOpenFull}>
                Visa alla meddelanden
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className={cn("grid gap-3", compact ? "grid-cols-1" : "md:grid-cols-[240px_1fr]")}>
        {/* Conversation list */}
        <div className={cn("space-y-1 overflow-y-auto pr-1", listHeight)}>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-3">
              Inga chattar ännu. Skapa en chatt med en annan portal.
            </p>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeConv?.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "w-full text-left rounded-md px-2 py-1.5 transition-colors",
                    isActive ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/60 border border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {conversationTitle(c, portal.key)}
                    </span>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      {timeLabel(c.last_message_at)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {c.lastMessage?.body || (c.lastMessage?.image_url ? "Bild" : "Inga meddelanden")}
                  </p>
                </button>
              );
            })
          )}
        </div>

        {/* Messages */}
        <div className="flex flex-col min-w-0">
          <div ref={scrollRef} className={cn("overflow-y-auto space-y-2 pr-1", msgHeight)}>
            {!activeConv ? (
              <p className="text-[11px] text-muted-foreground text-center py-8">Ingen chatt vald.</p>
            ) : messages.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-8">Inga meddelanden ännu.</p>
            ) : (
              messages.map((m) => {
                const mine = m.sender_portal_key === portal.key;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs",
                        mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      )}
                    >
                      <p className={cn("text-[9px] mb-0.5", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {m.sender_name ? `${m.sender_name} (${m.sender_portal_name})` : m.sender_portal_name}
                      </p>
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      {m.image_url && (
                        <a href={m.image_url} target="_blank" rel="noreferrer">
                          <img
                            src={m.image_url}
                            alt="Bifogad bild i chatt"
                            loading="lazy"
                            className="mt-1 max-h-40 rounded-md object-cover"
                          />
                        </a>
                      )}
                      <p className={cn("text-[9px] mt-0.5 text-right", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {timeLabel(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Composer */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-border/50 mt-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={activeConv ? "Skriv meddelande..." : "Skapa eller välj en chatt först"}
              disabled={!activeConv || send.isPending}
              className="h-8 text-xs"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleSend(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={!activeConv || send.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8"
              disabled={!activeConv || send.isPending}
              onClick={() => handleSend()}
            >
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* New conversation dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Ny chatt</DialogTitle>
            <DialogDescription className="text-xs">
              Välj vilka portaler chatten ska omfatta. Du deltar som <Badge variant="outline" className="text-[10px]">{portal.name}</Badge>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {otherProfiles.map((p) => {
              const Icon = portalIcon(p.kind);
              const checked = selectedKeys.includes(p.key);
              return (
                <label
                  key={p.key}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      setSelectedKeys((prev) => (v ? [...prev, p.key] : prev.filter((k) => k !== p.key)))
                    }
                  />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground">{p.name}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewOpen(false)}>Avbryt</Button>
            <Button size="sm" onClick={handleCreate} disabled={createConv.isPending}>
              {createConv.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Skapa chatt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
