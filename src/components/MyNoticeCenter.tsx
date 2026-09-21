import { BellRing, CheckCheck, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMyNotices } from "@/hooks/useMyNotices";

/** "Mitt" — personliga notiser om kommentarer, ändringar och tilldelningar. */
export function MyNoticeCenter() {
  const navigate = useNavigate();
  const { notices, unread, markRead } = useMyNotices();

  const open = (id: string, target: string) => {
    markRead.mutate([id]);
    navigate(target);
  };

  const when = (iso: string) =>
    new Date(iso).toLocaleString("sv-SE", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 sm:h-8 sm:w-8" aria-label="Mina notiser">
          <BellRing className="h-4 w-4" />
          {unread.length > 0 && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]">
              {unread.length > 99 ? "99+" : unread.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(380px,calc(100vw-2rem))]">
        <DropdownMenuLabel className="flex items-center justify-between text-xs">
          <span>Mina notiser</span>
          {unread.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px]"
              onClick={(event) => {
                event.preventDefault();
                markRead.mutate(unread.map((n) => n.id));
              }}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Markera lästa
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notices.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Inget nytt just nu. Här hamnar kommentarer, ändringar och uppgifter du får.
          </div>
        ) : (
          notices.slice(0, 20).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="cursor-pointer items-start gap-2 py-2.5"
              onClick={() => open(n.id, n.target_page)}
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-muted" : "bg-primary"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-foreground">{n.message}</span>
                <span className="mt-1 block text-[10px] tabular-nums text-muted-foreground">{when(n.created_at)}</span>
              </span>
              <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
