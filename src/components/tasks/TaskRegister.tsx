import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Repeat, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { taskTarget } from "@/lib/taskLink";
import { useTaskRegister, useUpdateTask, useUpdateStandardTask, type RegisterTask, type TaskCategory } from "@/hooks/useTasks";
import type { TaskRowArea } from "@/components/tasks/TaskRow";
import type { ProductionRecipe } from "@/hooks/useProductionRecipes";

/** Överkategorier vi vill se först i registret. */
const TOP_ORDER = ["Produktion", "Städning", "Packa varor", "Utbildning", "Märkning av varor", "Kontorsarbete"];

function whenText(iso: string | null) {
  if (!iso) return "Aldrig avbockad";
  const d = new Date(iso);
  return `Senast ${d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function TaskRegister({
  storeId,
  categories,
  areas,
  recipes,
  onOpenTask,
  onNavigate,
}: {
  storeId?: string | null;
  categories: TaskCategory[];
  areas: Map<string, TaskRowArea>;
  recipes: ProductionRecipe[];
  onOpenTask: (itemId: string) => void;
  onNavigate: (url: string) => void;
}) {
  const { data: register = [], isLoading } = useTaskRegister(storeId);
  const updateTask = useUpdateTask();
  const updateStandard = useUpdateStandardTask();

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<"namn" | "oftast" | "senast">("namn");
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Övrigt";
  const catColor = (id: string | null) => categories.find((c) => c.id === id)?.color ?? "hsl(var(--muted-foreground))";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = register.filter((r) => {
      if (cat !== "all" && (r.categoryId ?? "ovrigt") !== cat) return false;
      if (!q) return true;
      const area = r.zoneId ? areas.get(r.zoneId)?.name ?? "" : "";
      return [r.task, r.note ?? "", catName(r.categoryId), area].join(" ").toLowerCase().includes(q);
    });
    rows = [...rows];
    if (sort === "oftast") rows.sort((a, b) => b.times - a.times || a.task.localeCompare(b.task, "sv"));
    if (sort === "senast") rows.sort((a, b) => (b.lastDone ?? "").localeCompare(a.lastDone ?? ""));
    return rows;
  }, [register, query, cat, sort, areas, categories]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; color: string; rows: RegisterTask[] }>();
    filtered.forEach((r) => {
      const key = r.categoryId ?? "ovrigt";
      const g = map.get(key) ?? { key, label: catName(r.categoryId), color: catColor(r.categoryId), rows: [] };
      g.rows.push(r);
      map.set(key, g);
    });
    return [...map.values()].sort((a, b) => {
      const ai = TOP_ORDER.indexOf(a.label);
      const bi = TOP_ORDER.indexOf(b.label);
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return a.label.localeCompare(b.label, "sv");
    });
  }, [filtered, categories]);

  const setCategory = (row: RegisterTask, value: string) => {
    const category_id = value === "none" ? null : value;
    if (row.templateItemId) updateStandard.mutate({ id: row.templateItemId, category_id });
    if (row.itemId) updateTask.mutate({ id: row.itemId, category_id });
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök uppgift"
            className="pl-8"
          />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla överkategorier</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
            <SelectItem value="ovrigt">Övrigt</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="namn">Namn A–Ö</SelectItem>
            <SelectItem value="oftast">Görs oftast</SelectItem>
            <SelectItem value="senast">Senast gjord</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} uppgifter</span>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Hämtar registret …</p>}
      {!isLoading && groups.length === 0 && (
        <p className="text-sm text-muted-foreground">Inga uppgifter matchar sökningen.</p>
      )}

      <div className="space-y-3">
        {groups.map((g) => {
          const open = !closed[g.key];
          return (
            <Card key={g.key} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setClosed((p) => ({ ...p, [g.key]: open }))}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
              >
                <span className="h-3 w-3 rounded-full" style={{ background: g.color }} />
                <span className="font-semibold">{g.label}</span>
                <span className="text-xs text-muted-foreground">{g.rows.length} uppgifter</span>
                <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", !open && "-rotate-90")} />
              </button>

              {open && (
                <div className="divide-y border-t">
                  {g.rows.map((r) => {
                    const area = r.zoneId ? areas.get(r.zoneId) : null;
                    const target = taskTarget(
                      { link_url: r.linkUrl, recipe_id: r.recipeId },
                      recipes.find((x) => x.id === r.recipeId)?.name ?? null,
                    );
                    return (
                      <div key={r.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                        <button
                          type="button"
                          onClick={() => r.itemId && onOpenTask(r.itemId)}
                          disabled={!r.itemId}
                          className={cn(
                            "min-w-[180px] flex-1 text-left font-medium break-words",
                            r.itemId ? "hover:underline" : "cursor-default",
                          )}
                        >
                          {r.task}
                        </button>

                        {area && (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{ background: `${area.color}22`, color: area.color }}
                          >
                            {area.number}. {area.name}
                          </span>
                        )}
                        {r.recurring && (
                          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                            <Repeat className="h-3 w-3" /> Återkommande
                          </span>
                        )}
                        <span className="w-[150px] text-right text-xs text-muted-foreground">
                          {whenText(r.lastDone)}
                        </span>
                        <span className="w-[70px] text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {r.times} ggr
                        </span>

                        <Select value={r.categoryId ?? "none"} onValueChange={(v) => setCategory(r, v)}>
                          <SelectTrigger className="h-8 w-[170px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Övrigt</SelectItem>
                            {categories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {target && (
                          <button
                            type="button"
                            onClick={() => onNavigate(target.url)}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                          >
                            <ArrowUpRight className="h-3 w-3" /> {target.label}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
