import { useMemo, useState } from "react";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useHrNotifications, type HrNotification } from "@/hooks/useHrNotifications";

const targetFor = (template: string) => (template === "absence_pending" ? "/hr-control" : "/my-shifts");
/**
 * Integritetsregel: en notis avslöjar aldrig frånvarotyp eller hälsodetalj.
 * Därför "Frånvaroansökan"/"Frånvaro", aldrig "Sjukanmälan" eller "VAB".
 */
const titleFor = (template: string) => ({
  absence_pending: "Frånvaroansökan att behandla",
  absence_approved: "Frånvaro godkänd",
  absence_rejected: "Frånvaro avslagen",
  sick_day15: "HR-påminnelse",
  karens_warning: "HR-varning",
  vacation_expiry: "Semester att planera",
  las_probation: "Anställning att se över",
  las_conversion: "Anställning att se över",
}[template] ?? "HR-notis");

/** Filtergrupper i klartext — samma indelning som HR arbetar efter. */
const GROUPS: { key: string; label: string; templates: string[] | null }[] = [
  { key: "all", label: "Alla", templates: null },
  { key: "absence", label: "Frånvaro", templates: ["absence_pending", "absence_approved", "absence_rejected"] },
  { key: "vacation", label: "Semester", templates: ["vacation_expiry"] },
  { key: "employment", label: "Anställning", templates: ["las_probation", "las_conversion"] },
  { key: "hr", label: "HR-varningar", templates: ["sick_day15", "karens_warning"] },
];

const groupOf = (template: string) => GROUPS.find((group) => group.templates?.includes(template))?.key ?? "hr";

export function HrNotificationCenter() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { notifications, unread, markRead } = useHrNotifications();

  const open = (id: string, target: string) => {
    markRead.mutate([id]);
    navigate(target);
  };

  const filtered = useMemo(
    () =>
      notifications
        .filter((item) => (filter === "all" ? true : groupOf(item.template_key) === filter))
        .filter((item) => (onlyUnread ? !item.read_at : true)),
    [notifications, filter, onlyUnread],
  );

  /** Gruppera efter typ så listan blir en översikt, inte ett flöde. */
  const grouped = useMemo(() => {
    const map = new Map<string, HrNotification[]>();
    filtered.forEach((item) => {
      const title = titleFor(item.template_key);
      map.set(title, [...(map.get(title) ?? []), item]);
    });
    return [...map.entries()];
  }, [filtered]);

  const countFor = (key: string) =>
    key === "all" ? notifications.length : notifications.filter((item) => groupOf(item.template_key) === key).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 sm:h-8 sm:w-8" aria-label="HR-notiser">
          <Bell className="h-4 w-4" />
          {unread.length > 0 && <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]">{unread.length > 99 ? "99+" : unread.length}</Badge>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(380px,calc(100vw-2rem))]">
        <DropdownMenuLabel className="flex items-center justify-between text-xs">
          <span>HR-notiser</span>
          {unread.length > 0 && <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={() => markRead.mutate(unread.map((item) => item.id))}><CheckCheck className="h-3.5 w-3.5" /> Markera lästa</Button>}
        </DropdownMenuLabel>
        <div className="flex flex-wrap gap-1 px-2 pb-2">
          {GROUPS.filter((group) => group.key === "all" || countFor(group.key) > 0).map((group) => (
            <Button
              key={group.key}
              variant={filter === group.key ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={(event) => { event.preventDefault(); setFilter(group.key); }}
            >
              {group.label} {countFor(group.key) > 0 ? countFor(group.key) : ""}
            </Button>
          ))}
          <Button
            variant={onlyUnread ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={(event) => { event.preventDefault(); setOnlyUnread((value) => !value); }}
          >
            Endast olästa
          </Button>
        </div>
        <DropdownMenuSeparator />
        {grouped.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">Inga HR-notiser i urvalet.</div>
        ) : (
          grouped.map(([title, items]) => (
            <div key={title}>
              <p className="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {title} · {items.length}
              </p>
              {items.slice(0, 6).map((item) => (
                <DropdownMenuItem key={item.id} className="cursor-pointer items-start gap-2 py-2.5" onClick={() => open(item.id, targetFor(item.template_key))}>
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-muted" : "bg-primary"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted-foreground">{item.body ?? "Öppna för mer information"}</span>
                    <span className="mt-1 block text-[10px] tabular-nums text-muted-foreground">{new Date(item.created_at).toLocaleString("sv-SE")}</span>
                  </span>
                  <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </DropdownMenuItem>
              ))}
              {items.length > 6 && <p className="px-3 pb-1 text-[10px] text-muted-foreground">+{items.length - 6} fler i gruppen</p>}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
