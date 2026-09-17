import { useMemo, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { cn } from "@/lib/utils";
import { resolveStorageUrl } from "@/lib/signedStorage";
import {
  PAPER_TYPES,
  paperTypeInfo,
  useDeleteImportantPaper,
  useImportantPapers,
  useSaveImportantPaper,
  type ImportantPaper,
  type PaperType,
} from "@/hooks/useImportantPapers";

const nf = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function whenLabel(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `Idag ${time}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (same(d, y)) return `Igår ${time}`;
  return `${d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })} ${time}`;
}

/** Ekonomi → Viktiga papper: kvitton, följesedlar, fakturor, brev och anteckningar. */
export function ImportantPapers({ storeId }: { storeId?: string | null }) {
  const { data: papers = [], isLoading } = useImportantPapers(storeId);
  const save = useSaveImportantPaper();
  const del = useDeleteImportantPaper();

  const [typeFilter, setTypeFilter] = useState<"alla" | PaperType>("alla");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ImportantPaper | null>(null);

  const [form, setForm] = useState({
    paperType: "kvitto" as PaperType,
    companyName: "",
    paperDate: new Date().toISOString().slice(0, 10),
    netAmount: "",
    vatAmount: "",
    grossAmount: "",
    currency: "CHF",
    documentNumber: "",
    description: "",
    title: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of papers) c[p.paper_type] = (c[p.paper_type] ?? 0) + 1;
    return c;
  }, [papers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return papers.filter((p) => {
      if (typeFilter !== "alla" && p.paper_type !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        p.title,
        p.company_name,
        p.description,
        p.document_number,
        p.paper_date,
        p.created_by_name,
        paperTypeInfo(p.paper_type).singular,
        p.net_amount != null ? String(p.net_amount) : null,
        ...(p.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [papers, typeFilter, search]);

  function openNew(type?: PaperType) {
    setEdit(null);
    setFile(null);
    setForm({
      paperType: type ?? (typeFilter === "alla" ? "kvitto" : typeFilter),
      companyName: "",
      paperDate: new Date().toISOString().slice(0, 10),
      netAmount: "",
      vatAmount: "",
      grossAmount: "",
      currency: "CHF",
      documentNumber: "",
      description: "",
      title: "",
    });
    setOpen(true);
  }

  function openEdit(p: ImportantPaper) {
    setEdit(p);
    setFile(null);
    setForm({
      paperType: p.paper_type as PaperType,
      companyName: p.company_name ?? "",
      paperDate: p.paper_date ?? "",
      netAmount: p.net_amount != null ? String(p.net_amount) : "",
      vatAmount: p.vat_amount != null ? String(p.vat_amount) : "",
      grossAmount: p.gross_amount != null ? String(p.gross_amount) : "",
      currency: p.currency ?? "CHF",
      documentNumber: p.document_number ?? "",
      description: p.description ?? "",
      title: p.title ?? "",
    });
    setOpen(true);
  }

  const num = (v: string) => {
    const n = Number(v.replace(",", "."));
    return v.trim() === "" || Number.isNaN(n) ? null : n;
  };

  async function submit() {
    try {
      await save.mutateAsync({
        id: edit?.id,
        storeId: storeId ?? null,
        paperType: form.paperType,
        title: form.title,
        companyName: form.companyName,
        paperDate: form.paperDate || null,
        netAmount: num(form.netAmount),
        vatAmount: num(form.vatAmount),
        grossAmount: num(form.grossAmount),
        currency: form.currency,
        documentNumber: form.documentNumber,
        description: form.description,
        file,
      });
      toast.success(edit ? "Pappret uppdaterat" : "Pappret sparat");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte spara pappret");
    }
  }

  async function openFile(url: string) {
    const signed = await resolveStorageUrl(url);
    if (signed) window.open(signed, "_blank", "noopener");
    else toast.error("Kunde inte öppna filen");
  }

  const chip = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
      active ? "border-transparent text-white shadow-sm" : "border-border bg-card hover:bg-muted",
    );

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <FileText className="h-4 w-4" /> Viktiga papper
            <span className="text-xs font-normal text-muted-foreground tabular-nums">· {papers.length}</span>
          </p>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök företag, belopp, innehåll"
              className="h-9 pl-8"
            />
          </div>
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="mr-1 h-4 w-4" /> Nytt papper
          </Button>
        </div>

        <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
          <button
            type="button"
            onClick={() => setTypeFilter("alla")}
            className={chip(typeFilter === "alla")}
            style={typeFilter === "alla" ? { background: "hsl(var(--primary))" } : undefined}
          >
            Alla papper <span className="tabular-nums opacity-70">{papers.length}</span>
          </button>
          {PAPER_TYPES.map((t) => {
            const active = typeFilter === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTypeFilter(active ? "alla" : t.value)}
                className={chip(active)}
                style={active ? { background: t.color } : { borderColor: `${t.color}66`, color: t.color }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: active ? "#fff" : t.color }} />
                {t.label} <span className="tabular-nums opacity-70">{counts[t.value] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Hämtar papper …</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Inga papper här ännu — lägg in ett kvitto, en följesedel, en faktura, ett brev eller en anteckning.
        </p>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((p) => {
            const info = paperTypeInfo(p.paper_type);
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                  style={{ background: info.color }}
                >
                  {info.singular}
                </span>
                <button type="button" onClick={() => openEdit(p)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">
                    {p.company_name || p.title || "Utan företag"}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[p.paper_date, p.document_number, p.description].filter(Boolean).join(" · ") || "Ingen beskrivning"}
                  </span>
                </button>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                  {p.net_amount != null ? `${nf.format(p.net_amount)} ${p.currency}` : "—"}
                  <span className="block text-[10px] font-normal text-muted-foreground">netto</span>
                </span>
                {p.file_url && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openFile(p.file_url!)}>
                    <Paperclip className="h-4 w-4" />
                  </Button>
                )}
                <span className="flex shrink-0 items-center gap-2">
                  <StaffAvatar name={p.created_by_name} imageUrl={p.created_by_image} className="h-8 w-8" />
                  <span className="text-[11px] text-muted-foreground">
                    <span className="block max-w-[120px] truncate">{p.created_by_name ?? "Okänd"}</span>
                    <span className="block tabular-nums">{whenLabel(p.created_at)}</span>
                  </span>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  onClick={() => {
                    if (confirm("Ta bort pappret?")) del.mutate(p.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit ? "Ändra papper" : "Nytt papper"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Vad är det för papper?</Label>
              <Select
                value={form.paperType}
                onValueChange={(v) => setForm({ ...form, paperType: v as PaperType })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.singular}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Företag</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  placeholder="t.ex. Migros"
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs">Datum på pappret</Label>
                <Input
                  type="date"
                  value={form.paperDate}
                  onChange={(e) => setForm({ ...form, paperDate: e.target.value })}
                  className="h-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Nettobelopp</Label>
                <Input
                  inputMode="decimal"
                  value={form.netAmount}
                  onChange={(e) => setForm({ ...form, netAmount: e.target.value })}
                  placeholder="0.00"
                  className="h-10 font-mono tabular-nums"
                />
              </div>
              <div>
                <Label className="text-xs">Moms</Label>
                <Input
                  inputMode="decimal"
                  value={form.vatAmount}
                  onChange={(e) => setForm({ ...form, vatAmount: e.target.value })}
                  placeholder="0.00"
                  className="h-10 font-mono tabular-nums"
                />
              </div>
              <div>
                <Label className="text-xs">Valuta</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CHF">CHF</SelectItem>
                    <SelectItem value="SEK">SEK</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Nummer på pappret</Label>
                <Input
                  value={form.documentNumber}
                  onChange={(e) => setForm({ ...form, documentNumber: e.target.value })}
                  placeholder="Kvitto- eller fakturanummer"
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs">Bruttobelopp</Label>
                <Input
                  inputMode="decimal"
                  value={form.grossAmount}
                  onChange={(e) => setForm({ ...form, grossAmount: e.target.value })}
                  placeholder="0.00"
                  className="h-10 font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Vad innehåller pappret?</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Kort och sökbart, t.ex. Blommor till disken"
                rows={2}
              />
            </div>

            <div>
              <Label className="text-xs">Foto eller fil</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-10" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="mr-1 h-4 w-4" /> Välj fil eller ta foto
                </Button>
                <span className="truncate text-xs text-muted-foreground">
                  {file?.name ?? edit?.file_name ?? "Ingen fil"}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
