import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MapObjectIcon } from "@/components/storemap/MapObjectIcon";
import { cn } from "@/lib/utils";
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
  const [cat, setCat] = useState<string | null>(null);

  const categories = useMemo(() => {
    const seen: string[] = [];
    types.forEach((t) => {
      if (!seen.includes(t.category)) seen.push(t.category);
    });
    return seen;
  }, [types]);

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = types.filter(
      (t) =>
        (!cat || t.category === cat) &&
        (!needle ||
          t.name.toLowerCase().includes(needle) ||
          t.category.toLowerCase().includes(needle)),
    );
    const map = new Map<string, MapObjectType[]>();
    filtered.forEach((t) => map.set(t.category, [...(map.get(t.category) ?? []), t]));
    return [...map.entries()];
  }, [types, q, cat]);

  const total = grouped.reduce((n, [, items]) => n + items.length, 0);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök objekt…"
          className="h-9 rounded-full bg-muted/40 pl-8 pr-8 text-xs"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Rensa sökning"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCat(null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
            cat === null
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          Alla
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(cat === c ? null : c)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
              cat === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
        {grouped.map(([category, items]) => (
          <div key={category} className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {category}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onAdd(t)}
                  title={t.name}
                  className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <MapObjectIcon icon={t.icon} className="h-4 w-4" />
                  </span>
                  <span className="w-full truncate text-[11px] font-medium leading-tight">
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {total === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Inget objekt matchar sökningen.
          </p>
        )}
      </div>
    </div>
  );
}
