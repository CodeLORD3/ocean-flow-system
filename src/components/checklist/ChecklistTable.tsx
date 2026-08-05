import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Printer, FileText, CheckCheck, ChevronLeft, ChevronRight, ArrowRight, CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { generateChecklistPdf } from "@/lib/checklistPdf";
import { SignatureEditor } from "@/components/checklist/SignatureEditor";
import { SignatureRequestInbox } from "@/components/checklist/SignatureRequestInbox";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ChecklistDay,
  ChecklistItem,
  useCompleteChecklist,
  useMarkAllChecklistItems,
  useSetChecklistNote,
  useSignatureRequests,
  useToggleChecklistItem,
  useSetChecklistItemTime,
  useAddChecklistItem,
  useDeleteChecklistItem,
  weekdayName,
} from "@/hooks/useChecklist";

const PAGE_SIZE = 20;

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 sm:px-4 sm:py-2.5">
      <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xs sm:text-sm font-semibold text-foreground mt-0.5 truncate">{value}</p>
    </div>
  );
}


export function ChecklistTable({
  day,
  items,
  title,
  onBack,
  readOnly = false,
  storeName,
}: {
  day: ChecklistDay;
  items: ChecklistItem[];
  title: string;
  onBack?: () => void;
  readOnly?: boolean;
  storeName?: string | null;
}) {
  const [page, setPage] = useState(0);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({});
  const [addSection, setAddSection] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState({ task: "", time: "", category: "" });
  const { data: pendingRequests = [] } = useSignatureRequests(readOnly ? null : day.id);
  const toggle = useToggleChecklistItem();
  const setNote = useSetChecklistNote();
  const setTime = useSetChecklistItemTime();
  const addItem = useAddChecklistItem();
  const removeItem = useDeleteChecklistItem();
  const markAll = useMarkAllChecklistItems();
  const complete = useCompleteChecklist();

  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const pageItems = items.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const isCompleted = day.status === "completed";
  const locked = readOnly || isCompleted;

  // Sektionsrubriker inom aktuell sida
  const rows = useMemo(() => {
    type Row =
      | { kind: "section"; label: string }
      | { kind: "item"; item: ChecklistItem }
      | { kind: "add"; label: string };
    const out: Row[] = [];
    let last: string | null = null;
    pageItems.forEach((item) => {
      if (item.section !== last) {
        if (last) out.push({ kind: "add", label: last });
        out.push({ kind: "section", label: item.section });
        last = item.section;
      }
      out.push({ kind: "item", item });
    });
    if (last) out.push({ kind: "add", label: last });
    return out;
  }, [pageItems]);

  const sections = useMemo(
    () => Array.from(new Set(items.map((i) => i.section))),
    [items]
  );

  const commitTime = (item: ChecklistItem) => {
    const draft = timeDrafts[item.id];
    if (draft === undefined) return;
    if (draft.trim() === (item.time_label ?? "")) {
      setTimeDrafts((d) => {
        const { [item.id]: _drop, ...rest } = d;
        return rest;
      });
      return;
    }
    setTime.mutate(
      { id: item.id, dayId: day.id, time: draft },
      {
        onSuccess: () => {
          setTimeDrafts((d) => {
            const { [item.id]: _drop, ...rest } = d;
            return rest;
          });
          toast.success("Tiden uppdaterad — raden flyttades till rätt plats.");
        },
        onError: (e: any) => toast.error(e.message || "Kunde inte uppdatera tiden."),
      }
    );
  };

  const submitAdd = (section: string) => {
    addItem.mutate(
      { dayId: day.id, section, task: addDraft.task, time: addDraft.time, category: addDraft.category },
      {
        onSuccess: () => {
          setAddDraft({ task: "", time: "", category: "" });
          toast.success("Uppgiften tillagd.");
        },
        onError: (e: any) => toast.error(e.message || "Kunde inte lägga till uppgiften."),
      }
    );
  };

  const openAdd = (section: string) => {
    setAddSection(section);
    setAddDraft({ task: "", time: "", category: "" });
  };

  const handleComplete = () => {
    complete.mutate(day.id, {
      onSuccess: () => toast.success("Checklistan är slutförd och sparad som rapport för Admin."),
      onError: (e: any) => toast.error(e.message || "Kunde inte slutföra checklistan."),
    });
  };

  const handlePrint = (blank: boolean) => {
    if (items.length === 0) {
      toast.error("Checklistan innehåller inga uppgifter att skriva ut.");
      return;
    }
    try {
      generateChecklistPdf({
        storeName: storeName || (day as any).storeName || null,
        date: day.checklist_date,
        weekday: weekdayName(day.checklist_date),
        shift: day.shift,
        responsible: day.responsible_name,
        status: day.status,
        blank,
        items: items.map((i) => ({
          section: i.section,
          time_label: i.time_label,
          category: i.category,
          task: i.task,
          done: i.done,
          signature: i.signature,
          note: noteDrafts[i.id] ?? i.note,
        })),
      });
      toast.success(blank ? "Tom checklista skapad." : "Checklista-PDF skapad.");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte skapa PDF.");
    }
  };



  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label="Tillbaka">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-base sm:text-xl font-heading font-bold text-foreground truncate">{title}</h1>
          {isCompleted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-600 px-2 py-0.5 text-[10px] font-semibold">
              <CheckCircle2 className="h-3 w-3" /> Slutförd
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handlePrint(false)}>
            <Printer className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Skriv ut</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handlePrint(true)}>
            <FileText className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Tom lista</span>
          </Button>
          {!locked && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => openAdd(sections[0] || "Övrigt")}
            >
              <Plus className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Ny rad</span>
            </Button>
          )}
          {!locked && (
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                markAll.mutate(day.id, {
                  onSuccess: () => toast.success("Alla uppgifter markerade som klara."),
                })
              }
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Markera alla
            </Button>
          )}
        </div>
      </div>

      {/* Meta bar */}
      <div className="rounded-lg border border-border bg-card shadow-card overflow-hidden">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-stretch divide-x divide-y sm:divide-y-0 divide-border">
          <MetaCell label="Datum" value={day.checklist_date} />
          <MetaCell label="Veckodag" value={weekdayName(day.checklist_date)} />
          <MetaCell label="Ansvarig" value={day.responsible_name || "–"} />
          <MetaCell label="Pass" value={day.shift} />
          <div className="col-span-2 px-3 py-2 sm:px-4 sm:py-2.5 flex-1 sm:min-w-[180px]">
            <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-muted-foreground">Framsteg</p>
            <Progress value={pct} className="h-2 mt-1.5" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {doneCount} av {items.length} klara ({pct}%)
            </p>
          </div>
          <div className="col-span-2 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Sida {current + 1} av {pages}
            </p>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobil: kortlista med stora kryssrutor — ingen sidledes scroll */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => {
          if (row.kind === "section") {
            return (
              <div key={`ms-${row.label}`} className="flex items-center justify-between pt-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{row.label}</p>
                {!locked && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => openAdd(row.label)}>
                    <Plus className="h-3 w-3 mr-1" /> Ny rad
                  </Button>
                )}
              </div>
            );
          }

          if (row.kind === "add") {
            if (locked || addSection !== row.label) return null;
            return (
              <div key={`ma-${row.label}`} className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 space-y-2">
                <Input
                  autoFocus
                  value={addDraft.task}
                  placeholder="Vad ska göras?"
                  className="h-9 text-sm"
                  onChange={(e) => setAddDraft((d) => ({ ...d, task: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && submitAdd(row.label)}
                />
                <div className="flex gap-2">
                  <Input
                    value={addDraft.time}
                    placeholder="07:30"
                    className="h-9 w-24 text-sm text-center font-mono tabular-nums"
                    onChange={(e) => setAddDraft((d) => ({ ...d, time: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && submitAdd(row.label)}
                  />
                  <Input
                    value={addDraft.category}
                    placeholder="Kategori"
                    className="h-9 flex-1 text-sm"
                    onChange={(e) => setAddDraft((d) => ({ ...d, category: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && submitAdd(row.label)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-9" disabled={addItem.isPending} onClick={() => submitAdd(row.label)}>
                    Lägg till
                  </Button>
                  <Button variant="outline" size="sm" className="h-9" onClick={() => setAddSection(null)}>
                    Avbryt
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={`m-${row.item.id}`}
              className={cn(
                "rounded-lg border border-border bg-card shadow-card p-2.5",
                row.item.done && "border-emerald-600/40 bg-emerald-500/10"
              )}
            >
              <div className="flex items-start gap-2.5">
                <label className="flex items-center justify-center h-10 w-10 shrink-0 -m-1 cursor-pointer">
                  <Checkbox
                    checked={row.item.done}
                    disabled={locked}
                    onCheckedChange={(v) => toggle.mutate({ id: row.item.id, done: !!v })}
                    className="h-6 w-6 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                    aria-label={`Markera klar: ${row.item.task}`}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-foreground break-words">{row.item.task}</p>
                  <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {locked ? (
                      row.item.time_label && <span className="font-mono tabular-nums">{row.item.time_label}</span>
                    ) : (
                      <Input
                        value={timeDrafts[row.item.id] ?? row.item.time_label ?? ""}
                        placeholder="––:––"
                        inputMode="numeric"
                        className="h-8 w-[4.5rem] text-xs text-center font-mono tabular-nums"
                        onChange={(e) => setTimeDrafts((d) => ({ ...d, [row.item.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        onBlur={() => commitTime(row.item)}
                        aria-label={`Tid för ${row.item.task}`}
                      />
                    )}
                    {row.item.category && <span>{row.item.category}</span>}
                    {readOnly
                      ? row.item.signature && (
                          <span className="font-semibold text-foreground">✓ {row.item.signature}</span>
                        )
                      : (row.item.signature || row.item.done) && (
                          <SignatureEditor item={row.item} storeId={day.store_id} allItems={items} pendingRequests={pendingRequests} />
                        )}

                  </div>
                </div>
                {!locked && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem.mutate({ id: row.item.id })}
                    aria-label={`Ta bort ${row.item.task}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="mt-1.5 pl-[3.25rem]">
                {locked ? (
                  <p className="text-[11px] text-muted-foreground">
                    {row.item.note ? `Kommentar: ${row.item.note}` : "Ingen kommentar"}
                  </p>
                ) : (
                  <Input
                    value={noteDrafts[row.item.id] ?? row.item.note ?? ""}
                    placeholder="Kommentar / avvikelse"
                    className="h-8 text-xs"
                    onChange={(e) => setNoteDrafts((d) => ({ ...d, [row.item.id]: e.target.value }))}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== (row.item.note ?? "")) setNote.mutate({ id: row.item.id, note: v });
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: tabell */}
      <div className="hidden md:block rounded-lg border border-border bg-card shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="text-center font-semibold px-3 py-2.5 w-20 border-r border-border">Tid</th>
              <th className="text-left font-semibold px-3 py-2.5 w-40 border-r border-border">Kategori</th>
              <th className="text-left font-semibold px-3 py-2.5 border-r border-border">Uppgift</th>
              <th className="text-center font-semibold px-3 py-2.5 w-20 border-r border-border">Klar</th>
              <th className="text-center font-semibold px-3 py-2.5 w-64 border-r border-border">Kommentar / Avvikelse</th>
              <th className="text-center font-semibold px-3 py-2.5 w-24 border-r border-border">Signatur</th>
              <th className="w-10 px-1 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (row.kind === "section") {
                return (
                  <tr key={`s-${row.label}`} className="bg-muted/70">
                    <td colSpan={7} className="px-3 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">{row.label}</span>
                        {!locked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => openAdd(row.label)}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Lägg till rad
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }

              if (row.kind === "add") {
                if (locked) return null;
                if (addSection !== row.label) {
                  return (
                    <tr key={`a-${row.label}`} className="border-t border-border">
                      <td colSpan={7} className="px-3 py-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => openAdd(row.label)}
                        >
                          <Plus className="h-3 w-3" /> Ny rad i {row.label.toLowerCase()}
                        </button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={`a-${row.label}`} className="border-t border-border bg-primary/5">
                    <td className="px-2 py-1.5 border-r border-border">
                      <Input
                        value={addDraft.time}
                        placeholder="07:30"
                        className="h-7 text-xs text-center font-mono tabular-nums"
                        onChange={(e) => setAddDraft((d) => ({ ...d, time: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitAdd(row.label)}
                      />
                    </td>
                    <td className="px-2 py-1.5 border-r border-border">
                      <Input
                        value={addDraft.category}
                        placeholder="Kategori"
                        className="h-7 text-xs"
                        onChange={(e) => setAddDraft((d) => ({ ...d, category: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitAdd(row.label)}
                      />
                    </td>
                    <td className="px-2 py-1.5 border-r border-border">
                      <Input
                        autoFocus
                        value={addDraft.task}
                        placeholder="Vad ska göras?"
                        className="h-7 text-xs"
                        onChange={(e) => setAddDraft((d) => ({ ...d, task: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && submitAdd(row.label)}
                      />
                    </td>
                    <td colSpan={3} className="px-2 py-1.5 border-r border-border">
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" className="h-7 text-xs" disabled={addItem.isPending} onClick={() => submitAdd(row.label)}>
                          Lägg till
                        </Button>
                        <span className="text-[10px] text-muted-foreground">Enter sparar</span>
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAddSection(null)} aria-label="Avbryt">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr
                  key={row.item.id}
                  className={cn(
                    "border-t border-border transition-colors",
                    row.item.done ? "bg-emerald-500/10" : "hover:bg-muted/30"
                  )}
                >
                  <td className="px-1.5 py-1.5 text-center border-r border-border">
                    {locked ? (
                      <span className="font-mono tabular-nums text-xs text-muted-foreground">
                        {row.item.time_label || "–"}
                      </span>
                    ) : (
                      <Input
                        value={timeDrafts[row.item.id] ?? row.item.time_label ?? ""}
                        placeholder="––:––"
                        className="h-7 text-xs text-center font-mono tabular-nums border-transparent hover:border-input focus:border-input bg-transparent px-1"
                        onChange={(e) => setTimeDrafts((d) => ({ ...d, [row.item.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            setTimeDrafts((d) => {
                              const { [row.item.id]: _drop, ...rest } = d;
                              return rest;
                            });
                            e.currentTarget.blur();
                          }
                        }}
                        onBlur={() => commitTime(row.item)}
                        aria-label={`Tid för ${row.item.task}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground border-r border-border">{row.item.category || "–"}</td>
                  <td className="px-3 py-2 text-foreground border-r border-border">{row.item.task}</td>
                  <td className="px-3 py-2 text-center border-r border-border">
                    <Checkbox
                      checked={row.item.done}
                      disabled={locked}
                      onCheckedChange={(v) => toggle.mutate({ id: row.item.id, done: !!v })}
                      className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                      aria-label={`Markera klar: ${row.item.task}`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center border-r border-border">
                    {locked ? (
                      <span className="text-xs text-muted-foreground">{row.item.note || "–"}</span>
                    ) : (
                      <Input
                        value={noteDrafts[row.item.id] ?? row.item.note ?? ""}
                        placeholder="–"
                        className="h-7 text-xs text-center border-transparent hover:border-input focus:border-input bg-transparent"
                        onChange={(e) => setNoteDrafts((d) => ({ ...d, [row.item.id]: e.target.value }))}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (row.item.note ?? "")) setNote.mutate({ id: row.item.id, note: v });
                        }}
                      />
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 text-center text-xs font-semibold text-foreground border-r border-border">
                    {readOnly ? (
                      row.item.signature || "–"
                    ) : (
                      <SignatureEditor item={row.item} storeId={day.store_id} allItems={items} pendingRequests={pendingRequests} />
                    )}
                  </td>

                  <td className="px-1 py-1.5 text-center">
                    {!locked && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem.mutate({ id: row.item.id })}
                        aria-label={`Ta bort ${row.item.task}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!locked && items.length === 0 && (
        <div className="rounded-lg border border-border bg-card shadow-card p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Checklistan är tom — lägg till den första uppgiften.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={addDraft.time}
              placeholder="07:30"
              className="h-9 sm:w-24 text-sm text-center font-mono tabular-nums"
              onChange={(e) => setAddDraft((d) => ({ ...d, time: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && submitAdd("Övrigt")}
            />
            <Input
              value={addDraft.task}
              placeholder="Vad ska göras?"
              className="h-9 flex-1 text-sm"
              onChange={(e) => setAddDraft((d) => ({ ...d, task: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && submitAdd("Övrigt")}
            />
            <Button size="sm" className="h-9" disabled={addItem.isPending} onClick={() => submitAdd("Övrigt")}>
              <Plus className="h-4 w-4 mr-1" /> Lägg till
            </Button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="rounded-lg border border-border bg-card shadow-card px-3 py-2.5 sm:px-4 sm:py-3 space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
          {current < pages - 1 ? (
            <>
              Fler uppgifter fortsätter på nästa sida <ArrowRight className="h-4 w-4" />
            </>
          ) : (
            <>
              {items.length - doneCount === 0
                ? "Alla uppgifter är klara — checklistan kan slutföras."
                : `${items.length - doneCount} uppgifter kvar innan checklistan kan slutföras.`}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {Array.from({ length: pages }).map((_, i) => (
            <Button
              key={i}
              size="sm"
              variant={i === current ? "default" : "outline"}
              className="h-9 w-9 p-0"
              onClick={() => setPage(i)}
            >
              {i + 1}
            </Button>
          ))}
          <Button variant="outline" size="icon" className="h-9 w-9" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!readOnly && (
            <Button
              className="flex-1 sm:flex-none sm:ml-2 bg-emerald-600 hover:bg-emerald-700 text-primary-foreground"
              disabled={isCompleted || complete.isPending}
              onClick={handleComplete}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              {isCompleted ? "Slutförd" : "Klar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

