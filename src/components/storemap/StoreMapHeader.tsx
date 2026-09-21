import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Home,
  ImageIcon,
  ListChecks,
  History,
  Map as MapIcon,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { StatusRing } from "@/components/storemap/StatusRing";
import { STATUS_LABEL } from "@/lib/mapStatus";
import type { MapStatus } from "@/lib/mapStatus";
import type { MapZone } from "@/hooks/useStoreMap";
import { tagsOf, zoneMatches } from "@/lib/zoneTree";

export type HeaderCounts = { tasks: number; images: number; deviations: number };

type Props = {
  storeName: string;
  storeId: string;
  stores: { id: string; name: string }[];
  onPickStore?: (id: string) => void;
  plans: { id: string; name: string }[];
  planId: string | null;
  onPickPlan: (id: string) => void;
  view: string;
  onView: (v: string) => void;
  areaTab?: { label: string; color?: string | null } | null;
  counts: HeaderCounts;
  day: string;
  onDay: (iso: string) => void;
  today: string;
  tomorrow: string;
  progress: { percent: number; status: MapStatus; done: number; total: number };
  canManage: boolean;
  mode: "drift" | "redigera";
  onMode: (m: "drift" | "redigera") => void;
  zones: MapZone[];
  tasks: { id: string; task: string; zone_id: string | null; done: boolean }[];
  onOpenZone: (zoneId: string) => void;
  onOpenTask: (taskId: string) => void;
  onNewZone: () => void;
  newZoneDisabled?: boolean;
  /** Inbäddad i en annan sida — då visas ingen brödsmulerad väg eller stor titel. */
  embedded?: boolean;
};

const TABS = [
  { key: "karta", label: "Karta", icon: MapIcon, count: null },
  { key: "uppgifter", label: "Uppgifter", icon: ListChecks, count: "tasks" },
  { key: "bilder", label: "Bilder", icon: ImageIcon, count: "images" },
  { key: "avvikelser", label: "Avvikelser", icon: AlertTriangle, count: "deviations" },
  { key: "historik", label: "Historik", icon: History, count: null },
] as const;

/**
 * Butikskartans topp: var man är, vad man tittar på, vilken dag som gäller,
 * en sökruta för hela butiken och den stora knappen för nytt område.
 */
export function StoreMapHeader({
  storeName,
  storeId,
  stores,
  onPickStore,
  plans,
  planId,
  onPickPlan,
  view,
  onView,
  areaTab,
  counts,
  day,
  onDay,
  today,
  tomorrow,
  progress,
  canManage,
  mode,
  onMode,
  zones,
  tasks,
  onOpenZone,
  onOpenTask,
  onNewZone,
  newZoneDisabled,
  embedded,
}: Props) {
  const [query, setQuery] = useState("");

  const hits = useMemo(() => {
    const q = query.trim();
    if (q.length < 1) return null;
    const zoneHits = zones.filter((z) => zoneMatches(z, q)).slice(0, 6);
    const taskHits = tasks.filter((t) => t.task.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
    return { zoneHits, taskHits, empty: zoneHits.length === 0 && taskHits.length === 0 };
  }, [query, zones, tasks]);

  const dayChip = (label: string, value: string | null) => {
    const active = value ? day === value : day !== today && day !== tomorrow;
    return (
      <button
        key={label}
        type="button"
        onClick={() => value && onDay(value)}
        className={cn(
          "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {!embedded && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Home className="h-4 w-4" />
          <span>Butiker</span>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-foreground">{storeName}</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <MapIcon className="h-6 w-6 text-primary" />
            Butikskartan
          </h1>
          {stores.length > 1 && onPickStore ? (
            <Select value={storeId} onValueChange={onPickStore}>
              <SelectTrigger className="h-7 border-0 px-0 text-sm text-muted-foreground shadow-none focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">{storeName}</p>
          )}
        </div>

        {plans.length > 1 && (
          <Select value={planId ?? ""} onValueChange={onPickPlan}>
            <SelectTrigger className="h-8 w-40 rounded-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Vyväljare med ikon och antal nytt på varje flik */}
        <Tabs value={view} onValueChange={onView}>
          <TabsList className="h-12 rounded-2xl bg-muted p-1.5">
            {TABS.map((t) => {
              const n = t.count ? counts[t.count as keyof HeaderCounts] : 0;
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="relative h-9 gap-2 rounded-xl px-4 text-sm font-medium text-muted-foreground data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{t.label}</span>
                  {n > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold tabular-nums text-destructive-foreground">
                      {n}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
            {areaTab && (
              <TabsTrigger
                value="omrade"
                className="h-9 max-w-[180px] gap-2 rounded-xl px-4 text-sm data-[state=active]:text-white"
                style={
                  areaTab.color && view === "omrade"
                    ? { background: areaTab.color, boxShadow: `0 0 0 2px ${areaTab.color}33` }
                    : undefined
                }
              >
                {areaTab.color && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: view === "omrade" ? "#fff" : areaTab.color }}
                  />
                )}
                <span className="truncate">{areaTab.label}</span>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
          <StatusRing percent={progress.percent} status={progress.status} label={`${progress.percent}%`} />
          <div className="leading-tight">
            <p className="text-[11px] font-medium">{STATUS_LABEL[progress.status]}</p>
            <p className="text-[10px] tabular-nums text-muted-foreground">
              {progress.done}/{progress.total} uppgifter
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Dagväljare — idag är förvalt */}
        <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={day}
            onChange={(e) => onDay(e.target.value || today)}
            className="bg-transparent text-sm tabular-nums outline-none"
          />
        </label>

        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {dayChip("Idag", today)}
          {dayChip("Imorgon", tomorrow)}
          {dayChip("Valt datum", null)}
        </div>

        {/* Sök i hela butiken — område, tagg eller uppgift */}
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök område, plats eller uppgift…"
            className="h-11 rounded-xl pl-9"
          />
          {hits && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              {hits.empty && <p className="px-3 py-3 text-sm text-muted-foreground">Inget hittat</p>}
              {hits.zoneHits.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => {
                    onOpenZone(z.id);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color ?? undefined }} />
                  <span className="truncate font-medium">{z.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{tagsOf(z).join(", ")}</span>
                </button>
              ))}
              {hits.taskHits.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onOpenTask(t.id);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{t.task}</span>
                  {t.done && <span className="ml-auto text-xs text-muted-foreground">klar</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {canManage && (
          <Tabs value={mode} onValueChange={(v) => onMode(v as "drift" | "redigera")}>
            <TabsList className="h-11 rounded-xl bg-muted p-1">
              <TabsTrigger value="drift" className="h-9 rounded-lg px-4 text-xs">
                Visa
              </TabsTrigger>
              <TabsTrigger value="redigera" className="h-9 gap-1 rounded-lg px-4 text-xs">
                <Pencil className="h-3.5 w-3.5" /> Redigera
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {canManage && (
          <Button size="lg" className="h-11 gap-2 rounded-xl" onClick={onNewZone} disabled={newZoneDisabled}>
            <Plus className="h-5 w-5" /> Nytt område
          </Button>
        )}
      </div>
    </div>
  );
}
