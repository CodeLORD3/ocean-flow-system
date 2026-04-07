import { useState, useMemo } from "react";
import { useSite } from "@/contexts/SiteContext";
import { useShopWishes } from "@/hooks/useShopWishes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Plus, CalendarIcon, ArrowUpDown, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type SortKey = "date" | "category";

const STATUS_OPTIONS = [
  { value: "Inget", label: "Inget", color: "bg-muted-foreground/40" },
  { value: "Pågående", label: "Pågående", color: "bg-amber-500" },
  { value: "Klar", label: "Klar", color: "bg-emerald-500" },
] as const;

export default function ShopWishes() {
  const { activeStoreId } = useSite();
  const { wishes, isLoading, addWish, updateStatus, archiveWish } = useShopWishes(activeStoreId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [category, setCategory] = useState<string>("Butik");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(true);

  const activeWishes = useMemo(() => {
    const filtered = wishes.filter((w) => !w.archived);
    return [...filtered].sort((a, b) => {
      if (sortKey === "category") {
        const cmp = a.category.localeCompare(b.category);
        return sortAsc ? cmp : -cmp;
      }
      const da = a.due_date || "9999-12-31";
      const db = b.due_date || "9999-12-31";
      const cmp = da.localeCompare(db);
      return sortAsc ? cmp : -cmp;
    });
  }, [wishes, sortKey, sortAsc]);

  const archivedWishes = useMemo(() => wishes.filter((w) => w.archived), [wishes]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const handleAdd = () => {
    if (!title.trim() || !activeStoreId) return;
    addWish.mutate(
      { title: title.trim(), description: description.trim() || undefined, due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : undefined, category, store_id: activeStoreId },
      {
        onSuccess: () => {
          toast({ title: "Önskemål tillagt" });
          setTitle(""); setDescription(""); setDueDate(undefined); setCategory("Butik"); setDialogOpen(false);
        },
      }
    );
  };

  const StatusSquare = ({ status, wishId }: { status: string; wishId: string }) => {
    const current = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
    const nextIdx = (STATUS_OPTIONS.findIndex((s) => s.value === status) + 1) % STATUS_OPTIONS.length;
    const next = STATUS_OPTIONS[nextIdx];
    return (
      <button
        onClick={() => updateStatus.mutate({ id: wishId, status: next.value })}
        className="flex items-center gap-2 group"
        title={`Klicka för att ändra till "${next.label}"`}
      >
        <span className={cn("inline-block w-3.5 h-3.5 rounded-sm", current.color)} />
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{current.label}</span>
      </button>
    );
  };

  const WishTable = ({ items, showArchiveBtn }: { items: typeof wishes; showArchiveBtn: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">Status</TableHead>
          <TableHead>Önskemål</TableHead>
          <TableHead>
            <button className="flex items-center gap-1" onClick={() => handleSort("category")}>
              Typ <ArrowUpDown className="h-3 w-3" />
            </button>
          </TableHead>
          <TableHead>
            <button className="flex items-center gap-1" onClick={() => handleSort("date")}>
              Datum <ArrowUpDown className="h-3 w-3" />
            </button>
          </TableHead>
          {showArchiveBtn && <TableHead className="w-20" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 && (
          <TableRow><TableCell colSpan={showArchiveBtn ? 5 : 4} className="text-center text-muted-foreground py-8">Inga önskemål</TableCell></TableRow>
        )}
        {items.map((w) => (
          <TableRow key={w.id}>
            <TableCell><StatusSquare status={w.status} wishId={w.id} /></TableCell>
            <TableCell>
              <div className="font-medium text-sm">{w.title}</div>
              {w.description && <div className="text-xs text-muted-foreground line-clamp-1">{w.description}</div>}
            </TableCell>
            <TableCell>
              <Badge variant={w.category === "Kund" ? "default" : "secondary"} className="text-[10px]">{w.category}</Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground font-mono">
              {w.due_date ? format(parseISO(w.due_date), "d MMM yyyy", { locale: sv }) : "—"}
            </TableCell>
            {showArchiveBtn && (
              <TableCell>
                <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-destructive" onClick={() => archiveWish.mutate(w.id)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Rensa
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Önskemål</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Lägg till önskemål</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nytt önskemål</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Namn *</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ange önskemål..." />
              </div>
              <div>
                <label className="text-sm font-medium">Beskrivning</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beskriv önskemålet..." rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Typ</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Kund">Kund</SelectItem>
                      <SelectItem value="Butik">Butik</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Önskat datum</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, "d MMM yyyy", { locale: sv }) : "Välj datum"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <Button className="w-full" onClick={handleAdd} disabled={!title.trim() || addWish.isPending}>
                {addWish.isPending ? "Sparar..." : "Skapa önskemål"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Aktiva ({activeWishes.length})</TabsTrigger>
          <TabsTrigger value="archive">Arkiv ({archivedWishes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          {isLoading ? <p className="text-sm text-muted-foreground py-8 text-center">Laddar...</p> : <WishTable items={activeWishes} showArchiveBtn />}
        </TabsContent>
        <TabsContent value="archive">
          {isLoading ? <p className="text-sm text-muted-foreground py-8 text-center">Laddar...</p> : <WishTable items={archivedWishes} showArchiveBtn={false} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
