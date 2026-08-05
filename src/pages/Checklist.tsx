import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardCheck, Loader2, CheckCircle2, Clock, Plus, Trash2 } from "lucide-react";
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
import { useSite } from "@/contexts/SiteContext";
import { ChecklistTable } from "@/components/checklist/ChecklistTable";
import {
  useArchiveChecklistTemplate,
  useChecklistDayItems,
  useChecklistReports,
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDailyChecklist,
  weekdayName,
  DEFAULT_CHECKLIST_TEMPLATE_ID,
} from "@/hooks/useChecklist";

function ShopChecklistBody({
  storeId,
  storeName,
  templateId,
  listName,
}: {
  storeId: string;
  storeName: string;
  templateId: string;
  listName: string;
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
      title={`${listName} – ${weekdayName(data.day.checklist_date)} ${data.day.checklist_date}`}
    />
  );
}

function ShopChecklist({ storeId, storeName }: { storeId: string; storeName: string }) {
  const { data: templates = [], isLoading } = useChecklistTemplates(storeId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const create = useCreateChecklistTemplate();
  const archive = useArchiveChecklistTemplate();

  useEffect(() => {
    if (!activeId && templates.length > 0) setActiveId(templates[0].id);
    if (activeId && templates.length > 0 && !templates.some((t) => t.id === activeId)) {
      setActiveId(templates[0].id);
    }
  }, [templates, activeId]);

  const active = templates.find((t) => t.id === activeId) ?? null;

  const handleCreate = async () => {
    try {
      const tpl = await create.mutateAsync({ name: newName, storeId });
      setActiveId(tpl.id);
      setNewName("");
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {isLoading && <span className="text-xs text-muted-foreground">Laddar checklistor…</span>}
          {templates.map((t) => (
            <div key={t.id} className="group relative">
              <Button
                size="sm"
                variant={t.id === activeId ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setActiveId(t.id)}
              >
                {t.name}
              </Button>
              {t.id !== DEFAULT_CHECKLIST_TEMPLATE_ID && t.store_id === storeId && (
                <button
                  aria-label={`Ta bort ${t.name}`}
                  className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-background p-0.5 text-destructive shadow group-hover:block"
                  onClick={() => handleArchive(t.id, t.name)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

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

      {active ? (
        <ShopChecklistBody
          key={active.id}
          storeId={storeId}
          storeName={storeName}
          templateId={active.id}
          listName={active.name}
        />
      ) : (
        !isLoading && (
          <p className="p-6 text-sm text-muted-foreground">
            Inga checklistor ännu — skapa din första med "Ny checklista".
          </p>
        )
      )}
    </div>
  );
}


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
      title={`${day.storeName} – ${weekdayName(day.checklist_date)} ${day.checklist_date}`}
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
        <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" /> Checklistor
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Dagliga checklistor från butikerna — slutförda listor sparas som rapporter.
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
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="text-left font-semibold py-2">Datum</th>
                  <th className="text-left font-semibold py-2 hidden md:table-cell">Veckodag</th>
                  <th className="text-left font-semibold py-2">Butik</th>
                  <th className="text-left font-semibold py-2 hidden md:table-cell">Ansvarig</th>
                  <th className="text-center font-semibold py-2 w-14">Klara</th>
                  <th className="text-left font-semibold py-2 hidden sm:table-cell">Status</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {reports.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="py-2 font-mono tabular-nums text-[11px] sm:text-xs">{r.checklist_date}</td>
                    <td className="py-2 text-xs text-muted-foreground hidden md:table-cell">{weekdayName(r.checklist_date)}</td>
                    <td className="py-2 text-xs sm:text-sm truncate pr-2">{r.storeName}</td>
                    <td className="py-2 text-xs text-muted-foreground hidden md:table-cell">{r.responsible_name || "–"}</td>
                    <td className="py-2 text-center font-mono tabular-nums text-[11px] sm:text-xs">
                      {r.doneCount}/{r.total}
                    </td>
                    <td className="py-2 hidden sm:table-cell">
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
                      <Button variant="outline" size="sm" className="h-8 text-xs px-2" onClick={() => setOpenId(r.id)}>
                        Visa
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

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
        <ShopChecklist storeId={activeStoreId!} storeName={activeStoreName || "Butik"} />
      ) : (
        <ChecklistReports />
      )}
    </motion.div>
  );
}
