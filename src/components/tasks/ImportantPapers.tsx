import { useEffect, useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  ImagePlus,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Loader2,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { cn } from "@/lib/utils";
import { resolveStorageUrl } from "@/lib/signedStorage";
import { cleanDomain, companyLogoUrl } from "@/lib/companyLogo";
import {
  accountLabel,
  accountsFor,
  allAccountGroups,
  counterpartAccount,
  suggestAccount,
} from "@/lib/expenseAccounts";
import {
  PAPER_TYPES,
  paperTypeInfo,
  useDeleteImportantPaper,
  useImportantPapers,
  useSaveImportantPaper,
  type ImportantPaper,
  type PaperType,
} from "@/hooks/useImportantPapers";
import {
  cardLabel,
  matchCard,
  usePaymentCards,
  useRemovePaymentCard,
  useSavePaymentCard,
  type PaymentCard,
} from "@/hooks/usePaymentCards";
import { useStaff } from "@/hooks/useStaff";

const nf = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Fältnamn på svenska, används när en ny avläsning jämförs med det som står nu. */
const FIELD_LABELS: Record<string, string> = {
  paperType: "Typ av papper",
  companyName: "Företag",
  companyWebsite: "Webbadress",
  paperDate: "Datum",
  netAmount: "Nettobelopp",
  vatAmount: "Moms",
  grossAmount: "Bruttobelopp",
  currency: "Valuta",
  documentNumber: "Dokumentnummer",
  description: "Beskrivning",
  title: "Rubrik",
  paymentMethod: "Betalsätt",
  cardBrand: "Korttyp",
  cardLast4: "Kortets sista fyra",
  cardHolder: "Kortinnehavare",
  expenseAccount: "Bokföringskonto",
  expenseCategory: "Kostnadsslag",
  itemsText: "Köpta varor",
};

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

/** "Lax 120.50" per rad → poster för bokföringsunderlaget. */
function parseItems(text: string) {
  return text
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const m = row.match(/^(.*?)[\s:]+(-?[\d\s]+(?:[.,]\d{1,2})?)$/);
      if (!m) return { name: row, amount: null as number | null };
      const amount = Number(m[2].replace(/\s/g, "").replace(",", "."));
      return {
        name: m[1].trim() || row,
        amount: Number.isFinite(amount) ? amount : null,
      };
    });
}

/** ISO-veckonummer. */
function weekNumber(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** "Torsdag 17 september 2026 · 17/9 · vecka 38" — tydligt både i ord och siffror. */
/** Nyckel som fångar papper som troligen är samma dokument två gånger. */
export function duplicateKey(p: ImportantPaper): string | null {
  const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9åäöéü]/g, "");
  const company = norm(p.company_name);
  const nr = norm(p.document_number);
  if (company && nr) return `nr:${company}|${nr}`;
  if (p.paper_date && p.net_amount != null) return `sum:${company}|${p.paper_date}|${p.net_amount.toFixed(2)}`;
  return null;
}

/** Ett papper i jämförvyn — visar bilden och de fält man dömer dubbletten på. */
function CompareCard({
  paper,
  onOpen,
  onDelete,
}: {
  paper: ImportantPaper;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!paper.file_url) {
      setUrl(null);
      return;
    }
    void resolveStorageUrl(paper.file_url).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [paper.file_url]);

  const info = paperTypeInfo(paper.paper_type);
  const isPdf = (paper.file_url ?? "").toLowerCase().endsWith(".pdf");

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-2">
      <div className="flex items-center gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
          style={{ background: info.color }}
        >
          {info.singular}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {paper.company_name || paper.title || "Utan företag"}
        </span>
      </div>

      <div className="flex h-44 items-center justify-center overflow-hidden rounded border border-border bg-muted/40">
        {url && !isPdf ? (
          <img src={url} alt="Pappret" className="max-h-full max-w-full object-contain" />
        ) : url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-xs underline">
            Öppna PDF
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">Ingen bild</span>
        )}
      </div>

      <dl className="space-y-0.5 text-[11px]">
        {[
          ["Datum", paper.paper_date ?? "—"],
          ["Netto", paper.net_amount != null ? `${nf.format(paper.net_amount)} ${paper.currency}` : "—"],
          ["Brutto", paper.gross_amount != null ? `${nf.format(paper.gross_amount)} ${paper.currency}` : "—"],
          ["Dokumentnr", paper.document_number || "—"],
          ["Betalsätt", paper.payment_method === "kort" ? [paper.card_brand, paper.card_last4 ? `••${paper.card_last4}` : null].filter(Boolean).join(" ") || "Kort" : paper.payment_method === "kontant" ? "Kontant" : "—"],
          ["Konto", paper.expense_account || "—"],
          ["Inlagt", whenLabel(paper.created_at)],
          ["Inlagt av", paper.created_by_name ?? "Okänd"],
        ].map(([label, value]) => (
          <div key={label as string} className="flex gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 flex-1 break-words font-medium tabular-nums">{value as string}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex gap-2">
        <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={onOpen}>
          Öppna
        </Button>
        <Button size="sm" variant="destructive" className="h-8 flex-1 text-xs" onClick={onDelete}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Ta bort
        </Button>
      </div>
    </div>
  );
}

function longDayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const weekday = d.toLocaleDateString("sv-SE", { weekday: "long" });
  const rest = d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${rest} · ${d.getDate()}/${d.getMonth() + 1} · vecka ${weekNumber(d)}`;
}

/** "Tors 17 sep · v.38" — kort variant för listrader. */
function shortDayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const weekday = d.toLocaleDateString("sv-SE", { weekday: "short" }).replace(".", "");
  const rest = d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  return `${weekday[0].toUpperCase()}${weekday.slice(1)} ${rest} · v.${weekNumber(d)}`;
}

/** Banker/kortutgivare vi ser oftast — snabbval i kortregistret. */
const BANK_CHOICES = [
  "PostFinance",
  "UBS",
  "Raiffeisen",
  "ZKB",
  "Migros Bank",
  "Sparkasse",
  "SEB",
  "Swedbank",
  "Handelsbanken",
  "Nordea",
];

/** Ekonomi → Viktiga papper: kvitton, följesedlar, fakturor, brev och anteckningar. */
/** Väljer person med sökfält och profilbild — listan kan vara lång. */
function PersonSelect({
  value,
  onChange,
  staffList,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  staffList: { id: string; first_name?: string | null; last_name?: string | null; profile_image_url?: string | null }[];
  className?: string;
}) {
  const [q, setQ] = useState("");
  const name = (s: { first_name?: string | null; last_name?: string | null }) =>
    `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
  const hits = staffList.filter((s) => name(s).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("h-10", className)}>
        <SelectValue placeholder="Välj person" />
      </SelectTrigger>
      <SelectContent>
        <div className="sticky top-0 z-10 bg-popover p-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Sök person"
              className="h-9 pl-8"
            />
          </div>
        </div>
        {hits.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <StaffAvatar name={name(s)} imageUrl={s.profile_image_url ?? null} className="h-7 w-7" />
              {name(s)}
            </span>
          </SelectItem>
        ))}
        {hits.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Ingen person matchar sökningen — skriv namnet fritt i fältet under i stället
          </p>
        )}
        {value && (
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
            onClick={() => onChange("")}
          >
            Ta bort personvalet
          </button>
        )}
      </SelectContent>
    </Select>
  );
}

export function ImportantPapers({ storeId }: { storeId?: string | null }) {
  const { data: papers = [], isLoading } = useImportantPapers(storeId);
  const save = useSaveImportantPaper();
  const del = useDeleteImportantPaper();
  const { data: paymentCards = [] } = usePaymentCards();
  const saveCard = useSavePaymentCard();
  const removeCard = useRemovePaymentCard();
  const { data: staffList = [] } = useStaff(storeId ?? undefined);

  const [typeFilter, setTypeFilter] = useState<"alla" | PaperType>("alla");
  const [payFilter, setPayFilter] = useState("alla");
  const [accountFilter, setAccountFilter] = useState("alla");
  const [sortBy, setSortBy] = useState("datum");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<ImportantPaper | null>(null);

  const [form, setForm] = useState({
    paperType: "kvitto" as PaperType,
    companyName: "",
    companyWebsite: "",
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
    cardId: "",
  });
  // Gäller när pappret är ett kort: vem äger kortet och är det privat (utlägg)?
  const [kortOwner, setKortOwner] = useState("");
  const [kortPrivat, setKortPrivat] = useState(false);
  // Gult = personen hittades av avläsningen och är inte kontrollerad än.
  const [kortOwnerAuto, setKortOwnerAuto] = useState(false);
  // Bilden visas vid sidan om fälten så det är lätt att fylla i rätt.
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBig, setPreviewBig] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  // Ny avläsning av det sparade fotot: visar nytt värde mot det som står nu.
  const [compare, setCompare] = useState<
    { key: FormKey; label: string; current: string; next: string }[] | null
  >(null);
  const [pickedCompare, setPickedCompare] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null);
  const [needsOnly, setNeedsOnly] = useState(false);
  // Gult = avläst från pappret och inte kontrollerat än.
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());
  // Grönt = någon har skrivit in eller rättat värdet själv.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [cardOpen, setCardOpen] = useState(false);
  /** Sätts när vi redigerar ett redan inlagt kort i stället för att lägga till nytt. */
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState({
    cardBrand: "",
    bank: "",
    cardLast4: "",
    cardHolder: "",
    staffId: "",
    cardKind: "foretag" as "foretag" | "privat",
  });
  // Foto av kortet: fälten läses av på samma sätt som på ett papper.
  const cardCamRef = useRef<HTMLInputElement>(null);
  const cardLibRef = useRef<HTMLInputElement>(null);
  const [cardReading, setCardReading] = useState(false);
  const [cardAutoFilled, setCardAutoFilled] = useState<Set<string>>(new Set());

  /** Hittar personen i personallistan utifrån namnet som står på kortet. */
  function staffIdFromName(name: string): string {
    const clean = (v: string) => v.toLowerCase().replace(/[^a-zà-ÿ ]/gi, " ").split(" ").filter(Boolean);
    const words = clean(name);
    if (words.length === 0) return "";
    let best = "";
    let bestHits = 0;
    for (const s of staffList) {
      const staffWords = clean(`${s.first_name ?? ""} ${s.last_name ?? ""}`);
      if (staffWords.length === 0) continue;
      const hits = staffWords.filter((w) => words.includes(w)).length;
      if (hits > bestHits) {
        bestHits = hits;
        best = s.id;
      }
    }
    return bestHits >= 2 || (bestHits === 1 && words.length === 1) ? best : "";
  }

  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    if (file) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    if (edit?.file_url) {
      let alive = true;
      void resolveStorageUrl(edit.file_url).then((u) => {
        if (alive) setPreview(u ?? null);
      });
      return () => {
        alive = false;
      };
    }
    setPreview(null);
  }, [open, file, edit?.file_url]);

  const previewIsPdf = (file?.type ?? edit?.file_mime ?? "").includes("pdf");

  type FormKey =
    | "paperType"
    | "companyName"
    | "companyWebsite"
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

  /** Ändrar ett fält: gul markering släcks och fältet blir grönt = kontrollerat. */
  function setField(key: FormKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }) as typeof f);
    setAutoFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setChecked((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }

  const lit = (key: FormKey) =>
    autoFilled.has(key)
      ? "border-amber-500 bg-amber-50 ring-1 ring-amber-400"
      : checked.has(key)
        ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400"
        : "";

  const litLabel = (key: FormKey) =>
    autoFilled.has(key) ? (
      <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
        <Sparkles className="h-2.5 w-2.5" /> avläst — kontrollera
      </span>
    ) : checked.has(key) ? (
      <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
        <Check className="h-2.5 w-2.5" /> klart
      </span>
    ) : null;

  /** Kortet som matchar de fyra sista siffrorna — ger vem som betalat och om det är utlägg. */
  const activeCard: PaymentCard | null =
    paymentCards.find((c) => c.id === form.cardId) ?? matchCard(paymentCards, form.cardLast4);

  /** Väljer ett registrerat kort och fyller i korttyp, siffror och ägare. */
  function pickCard(c: PaymentCard) {
    setForm((f) => ({
      ...f,
      cardId: c.id,
      paymentMethod: "kort",
      cardBrand: c.card_brand ?? f.cardBrand,
      cardLast4: c.card_last4,
      cardHolder: c.staff_name || c.card_holder || f.cardHolder,
    }));
    setAutoFilled((prev) => {
      const next = new Set(prev);
      for (const k of ["cardBrand", "cardLast4", "cardHolder", "paymentMethod"]) next.delete(k);
      return next;
    });
    setChecked((prev) => {
      const next = new Set(prev);
      for (const k of ["cardBrand", "cardLast4", "cardHolder", "paymentMethod"]) next.add(k);
      return next;
    });
  }

  function toDataUrl(f: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Kunde inte läsa filen"));
      reader.readAsDataURL(f);
    });
  }

  /** Läser av ett papper och returnerar bara det som syns på bilden. */
  async function parsePaper(f: File): Promise<Partial<Record<FormKey, string>>> {
    const dataUrl = await toDataUrl(f);
    const { data, error } = await supabase.functions.invoke("parse-viktigt-papper", {
      body: { dataUrl, fileName: f.name },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const p = (data?.paper ?? {}) as Record<string, unknown>;

    const str = (v: unknown) => (v == null ? "" : String(v).trim());
    const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");

    const patch: Partial<Record<FormKey, string>> = {};
    const validType = PAPER_TYPES.some((t) => t.value === str(p.paper_type));
    if (validType) patch.paperType = str(p.paper_type);
    if (str(p.company_name)) patch.companyName = str(p.company_name);
    if (cleanDomain(str(p.company_website))) patch.companyWebsite = cleanDomain(str(p.company_website))!;
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

    // Föreslår bokföringskonto: diesel och bensin hamnar på drivmedelskontot.
    const hit = suggestAccount(
      [patch.companyName, patch.title, patch.description, patch.expenseCategory, patch.itemsText]
        .filter(Boolean)
        .join(" "),
      patch.currency ?? "CHF",
    );
    if (hit) {
      patch.expenseAccount = hit.code;
      if (!patch.expenseCategory) patch.expenseCategory = hit.label;
    }
    return patch;
  }

  /** Läser av pappret i formuläret och fyller i fälten automatiskt. */
  async function readPaper(f: File) {
    setReading(true);
    try {
      const patch = await parsePaper(f);
      const keys = Object.keys(patch) as FormKey[];
      if (keys.length === 0) {
        toast.info("Hittade ingen information på pappret — fyll i själv");
        return;
      }
      if (patch.paperType === "kort") {
        for (const k of ["netAmount", "vatAmount", "grossAmount", "documentNumber", "description", "itemsText", "expenseAccount", "expenseCategory", "paymentMethod"] as FormKey[]) {
          delete patch[k];
        }
      }
      const shown = Object.keys(patch) as FormKey[];
      setForm((prev) => ({ ...prev, ...patch }) as typeof prev);
      setAutoFilled(new Set(shown));
      const owner = staffIdFromName(patch.cardHolder ?? "");
      if (owner) {
        setKortOwner(owner);
        setKortOwnerAuto(true);
      }
      toast.success(`${shown.length} fält avlästa — kontrollera de gula fälten`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte läsa av pappret");
    } finally {
      setReading(false);
    }
  }

  /**
   * Läser av det sparade fotot igen och visar vad avläsningen ger jämfört med
   * det som står i pappret nu. Ingenting ändras förrän man väljer nya värden.
   */
  async function rereadSaved() {
    if (!edit?.file_url) return;
    setReading(true);
    try {
      const signed = await resolveStorageUrl(edit.file_url);
      if (!signed) throw new Error("Kunde inte hämta bilden");
      const res = await fetch(signed);
      if (!res.ok) throw new Error("Kunde inte hämta bilden");
      const blob = await res.blob();
      const f = new File([blob], edit.file_name ?? "papper", {
        type: edit.file_mime ?? blob.type ?? "image/jpeg",
      });
      const patch = await parsePaper(f);
      const rows = (Object.keys(patch) as FormKey[])
        .map((key) => ({
          key,
          label: FIELD_LABELS[key] ?? key,
          current: String((form as Record<string, string>)[key] ?? ""),
          next: patch[key] ?? "",
        }))
        .filter((r) => r.next.trim() !== "");
      if (rows.length === 0) {
        toast.info("Avläsningen hittade ingen information på bilden");
        return;
      }
      // Det som skiljer sig från nuvarande värde är förvalt.
      setPickedCompare(new Set(rows.filter((r) => r.current.trim() !== r.next.trim()).map((r) => r.key)));
      setCompare(rows);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte läsa av bilden igen");
    } finally {
      setReading(false);
    }
  }

  /** Lägger in valda värden från den nya avläsningen. Gult = kontrollera dem. */
  function applyCompare(rows: { key: FormKey; next: string }[]) {
    if (!rows.length) return;
    setForm((prev) => {
      const next = { ...prev } as Record<string, string>;
      for (const r of rows) next[r.key] = r.next;
      return next as typeof prev;
    });
    setAutoFilled(new Set(rows.map((r) => r.key)));
    setChecked((prev) => {
      const next = new Set(prev);
      for (const r of rows) next.delete(r.key);
      return next;
    });
    setCompare(null);
    toast.success(`${rows.length} fält uppdaterade — kontrollera de gula fälten`);
  }

  /** Läser av ett foto av kortet och fyller kortformuläret. */
  async function readCardPhoto(file: File | null | undefined) {
    if (!file) return;
    setCardReading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Kunde inte läsa filen"));
        r.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("parse-viktigt-papper", {
        body: { dataUrl, fileName: file.name, kind: "card" },
      });
      if (error) throw error;
      const card = (data as { paper?: Record<string, unknown> } | null)?.paper ?? {};
      const brand = typeof card.card_brand === "string" ? card.card_brand : "";
      const last4 = typeof card.card_last4 === "string" ? card.card_last4.replace(/\D/g, "").slice(-4) : "";
      const holder = typeof card.card_holder === "string" ? card.card_holder : "";
      const bank = typeof card.company_name === "string" ? card.company_name : "";
      const found = new Set<string>();
      setCardForm((f) => {
        const next = { ...f };
        if (brand) { next.cardBrand = brand; found.add("cardBrand"); }
        if (bank) { next.bank = bank; found.add("bank"); }
        if (last4.length === 4) { next.cardLast4 = last4; found.add("cardLast4"); }
        if (holder) { next.cardHolder = holder; found.add("cardHolder"); }
        const owner = staffIdFromName(holder);
        if (owner) { next.staffId = owner; found.add("staffId"); }
        return next;
      });
      setCardAutoFilled(found);
      if (found.size === 0) toast.info("Hittade inget på kortet — skriv in själv");
      else toast.success("Kortet avläst — kontrollera de gula fälten");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte läsa kortet");
    } finally {
      setCardReading(false);
    }
  }

  /**
   * Mobilflödet: bilderna läggs in först och sparas direkt, ett papper per bild.
   * Det som kan läsas av fylls i automatiskt — resten finredigeras senare.
   */
  async function addPhotos(files: File[]) {
    if (!files.length) return;
    setQueue({ done: 0, total: files.length });
    let ok = 0;
    let firstId: string | null = null;
    for (const f of files) {
      let patch: Partial<Record<FormKey, string>> = {};
      try {
        patch = await parsePaper(f);
      } catch {
        // Kunde inte läsas av — pappret sparas ändå med bilden.
      }
      // Känner igen kortet på de fyra sista siffrorna → vem som betalat, och utlägg om det är ett privat kort.
      const known = matchCard(paymentCards, patch.cardLast4 ?? "");
      try {
        const id = await save.mutateAsync({
          storeId: storeId ?? null,
          paperType: (patch.paperType as PaperType) ?? "kvitto",
          title: patch.title ?? "",
          companyName: patch.companyName ?? "",
          companyWebsite: patch.companyWebsite ?? "",
          companyLogoUrl: companyLogoUrl(patch.companyWebsite ?? ""),
          paperDate: patch.paperDate ?? new Date().toISOString().slice(0, 10),
          netAmount: num(patch.netAmount ?? ""),
          vatAmount: num(patch.vatAmount ?? ""),
          grossAmount: num(patch.grossAmount ?? ""),
          currency: patch.currency ?? "CHF",
          documentNumber: patch.documentNumber ?? "",
          description: patch.description ?? "",
          paymentMethod: (patch.paymentMethod as "kort" | "kontant") || null,
          cardBrand: patch.cardBrand ?? known?.card_brand ?? "",
          cardLast4: patch.cardLast4 ?? "",
          cardHolder: patch.cardHolder ?? known?.staff_name ?? known?.card_holder ?? "",
          cardId: known?.id ?? null,
          paidByStaffId: known?.staff_id ?? null,
          isExpenseClaim: known?.card_kind === "privat",
          expenseAccount: patch.expenseAccount ?? "",
          expenseCategory: patch.expenseCategory ?? "",
          lineItems: parseItems(patch.itemsText ?? ""),
          file: f,
        });
        ok += 1;
        if (!firstId) firstId = id;
      } catch (e: any) {
        toast.error(e?.message ?? "Kunde inte spara bilden");
      }
      setQueue((q) => (q ? { ...q, done: q.done + 1 } : q));
    }
    setQueue(null);
    if (ok) {
      toast.success(
        ok === 1 ? "Bilden sparad — fyll i eller rätta informationen" : `${ok} bilder sparade — fyll i informationen`,
      );
      setNeedsOnly(true);
    }
  }

  function pickFile(f: File | null) {
    setFile(f);
    if (f) void readPaper(f);
  }

  /** Papper som behöver kompletteras innan de duger som bokföringsunderlag. */
  const needsCheck = (p: ImportantPaper) => !p.company_name || p.net_amount == null;

  /**
   * Möjliga dubbletter: samma företag + dokumentnummer, eller samma företag,
   * datum och belopp. Pappren varnas men tas aldrig bort automatiskt.
   */
  const dupGroups = useMemo(() => {
    const map = new Map<string, ImportantPaper[]>();
    for (const p of papers) {
      const key = duplicateKey(p);
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return [...map.entries()].filter(([, g]) => g.length > 1);
  }, [papers]);

  const dupKeyById = useMemo(() => {
    const m = new Map<string, string>();
    for (const [key, group] of dupGroups) for (const p of group) m.set(p.id, key);
    return m;
  }, [dupGroups]);

  const [compareKey, setCompareKey] = useState<string | null>(null);
  const compareGroup = dupGroups.find(([k]) => k === compareKey)?.[1] ?? [];



  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of papers) c[p.paper_type] = (c[p.paper_type] ?? 0) + 1;
    return c;
  }, [papers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return papers.filter((p) => {
      if (typeFilter !== "alla" && p.paper_type !== typeFilter) return false;
      if (needsOnly && !needsCheck(p)) return false;
      if (payFilter === "kontant" && p.payment_method !== "kontant") return false;
      if (payFilter === "utlagg" && !p.is_expense_claim) return false;
      if (payFilter === "kort" && p.payment_method !== "kort") return false;
      if (payFilter.startsWith("kort:") && p.card_last4 !== payFilter.slice(5)) return false;
      if (accountFilter !== "alla" && (p.expense_account ?? "") !== accountFilter) return false;
      if (!q) return true;
      const hay = [
        p.title,
        p.company_name,
        p.description,
        p.document_number,
        p.payment_method,
        p.card_brand,
        p.card_last4,
        p.card_holder,
        p.expense_account,
        p.expense_category,
        ...(p.line_items ?? []).map((l) => l.name),
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
  }, [papers, typeFilter, search, payFilter, accountFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortBy === "belopp") list.sort((a, b) => (b.net_amount ?? 0) - (a.net_amount ?? 0));
    else if (sortBy === "datum") list.sort((a, b) => (b.paper_date ?? "").localeCompare(a.paper_date ?? ""));
    else if (sortBy === "datum-aldst")
      list.sort((a, b) => (a.paper_date ?? "zzz").localeCompare(b.paper_date ?? "zzz"));
    else if (sortBy === "vecka")
      list.sort((a, b) => (b.paper_date ?? "").localeCompare(a.paper_date ?? ""));
    else if (sortBy === "foretag")
      list.sort((a, b) => (a.company_name ?? "").localeCompare(b.company_name ?? "", "sv"));
    else if (sortBy === "konto")
      list.sort((a, b) => (a.expense_account ?? "zzz").localeCompare(b.expense_account ?? "zzz", "sv"));
    return list;
  }, [filtered, sortBy]);

  /** Pappren samlas under sitt datum — varje datum går att fälla ihop. */
  const dateGroups = useMemo(() => {
    const map = new Map<string, ImportantPaper[]>();
    for (const p of sorted) {
      const key = p.paper_date ?? "utan-datum";
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return [...map.entries()];
  }, [sorted]);

  const cards = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of papers) {
      if (p.card_last4) map.set(p.card_last4, [p.card_brand, `••${p.card_last4}`].filter(Boolean).join(" "));
    }
    return [...map.entries()];
  }, [papers]);

  const accounts = useMemo(
    () => [...new Set(papers.map((p) => p.expense_account).filter(Boolean))].sort() as string[],
    [papers],
  );

  function openNew(type?: PaperType) {
    setEdit(null);
    setFile(null);
    setAutoFilled(new Set());
    setChecked(new Set());
    setKortOwner("");
    setKortPrivat(false);
    setKortOwnerAuto(false);
    setForm({
      paperType: type ?? (typeFilter === "alla" ? "kvitto" : typeFilter),
      companyName: "",
      companyWebsite: "",
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
      cardId: "",
    });
    setOpen(true);
  }

  function openEdit(p: ImportantPaper) {
    setEdit(p);
    setFile(null);
    setKortOwner(p.paid_by_staff_id ?? "");
    setKortPrivat(!!p.is_expense_claim);
    setKortOwnerAuto(false);
    setAutoFilled(new Set());
    setChecked(new Set());
    setForm({
      paperType: p.paper_type as PaperType,
      companyName: p.company_name ?? "",
      companyWebsite: p.company_website ?? "",
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
      cardId: p.card_id ?? "",
    });
    setOpen(true);
  }

  /** Bläddra mellan papperna i samma ordning som listan visar dem. */
  const editIndex = edit ? sorted.findIndex((p) => p.id === edit.id) : -1;
  function goRelative(delta: number) {
    const next = sorted[editIndex + delta];
    if (next) openEdit(next);
  }

  /** Piltangenterna byter papper, men inte när du skriver i ett fält. */
  useEffect(() => {
    if (!open || !edit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      goRelative(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });



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
        companyWebsite: form.companyWebsite,
        companyLogoUrl: companyLogoUrl(form.companyWebsite),
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
        cardId: form.paperType === "kort" ? null : activeCard?.id ?? null,
        paidByStaffId: form.paperType === "kort" ? kortOwner || null : activeCard?.staff_id ?? null,
        isExpenseClaim:
          form.paperType === "kort" ? kortPrivat : activeCard?.card_kind === "privat",
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
              placeholder="Sök"
              className="h-9 pl-8"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => openNew()}>
            <Plus className="mr-1 h-4 w-4" /> Skriv in själv
          </Button>
        </div>

        {/* Steg 1: bilden in. Steg 2: informationen — går att göra senare eller på datorn. */}
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            void addPhotos([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <input
          ref={libRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            void addPhotos([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            className="h-16 justify-center text-base font-semibold"
            disabled={!!queue}
            onClick={() => camRef.current?.click()}
          >
            <Camera className="mr-2 h-6 w-6" /> Ta foto på pappret
          </Button>
          <Button
            variant="outline"
            className="h-16 justify-center text-base font-semibold"
            disabled={!!queue}
            onClick={() => libRef.current?.click()}
          >
            <ImagePlus className="mr-2 h-6 w-6" /> Välj bilder i telefonen
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          {queue ? (
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sparar bild {queue.done + 1} av {queue.total} …
            </span>
          ) : (
            "Ta flera bilder på en gång — informationen läses av automatiskt och kan finredigeras senare eller på datorn."
          )}
        </p>


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

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setNeedsOnly((v) => !v)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              needsOnly
                ? "border-transparent bg-amber-500 text-white shadow-sm"
                : "border-amber-300 bg-card text-amber-700 hover:bg-amber-50",
            )}
          >
            Behöver fyllas i{" "}
            <span className="tabular-nums opacity-70">{papers.filter(needsCheck).length}</span>
          </button>

          <Select value={payFilter} onValueChange={setPayFilter}>
            <SelectTrigger className="h-9 w-full sm:w-48">
              <SelectValue placeholder="Betalsätt" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alla">Alla betalsätt</SelectItem>
              <SelectItem value="kontant">Kontant</SelectItem>
              <SelectItem value="utlagg">Utlägg (privat kort)</SelectItem>
              <SelectItem value="kort">Kort (alla)</SelectItem>
              {cards.map(([last4, label]) => (
                <SelectItem key={last4} value={`kort:${last4}`}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="Konto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alla">Alla konton</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a} value={a}>
                  Konto {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="Sortera" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="senast">Senast inlagt</SelectItem>
              <SelectItem value="datum">Datum på pappret (nyast först)</SelectItem>
              <SelectItem value="datum-aldst">Datum på pappret (äldst först)</SelectItem>
              <SelectItem value="vecka">Vecka och veckodag</SelectItem>
              <SelectItem value="belopp">Högsta belopp</SelectItem>
              <SelectItem value="foretag">Företag A–Ö</SelectItem>
              <SelectItem value="konto">Konto</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground tabular-nums">
            {sorted.length} papper ·{" "}
            {nf.format(sorted.reduce((sum, p) => sum + (p.net_amount ?? 0), 0))} netto
          </span>
        </div>
      </Card>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Hämtar papper …</p>
      ) : sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Inga papper här ännu — lägg in ett kvitto, en följesedel, en faktura, ett brev eller en anteckning.
        </p>
      ) : (
        <div className="space-y-2">
          {dateGroups.map(([key, group]) => {
            const isOpen = !collapsed.has(key);
            const sum = group.reduce((s, p) => s + (p.net_amount ?? 0), 0);
            return (
              <div key={key} className="overflow-hidden rounded-lg border border-border bg-card">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-2 bg-muted/60 px-3 py-2 text-left hover:bg-muted"
                >
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 transition-transform", !isOpen && "-rotate-90")}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {key === "utan-datum" ? "Utan datum" : longDayLabel(key)}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {group.length} papper · {nf.format(sum)} netto
                  </span>
                </button>

                {isOpen && (
                  <div className="divide-y divide-border">
                    {group.map((p) => {
                      const info = paperTypeInfo(p.paper_type);
                      return (
                        <div key={p.id} className="flex items-center gap-2 px-2 py-1">
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                            style={{ background: info.color }}
                          >
                            {info.singular}
                          </span>
                          {p.is_expense_claim && (
                            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 sm:flex">
                              <StaffAvatar
                                name={p.paid_by_name}
                                imageUrl={p.paid_by_image}
                                className="h-4 w-4"
                              />
                              Utlägg
                            </span>
                          )}
                          {needsCheck(p) && (
                            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              Fyll i
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {p.company_logo_url || companyLogoUrl(p.company_website) ? (
                              <img
                                src={p.company_logo_url || companyLogoUrl(p.company_website)!}
                                alt={`Logotyp för ${p.company_name ?? "företaget"}`}
                                className="h-5 w-5 shrink-0 rounded border border-border bg-white object-contain p-[1px]"
                                loading="lazy"
                              />
                            ) : null}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium leading-tight">
                                {p.company_name || p.title || "Utan företag"}
                              </span>
                              <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                                {[
                                  p.payment_method === "kort"
                                    ? [p.card_brand ?? "Kort", p.card_last4 ? `••${p.card_last4}` : null]
                                        .filter(Boolean)
                                        .join(" ")
                                    : p.payment_method === "kontant"
                                      ? "Kontant"
                                      : null,
                                  p.expense_account
                                    ? accountLabel(p.expense_account, p.currency)
                                    : p.expense_category,
                                  p.document_number,
                                  p.description ||
                                    (p.line_items ?? [])
                                      .slice(0, 3)
                                      .map((l) => l.name)
                                      .join(", "),
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "Ingen beskrivning"}
                              </span>
                            </span>
                          </button>

                          <span className="shrink-0 text-right text-[12px] font-semibold tabular-nums">
                            {p.net_amount != null ? `${nf.format(p.net_amount)} ${p.currency}` : "—"}
                          </span>
                          {p.file_url && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              onClick={() => openFile(p.file_url!)}
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <StaffAvatar
                            name={p.created_by_name}
                            imageUrl={p.created_by_image}
                            className="h-6 w-6 shrink-0"
                          />
                          <span className="hidden shrink-0 text-[10px] leading-tight text-muted-foreground sm:block">
                            <span className="block max-w-[110px] truncate">{p.created_by_name ?? "Okänd"}</span>
                            <span className="block tabular-nums">{whenLabel(p.created_at)}</span>
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 text-destructive"
                            onClick={() => {
                              if (confirm("Ta bort pappret?")) del.mutate(p.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] w-[97vw] overflow-y-auto sm:max-w-lg lg:max-w-5xl">
          <DialogHeader className="sticky top-0 z-20 -mx-6 -mt-6 border-b border-border bg-background px-6 pb-2 pt-4">
            <div className="flex items-center gap-2">
              {edit && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    disabled={editIndex <= 0}
                    onClick={() => goRelative(-1)}
                    title="Föregående papper"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    disabled={editIndex < 0 || editIndex >= sorted.length - 1}
                    onClick={() => goRelative(1)}
                    title="Nästa papper"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-base">
                  {form.paperDate
                    ? longDayLabel(form.paperDate)
                    : edit
                      ? "Papper utan datum"
                      : "Nytt papper"}
                </DialogTitle>
                <p className="truncate text-xs text-muted-foreground">
                  {[form.companyName, edit ? "Ändra papper" : "Nytt papper"].filter(Boolean).join(" · ")}
                  {editIndex >= 0 ? ` · ${editIndex + 1} av ${sorted.length}` : ""}
                </p>
              </div>
              <Button onClick={submit} disabled={save.isPending} className="h-9 shrink-0">
                {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Spara
              </Button>
            </div>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Bilden: överst på mobilen, vid sidan om på datorn. */}
          {preview ? (
            <div className="order-first lg:order-last lg:sticky lg:top-0 lg:self-start">
              <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
                {previewIsPdf ? (
                  <iframe src={preview} title="Pappret" className="h-[40vh] w-full lg:h-[72vh]" />
                ) : (
                  <TransformWrapper
                    minScale={1}
                    maxScale={8}
                    doubleClick={{ mode: "toggle", step: 2 }}
                    wheel={{ step: 0.15 }}
                  >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                      <div className="relative">
                        <TransformComponent
                          wrapperClass={cn(
                            "w-full bg-white",
                            previewBig ? "max-h-[80vh]" : "max-h-[34vh] lg:max-h-[72vh]",
                          )}
                          contentClass="w-full"
                        >
                          <img src={preview} alt="Fotot på pappret" className="w-full object-contain" />
                        </TransformComponent>
                        <div className="absolute right-1.5 top-1.5 flex flex-col gap-1 rounded-lg bg-background/90 p-1 shadow">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Zooma in"
                            onClick={() => zoomIn(0.4)}
                          >
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Zooma ut"
                            onClick={() => zoomOut(0.4)}
                          >
                            <ZoomOut className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Återställ"
                            onClick={() => resetTransform()}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </TransformWrapper>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Zooma med knapparna, rullhjulet eller nyp på mobilen — dra för att flytta
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setPreviewBig((v) => !v)}
                  >
                    {previewBig ? "Mindre ruta" : "Större ruta"}
                  </Button>
                  {(file || edit?.file_url) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => (edit?.file_url ? void openFile(edit.file_url) : window.open(preview, "_blank"))}
                    >
                      <Maximize2 className="mr-1 h-3.5 w-3.5" /> Öppna
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : edit?.file_url ? (
            <Button variant="outline" className="h-11 justify-start" onClick={() => openFile(edit.file_url!)}>
              <Paperclip className="mr-2 h-4 w-4" /> Visa bilden på pappret
            </Button>
          ) : null}

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

                {form.paymentMethod === "kort" && (
                  <>
                    <div className="mt-2">
                      <Label className="text-xs">Vilket kort?</Label>
                      <div className="mt-1 grid gap-1.5">
                        {paymentCards.map((c) => {
                          const on = activeCard?.id === c.id;
                          return (
                            <div
                              key={c.id}
                              className={cn(
                                "rounded-lg border transition",
                                on
                                  ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400"
                                  : "border-border bg-card",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => pickCard(c)}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted/60"
                              >
                                <StaffAvatar
                                  name={c.staff_name ?? c.card_holder}
                                  imageUrl={c.staff_image}
                                  className="h-8 w-8"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-semibold">
                                    {c.bank ? (
                                      <>
                                        {c.bank}
                                        <span className="font-normal text-muted-foreground">
                                          {" · "}
                                          {c.card_brand || "Kort"} · ••{c.card_last4}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        {c.card_brand || "Kort"} · ••{c.card_last4}
                                      </>
                                    )}
                                  </span>
                                  <span className="block truncate text-[11px] text-muted-foreground">
                                    {c.staff_name || c.card_holder || c.label || "Ingen ägare angiven"}
                                  </span>
                                </span>
                                {c.card_kind === "privat" ? (
                                  <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                                    Privat → utlägg
                                  </span>
                                ) : (
                                  <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                    Företagskort
                                  </span>
                                )}
                                {on && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                              </button>
                              {!c.bank && (
                                <button
                                  type="button"
                                  className="w-full border-t border-dashed px-2.5 py-1 text-left text-[11px] font-medium text-primary hover:bg-muted"
                                  onClick={() => {
                                    setEditingCardId(c.id);
                                    setCardForm({
                                      cardBrand: c.card_brand ?? "",
                                      bank: "",
                                      cardLast4: c.card_last4,
                                      cardHolder: c.card_holder ?? "",
                                      staffId: c.staff_id ?? "",
                                      cardKind: c.card_kind,
                                    });
                                    setCardOpen(true);
                                  }}
                                >
                                  Ange bank
                                </button>
                              )}
                            </div>
                          );
                        })}
                        <Button
                          variant="outline"
                          className="h-10 justify-start"
                          onClick={() => {
                            setEditingCardId(null);
                            setCardForm({
                              cardBrand: form.cardBrand,
                              bank: "",
                              cardLast4: form.cardLast4,
                              cardHolder: form.cardHolder,
                              staffId: "",
                              cardKind: "foretag",
                            });
                            setCardOpen(true);
                          }}
                        >
                          <CreditCard className="mr-2 h-4 w-4" /> Lägg till ett kort
                        </Button>
                      </div>
                      {activeCard && (
                        <p className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-800">
                          <Check className="h-3.5 w-3.5" />
                          {activeCard.card_kind === "privat"
                            ? `${activeCard.staff_name || activeCard.card_holder || "Personen"} har betalat privat — bokförs som utlägg`
                            : `Betalat med företagskortet ${cardLabel(activeCard)}`}
                        </p>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Korttyp{litLabel("cardBrand")}</Label>
                      <Input
                        value={form.cardBrand}
                        onChange={(e) => setField("cardBrand", e.target.value)}
                        placeholder="Visa, Twint …"
                        className={cn("h-10", lit("cardBrand"))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Sista 4 siffror{litLabel("cardLast4")}</Label>
                      <Input
                        inputMode="numeric"
                        maxLength={4}
                        value={form.cardLast4}
                        onChange={(e) => setField("cardLast4", e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="4321"
                        className={cn("h-10 font-mono tabular-nums", lit("cardLast4"))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Kortet tillhör{litLabel("cardHolder")}</Label>
                      <Input
                        value={form.cardHolder}
                        onChange={(e) => setField("cardHolder", e.target.value)}
                        placeholder="Namn"
                        className={cn("h-10", lit("cardHolder"))}
                      />
                    </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {form.paperType === "kort" && (
              <div className="rounded-lg border border-teal-300 bg-teal-50/60 p-2.5">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-teal-900">
                  <CreditCard className="h-4 w-4" /> Det här kortet läggs in i kortregistret
                </p>
                <div className="mb-2">
                  <Label className="text-xs">Vilken bank står på kortet?{litLabel("companyName")}</Label>
                  <Input
                    value={form.companyName}
                    onChange={(e) => setField("companyName", e.target.value)}
                    placeholder="PostFinance, SEB …"
                    className={cn("h-10", lit("companyName"))}
                  />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {BANK_CHOICES.map((b) => (
                      <Button
                        key={b}
                        type="button"
                        size="sm"
                        variant={form.companyName === b ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setField("companyName", form.companyName === b ? "" : b)}
                      >
                        {b}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Korttyp{litLabel("cardBrand")}</Label>
                    <Input
                      value={form.cardBrand}
                      onChange={(e) => setField("cardBrand", e.target.value)}
                      placeholder="Visa, Twint …"
                      className={cn("h-10", lit("cardBrand"))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Sista 4 siffror{litLabel("cardLast4")}</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={4}
                      value={form.cardLast4}
                      onChange={(e) => setField("cardLast4", e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="4321"
                      className={cn("h-10 font-mono tabular-nums", lit("cardLast4"))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Namnet på kortet{litLabel("cardHolder")}</Label>
                    <Input
                      value={form.cardHolder}
                      onChange={(e) => setField("cardHolder", e.target.value)}
                      placeholder="Namn"
                      className={cn("h-10", lit("cardHolder"))}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <Label className="text-xs">
                    Vem äger kortet?
                    {kortOwnerAuto ? (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        <Sparkles className="h-2.5 w-2.5" /> avläst — kontrollera
                      </span>
                    ) : null}
                  </Label>
                  <PersonSelect
                    value={kortOwner}
                    onChange={(v) => {
                      setKortOwnerAuto(false);
                      setKortOwner(v);
                    }}
                    staffList={staffList}
                    className={cn(kortOwnerAuto && "border-amber-500 bg-amber-50 ring-1 ring-amber-400")}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Är det någon utanför personallistan? Lämna valet tomt och skriv namnet i "Namnet på kortet".
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={kortPrivat ? "outline" : "default"}
                    className="h-11 text-sm font-semibold"
                    onClick={() => setKortPrivat(false)}
                  >
                    Företagskort
                  </Button>
                  <Button
                    type="button"
                    variant={kortPrivat ? "default" : "outline"}
                    className="h-11 text-sm font-semibold"
                    onClick={() => setKortPrivat(true)}
                  >
                    Privat kort → utlägg
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-teal-900">
                  Kvitton med samma fyra sista siffror kopplas automatiskt till kortet, så du kan
                  sortera på kort, kontant och kortnummer.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Företag{litLabel("companyName")}</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setField("companyName", e.target.value)}
                  placeholder="Företagets namn"
                  className={cn("h-10", lit("companyName"))}
                />
                <div className="mt-2 flex items-center gap-2">
                  {companyLogoUrl(form.companyWebsite) ? (
                    <img
                      src={companyLogoUrl(form.companyWebsite)!}
                      alt={`Logotyp för ${form.companyName || "företaget"}`}
                      className="h-9 w-9 shrink-0 rounded-md border border-border bg-white object-contain p-0.5"
                      loading="lazy"
                    />
                  ) : null}
                  <Input
                    value={form.companyWebsite}
                    onChange={(e) => setField("companyWebsite", e.target.value)}
                    placeholder="Webbadress — ger logotypen"
                    className={cn("h-10", lit("companyWebsite"))}
                  />
                </div>
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

            {form.paperType !== "kort" && (
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
            )}

            {form.paperType !== "kort" && (
            <>
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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Bokföringskonto{litLabel("expenseAccount")}</Label>
                <Select
                  value={form.expenseAccount || "inget"}
                  onValueChange={(v) => setField("expenseAccount", v === "inget" ? "" : v)}
                >
                  <SelectTrigger className={cn("h-10", lit("expenseAccount"))}>
                    <SelectValue placeholder="Välj konto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inget">Inget konto valt</SelectItem>
                    {allAccountGroups(form.currency).map((g) => (
                      <SelectGroup key={g.country}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.accounts.map((a) => (
                          <SelectItem key={`${g.country}-${a.code}`} value={a.code}>
                            {`${a.code} — ${a.label}`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {form.expenseAccount
                    ? `${accountLabel(form.expenseAccount, form.currency)}${
                        counterpartAccount(form.expenseAccount)
                          ? ` · motsvarar ${counterpartAccount(form.expenseAccount)!.code} ${
                              counterpartAccount(form.expenseAccount)!.label
                            }`
                          : ""
                      }`
                    : "Både svenska (BAS) och schweiziska (KMU) konton kan väljas"}
                </p>
              </div>
              <div>
                <Label className="text-xs">Kostnadsslag{litLabel("expenseCategory")}</Label>
                <Input
                  value={form.expenseCategory}
                  onChange={(e) => setField("expenseCategory", e.target.value)}
                  placeholder="Kostnadsslag"
                  className={cn("h-10", lit("expenseCategory"))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Vad köptes?{litLabel("itemsText")}</Label>
              <Textarea
                value={form.itemsText}
                onChange={(e) => setField("itemsText", e.target.value)}
                placeholder="En vara per rad, belopp sist"
                rows={4}
                className={cn("font-mono text-sm", lit("itemsText"))}
              />
            </div>

            <div>
              <Label className="text-xs">Vad innehåller pappret?{litLabel("description")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Kort och sökbart"
                rows={2}
                className={cn(lit("description"))}
              />
            </div>
            </>
            )}

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
                {!file && edit?.file_url && (
                  <>
                    <Button variant="outline" className="h-10" disabled={reading} onClick={() => void rereadSaved()}>
                      {reading ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="mr-1 h-4 w-4" />
                      )}
                      Läs av bilden igen
                    </Button>
                    <Button variant="ghost" className="h-10" onClick={() => void openFile(edit.file_url!)}>
                      Visa bilden
                    </Button>
                  </>
                )}
                <span className="truncate text-xs text-muted-foreground">
                  {file?.name ?? edit?.file_name ?? "Ingen fil"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {reading
                  ? "Läser av pappret …"
                  : "Fälten fylls i automatiskt från fotot. Gult = avläst och inte kontrollerat, grönt = du har skrivit in eller rättat det."}
              </p>
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

      {/* Ny avläsning av bilden: nya siffror mot de som står nu, du väljer vilka som gäller. */}
      <Dialog open={!!compare} onOpenChange={(o) => !o && setCompare(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ny avläsning av bilden</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Bocka i det du vill ta in. Inget ändras förrän du väljer, och pappret sparas först när du
            trycker Spara.
          </p>
          <div className="space-y-1.5">
            {(compare ?? []).map((r) => {
              const same = r.current.trim() === r.next.trim();
              const picked = pickedCompare.has(r.key);
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() =>
                    setPickedCompare((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.key)) next.delete(r.key);
                      else next.add(r.key);
                      return next;
                    })
                  }
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs transition",
                    picked ? "border-amber-500 bg-amber-50" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      picked ? "border-amber-600 bg-amber-500 text-white" : "border-muted-foreground/40",
                    )}
                  >
                    {picked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{r.label}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                      <span className="text-muted-foreground line-through">{r.current || "—"}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className={same ? "text-muted-foreground" : "font-semibold text-emerald-700"}>
                        {r.next}
                      </span>
                      {same && <span className="font-sans text-[10px] text-muted-foreground">samma som nu</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCompare(null)}>
              Behåll som det är
            </Button>
            <Button
              onClick={() => applyCompare((compare ?? []).filter((r) => pickedCompare.has(r.key)))}
              disabled={pickedCompare.size === 0}
            >
              Använd valda värden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kortregistret: när kortet är inlagt vet systemet vem som betalat. */}
      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lägg till ett kort</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <input
              ref={cardCamRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void readCardPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={cardLibRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void readCardPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="h-14 justify-center text-sm font-semibold"
                disabled={cardReading}
                onClick={() => cardCamRef.current?.click()}
              >
                {cardReading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-5 w-5" />
                )}
                Ta foto på kortet
              </Button>
              <Button
                variant="outline"
                className="h-14 justify-center text-sm font-semibold"
                disabled={cardReading}
                onClick={() => cardLibRef.current?.click()}
              >
                <ImagePlus className="mr-2 h-5 w-5" /> Välj bild
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {cardReading
                ? "Läser av kortet …"
                : "Fotot används bara för att läsa av korttyp, de fyra sista siffrorna och namnet. Hela kortnumret sparas aldrig."}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Korttyp</Label>
                <Input
                  value={cardForm.cardBrand}
                  onChange={(e) => {
                    setCardAutoFilled((s) => {
                      const n = new Set(s);
                      n.delete("cardBrand");
                      return n;
                    });
                    setCardForm((f) => ({ ...f, cardBrand: e.target.value }));
                  }}
                  placeholder="Visa, Twint …"
                  className={`h-10 ${cardAutoFilled.has("cardBrand") ? "border-amber-400 bg-amber-50" : ""}`}
                />
              </div>
              <div>
                <Label className="text-xs">Sista 4 siffror</Label>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={cardForm.cardLast4}
                  onChange={(e) => {
                    setCardAutoFilled((s) => {
                      const n = new Set(s);
                      n.delete("cardLast4");
                      return n;
                    });
                    setCardForm((f) => ({ ...f, cardLast4: e.target.value.replace(/\D/g, "").slice(0, 4) }));
                  }}
                  placeholder="4321"
                  className={`h-10 font-mono tabular-nums ${cardAutoFilled.has("cardLast4") ? "border-amber-400 bg-amber-50" : ""}`}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Vilken bank står på kortet?</Label>
              <Input
                value={cardForm.bank}
                onChange={(e) => {
                  setCardAutoFilled((s) => {
                    const n = new Set(s);
                    n.delete("bank");
                    return n;
                  });
                  setCardForm((f) => ({ ...f, bank: e.target.value }));
                }}
                placeholder="PostFinance, UBS, SEB …"
                className={`h-10 ${cardAutoFilled.has("bank") ? "border-amber-400 bg-amber-50" : ""}`}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {BANK_CHOICES.map(
                  (b) => (
                    <Button
                      key={b}
                      type="button"
                      variant={cardForm.bank === b ? "default" : "outline"}
                      className="h-7 px-2 text-[11px]"
                      onClick={() => {
                        setCardAutoFilled((s) => {
                          const n = new Set(s);
                          n.delete("bank");
                          return n;
                        });
                        setCardForm((f) => ({ ...f, bank: f.bank === b ? "" : b }));
                      }}
                    >
                      {b}
                    </Button>
                  ),
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs">Vem äger kortet?</Label>
              <PersonSelect
                value={cardForm.staffId}
                onChange={(v) => {
                  setCardAutoFilled((st) => {
                    const n = new Set(st);
                    n.delete("staffId");
                    return n;
                  });
                  setCardForm((f) => ({ ...f, staffId: v }));
                }}
                staffList={staffList}
                className={cardAutoFilled.has("staffId") ? "border-amber-400 bg-amber-50" : ""}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Tillhör kortet någon som inte finns i personallistan? Lämna valet tomt och skriv namnet här under.
              </p>
              <Input
                value={cardForm.cardHolder}
                onChange={(e) => {
                  setCardAutoFilled((s) => {
                    const n = new Set(s);
                    n.delete("cardHolder");
                    n.delete("staffId");
                    return n;
                  });
                  setCardForm((f) => ({ ...f, cardHolder: e.target.value }));
                }}
                placeholder="Skriv namnet fritt, t.ex. bolaget eller en extern person"
                className={`mt-1.5 h-10 ${cardAutoFilled.has("cardHolder") ? "border-amber-400 bg-amber-50" : ""}`}
              />
            </div>

            <div>
              <Label className="text-xs">Vad är det för kort?</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {[
                  ["foretag", "Företagskort"],
                  ["privat", "Privat kort — utlägg"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={cardForm.cardKind === value ? "default" : "outline"}
                    className="h-11 text-sm font-semibold"
                    onClick={() => setCardForm((f) => ({ ...f, cardKind: value as "foretag" | "privat" }))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Privat kort betyder att personen lagt ut egna pengar och ska få dem tillbaka.
              </p>
            </div>

            {paymentCards.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-xs font-semibold">Kort som finns inlagda</p>
                <div className="space-y-1">
                  {paymentCards.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <StaffAvatar
                        name={c.staff_name ?? c.card_holder}
                        imageUrl={c.staff_image}
                        className="h-7 w-7"
                      />
                      <span className="min-w-0 flex-1 truncate">{cardLabel(c)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeCard.mutate(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCardOpen(false)}>
              Avbryt
            </Button>
            <Button
              disabled={!/^\d{4}$/.test(cardForm.cardLast4) || saveCard.isPending}
              onClick={async () => {
                try {
                  const staff = staffList.find((s) => s.id === cardForm.staffId);
                  await saveCard.mutateAsync({
                    id: editingCardId ?? undefined,
                    storeId: storeId ?? null,
                    staffId: cardForm.staffId || null,
                    cardBrand: cardForm.cardBrand,
                    bank: cardForm.bank,
                    cardLast4: cardForm.cardLast4,
                    cardHolder:
                      cardForm.cardHolder ||
                      (staff ? `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() : ""),
                    cardKind: cardForm.cardKind,
                  });
                  toast.success(editingCardId ? "Kortet är uppdaterat" : "Kortet är inlagt");
                  setEditingCardId(null);
                  setCardOpen(false);
                } catch (e: any) {
                  toast.error(e?.message ?? "Kunde inte spara kortet");
                }
              }}
            >
              {saveCard.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Spara kortet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
