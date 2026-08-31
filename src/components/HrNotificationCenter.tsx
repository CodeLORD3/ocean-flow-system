import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useHrNotifications } from "@/hooks/useHrNotifications";

const targetFor = (template: string) => template.startsWith("las_") || template.startsWith("absence") || template.startsWith("sick") || template === "vacation_expiry" ? "/my-shifts" : "/my-shifts";
const titleFor = (template: string) => ({
  absence_approved: "Frånvaro godkänd",
  absence_rejected: "Frånvaro avslagen",
  sick_day15: "HR-påminnelse",
  karens_warning: "HR-varning",
  vacation_expiry: "Semester att planera",
}[template] ?? "HR-notis");

export function HrNotificationCenter() {
  const navigate = useNavigate();
  const { notifications, unread, markRead } = useHrNotifications();
  const open = (id: string, target: string) => {
    markRead.mutate([id]);
    navigate(target);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 sm:h-8 sm:w-8" aria-label="HR-notiser">
          <Bell className="h-4 w-4" />
          {unread.length > 0 && <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]">{unread.length > 99 ? "99+" : unread.length}</Badge>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(360px,calc(100vw-2rem))]">
        <DropdownMenuLabel className="flex items-center justify-between text-xs">
          <span>HR-notiser</span>
          {unread.length > 0 && <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => markRead.mutate(unread.map((item) => item.id))}><CheckCheck className="h-3.5 w-3.5" /> Markera lästa</Button>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? <div className="px-3 py-6 text-center text-xs text-muted-foreground">Inga HR-notiser.</div> : notifications.slice(0, 8).map((item) => (
          <DropdownMenuItem key={item.id} className="cursor-pointer items-start gap-2 py-3" onClick={() => open(item.id, targetFor(item.template_key))}>
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-muted" : "bg-primary"}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium">{titleFor(item.template_key)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{item.body ?? "Öppna för mer information"}</span>
              <span className="mt-1 block text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleString("sv-SE")}</span>
            </span>
            <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
