import { useEffect, useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  generateInventoryCountListPdf,
  type CountListProduct,
} from "@/lib/inventoryCountListPdf";

const collator = new Intl.Collator("sv");

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: CountListProduct[];
  storeName?: string;
  date?: string;
};

/** Bocka i vilka produkter som ska med på den utskrivna inventeringslistan. */
export default function CountListPrintDialog({
  open,
  onOpenChange,
  products,
  storeName,
  date,
}: Props) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(products.map((p) => p.id)));
      setSearch("");
    }
  }, [open, products]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, CountListProduct[]>();
    products
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          String(p.sku ?? "").toLowerCase().includes(q),
      )
      .forEach((p) => {
        const cat = p.category || "Övrigt";
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(p);
      });
    return Array.from(map.entries())
      .sort((a, b) => collator.compare(a[0], b[0]))
      .map(([cat, items]) => [cat, items.sort((a, b) => collator.compare(a.name, b.name))] as const);
  }, [products, search]);

  const visibleIds = useMemo(() => groups.flatMap(([, items]) => items.map((i) => i.id)), [groups]);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const handlePrint = async () => {
    const list = products.filter((p) => selected.has(p.id));
    if (!list.length) {
      toast({ title: "Välj minst en produkt", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await generateInventoryCountListPdf(list, { storeName, date });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Kunde inte skapa listan", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Välj produkter till inventeringslistan</DialogTitle>
          <DialogDescription className="text-xs">
            {storeName ? `${storeName} · ` : ""}
            {selected.size} av {products.length} produkter valda
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök namn eller SKU"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setMany(visibleIds, true)}>
            Markera alla
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setMany(visibleIds, false)}>
            Rensa
          </Button>
        </div>

        <ScrollArea className="h-[52vh] pr-2">
          <div className="space-y-2">
            {groups.map(([cat, items]) => {
              const ids = items.map((i) => i.id);
              const allOn = ids.every((id) => selected.has(id));
              return (
                <div key={cat} className="rounded-md border">
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-2 py-1">
                    <Checkbox
                      checked={allOn}
                      onCheckedChange={(v) => setMany(ids, v === true)}
                      aria-label={`Välj alla i ${cat}`}
                    />
                    <span className="text-xs font-semibold">{cat}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{items.length} st</span>
                  </div>
                  <div className="divide-y">
                    {items.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-muted/30"
                      >
                        <Checkbox
                          checked={selected.has(p.id)}
                          onCheckedChange={(v) => toggle(p.id, v === true)}
                        />
                        <span className="text-xs truncate">{p.name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {p.sku ? `${p.sku} · ` : ""}
                          {p.unit}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {!groups.length && (
              <p className="text-xs text-muted-foreground py-6 text-center">Inga produkter matchar sökningen.</p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={handlePrint} disabled={busy}>
            <Printer className="h-3.5 w-3.5" />
            {busy ? "Förbereder…" : `Skriv ut (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
