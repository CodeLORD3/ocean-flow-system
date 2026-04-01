import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, CheckCircle, Banknote, AlertTriangle, X } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

interface Props {
  onNavigate: (path: string) => void;
}

export default function PortalNotificationDropdown({ onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });
  }, []);

  const { data: notifications = [] } = useQuery({
    queryKey: ["portal-notifications", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("portal", "investor")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    refetchInterval: 15000,
  });

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("portal-notif-dropdown")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["portal-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["portal-notification-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const markAllRead = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications.filter((n: any) => !n.is_read).map((n: any) => n.id);
      if (unreadIds.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", unreadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["portal-notification-count"] });
    },
  });

  const dismissNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["portal-notification-count"] });
    },
  });

  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["portal-notifications"] });
    queryClient.invalidateQueries({ queryKey: ["portal-notification-count"] });
  };

  const getIcon = (message: string) => {
    if (message.toLowerCase().includes("payout") || message.toLowerCase().includes("paid") || message.toLowerCase().includes("sent")) {
      return <Banknote className="h-3.5 w-3.5 text-mackerel" />;
    }
    if (message.toLowerCase().includes("matured") || message.toLowerCase().includes("matures")) {
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
    }
    if (message.toLowerCase().includes("received") || message.toLowerCase().includes("active") || message.toLowerCase().includes("booked") || message.toLowerCase().includes("confirmed")) {
      return <CheckCircle className="h-3.5 w-3.5 text-primary" />;
    }
    return <Bell className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const handleClick = (n: any) => {
    if (!n.is_read) markOneRead(n.id);
    setOpen(false);
    if (n.target_page) onNavigate(n.target_page);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-white/60 hover:text-mackerel-gold transition-colors"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[360px] bg-white border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="text-xs font-semibold text-foreground">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="text-[10px] text-primary hover:underline font-medium"
                >
                  Mark all as read
                </button>
              )}
              <button onClick={() => { setOpen(false); onNavigate("/portal/notifications"); }} className="text-[10px] text-muted-foreground hover:text-foreground">
                View all
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No notifications yet.
              </div>
            ) : (
              notifications.map((n: any) => (
                <div
                  key={n.id}
                  className={`relative flex items-start gap-3 px-4 py-3 border-b border-border/30 transition-colors group ${
                    !n.is_read
                      ? "bg-primary/[0.06] hover:bg-primary/[0.10]"
                      : "hover:bg-muted/40"
                  }`}
                >
                  {/* Unread indicator bar */}
                  {!n.is_read && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                  )}

                  {/* Clickable main area */}
                  <button
                    onClick={() => handleClick(n)}
                    className="flex items-start gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="mt-0.5 shrink-0">
                      {getIcon(n.message)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] leading-relaxed ${!n.is_read ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                        {n.message}
                      </p>
                      <span className="text-[10px] text-muted-foreground/70 mt-0.5 block">
                        {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </button>

                  {/* Action buttons */}
                  <div className="shrink-0 flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markOneRead(n.id); }}
                        title="Mark as read"
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
                      >
                        <CheckCircle className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); dismissNotification.mutate(n.id); }}
                      title="Dismiss"
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Unread dot */}
                  {!n.is_read && (
                    <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
