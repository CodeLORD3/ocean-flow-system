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
      <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:min-w-[220px] sm:flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök uppgift"
            className="h-11 pl-8 sm:h-10"
          />
        </div>
        <div className="flex gap-2">
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="h-11 flex-1 text-sm sm:h-10 sm:w-[200px] sm:flex-none">
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
            <SelectTrigger className="h-11 flex-1 text-sm sm:h-10 sm:w-[170px] sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="namn">Namn A–Ö</SelectItem>
              <SelectItem value="oftast">Görs oftast</SelectItem>
              <SelectItem value="senast">Senast gjord</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                <div className="border-t border-grid-line">
                  {g.rows.map((r) => {
                    const area = r.zoneId ? areas.get(r.zoneId) : null;
                    const target = taskTarget(
                      { link_url: r.linkUrl, recipe_id: r.recipeId },
                      recipes.find((x) => x.id === r.recipeId)?.name ?? null,
                    );
                    return (
                      <div
                        key={r.key}
                        className="flex min-h-[34px] items-center gap-2 border-b border-grid-line px-2 py-1 last:border-b-0 hover:bg-muted/40"
                      >
                        {/* Namnet först — samma täthet som raderna i Mina uppgifter */}
                        <button
                          type="button"
                          onClick={() => r.itemId && onOpenTask(r.itemId)}
                          disabled={!r.itemId}
                          className={cn(
                            "min-w-[7rem] flex-1 truncate py-0.5 text-left text-[13px] font-semibold",
                            r.itemId ? "hover:underline" : "cursor-default",
                          )}
                          title={r.task}
                        >
                          {r.task}
                        </button>

                        <span className="hidden w-[150px] shrink-0 items-center md:flex">
                          {area ? (
                            <span className="inline-flex w-full items-center gap-1.5 px-2 text-[11px] text-muted-foreground">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: area.color }} />
                              <span className="truncate">
                                {area.number}. {area.name}
                              </span>
                            </span>
                          ) : (
                            <span className="px-2 text-[11px] text-muted-foreground/60">Inget område</span>
                          )}
                        </span>

                        <span className="hidden w-[132px] shrink-0 truncate text-[11px] text-muted-foreground xl:block">
                          {whenText(r.lastDone)}
                        </span>

                        <span className="hidden w-[52px] shrink-0 justify-end font-mono text-[10px] tabular-nums text-muted-foreground sm:flex">
                          {r.times} ggr
                        </span>

                        <span className="hidden w-[20px] shrink-0 justify-center sm:flex">
                          {r.recurring && (
                            <span title="Återkommande">
                              <Repeat className="h-3 w-3 text-muted-foreground" />
                            </span>
                          )}
                        </span>

                        <span className="hidden w-[150px] shrink-0 lg:block">
                          <Select value={r.categoryId ?? "none"} onValueChange={(v) => setCategory(r, v)}>
                            <SelectTrigger className="h-7 w-full text-[11px]">
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
                        </span>

                        <span className="flex w-[34px] shrink-0 justify-end">
                          {target && (
                            <button
                              type="button"
                              onClick={() => onNavigate(target.url)}
                              title={target.label}
                              className="rounded-md p-1 text-primary hover:bg-primary/10"
                            >
                              <ArrowUpRight className="h-4 w-4" />
                            </button>
                          )}
                        </span>
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
