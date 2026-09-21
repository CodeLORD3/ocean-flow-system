import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Tag as TagIcon, X } from "lucide-react";
import { childZones, normalizeTag, tagCounts, tagsOf } from "@/lib/zoneTree";
import type { MapZone } from "@/hooks/useStoreMap";

/**
 * Ersätter det gamla objektbiblioteket. Här namnger man ytan, sätter sina egna
 * taggar i fritext och ritar en ny yta inuti den — område i område.
 */
export function ZoneTagsPanel({
  zones,
  zone,
  onSaveName,
  onSaveTags,
  onAddChild,
  onOpenZone,
  onPickTag,
}: {
  zones: MapZone[];
  zone: MapZone | null;
  onSaveName: (name: string) => void;
  onSaveTags: (tags: string[]) => void;
  onAddChild: (parentId: string) => void;
  onOpenZone: (zoneId: string) => void;
  onPickTag: (tag: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const used = tagCounts(zones);

  if (!zone) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs">Yta och taggar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Tryck på en yta i kartan för att namnge den, sätta taggar och rita nya ytor inuti.
          </p>
          {used.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {used.slice(0, 16).map((t) => (
                <button
                  key={t.tag}
                  onClick={() => onPickTag(t.tag)}
                  className="rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
                >
                  {t.tag} <span className="tabular-nums text-muted-foreground">{t.count}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const tags = tagsOf(zone);
  const children = childZones(zones, zone.id);

  const addTag = (raw: string) => {
    const t = normalizeTag(raw);
    if (!t || tags.includes(t)) return setDraft("");
    onSaveTags([...tags, t]);
    setDraft("");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs">Yta och taggar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          defaultValue={zone.name}
          key={zone.id}
          onBlur={(e) => e.target.value.trim() && e.target.value !== zone.name && onSaveName(e.target.value.trim())}
          className="h-8 text-xs"
          placeholder="Vad heter ytan?"
        />

        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <TagIcon className="h-3 w-3" /> Egna taggar
          </p>
          <div className="flex flex-wrap gap-1">
            {tags.length === 0 && <span className="text-[11px] text-muted-foreground">Inga taggar ännu</span>}
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
              >
                <button onClick={() => onPickTag(t)}>{t}</button>
                <button
                  aria-label={`Ta bort taggen ${t}`}
                  onClick={() => onSaveTags(tags.filter((x) => x !== t))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(draft);
              }
            }}
            placeholder="Skriv en tagg och tryck Enter"
            className="h-8 text-xs"
          />
          {used.filter((t) => !tags.includes(t.tag)).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {used
                .filter((t) => !tags.includes(t.tag))
                .slice(0, 10)
                .map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => addTag(t.tag)}
                    className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                  >
                    + {t.tag}
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">Ytor inuti ({children.length})</p>
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenZone(c.id)}
              className="flex w-full items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color ?? "hsl(var(--primary))" }} />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          <Button size="sm" variant="outline" className="h-8 w-full gap-1 text-xs" onClick={() => onAddChild(zone.id)}>
            <Plus className="h-3 w-3" /> Rita en yta inuti {zone.name}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
