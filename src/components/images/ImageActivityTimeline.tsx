import { useImageActivity } from "@/hooks/useImageLibrary";
import { StaffFace } from "@/components/staff/StaffNameAvatar";
import { mediaKindLabel } from "@/lib/imageStatus";

/** Vem som gjort vad med bilden. Historiken är mänsklig, inte teknisk. */
const ACTION_TEXT: Record<string, string> = {
  uploaded: "laddade upp bilden",
  classified: "sorterade bilden",
  reclassified: "ändrade bildens uppgifter",
  unlinked: "tog bort en koppling",
  commented: "kommenterade bilden",
};

function fieldText(field: string | null, oldV: string | null, newV: string | null) {
  if (!field) return null;
  if (field.startsWith("koppling:")) {
    const what = field.split(":")[1];
    const label =
      { store: "butik", zone: "område", resource: "sak", product: "produkt", task: "uppgift", observation: "iakttagelse" }[
        what
      ] ?? what;
    return newV ? `kopplade till ${label}` : `tog bort kopplingen till ${label}`;
  }
  if (field === "vad bilden visar") {
    return `vad bilden visar: ${mediaKindLabel(oldV)} → ${mediaKindLabel(newV)}`;
  }
  const from = oldV ? `"${oldV}"` : "tomt";
  const to = newV ? `"${newV}"` : "tomt";
  return `${field}: ${from} → ${to}`;
}

export default function ImageActivityTimeline({ mediaId }: { mediaId?: string | null }) {
  const { data: rows = [], isLoading } = useImageActivity(mediaId);

  if (!mediaId) return null;
  if (isLoading) return <p className="text-sm text-muted-foreground">Hämtar historik…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Ingen historik ännu.</p>;

  // Samla ihop ändringar som hör till samma sparning.
  const groups: { key: string; actor: string; action: string; at: string; details: string[] }[] = [];
  for (const r of rows) {
    const key = r.change_group_id || r.id;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        actor: r.actor_name || "Okänd",
        action: ACTION_TEXT[r.action_type] || r.action_type,
        at: r.created_at,
        details: [],
      };
      groups.push(g);
    }
    const d = fieldText(r.field_name, r.old_value, r.new_value);
    if (d) g.details.push(d);
  }

  return (
    <ul className="space-y-3">
      {groups.map((g) => (
        <li key={g.key} className="flex gap-3">
          <StaffFace name={g.actor} />
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{g.actor}</span> {g.action}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(g.at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
            </p>
            {g.details.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {g.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
