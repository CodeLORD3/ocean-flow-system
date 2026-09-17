import { useMemo, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Plus, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
    paymentMethod: "" as "" | "kort" | "kontant",
    cardBrand: "",
    cardLast4: "",
    cardHolder: "",
    expenseAccount: "",
    expenseCategory: "",
    itemsText: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  // Fält som lästes av från pappret — de lyser tills någon rättar dem.
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());

  type FormKey =
    | "paperType"
    | "companyName"
    | "paperDate"
    | "netAmount"
    | "vatAmount"
    | "grossAmount"
    | "currency"
    | "documentNumber"
    | "description"
    | "title"
    | "paymentMethod"
    | "cardBrand"
    | "cardLast4"
    | "cardHolder"
    | "expenseAccount"
    | "expenseCategory"
    | "itemsText";

  /** Ändrar ett fält och släcker markeringen, eftersom värdet nu är kontrollerat. */
  function setField(key: FormKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }) as typeof f);
    setAutoFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  const lit = (key: FormKey) =>
    autoFilled.has(key) ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400" : "";

  const litLabel = (key: FormKey) =>
    autoFilled.has(key) ? (
      <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
        <Sparkles className="h-2.5 w-2.5" /> avläst
      </span>
    ) : null;

  function toDataUrl(f: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Kunde inte läsa filen"));
      reader.readAsDataURL(f);
    });
  }

  /** Läser av pappret och fyller i fälten automatiskt, som i inköpsrapporteringen. */
  async function readPaper(f: File) {
    setReading(true);
    try {
      const dataUrl = await toDataUrl(f);
      const { data, error } = await supabase.functions.invoke("parse-viktigt-papper", {
        body: { dataUrl, fileName: f.name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const p = (data?.paper ?? {}) as Record<string, unknown>;

      const str = (v: unknown) => (v == null ? "" : String(v).trim());
      const money = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? String(v) : "";

      const patch: Partial<Record<FormKey, string>> = {};
      const validType = PAPER_TYPES.some((t) => t.value === str(p.paper_type));
      if (validType) patch.paperType = str(p.paper_type);
      if (str(p.company_name)) patch.companyName = str(p.company_name);
      if (/^\d{4}-\d{2}-\d{2}$/.test(str(p.paper_date))) patch.paperDate = str(p.paper_date);
      if (str(p.document_number)) patch.documentNumber = str(p.document_number);
      if (money(p.net_amount)) patch.netAmount = money(p.net_amount);
      if (money(p.vat_amount)) patch.vatAmount = money(p.vat_amount);
      if (money(p.gross_amount)) patch.grossAmount = money(p.gross_amount);
      if (["CHF", "SEK", "EUR"].includes(str(p.currency).toUpperCase()))
        patch.currency = str(p.currency).toUpperCase();
      if (["kort", "kontant"].includes(str(p.payment_method))) patch.paymentMethod = str(p.payment_method);
      if (str(p.card_brand)) patch.cardBrand = str(p.card_brand);
      if (/^\d{4}$/.test(str(p.card_last4))) patch.cardLast4 = str(p.card_last4);
      if (str(p.card_holder)) patch.cardHolder = str(p.card_holder);
      if (str(p.expense_category)) patch.expenseCategory = str(p.expense_category);
      if (Array.isArray(p.line_items) && p.line_items.length) {
        patch.itemsText = (p.line_items as any[])
          .map((l) => [str(l?.name), l?.amount != null ? String(l.amount) : ""].filter(Boolean).join(" "))
          .filter(Boolean)
          .join("\n");
      }
      if (str(p.title)) patch.title = str(p.title);
      if (str(p.description)) patch.description = str(p.description);

      const keys = Object.keys(patch) as FormKey[];
      if (keys.length === 0) {
        toast.info("Hittade ingen information på pappret — fyll i själv");
        return;
      }
      setForm((prev) => ({ ...prev, ...patch }) as typeof prev);
      setAutoFilled(new Set(keys));
      toast.success(`${keys.length} fält avlästa — kontrollera de gröna fälten`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte läsa av pappret");
    } finally {
      setReading(false);
    }
  }

  function pickFile(f: File | null) {
    setFile(f);
    if (f) void readPaper(f);
  }

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
        p.payment_method,
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
    setAutoFilled(new Set());
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
      paymentMethod: "",
      cardBrand: "",
      cardLast4: "",
      cardHolder: "",
      expenseAccount: "",
      expenseCategory: "",
      itemsText: "",
    });
    setOpen(true);
  }

  function openEdit(p: ImportantPaper) {
    setEdit(p);
    setFile(null);
    setAutoFilled(new Set());
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
      paymentMethod: (p.payment_method as "kort" | "kontant" | null) ?? "",
      cardBrand: p.card_brand ?? "",
      cardLast4: p.card_last4 ?? "",
      cardHolder: p.card_holder ?? "",
      expenseAccount: p.expense_account ?? "",
      expenseCategory: p.expense_category ?? "",
      itemsText: (p.line_items ?? [])
        .map((l) => [l.name, l.amount != null ? String(l.amount) : ""].filter(Boolean).join(" "))
        .join("\n"),
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
        paymentMethod: form.paymentMethod || null,
        cardBrand: form.cardBrand,
        cardLast4: form.cardLast4,
        cardHolder: form.cardHolder,
        expenseAccount: form.expenseAccount,
        expenseCategory: form.expenseCategory,
        lineItems: parseItems(form.itemsText),
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
                    {[
                      p.paper_date,
                      p.payment_method === "kort"
                        ? "Kort"
                        : p.payment_method === "kontant"
                          ? "Kontant"
                          : null,
                      p.document_number,
                      p.description,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Ingen beskrivning"}
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
              <Label className="text-xs">Vad är det för papper?{litLabel("paperType")}</Label>
              <Select
                value={form.paperType}
                onValueChange={(v) => setField("paperType", v)}
              >
                <SelectTrigger className={cn("h-10", lit("paperType"))}>
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

            {form.paperType === "kvitto" && (
              <div>
                <Label className="text-xs">Betalades med{litLabel("paymentMethod")}</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {[
                    ["kort", "Kort"],
                    ["kontant", "Kontant"],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={form.paymentMethod === value ? "default" : "outline"}
                      className={cn("h-11 text-sm font-semibold", form.paymentMethod === value && lit("paymentMethod"))}
                      onClick={() =>
                        setField("paymentMethod", form.paymentMethod === value ? "" : value)
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Företag{litLabel("companyName")}</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setField("companyName", e.target.value)}
                  placeholder="t.ex. Migros"
                  className={cn("h-10", lit("companyName"))}
                />
              </div>
              <div>
                <Label className="text-xs">Datum på pappret{litLabel("paperDate")}</Label>
                <Input
                  type="date"
                  value={form.paperDate}
                  onChange={(e) => setField("paperDate", e.target.value)}
                  className={cn("h-10", lit("paperDate"))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Nettobelopp{litLabel("netAmount")}</Label>
                <Input
                  inputMode="decimal"
                  value={form.netAmount}
                  onChange={(e) => setField("netAmount", e.target.value)}
                  placeholder="0.00"
                  className={cn("h-10 font-mono tabular-nums", lit("netAmount"))}
                />
              </div>
              <div>
                <Label className="text-xs">Moms{litLabel("vatAmount")}</Label>
                <Input
                  inputMode="decimal"
                  value={form.vatAmount}
                  onChange={(e) => setField("vatAmount", e.target.value)}
                  placeholder="0.00"
                  className={cn("h-10 font-mono tabular-nums", lit("vatAmount"))}
                />
              </div>
              <div>
                <Label className="text-xs">Valuta{litLabel("currency")}</Label>
                <Select value={form.currency} onValueChange={(v) => setField("currency", v)}>
                  <SelectTrigger className={cn("h-10", lit("currency"))}>
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
                <Label className="text-xs">Nummer på pappret{litLabel("documentNumber")}</Label>
                <Input
                  value={form.documentNumber}
                  onChange={(e) => setField("documentNumber", e.target.value)}
                  placeholder="Kvitto- eller fakturanummer"
                  className={cn("h-10", lit("documentNumber"))}
                />
              </div>
              <div>
                <Label className="text-xs">Bruttobelopp{litLabel("grossAmount")}</Label>
                <Input
                  inputMode="decimal"
                  value={form.grossAmount}
                  onChange={(e) => setField("grossAmount", e.target.value)}
                  placeholder="0.00"
                  className={cn("h-10 font-mono tabular-nums", lit("grossAmount"))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Vad innehåller pappret?{litLabel("description")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Kort och sökbart, t.ex. Blommor till disken"
                rows={2}
                className={cn(lit("description"))}
              />
            </div>

            <div>
              <Label className="text-xs">Foto eller fil</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="h-10" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="mr-1 h-4 w-4" /> Välj fil eller ta foto
                </Button>
                {file && (
                  <Button
                    variant="outline"
                    className="h-10"
                    disabled={reading}
                    onClick={() => void readPaper(file)}
                  >
                    {reading ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="mr-1 h-4 w-4" />
                    )}
                    Läs av igen
                  </Button>
                )}
                <span className="truncate text-xs text-muted-foreground">
                  {file?.name ?? edit?.file_name ?? "Ingen fil"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {reading
                  ? "Läser av pappret …"
                  : "Fälten fylls i automatiskt från fotot — kontrollera de gröna fälten."}
              </p>
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
