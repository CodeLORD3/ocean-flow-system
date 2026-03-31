import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, CheckCircle, DollarSign, AlertTriangle } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { usePortalTabs } from "./PortalTabsContext";

export default function PortalNotifications() {
  const { switchTab } = usePortalTabs();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });
  }, []);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["portal-notifications-full", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("portal", "investor")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;

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
      queryClient.invalidateQueries({ queryKey: ["portal-notifications-full"] });
      queryClient.invalidateQueries({ queryKey: ["portal-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["portal-notification-count"] });
    },
  });

  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["portal-notifications-full"] });
    queryClient.invalidateQueries({ queryKey: ["portal-notifications"] });
    queryClient.invalidateQueries({ queryKey: ["portal-notification-count"] });
  };

  const getIcon = (message: string) => {
    if (message.toLowerCase().includes("payout") || message.toLowerCase().includes("paid") || message.toLowerCase().includes("sent")) {
      return <DollarSign className="h-4 w-4 text-mackerel" />;
    }
    if (message.toLowerCase().includes("matured") || message.toLowerCase().includes("matures")) {
      return <AlertTriangle className="h-4 w-4 text-amber-600" />;
    }
    if (message.toLowerCase().includes("received") || message.toLowerCase().includes("active") || message.toLowerCase().includes("booked") || message.toLowerCase().includes("confirmed")) {
      return <CheckCircle className="h-4 w-4 text-primary" />;
    }
    return <Bell className="h-4 w-4 text-muted-foreground" />;
  };

  const handleClick = (n: any) => {
    if (!n.is_read) markOneRead(n.id);
    if (n.target_page) switchTab(n.target_page);
  };

  if (isLoading) {
    return <div className="text-primary text-sm animate-pulse p-8 text-center">Loading notifications...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Notifications
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            className="text-xs text-primary hover:underline font-medium"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="border border-border bg-white divide-y divide-border/50">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No notifications yet. They'll appear here as your investments progress.
          </div>
        ) : (
          notifications.map((n: any) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-muted/40 transition-colors ${
                !n.is_read ? "bg-primary/[0.03]" : ""
              }`}
            >
              <div className="mt-0.5 shrink-0 h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center">
                {getIcon(n.message)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[12px] leading-relaxed ${!n.is_read ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                  {n.message}
                </p>
                <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                  {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                </span>
              </div>
              {!n.is_read && (
                <div className="h-2.5 w-2.5 rounded-full bg-primary mt-2 shrink-0" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
