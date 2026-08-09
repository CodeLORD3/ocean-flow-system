import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  Loader2,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  Pencil,
  ArrowUpRight,
  CalendarDays,
  History,
  Copy,

} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSite } from "@/contexts/SiteContext";
import { ChecklistTable } from "@/components/checklist/ChecklistTable";
import { ChecklistCopyDialog } from "@/components/checklist/ChecklistCopyDialog";
import { ChecklistRestoreDialog } from "@/components/checklist/ChecklistRestoreDialog";

import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  useArchiveChecklistTemplate,
  useDeleteChecklistTemplate,
  useRenameChecklistTemplate,
  useChecklistDayItems,
  useChecklistReports,
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDailyChecklist,
  useSetTemplateWeekdays,
  useStoreChecklistHistory,
  useTodayChecklistStatus,
  templateAppliesOn,
  todayIso,
  weekdayName,
  WEEKDAY_SHORT,
  DEFAULT_CHECKLIST_TEMPLATE_ID,
  type ChecklistTemplate,
} from "@/hooks/useChecklist";

function formatToday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ── Öppen checklista (dagens) ─────────────────────────────────────────────── */

function ShopChecklistBody({
  storeId,
  storeName,
  templateId,
  listName,
  onBack,
}: {
  storeId: string;
  storeName: string;
  templateId: string;
  listName: string;
  onBack: () => void;
}) {
  const { data, isLoading } = useDailyChecklist(storeId, undefined, templateId);

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Laddar checklistan…
      </div>
    );
  }

  return (
    <ChecklistTable
      day={data.day}
      items={data.items}
      storeName={storeName}
      onBack={onBack}
      title={`${listName} – ${weekdayName(data.day.checklist_date)} ${data.day.checklist_date}`}
    />
  );
}

/* ── Historikdetalj för butiken ───────────────────────────────────────────── */

function StoreHistoryDetail({
  day,
  storeName,
  onBack,
}: {
  day: any;
  storeName: string;
  onBack: () => void;
}) {
  const { data: items = [], isLoading } = useChecklistDayItems(day.id);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Laddar checklista…
      </div>
    );
  }

  return (
    <ChecklistTable
      day={day}
      items={items}
      readOnly
      onBack={onBack}
      storeName={storeName}
      title={`${day.listName} – ${weekdayName(day.checklist_date)} ${day.checklist_date}`}
    />
  );
}

/* ── Landningssida för butiken ────────────────────────────────────────────── */

function ShopChecklistLanding({ storeId, storeName }: { storeId: string; storeName: string }) {
  const iso = todayIso();
  const { data: templates = [], isLoading } = useChecklistTemplates(storeId);
  const { data: status = {} } = useTodayChecklistStatus(storeId);
  const { data: history = [], isLoading: histLoading } = useStoreChecklistHistory(storeId);

  const [openTemplate, setOpenTemplate] = useState<ChecklistTemplate | null>(null);
  const [openHistoryDay, setOpenHistoryDay] = useState<any | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWeekdays, setNewWeekdays] = useState<number[]>([]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);


  const create = useCreateChecklistTemplate();
  const archive = useArchiveChecklistTemplate();
  const hardDelete = useDeleteChecklistTemplate();
  const rename = useRenameChecklistTemplate();
  const [deleteTarget, setDeleteTarget] = useState<ChecklistTemplate | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChecklistTemplate | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const setWeekdays = useSetTemplateWeekdays();
  const { staff } = useStaffAuth();
  const isAdmin = ((staff?.portal_access ?? []) as string[]).includes("admin");

  const todays = useMemo(() => templates.filter((t) => templateAppliesOn(t, iso)), [templates, iso]);
  const others = useMemo(() => templates.filter((t) => !templateAppliesOn(t, iso)), [templates, iso]);

  const handleCreate = async () => {
    try {
      const tpl = await create.mutateAsync({ name: newName, storeId });
      if (newWeekdays.length > 0 && newWeekdays.length < 7) {
        await setWeekdays.mutateAsync({ id: tpl.id, weekdays: newWeekdays });
      }
      setNewName("");
      setNewWeekdays([]);
      setNewOpen(false);
      toast.success(`Checklistan "${tpl.name}" skapad`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte skapa checklistan");
    }
  };


  const handleArchive = async (id: string, name: string) => {
    try {
      await archive.mutateAsync(id);
      toast.success(`"${name}" togs bort från menyn`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte ta bort checklistan");
    }
  };

  const canHardDelete = !!deleteTarget;

  const handleHardDelete = async (tpl: ChecklistTemplate) => {
    try {
      await hardDelete.mutateAsync({ id: tpl.id, force: true });
      setDeleteTarget(null);
      toast.success(`"${tpl.name}" raderades permanent`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte radera checklistan");
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    try {
      await rename.mutateAsync({ id: renameTarget.id, name: renameValue });
      setRenameTarget(null);
      toast.success("Namnet uppdaterat");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte byta namn");
    }
  };

  const toggleWeekday = async (tpl: ChecklistTemplate, day: number) => {
    const current = tpl.weekdays ?? [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    try {
      await setWeekdays.mutateAsync({ id: tpl.id, weekdays: next });
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte spara veckoschemat");
    }
  };

  if (openTemplate) {
    return (
      <ShopChecklistBody
        key={openTemplate.id}
        storeId={storeId}
        storeName={storeName}
        templateId={openTemplate.id}
        listName={openTemplate.name}
        onBack={() => setOpenTemplate(null)}
      />
    );
  }

  if (openHistoryDay) {
    return (
      <StoreHistoryDetail day={openHistoryDay} storeName={storeName} onBack={() => setOpenHistoryDay(null)} />
    );
  }

  const listRow = (t: ChecklistTemplate, dimmed = false) => {
    const s = status[t.id];
    const done = s?.status === "completed";
    return (
      <button
        key={t.id}
        onClick={() => setOpenTemplate(t)}
        className={cn(
          "group flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40",
          done && "border-emerald-600/40 bg-emerald-500/5",
          dimmed && "opacity-70",
        )}
      >
        <ClipboardCheck className={cn("h-4 w-4 shrink-0", done ? "text-emerald-500" : "text-primary")} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {(t.weekdays ?? []).length === 0
              ? "Alla dagar"
              : t.weekdays.map((d) => WEEKDAY_SHORT[d]).join(", ")}
            {s?.responsible ? ` · ${s.responsible}` : ""}
          </p>
        </div>
        <span className="shrink-0 font-mono tabular-nums text-xs text-muted-foreground">
          {s ? `${s.done}/${s.total}` : "–"}
        </span>
        {done ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : s ? (
          <Clock className="h-4 w-4 shrink-0 text-amber-500" />
        ) : null}
        {isAdmin && (
          <span onClick={(e) => e.stopPropagation()} className="shrink-0">
            <ChecklistCopyDialog
              template={t}
              sourceStoreId={storeId}
              trigger={
                <span
                  role="button"
                  aria-label={`Kopiera ${t.name} till andra butiker`}
                  title="Kopiera till andra butiker"
                  className="text-muted-foreground hover:text-primary"
                >
                  <Copy className="h-3.5 w-3.5" />
                </span>
              }
            />
          </span>
        )}
        <>
          <span
            role="button"
            aria-label={`Byt namn på ${t.name}`}
            className="shrink-0 text-muted-foreground hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              setRenameTarget(t);
              setRenameValue(t.name);
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </span>
          <span
            role="button"
            aria-label={`Radera ${t.name}`}
            title="Radera checklista"
            className="shrink-0 text-destructive hover:text-destructive/80"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(t);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </span>
        </>


        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-xl font-bold text-foreground">
            <ClipboardCheck className="h-5 w-5 text-primary" /> Checklistor
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {storeName} · <span className="capitalize">{formatToday(iso)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          title="Historik – alla tidigare checklistor"
          aria-label="Visa historik"
          onClick={() => setHistoryOpen(true)}
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          title="Veckoschema – välj vilka dagar checklistorna gäller"
          aria-label="Veckoschema"
          onClick={() => setScheduleOpen(true)}
        >
          <CalendarDays className="h-4 w-4" />
        </Button>
        {isAdmin && <ChecklistRestoreDialog storeId={storeId} />}

        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary" className="h-8 gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Ny checklista
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Ny checklista</DialogTitle>
            </DialogHeader>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="T.ex. Veckostädning"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-foreground">Vilka dagar ska den göras?</p>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const on = newWeekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setNewWeekdays((prev) =>
                          prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                        )
                      }
                      className={cn(
                        "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {WEEKDAY_SHORT[d]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {newWeekdays.length === 0 || newWeekdays.length === 7
                  ? "Inga dagar valda = listan gäller alla dagar."
                  : `Schemaläggs: ${[1, 2, 3, 4, 5, 6, 0].filter((d) => newWeekdays.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(", ")}`}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Listan skapas tom — lägg till uppgifterna direkt i tabellen.
            </p>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setNewOpen(false)}>
                Avbryt
              </Button>
              <Button onClick={handleCreate} disabled={create.isPending || !newName.trim()}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Skapa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading">
            Dagens checklistor · {weekdayName(iso)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Laddar checklistor…</p>
          ) : todays.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ingen checklista är schemalagd för {weekdayName(iso).toLowerCase()}. Se veckoschemat nedan.
            </p>
          ) : (
            todays.map((t) => listRow(t))
          )}
        </CardContent>
      </Card>

      {others.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">Övriga checklistor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">{others.map((t) => listRow(t, true))}</CardContent>
        </Card>
      )}

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-heading">
              <CalendarDays className="h-4 w-4 text-primary" /> Veckoschema
            </DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground">
            Klicka i vilka veckodagar varje checklista gäller. Inga dagar valda = gäller alla dagar.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 text-left font-semibold">Checklista</th>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <th
                      key={d}
                      className={cn(
                        "w-12 py-2 text-center font-semibold",
                        d === new Date().getDay() && "text-primary",
                      )}
                    >
                      {WEEKDAY_SHORT[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b border-border/60">
                    <td className="py-2 pr-2 text-xs sm:text-sm">{t.name}</td>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                      const on = (t.weekdays ?? []).includes(d);
                      const all = (t.weekdays ?? []).length === 0;
                      return (
                        <td key={d} className="py-1.5 text-center">
                          <button
                            aria-label={`${t.name} ${WEEKDAY_SHORT[d]}`}
                            onClick={() => toggleWeekday(t, d)}
                            className={cn(
                              "mx-auto flex h-6 w-6 items-center justify-center rounded border text-[10px] transition-colors",
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : all
                                  ? "border-dashed border-primary/40 text-primary/60"
                                  : "border-border text-muted-foreground hover:border-primary/50",
                            )}
                          >
                            {on ? "✓" : all ? "•" : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-heading">
              <History className="h-4 w-4 text-primary" /> Historik
            </DialogTitle>
          </DialogHeader>
          {histLoading ? (
            <p className="text-xs text-muted-foreground">Laddar…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Inga tidigare checklistor ännu.</p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                  <th className="py-2 text-left font-semibold">Datum</th>
                  <th className="hidden py-2 text-left font-semibold md:table-cell">Veckodag</th>
                  <th className="py-2 text-left font-semibold">Checklista</th>
                  <th className="hidden py-2 text-left font-semibold md:table-cell">Ansvarig</th>
                  <th className="w-14 py-2 text-center font-semibold">Klara</th>
                  <th className="hidden py-2 text-left font-semibold sm:table-cell">Status</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {history.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2 font-mono tabular-nums text-[11px] sm:text-xs">{r.checklist_date}</td>
                    <td className="hidden py-2 text-xs text-muted-foreground md:table-cell">
                      {weekdayName(r.checklist_date)}
                    </td>
                    <td className="truncate py-2 pr-2 text-xs sm:text-sm">{r.listName}</td>
                    <td className="hidden py-2 text-xs text-muted-foreground md:table-cell">
                      {r.completed_by_name || r.responsible_name || "–"}
                    </td>
                    <td className="py-2 text-center font-mono tabular-nums text-[11px] sm:text-xs">
                      {r.doneCount}/{r.total}
                    </td>
                    <td className="hidden py-2 sm:table-cell">
                      {r.status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Slutförd
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                          <Clock className="h-3 w-3" /> Pågående
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => {
                          setHistoryOpen(false);
                          setOpenHistoryDay(r);
                        }}
                      >
                        Visa
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>


      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Byt namn på checklistan</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Avbryt
            </Button>
            <Button onClick={handleRename} disabled={rename.isPending || !renameValue.trim()}>
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ta bort "{deleteTarget?.name}"</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Arkivera döljer listan i menyn men behåller historiken — den kan återställas senare. Radera
            permanent tar bort listan, alla dess uppgifter och all historik — det går inte att ångra.
          </p>
          {deleteTarget && deleteTarget.store_id === null && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Detta är en gemensam checklista som gäller alla butiker — permanent radering tar bort den
              för samtliga butiker.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Avbryt
            </Button>
            <Button
              variant="outline"
              disabled={archive.isPending}
              onClick={async () => {
                if (!deleteTarget) return;
                await handleArchive(deleteTarget.id, deleteTarget.name);
                setDeleteTarget(null);
              }}
            >
              Arkivera
            </Button>
            {canHardDelete && (
              <Button
                variant="destructive"
                disabled={hardDelete.isPending}
                onClick={() => deleteTarget && handleHardDelete(deleteTarget)}
              >
                Radera permanent
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Admin/grossist: rapportvy ────────────────────────────────────────────── */

function ChecklistReportDetail({ dayId, onBack }: { dayId: string; onBack: () => void }) {
  const { data: reports = [] } = useChecklistReports();
  const { data: items = [], isLoading } = useChecklistDayItems(dayId);
  const day = reports.find((r: any) => r.id === dayId);

  if (isLoading || !day) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Laddar rapport…
      </div>
    );
  }

  return (
    <ChecklistTable
      day={day}
      items={items}
      readOnly
      onBack={onBack}
      storeName={day.storeName}
      title={`${day.storeName} · ${day.listName ?? "Checklista"} – ${weekdayName(day.checklist_date)} ${day.checklist_date}`}
    />
  );
}

function ChecklistReports() {
  const { data: reports = [], isLoading } = useChecklistReports();
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) return <ChecklistReportDetail dayId={openId} onBack={() => setOpenId(null)} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-xl font-bold text-foreground">
          <ClipboardCheck className="h-5 w-5 text-primary" /> Checklistor
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="capitalize">{formatToday(todayIso())}</span> · dagliga checklistor från butikerna
        </p>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading">Rapporter</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Laddar…</p>
          ) : reports.length === 0 ? (
            <p className="text-xs text-muted-foreground">Inga checklistor har rapporterats in ännu.</p>
          ) : (
            <>
              {/* Mobil: kortlista istället för trång tabell */}
              <div className="space-y-2 sm:hidden">
                {reports.map((r: any) => (
                  <button
                    key={r.id}
                    onClick={() => setOpenId(r.id)}
                    className="w-full rounded-lg border border-border bg-card p-3 text-left active:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{r.storeName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{r.listName}</p>
                      </div>
                      {r.status === "completed" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Slutförd
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-600">
                          <Clock className="h-3 w-3" /> Pågående
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        {r.checklist_date} · {weekdayName(r.checklist_date)}
                      </span>
                      <span className="font-mono tabular-nums text-foreground">
                        {r.doneCount}/{r.total} klara
                      </span>
                    </div>
                    {r.responsible_name && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">Ansvarig: {r.responsible_name}</p>
                    )}
                  </button>
                ))}
              </div>

              <table className="hidden w-full table-fixed text-sm sm:table">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground sm:text-[11px]">
                    <th className="py-2 text-left font-semibold">Datum</th>
                    <th className="hidden py-2 text-left font-semibold md:table-cell">Veckodag</th>
                    <th className="py-2 text-left font-semibold">Butik</th>
                    <th className="py-2 text-left font-semibold">Checklista</th>
                    <th className="hidden py-2 text-left font-semibold md:table-cell">Ansvarig</th>
                    <th className="w-14 py-2 text-center font-semibold">Klara</th>
                    <th className="py-2 text-left font-semibold">Status</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r: any) => (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="py-2 font-mono tabular-nums text-[11px] sm:text-xs">{r.checklist_date}</td>
                      <td className="hidden py-2 text-xs text-muted-foreground md:table-cell">
                        {weekdayName(r.checklist_date)}
                      </td>
                      <td className="truncate py-2 pr-2 text-xs sm:text-sm">{r.storeName}</td>
                      <td className="truncate py-2 pr-2 text-xs text-muted-foreground">{r.listName}</td>
                      <td className="hidden py-2 text-xs text-muted-foreground md:table-cell">
                        {r.responsible_name || "–"}
                      </td>
                      <td className="py-2 text-center font-mono tabular-nums text-[11px] sm:text-xs">
                        {r.doneCount}/{r.total}
                      </td>
                      <td className="py-2">
                        {r.status === "completed" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Slutförd
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                            <Clock className="h-3 w-3" /> Pågående
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => setOpenId(r.id)}>
                          Visa
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

        </CardContent>
      </Card>
    </div>
  );
}

export default function Checklist() {
  const { site, activeStoreId, activeStoreName } = useSite();
  const isShop = site === "shop" && !!activeStoreId;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {isShop ? (
        <ShopChecklistLanding storeId={activeStoreId!} storeName={activeStoreName || "Butik"} />
      ) : (
        <ChecklistReports />
      )}
    </motion.div>
  );
}
