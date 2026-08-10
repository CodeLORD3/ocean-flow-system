import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, ChevronUp, ChevronDown, Pencil, Check } from "lucide-react";
import { useStoreSidebarPrefs } from "@/hooks/useStoreSidebarPrefs";
import { useLocalSidebarPrefs } from "@/hooks/useLocalSidebarPrefs";

export type VisibilityNavItem = { title: string; url: string };
export type VisibilitySection = { label: string; items: VisibilityNavItem[] };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sections in their default (code) order — label is used as section key */
  sections: VisibilitySection[];
  lockedUrls?: string[];
  /** Local scope key when there is no active store (e.g. "production") */
  localScope?: string;
}

export function SidebarVisibilityDialog({ open, onOpenChange, sections, lockedUrls = [], localScope }: Props) {
  const storePrefs = useStoreSidebarPrefs();
  const localPrefs = useLocalSidebarPrefs(localScope ?? "default");
  const {
    isHidden,
    setHidden,
    hasStore,
    itemOrder,
    sectionLabels,
    sectionOrder,
    setItemOrder,
    upsertSection,
  } = localScope ? localPrefs : storePrefs;


  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  useEffect(() => {
    if (!open) setEditingKey(null);
  }, [open]);

  // Sections ordered by saved sort order, fallback to code order
  const orderedSections = useMemo(() => {
    return sections
      .map((s, i) => ({ ...s, key: s.label, order: sectionOrder.get(s.label) ?? i, fallback: i }))
      .sort((a, b) => a.order - b.order || a.fallback - b.fallback);
  }, [sections, sectionOrder]);

  const orderItems = (items: VisibilityNavItem[]) =>
    items
      .map((it, i) => ({ ...it, order: itemOrder.get(it.url) ?? i, fallback: i }))
      .sort((a, b) => a.order - b.order || a.fallback - b.fallback);

  const moveSection = (key: string, dir: -1 | 1) => {
    const keys = orderedSections.map((s) => s.key);
    const idx = keys.indexOf(key);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= keys.length) return;
    [keys[idx], keys[target]] = [keys[target], keys[idx]];
    upsertSection.mutate(keys.map((k, i) => ({ section_key: k, sort_order: i })));
  };

  const moveItem = (items: VisibilityNavItem[], url: string, dir: -1 | 1) => {
    const urls = orderItems(items).map((i) => i.url);
    const idx = urls.indexOf(url);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= urls.length) return;
    [urls[idx], urls[target]] = [urls[target], urls[idx]];
    setItemOrder.mutate(urls);
  };

  const saveLabel = (key: string) => {
    const value = draftLabel.trim();
    upsertSection.mutate([{ section_key: key, label: value.length ? value : null }]);
    setEditingKey(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anpassa meny</DialogTitle>
          <DialogDescription>
            Stäng av flikar som butiken inte använder, ändra ordning med pilarna och byt namn på sektioner.
            Inget tas bort – du kan slå på dem igen när som helst.
          </DialogDescription>
        </DialogHeader>

        {!hasStore && (
          <p className="text-sm text-muted-foreground">Ingen aktiv butik vald – välj butik först.</p>
        )}

        {hasStore && (
          <div className="space-y-5">
            {orderedSections.map((section, sIdx) => (
              <div key={section.key} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  {editingKey === section.key ? (
                    <div className="flex flex-1 items-center gap-1">
                      <Input
                        autoFocus
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveLabel(section.key);
                          if (e.key === "Escape") setEditingKey(null);
                        }}
                        className="h-7 text-sm"
                        placeholder={section.key}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveLabel(section.key)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      className="group flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setEditingKey(section.key);
                        setDraftLabel(sectionLabels.get(section.key) ?? section.key);
                      }}
                    >
                      {sectionLabels.get(section.key) ?? section.label}
                      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )}

                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      disabled={sIdx === 0 || upsertSection.isPending}
                      onClick={() => moveSection(section.key, -1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      disabled={sIdx === orderedSections.length - 1 || upsertSection.isPending}
                      onClick={() => moveSection(section.key, 1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  {orderItems(section.items).map((item, iIdx, arr) => {
                    const locked = lockedUrls.includes(item.url);
                    return (
                      <div
                        key={item.url}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          {item.title}
                          {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={iIdx === 0 || setItemOrder.isPending}
                            onClick={() => moveItem(section.items, item.url, -1)}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={iIdx === arr.length - 1 || setItemOrder.isPending}
                            onClick={() => moveItem(section.items, item.url, 1)}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Switch
                            className="ml-1"
                            checked={locked ? true : !isHidden(item.url)}
                            disabled={locked || setHidden.isPending}
                            onCheckedChange={(checked) =>
                              setHidden.mutate({ navUrl: item.url, hidden: !checked })
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
