import { useNavigate } from "react-router-dom";
import { dayKey, dayLabel } from "@/lib/imageMeta";
import { eventIcon, eventLabel, eventTime, type PersonEvent } from "@/lib/personEvents";
import { cn } from "@/lib/utils";

/**
 * Personens händelser grupperade per dag, samma dagsrubrikspråk som
 * bildflödet: rubrik till vänster och ett streck ut till kanten.
 */
export function PersonTimeline({ events }: { events: PersonEvent[] }) {
  const navigate = useNavigate();

  if (events.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">Inget registrerat ännu.</p>;
  }

  const groups: { key: string; rows: PersonEvent[] }[] = [];
  events.forEach((e) => {
    const key = dayKey(e.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(e);
    else groups.push({ key, rows: [e] });
  });

  return (
    <div className="space-y-6 px-4 py-4">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="mb-2 flex items-center gap-3">
            <h3 className="shrink-0 text-sm font-semibold text-foreground">{dayLabel(g.key)}</h3>
            <span className="h-px flex-1 bg-border" />
          </div>
          <ul className="space-y-1">
            {g.rows.map((e) => {
              const Icon = eventIcon(e.kind);
              const clickable = !!e.route;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => e.route && navigate(e.route)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                      clickable ? "hover:bg-muted/60" : "cursor-default",
                    )}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{e.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="font-mono tabular-nums">{eventTime(e.at)}</span>
                        {" · "}
                        {eventLabel(e.kind)}
                        {e.meta ? ` · ${e.meta}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default PersonTimeline;
