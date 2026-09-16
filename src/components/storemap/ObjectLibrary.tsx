import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapObjectIcon } from "@/components/storemap/MapObjectIcon";
import type { MapObjectType } from "@/hooks/useStoreMap";

/** Objektbiblioteket i redigeringsläget — klick lägger objektet på kartan. */
export function ObjectLibrary({
  types,
  onAdd,
}: {
  types: MapObjectType[];
  onAdd: (t: MapObjectType) => void;
}) {
  const [q, setQ] = useState("");
  const grouped = useMemo(() => {
    const filtered = types.filter(
      (t) =>
        !q.trim() ||
        t.name.toLowerCase().includes(q.toLowerCase()) ||
        t.category.toLowerCase().includes(q.toLowerCase()),
    );
    const map = new Map<string, MapObjectType[]>();
    filtered.forEach((t) => map.set(t.category, [...(map.get(t.category) ?? []), t]));
    return [...map.entries()];
  }, [types, q]);

  return (
    <div className="space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Sök objekt…"
        className="h-7 text-xs"
      />
      <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
        {grouped.map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">{cat}</p>
            <div className="space-y-1">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onAdd(t)}
                  className="w-full flex items-center gap-2 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted text-left"
                >
                  <MapObjectIcon icon={t.icon} className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
