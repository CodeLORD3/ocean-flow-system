import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, ImagePlus, Loader2, Store, Factory, Shield, ArrowLeft, Megaphone, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { GROSSIST_PROFILE, type PortalProfile } from "@/lib/portalProfiles";
import {
  ChatConversation,
  conversationTitle,
  useChatConversations,
  useChatMessages,
  useCreateConversation,
  useCurrentPortal,
  useAllowedChatTargets,
  useSendChatMessage,
  useBroadcastImportant,
  useChatUnread,
  useMarkConversationRead,
} from "@/hooks/useChat";

function portalIcon(kind: PortalProfile["kind"]) {
  return kind === "admin" ? Shield : kind === "grossist" ? Factory : Store;
}

function initialsOf(name: string) {
  return name
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
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

/** Klockslag i meddelandebubblan (datum visas i stället som avgränsare) */
function clockLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

/** WhatsApp-liknande datumavgränsare med veckodag */
function dayDividerLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekday = d.toLocaleDateString("sv-SE", { weekday: "long" });
  const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  if (d.toDateString() === today.toDateString()) return `Idag · ${cap}`;
  if (d.toDateString() === yesterday.toDateString()) return `Igår · ${cap}`;
  return `${cap} ${d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" })}`;
}

type Props = {
  /** Kompakt variant för översiktssidan */
  compact?: boolean;
  className?: string;
  onOpenFull?: () => void;
};

export function ChatPanel({ compact = false, className, onOpenFull }: Props) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const portal = useCurrentPortal();
  const otherProfiles = useAllowedChatTargets();
  const { data: conversations = [], isLoading } = useChatConversations(portal?.key);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastKeys, setBroadcastKeys] = useState<string[]>([]);
  const [text, setText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const createConv = useCreateConversation();
  const broadcast = useBroadcastImportant();
  const send = useSendChatMessage();
  const unread = useChatUnread();
  const markRead = useMarkConversationRead();

  // Butiker chattar bara med Grossist – ingen lista, chatten är alltid öppen
  const isStore = portal?.kind === "store";
  const activeConv: ChatConversation | undefined =
    conversations.find((c) => c.id === activeId) ??
    (isStore || !isMobile ? conversations[0] : undefined);

  // Se till att det finns en färdig 1:1-chatt med varje tillåten motpart
  const ensuring = useRef(false);
  const ensuredKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!portal || isLoading || ensuring.current) return;
    const targets = isStore ? [GROSSIST_PROFILE] : otherProfiles;
    if (targets.length === 0) return;

    const existing = new Set(
      conversations
        .filter((c) => c.participants.length === 2)
        .flatMap((c) => c.participants.map((p) => p.portal_key))
    );
    const missing = targets.filter(
      (t) => !existing.has(t.key) && !ensuredKeys.current.has(t.key)
    );
    if (missing.length === 0) return;

    ensuring.current = true;
    (async () => {
      for (const target of missing) {
        ensuredKeys.current.add(target.key);
        try {
          const id = await createConv.mutateAsync({ participants: [portal, target] });
          if (isStore) setActiveId(id);
        } catch {
          ensuredKeys.current.delete(target.key);
        }
      }
    })().finally(() => {
      ensuring.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStore, portal?.key, isLoading, conversations.length, otherProfiles.length]);

  const { data: messages = [] } = useChatMessages(activeConv?.id);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, activeConv?.id]);

  // Markera den öppna chatten som läst när nya meddelanden visas
  const convId = activeConv?.id;
  useEffect(() => {
    if (convId) markRead.mutate(convId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, messages.length]);

  const storeTargets = useMemo(() => otherProfiles.filter((p) => p.kind === "store"), [otherProfiles]);
  const isAdmin = portal?.kind === "admin";

  const handleBroadcast = async () => {
    if (!broadcastText.trim()) {
      toast({ title: "Skriv ett meddelande", variant: "destructive" });
      return;
    }
    try {
      const count = await broadcast.mutateAsync({ body: broadcastText, storeKeys: broadcastKeys });
      toast({ title: "Specialmeddelande skickat", description: `Skickat till ${count} butik(er).` });
      setBroadcastText("");
      setBroadcastKeys([]);
      setBroadcastOpen(false);
    } catch (e: any) {
      toast({ title: "Kunde inte skicka", description: e.message, variant: "destructive" });
    }
  };




  const handleSend = async (file?: File | null) => {
    if (!activeConv) return;
    const body = text;
    if (!body.trim() && !file) return;
    // Töm fältet direkt så det känns snabbt och tangentbordet stannar kvar
    setText("");
    if (textRef.current) {
      textRef.current.style.height = "auto";
      textRef.current.focus();
    }
    try {
      await send.mutateAsync({ conversationId: activeConv.id, body, file });
    } catch (e: any) {
      setText(body);
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

  // På mobil visas antingen listan eller tråden (WhatsApp-mönster) — aldrig sidledes scroll.
  const showList = !isStore && (!isMobile || !mobileThread);
  const showThread = isStore || !isMobile || mobileThread;

  const listHeight = compact
    ? "h-80"
    : isMobile
      ? "h-[calc(100dvh-15rem)] min-h-[18rem]"
      : "h-[calc(100dvh-10rem)] min-h-[600px]";

  const msgHeight = compact
    ? "h-80"
    : isMobile
      ? "h-[calc(100dvh-18rem)] min-h-[18rem]"
      : "h-[calc(100dvh-13rem)] min-h-[560px]";



  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader className="pb-2 px-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-heading flex items-center gap-1.5 min-w-0">
            {isMobile && mobileThread && !isStore ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -ml-1 shrink-0"
                aria-label="Tillbaka till chattlistan"
                onClick={() => {
                  setMobileThread(false);
                  setActiveId(null);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <MessageSquare className="h-4 w-4 text-primary shrink-0" />
            )}
            <span className="truncate">
              {isStore
                ? "Chatt med Grossist"
                : activeConv && showThread
                  ? conversationTitle(activeConv, portal.key)
                  : "Chatt"}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1 shrink-0">
            {showList && isAdmin && storeTargets.length > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-[11px] gap-1"
                onClick={() => setBroadcastOpen(true)}
              >
                <Megaphone className="h-3 w-3" /> Viktigt
              </Button>
            )}
            {compact && onOpenFull && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onOpenFull}>
                Visa alla
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent
        className={cn(
          "grid gap-3 px-2 sm:px-6",
          isStore
            ? "grid-cols-1"
            : compact
              ? "grid-cols-1 md:grid-cols-[190px_1fr]"
              : "md:grid-cols-[240px_1fr] lg:grid-cols-[264px_1fr]"
        )}
      >

        {/* Conversation list */}
        {showList && (
          <div className={cn("space-y-1 overflow-y-auto overflow-x-hidden pr-1", listHeight)}>
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-[11px] text-muted-foreground py-3">
                Förbereder chattar…
              </p>
            ) : (
              conversations.map((c) => {
                const isActive = c.id === activeConv?.id;
                const title = conversationTitle(c, portal.key);
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveId(c.id);
                      setMobileThread(true);
                    }}
                    className={cn(
                      "w-full text-left rounded-md px-2 transition-colors flex items-center gap-2",
                      compact ? "py-1.5" : "py-2",
                      isActive && !isMobile
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/60 border border-transparent"
                    )}
                  >
                    <span className={cn(
                      "shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold",
                      compact ? "h-6 w-6" : "h-8 w-8"
                    )}>
                      {initialsOf(title)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">{title}</span>
                        {(unread.byConv[c.id] || 0) > 0 && !isActive && (
                          <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[9px] rounded-full shrink-0">
                            {unread.byConv[c.id]}
                          </Badge>
                        )}
                      </span>
                      {!compact && (
                        <span className="flex items-center gap-2">
                          <span className="block text-[10px] text-muted-foreground truncate flex-1 min-w-0">
                            {c.lastMessage?.body || (c.lastMessage?.image_url ? "Bild" : "Inga meddelanden")}
                          </span>
                          <span className="text-[9px] text-muted-foreground shrink-0 font-mono tabular-nums">
                            {timeLabel(c.last_message_at)}
                          </span>
                        </span>
                      )}
                    </span>


                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Messages */}
        {showThread && (
          <div className="flex flex-col min-w-0">
            <div
              ref={scrollRef}
              className={cn("overflow-y-auto overflow-x-hidden space-y-1.5 pr-1", msgHeight)}
            >
              {!activeConv ? (
                <p className="text-[11px] text-muted-foreground text-center py-8">
                  {isStore ? "Öppnar chatten med Grossist…" : "Ingen chatt vald."}
                </p>
              ) : messages.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-8">
                  {isStore ? "Skriv ett meddelande till Grossist för att börja." : "Inga meddelanden ännu."}
                </p>
              ) : (
                messages.map((m, i) => {
                  const mine = m.sender_portal_key === portal.key;
                  const prev = i > 0 ? messages[i - 1] : null;
                  const showDay =
                    !prev ||
                    new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
                  // WhatsApp-stil: rubrik på första meddelandet i en följd – och alltid först på en ny dag
                  const showHeader =
                    !prev ||
                    showDay ||
                    prev.sender_portal_key !== m.sender_portal_key ||
                    (prev.sender_name || "") !== (m.sender_name || "");
                  return (
                    <Fragment key={m.id}>
                      {showDay && (
                        <div className="flex items-center justify-center py-2">
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {dayDividerLabel(m.created_at)}
                          </span>
                        </div>
                      )}
                    <div
                      className={cn("group flex items-center gap-1", mine ? "justify-end" : "justify-start", showHeader && i > 0 && !showDay && "mt-2")}
                    >
                      {canForward && mine && (
                        <button
                          type="button"
                          aria-label="Vidarebefordra meddelande"
                          title="Vidarebefordra till annan butik"
                          onClick={() => openForward(m)}
                          className="shrink-0 rounded-full p-1 text-muted-foreground opacity-60 hover:opacity-100 hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                        >
                          <Forward className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <div
                        className={cn(
                          "max-w-[85%] sm:max-w-[80%] px-2.5 py-1 text-xs leading-snug shadow-sm",
                          mine
                            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
                            : "bg-muted text-foreground rounded-2xl rounded-bl-sm",
                          m.is_important &&
                            "border-2 border-destructive bg-destructive/10 text-foreground ring-1 ring-destructive/30"
                        )}
                      >
                        {showHeader && (
                          <span
                            className={cn(
                              "block text-[9px] font-semibold",
                              mine ? "text-primary-foreground/80" : "text-primary"
                            )}
                          >
                            {m.sender_name ? `${m.sender_name} (${m.sender_portal_name})` : m.sender_portal_name}
                          </span>
                        )}


                        {m.is_important && (
                          <span className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-destructive">
                            <AlertTriangle className="h-3 w-3" /> Specialmeddelande
                          </span>
                        )}
                        {fwd && (
                          <span
                            className={cn(
                              "mb-0.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold",
                              mine
                                ? "bg-primary-foreground/15 text-primary-foreground/90"
                                : "bg-background/70 text-primary"
                            )}
                          >
                            <Forward className="h-3 w-3 shrink-0" />
                            Vidarebefordrat · från {fwd.from}
                          </span>
                        )}
                        {bodyText && (
                          <span className="whitespace-pre-wrap break-words">{bodyText}</span>
                        )}
                        {m.image_url && (
                          <a href={m.image_url} target="_blank" rel="noreferrer">
                            <img
                              src={m.image_url}
                              alt="Bifogad bild i chatt"
                              loading="lazy"
                              className="mt-1 max-h-40 w-full rounded-lg object-cover"
                            />
                          </a>
                        )}
                        <span
                          className={cn(
                            "block text-right text-[9px] tabular-nums leading-none pt-0.5",
                            mine ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}
                        >
                          {clockLabel(m.created_at)}
                        </span>

                      </div>

                      {canForward && !mine && (
                        <button
                          type="button"
                          aria-label="Vidarebefordra meddelande"
                          title="Vidarebefordra till annan butik"
                          onClick={() => openForward(m)}
                          className="shrink-0 rounded-full p-1 text-muted-foreground opacity-60 hover:opacity-100 hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                        >
                          <Forward className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    </Fragment>
                  );

                })
              )}
            </div>

            {/* Composer – WhatsApp-liknande: alltid synlig skickaknapp, ingen inzoomning på mobil */}
            <div className="sticky bottom-0 z-10 flex items-end gap-1.5 pt-2 border-t border-border/50 mt-2 bg-card pb-[env(safe-area-inset-bottom)]">
              <textarea
                ref={textRef}

                value={text}
                rows={1}
                onChange={(e) => {
                  setText(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                enterKeyHint="send"
                autoCapitalize="sentences"
                placeholder={activeConv ? "Skriv meddelande..." : "Välj en chatt först"}
                disabled={!activeConv}
                /* 16px på mobil hindrar iOS från att zooma in vid fokus */
                className="flex-1 min-h-9 max-h-[120px] resize-none overflow-y-auto rounded-2xl border border-input bg-background px-3 py-2 text-base sm:text-xs leading-snug placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
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
                className="h-9 w-9 shrink-0 rounded-full"
                disabled={!activeConv || send.isPending}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                disabled={!activeConv || send.isPending}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSend()}
                aria-label="Skicka"
              >
                {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

          </div>
        )}
      </CardContent>

      {/* Specialmeddelande till alla butiker (Admin) */}

      <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-1.5">
              <Megaphone className="h-4 w-4 text-destructive" /> Specialmeddelande
            </DialogTitle>
            <DialogDescription className="text-xs">
              Meddelandet markeras som viktigt hos mottagarna. Lämna butiker omarkerade för att skicka till alla.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
            rows={4}
            placeholder="Skriv det viktiga meddelandet..."
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-base sm:text-xs leading-snug focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {storeTargets.map((p) => {
              const checked = broadcastKeys.includes(p.key);
              return (
                <label key={p.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 cursor-pointer">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      setBroadcastKeys((prev) => (v ? [...prev, p.key] : prev.filter((k) => k !== p.key)))
                    }
                  />
                  <Store className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-foreground">{p.name}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBroadcastOpen(false)}>Avbryt</Button>
            <Button size="sm" variant="destructive" onClick={handleBroadcast} disabled={broadcast.isPending}>
              {broadcast.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Skicka till {broadcastKeys.length || storeTargets.length} butik(er)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
