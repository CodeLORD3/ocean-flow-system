import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { IndustryButton, IndustryInput, IndustryRow, SectionLabel, StatusLabel } from "@/components/industry";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStores } from "@/hooks/useStores";
import { useDeleteTemplate, useSaveTemplate, useShiftTemplates } from "@/hooks/useSchedule";
import type { ShiftTemplate } from "@/lib/schedule";

const weekdays = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

type Draft = { name: string; weekday: string; start_time: string; end_time: string; break_minutes: string; count: string };
const emptyDraft: Draft = { name: "", weekday: "1", start_time: "08:00", end_time: "17:00", break_minutes: "30", count: "1" };

export function ShiftTemplatesPanel() {
  const { data: stores = [] } = useStores(true);
  const [storeId, setStoreId] = useState("");
  const activeStoreId = storeId || stores[0]?.id || "";
  const { data: templates = [], isLoading } = useShiftTemplates(activeStoreId);
  const save = useSaveTemplate();
  const remove = useDeleteTemplate();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  const grouped = useMemo(() => [...templates].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)), [templates]);
  const update = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const edit = (template: ShiftTemplate) => {
    setEditingId(template.id);
    setDraft({ name: template.name, weekday: String(template.weekday), start_time: template.start_time.slice(0, 5), end_time: template.end_time.slice(0, 5), break_minutes: String(template.break_minutes), count: String(template.count) });
  };
  const reset = () => { setEditingId(null); setDraft(emptyDraft); };
  const submit = async () => {
    if (!activeStoreId || !draft.name.trim() || !draft.start_time || !draft.end_time) return;
    try {
      await save.mutateAsync({ id: editingId ?? undefined, store_id: activeStoreId, name: draft.name.trim(), weekday: Number(draft.weekday), start_time: draft.start_time, end_time: draft.end_time, break_minutes: Math.max(0, Number(draft.break_minutes) || 0), count: Math.max(1, Number(draft.count) || 1) });
      toast.success(editingId ? "Passmallen uppdaterad" : "Passmall sparad");
      reset();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Kunde inte spara passmallen"); }
  };
  const deleteTemplate = async (id: string) => {
    try { await remove.mutateAsync(id); toast.success("Passmallen borttagen"); if (editingId === id) reset(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Kunde inte ta bort passmallen"); }
  };

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><SectionLabel>Passmallar</SectionLabel><p className="ind-muted text-sm">Konfigurera återkommande pass per enhet. Mallarna används när en vecka skapas.</p></div>
      <div className="min-w-[220px]"><SectionLabel>Enhet</SectionLabel><Select value={activeStoreId} onValueChange={(value) => { setStoreId(value); reset(); }}><SelectTrigger><SelectValue placeholder="Välj enhet" /></SelectTrigger><SelectContent>{stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent></Select></div>
    </div>
    <div className="grid gap-3 rounded-[var(--radius-md)] border border-border p-3 md:grid-cols-[1.4fr_1fr_1fr_1fr_100px_90px_auto] md:items-end">
      <div><SectionLabel>Namn</SectionLabel><IndustryInput className="w-full" placeholder="Öppning" value={draft.name} onChange={(event) => update("name", event.target.value)} /></div>
      <div><SectionLabel>Veckodag</SectionLabel><Select value={draft.weekday} onValueChange={(value) => update("weekday", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{weekdays.map((day, index) => <SelectItem key={day} value={String(index + 1)}>{day}</SelectItem>)}</SelectContent></Select></div>
      <div><SectionLabel>Från</SectionLabel><IndustryInput className="w-full" type="time" value={draft.start_time} onChange={(event) => update("start_time", event.target.value)} /></div>
      <div><SectionLabel>Till</SectionLabel><IndustryInput className="w-full" type="time" value={draft.end_time} onChange={(event) => update("end_time", event.target.value)} /></div>
      <div><SectionLabel>Rast min</SectionLabel><IndustryInput className="w-full" type="number" min="0" step="5" value={draft.break_minutes} onChange={(event) => update("break_minutes", event.target.value)} /></div>
      <div><SectionLabel>Antal</SectionLabel><IndustryInput className="w-full" type="number" min="1" step="1" value={draft.count} onChange={(event) => update("count", event.target.value)} /></div>
      <div className="flex gap-2"><IndustryButton variant="primary" corners disabled={!activeStoreId || !draft.name.trim() || save.isPending} onClick={() => void submit()}><Plus className="h-4 w-4" />{editingId ? "Spara" : "Lägg till"}</IndustryButton>{editingId && <IndustryButton variant="ghost" onClick={reset}>Avbryt</IndustryButton>}</div>
    </div>
    <div className="space-y-1">
      {isLoading ? <p className="ind-muted text-sm">Läser passmallar…</p> : grouped.length === 0 ? <IndustryRow edge="neutral"><p className="ind-muted text-sm">Inga passmallar för enheten ännu. Lägg till den första ovan.</p></IndustryRow> : grouped.map((template) => <IndustryRow key={template.id} edge="neutral" className="flex-wrap gap-3"><div className="min-w-[180px] flex-1"><p className="font-medium">{template.name}</p><p className="ind-muted text-xs">{weekdays[template.weekday - 1] ?? "—"} · <span className="ind-mono">{template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)}</span> · rast <span className="ind-mono">{template.break_minutes} min</span></p></div><StatusLabel tone="neutral">{template.count} {template.count === 1 ? "plats" : "platser"}</StatusLabel><IndustryButton variant="ghost" size="touch" aria-label={`Redigera ${template.name}`} onClick={() => edit(template)}><Pencil className="h-4 w-4" /></IndustryButton><IndustryButton variant="ghost" size="touch" aria-label={`Ta bort ${template.name}`} onClick={() => void deleteTemplate(template.id)}><Trash2 className="h-4 w-4" /></IndustryButton></IndustryRow>)}
    </div>
  </section>;
}
