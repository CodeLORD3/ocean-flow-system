import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardCheck,
  HelpCircle,
  Keyboard,
  MessageSquarePlus,
  Package,
  RotateCcw,
  Search,
  Send,
  SkipForward,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSite } from "@/contexts/SiteContext";
import { useTabs } from "@/contexts/TabsContext";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { useCurrentStaff, staffFullName } from "@/hooks/useCurrentStaff";
import {
  useCountItems,
  useCountLines,
  useCountPlaces,
  useOpenCountSession,
  useRemoveCountLine,
  useSaveCountLine,
  type CountItem,
  type CountPlace,
} from "@/hooks/useMobileStockCount";
import {
  bestBeforeText,
  clearDraft,
  clearPosition,
  diffText,
  fmtQty,
  readDraft,
  readPosition,
  submitCount,
  timeText,
  writeDraft,
  writePosition,
} from "@/lib/mobileCount";
import NumberPad from "@/components/inventory/mobile/NumberPad";
import CountStepper from "@/components/inventory/mobile/CountStepper";
import IntroSlides, { hasSeenIntro } from "@/components/inventory/mobile/IntroSlides";
import PendingCountApprovals from "@/components/inventory/mobile/PendingCountApprovals";
import CountNoteSheet from "@/components/inventory/mobile/CountNoteSheet";
import OrderSheet from "@/components/inventory/mobile/OrderSheet";
import { useDraftOrder } from "@/hooks/useStoreReplenishment";
import { tomorrowSe } from "@/lib/storeReplenishment";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";

type Step = "plats" | "rakna" | "klarplats" | "sammanfattning" | "klar";

const BLIND_KEY = "count-blind";

/** Stor primärknapp längst ner i tumzonen. */
function BigButton({
  children,
  onClick,
  variant = "primary",
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "plain" | "danger";
  disabled?: boolean;
}) {
  const look =
    variant === "primary"
      ? "bg-primary text-primary-foreground active:brightness-110"
      : variant === "danger"
        ? "border border-destructive/40 bg-destructive/10 text-destructive"
        : "border border-border bg-card active:bg-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-16 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl text-[19px] font-semibold shadow-sm disabled:opacity-50 ${look}`}
    >
      {children}
    </button>
  );
}

/**
 * Räkna varor — guidad inventering på telefon. En sak per skärm, stora
 * tryckytor och inga tekniska ord. Lagret ändras aldrig här: räkningen skickas
 * in och butikschefen godkänner.
 */
export default function CountMobile() {
  const { activeStoreId, activeStoreName } = useSite();
  const { activeUser } = useActiveUser();
  const { data: me } = useCurrentStaff();
  const { switchTab } = useTabs();
  const storeId = activeStoreId;
  // Räkningen måste alltid kopplas till den INLOGGADE personen, aldrig till
  // "aktiv användare"-väljaren — annars hamnar räkningen på fel namn.
  const staffId = me?.id ?? activeUser?.id ?? null;
  const staffName =
    staffFullName(me) ??
    (activeUser ? `${activeUser.first_name} ${activeUser.last_name}`.trim() : null);

  const [step, setStep] = useState<Step>("plats");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, number>>({});
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [padValue, setPadValue] = useState("");
  const [resumePlace, setResumePlace] = useState<CountPlace | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [blind, setBlind] = useState(() => {
    try {
      return localStorage.getItem(BLIND_KEY) !== "av";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!hasSeenIntro()) setIntroOpen(true);
  }, []);

  /** Butikens beställning till imorgon — samma utkast för alla tryck. */
  const wantedDate = useMemo(() => tomorrowSe(), []);
  const draftOrder = useDraftOrder(storeId, wantedDate);
  const orderedByProduct = useMemo(() => {
    const map = new Map<string, any>();
    for (const l of draftOrder.data?.store_replenishment_lines ?? []) map.set(l.product_id, l);
    return map;
  }, [draftOrder.data]);

  const places = useCountPlaces(storeId);
  const items = useCountItems(locationId);
  const lines = useCountLines(sessionId);
  const openSession = useOpenCountSession();
  const saveLine = useSaveCountLine();
  const removeLine = useRemoveCountLine();

  /** Sparade rader från databasen fylls in i räkningen. */
  useEffect(() => {
    if (!lines.data) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const l of lines.data) {
        if (l.counted_qty === null || l.counted_qty === undefined) continue;
        const key = `${l.product_id}:${l.lot_id ?? ""}`;
        if (next[key] === undefined) next[key] = Number(l.counted_qty);
      }
      return next;
    });
  }, [lines.data]);

  const list = items.data ?? [];
  const current: CountItem | undefined = list[index];
  const countedKeys = Object.keys(values);
  const countedTotal = countedKeys.length;

  const setBlindMode = (v: boolean) => {
    setBlind(v);
    try {
      localStorage.setItem(BLIND_KEY, v ? "pa" : "av");
    } catch {
      /* ignoreras */
    }
  };

  /** Varje inmatning sparas direkt — lokalt och mot databasen. */
  const store = async (item: CountItem, qty: number, comment?: string) => {
    const key = item.key;
    const next = { ...values, [key]: qty };
    setValues(next);
    setLastKey(key);
    if (storeId && locationId)
      writeDraft({ storeId, locationId, staffId, values: next });
    if (sessionId && locationId) {
      try {
        await saveLine.mutateAsync({ sessionId, item, locationId, quantity: qty, comment });
      } catch {
        toast.error("Kunde inte spara mot systemet just nu — siffran ligger kvar i telefonen.");
      }
    }
  };

  const goNext = () => {
    if (index + 1 < list.length) setIndex(index + 1);
    else setStep("klarplats");
  };

  /** Backa till varan innan — siffran som redan matats in ligger kvar. */
  const goPrev = () => {
    if (index > 0) setIndex(index - 1);
  };


  const saveAndNext = async () => {
    if (!current) return;
    await store(current, values[current.key] ?? 0, notes[current.key] || undefined);
    goNext();
  };

  const undoLast = async () => {
    if (!lastKey) return;
    const item = list.find((i) => i.key === lastKey);
    const next = { ...values };
    delete next[lastKey];
    setValues(next);
    if (storeId && locationId) writeDraft({ storeId, locationId, staffId, values: next });
    if (sessionId && locationId && item)
      await removeLine.mutateAsync({
        sessionId,
        productId: item.productId,
        locationId,
        lotId: item.lotId,
      });
    if (item) setIndex(Math.max(0, list.findIndex((i) => i.key === item.key)));
    setLastKey(null);
    toast.success("Inmatningen togs bort", { position: "top-center" });
  };

  /** Väljer lagerplats. Någon annans påbörjade räkning öppnas aldrig. */
  const choosePlace = async (place: CountPlace) => {
    // En kollega kan ha börjat på samma plats. Ingen låsning — man fortsätter
    // på samma räkning så inga rader tappas.
    setLocationId(place.id);
    setLocationName(place.name);
    const draft = storeId ? readDraft(storeId, place.id, staffId) : null;
    if (place.countedRows > 0 || draft) {
      setResumePlace(place);
      return;
    }
    await begin(place, false);
  };

  const begin = async (place: CountPlace, fresh: boolean) => {
    if (!storeId) return;
    setResumePlace(null);
    const draft = readDraft(storeId, place.id, staffId);
    setValues(fresh ? {} : draft?.values ?? {});
    if (fresh) clearDraft(storeId, place.id, staffId);
    setIndex(0);
    setLastKey(null);
    try {
      const id = await openSession.mutateAsync({
        storeId,
        locationId: place.id,
        staffId,
        staffName,
        locationName: place.name,
        fresh,
      });
      setSessionId(id);
      setStep("rakna");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte starta räkningen.");
    }
  };

  /** Rader att visa i sammanfattningen, med avvikelse mot systemets saldo. */
  const summary = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list
      .filter((i) => values[i.key] !== undefined)
      .filter((i) => !q || i.productName.toLowerCase().includes(q))
      .map((i) => ({ item: i, counted: values[i.key], diff: values[i.key] - i.expectedQty }));
  }, [list, values, search]);

  const diffCount = useMemo(
    () =>
      list.filter(
        (i) => values[i.key] !== undefined && Math.abs(values[i.key] - i.expectedQty) >= 0.05,
      ).length,
    [list, values],
  );

  const sendCount = async () => {
    if (!storeId || !sessionId || !locationId) return;
    setSending(true);
    try {
      const rows = list
        .filter((i) => values[i.key] !== undefined)
        .map((i) => ({
          productId: i.productId,
          productName: i.productName,
          sku: i.sku,
          unit: i.unit,
          category: i.category,
          costPrice: i.costPrice,
          expectedQty: i.expectedQty,
          countedQty: values[i.key],
        }));
      await submitCount({
        storeId,
        sessionId,
        locationId,
        locationName,
        reportedBy: staffName,
        rows,
      });
      clearDraft(storeId, locationId, staffId);
      setConfirmOpen(false);
      setStep("klar");
      places.refetch();
      toast.success("Räkningen är inskickad");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte skicka in räkningen.");
    } finally {
      setSending(false);
    }
  };

  const header = (
    <div className="-mx-4 flex shrink-0 items-center justify-between gap-1 border-b border-border bg-background px-2 py-1">
      <button
        type="button"
        onClick={() =>
          step === "plats"
            ? switchTab("/inventory")
            : setStep(step === "rakna" ? "plats" : step === "sammanfattning" ? "rakna" : "plats")
        }
        className="flex h-14 min-h-[56px] min-w-[56px] items-center gap-1 rounded-2xl px-2 text-[17px] font-semibold"
      >
        <ArrowLeft className="h-6 w-6 shrink-0" /> Tillbaka
      </button>
      {step === "rakna" && list.length > 0 && (
        <span className="truncate text-[17px] font-semibold tabular-nums">
          Vara {Math.min(index + 1, list.length)} av {list.length}
        </span>
      )}
      <div className="flex items-center gap-1">
        {step === "rakna" && lastKey && (
          <button
            type="button"
            onClick={undoLast}
            className="flex h-14 min-h-[56px] min-w-[56px] items-center gap-1 rounded-2xl border border-border px-2 text-[17px] font-medium"
          >
            <RotateCcw className="h-6 w-6 shrink-0" /> Ångra
          </button>
        )}
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Hur gör jag?"
          className="flex h-14 min-h-[56px] min-w-[56px] items-center justify-center gap-1 rounded-2xl border border-border px-2 text-[17px] font-medium"
        >
          <HelpCircle className="h-6 w-6 shrink-0 text-primary" />
        </button>
      </div>
    </div>
  );

  if (!storeId) {
    return (
      <div className="mx-auto w-full max-w-[520px] overflow-x-hidden px-4 py-6">
        <p className="text-[18px]">Välj butik först, sedan kan du räkna.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[520px] flex-col overflow-x-hidden px-4">
      {header}


      {/* Steg 2 — välj plats */}
      {step === "plats" && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4">
          <p className="text-[16px] text-muted-foreground">{activeStoreName}</p>
          <h2 className="font-heading text-[22px] font-semibold">Var räknar du?</h2>
          {places.isLoading && <p className="text-[18px] text-muted-foreground">Hämtar platser…</p>}
          {(places.data ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choosePlace(p)}
              className="flex min-h-[80px] w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm active:bg-muted"
            >
              <span className="min-w-0">
                <span className="block truncate font-heading text-[22px] font-semibold leading-tight">
                  {p.name}
                </span>
                <span className="block text-[16px] text-muted-foreground">
                  {p.productCount} varor
                </span>
                <span
                  className={`mt-1 block text-[16px] font-semibold ${
                    p.countedRows === 0
                      ? "text-muted-foreground"
                      : p.countedRows >= p.productCount
                        ? "text-emerald-600"
                        : "text-amber-600"
                  }`}
                >
                  {p.countedRows === 0
                    ? "Ej påbörjad"
                    : p.countedRows >= p.productCount
                      ? "Klar"
                      : `Pågår — ${p.countedRows} av ${p.productCount} klara`}
                </span>
                {p.countedRows > 0 && (
                  <span className="block text-[16px] text-muted-foreground">
                    Fortsätt där du slutade
                    {timeText(p.lastActivityAt) ? ` — ${timeText(p.lastActivityAt)}` : ""}
                  </span>
                )}
                {p.claimedBy && staffId && p.claimedBy !== staffId && p.countedRows > 0 && (
                  <span className="block text-[16px] text-muted-foreground">
                    {p.claimedByName || "En kollega"} räknar här
                  </span>
                )}
              </span>
              <ChevronRight className="h-7 w-7 shrink-0 text-muted-foreground" />
            </button>
          ))}
          {places.data && places.data.length === 0 && (
            <p className="text-[18px] text-muted-foreground">
              Butiken har inga lagerplatser upplagda ännu.
            </p>
          )}
          <PendingCountApprovals storeId={storeId} />
        </div>
      )}

      {/* Steg 3 — räkna: allt ryms på en skärm, knappzonen alltid synlig */}
      {step === "rakna" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mt-2 h-2 w-full shrink-0 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${list.length ? ((index + 1) / list.length) * 100 : 0}%` }}
            />
          </div>

          {items.isLoading && (
            <p className="mt-4 text-[18px] text-muted-foreground">Hämtar varor…</p>
          )}

          {current && (
            <>
              {/* Produktrad — liten bild till vänster, namnet stort */}
              <div className="mt-3 flex min-h-0 shrink items-start gap-3">
                <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
                  {current.imageUrl ? (
                    <img
                      src={thumbUrl(current.imageUrl, THUMB_TILE) as string}
                      alt={current.productName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-8 w-8 text-muted-foreground/50" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words font-heading text-[24px] font-semibold leading-tight">
                    {current.productName}
                  </h2>
                  <p className="text-[18px] leading-snug text-muted-foreground">
                    Räknas i {current.unit === "st" ? "stycken" : "kg"}
                  </p>
                  {current.lotNumber && (
                    <p className="text-[17px] font-medium leading-snug">
                      Parti {current.lotNumber}
                      {bestBeforeText(current.bestBefore)
                        ? ` · ${bestBeforeText(current.bestBefore)}`
                        : ""}
                    </p>
                  )}
                  {!blind && (
                    <p className="text-[17px] leading-snug text-muted-foreground">
                      Systemet har {fmtQty(current.expectedQty, current.unit)}
                    </p>
                  )}
                  {notes[current.key] && (
                    <p className="truncate text-[16px] italic text-muted-foreground">
                      {notes[current.key]}
                    </p>
                  )}
                </div>
              </div>

              {/* Stegaren */}
              <div className="mt-3 shrink-0">
                <CountStepper
                  value={values[current.key] ?? 0}
                  unit={current.unit}
                  onChange={(v) => setValues({ ...values, [current.key]: v })}
                />
              </div>

              {/* En rad med två sekundärknappar */}
              <div className="mt-3 grid shrink-0 grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPadValue(
                      values[current.key] !== undefined
                        ? String(values[current.key]).replace(".", ",")
                        : "",
                    );
                    setPadOpen(true);
                  }}
                  className="flex h-14 min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-border bg-card px-2 text-[18px] font-semibold active:bg-muted"
                >
                  <Keyboard className="h-6 w-6 shrink-0" />
                  <span className="truncate">Skriv siffra</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNoteOpen(true)}
                  className="flex h-14 min-h-[56px] items-center justify-center gap-2 rounded-2xl border border-border bg-card px-2 text-[18px] font-semibold active:bg-muted"
                >
                  <MessageSquarePlus className="h-6 w-6 shrink-0" />
                  <span className="truncate">Anteckning</span>
                </button>
              </div>

              {/* Beställ varan till butiken — inget lager flyttas här */}
              {storeId && (
                <div className="mt-3 shrink-0">
                  <OrderSheet
                    storeId={storeId}
                    staffName={staffName}
                    productId={current.productId}
                    productName={current.productName}
                    unit={current.unit}
                    wantedDate={wantedDate}
                    existing={orderedByProduct.get(current.productId) ?? null}
                    editable
                  />
                </div>
              )}

              {/* Knappzon — alltid längst ner, aldrig under vecket */}
              <div className="mt-auto shrink-0 space-y-3 pb-3 pt-3">
                <BigButton onClick={saveAndNext}>
                  <Check className="h-6 w-6" /> Spara och nästa
                </BigButton>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={index === 0}
                    className="flex h-14 min-h-[56px] items-center justify-center gap-1 rounded-2xl border border-border bg-card px-2 text-[18px] font-semibold active:bg-muted disabled:opacity-40"
                  >
                    <ArrowLeft className="h-6 w-6 shrink-0" />
                    <span className="truncate">Föregående</span>
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex h-14 min-h-[56px] items-center justify-center gap-1 rounded-2xl border border-border bg-card px-2 text-[18px] font-semibold active:bg-muted"
                  >
                    <SkipForward className="h-6 w-6 shrink-0" />
                    <span className="truncate">Hoppa över</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await store(current, 0, "Finns inte här");
                      goNext();
                    }}
                    className="flex h-14 min-h-[56px] items-center justify-center gap-1 rounded-2xl border border-border bg-card px-2 text-[18px] font-semibold active:bg-muted"
                  >
                    <XCircle className="h-6 w-6 shrink-0" />
                    <span className="truncate">Finns inte</span>
                  </button>
                </div>

              </div>
            </>
          )}
        </div>
      )}

      {/* Egen skärm efter sista varan */}
      {step === "klarplats" && (
        <div className="flex min-h-0 flex-1 flex-col py-4">
          <div className="rounded-3xl border border-emerald-500/50 bg-emerald-50 p-5 dark:bg-emerald-500/10">
            <Check className="h-10 w-10 text-emerald-600" />
            <h2 className="mt-2 font-heading text-[24px] font-semibold leading-tight">
              Klar med platsen
            </h2>
            <p className="mt-1 text-[18px] leading-snug text-muted-foreground">
              {locationName}: {countedTotal} varor räknade. Titta igenom listan innan du skickar in.
            </p>
          </div>
          <div className="mt-auto space-y-3 pb-3">
            <BigButton onClick={() => setStep("sammanfattning")}>
              <ChevronRight className="h-6 w-6" /> Titta igenom och skicka in
            </BigButton>
            <BigButton variant="plain" onClick={() => setStep("rakna")}>
              Tillbaka till varorna
            </BigButton>
          </div>
        </div>
      )}

      {/* Steg 4 — sammanfattning */}
      {step === "sammanfattning" && (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
          <div>
            <h2 className="font-heading text-[22px] font-semibold">Det du räknat</h2>
            <p className="text-[18px] text-muted-foreground">
              {countedTotal} varor räknade, {diffCount} skiljer sig från väntat.
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök vara"
              className="h-16 min-h-[56px] pl-11 text-[18px]"
            />
          </div>
          <div className="space-y-2">
            {summary.map(({ item, counted, diff }) => {
              const off = Math.abs(diff) >= 0.05;
              const ordered = orderedByProduct.get(item.productId) ?? null;
              return (
                <div key={item.key} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIndex(list.findIndex((i) => i.key === item.key));
                    setStep("rakna");
                  }}
                  className={`flex min-h-[72px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${
                    off ? "border-amber-500/50 bg-amber-50 dark:bg-amber-500/10" : "border-border bg-card"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[19px] font-semibold leading-tight">
                      {item.productName}
                    </span>
                    <span
                      className={`block text-[17px] ${
                        off
                          ? diff < 0
                            ? "text-rose-600"
                            : "text-emerald-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {diffText(diff, item.unit)}
                    </span>
                  </span>
                  <span className="shrink-0 font-heading text-[22px] font-semibold tabular-nums">
                    {fmtQty(counted, item.unit)}
                  </span>
                </button>
                {storeId && (
                  <div className="w-[56px] shrink-0">
                    <OrderSheet
                      storeId={storeId}
                      staffName={staffName}
                      productId={item.productId}
                      productName={item.productName}
                      unit={item.unit}
                      wantedDate={wantedDate}
                      existing={ordered}
                      editable
                    />
                  </div>
                )}
                </div>
              );
            })}
            {summary.length === 0 && (
              <p className="text-[18px] text-muted-foreground">Inget räknat ännu.</p>
            )}
          </div>
          <BigButton onClick={() => setConfirmOpen(true)} disabled={countedTotal === 0}>
            <Send className="h-6 w-6" /> Skicka in räkningen
          </BigButton>
        </div>
      )}

      {/* Steg 5 — klart */}
      {step === "klar" && (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-4">
          <div className="rounded-3xl border border-emerald-500/50 bg-emerald-50 p-5 dark:bg-emerald-500/10">
            <ClipboardCheck className="h-10 w-10 text-emerald-600" />
            <h2 className="mt-2 font-heading text-[24px] font-semibold leading-tight text-emerald-800 dark:text-emerald-200">
              Räkningen är inskickad
            </h2>
            <p className="mt-1 text-[18px] leading-snug text-emerald-900/80 dark:text-emerald-200/80">
              Den väntar på godkännande. Butikschefen godkänner innan lagret uppdateras.
            </p>
          </div>
          <BigButton
            variant="plain"
            onClick={() => {
              setValues({});
              setSessionId(null);
              setLocationId(null);
              setIndex(0);
              setStep("plats");
              places.refetch();
            }}
          >
            Räkna en annan plats
          </BigButton>
        </div>
      )}

      {/* Stor knappsats */}
      <Dialog open={padOpen} onOpenChange={setPadOpen}>
        <DialogContent className="max-w-[360px] gap-4 rounded-3xl p-4">
          <DialogHeader>
            <DialogTitle className="text-[20px]">
              {current?.productName ?? "Skriv siffra"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex h-16 items-center justify-end rounded-2xl border border-border bg-muted/40 px-4 font-heading text-[30px] font-semibold tabular-nums">
            {padValue || "0"}
            <span className="ml-2 text-[18px] text-muted-foreground">{current?.unit}</span>
          </div>
          <NumberPad
            value={padValue}
            onChange={setPadValue}
            allowDecimal={current?.unit !== "st"}
          />
          <BigButton
            onClick={() => {
              if (!current) return;
              const qty = Number((padValue || "0").replace(",", "."));
              setValues({ ...values, [current.key]: Number.isFinite(qty) ? qty : 0 });
              setPadOpen(false);
            }}
          >
            <Check className="h-6 w-6" /> Klar
          </BigButton>
        </DialogContent>
      </Dialog>

      {/* Fortsätt eller börja om */}
      <Dialog open={!!resumePlace} onOpenChange={(v) => !v && setResumePlace(null)}>
        <DialogContent className="max-w-[360px] gap-4 rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle className="text-[21px] leading-tight">
              Fortsätt räkningen
              {timeText(resumePlace?.lastActivityAt) ? ` från ${timeText(resumePlace?.lastActivityAt)}` : ""}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-[18px] text-muted-foreground">
            {resumePlace?.countedRows ?? 0} varor är redan räknade på {resumePlace?.name}.
          </p>
          <BigButton onClick={() => resumePlace && begin(resumePlace, false)}>
            Fortsätt
          </BigButton>
          <BigButton variant="plain" onClick={() => resumePlace && begin(resumePlace, true)}>
            Börja om
          </BigButton>
        </DialogContent>
      </Dialog>

      {/* Bekräfta inskick */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-[360px] gap-4 rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle className="text-[21px] leading-tight">Skicka in räkningen?</DialogTitle>
          </DialogHeader>
          <p className="text-[18px] leading-snug">
            {countedTotal} varor räknade, {diffCount} avvikelser. Butikschefen godkänner innan
            lagret uppdateras.
          </p>
          <BigButton onClick={sendCount} disabled={sending}>
            <Send className="h-6 w-6" /> {sending ? "Skickar…" : "Skicka in"}
          </BigButton>
          <BigButton variant="plain" onClick={() => setConfirmOpen(false)}>
            Avbryt
          </BigButton>
        </DialogContent>
      </Dialog>

      {/* Hjälp */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-[360px] gap-4 rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle className="text-[21px]">Hur gör jag?</DialogTitle>
          </DialogHeader>
          <BigButton
            variant="plain"
            onClick={() => {
              setHelpOpen(false);
              setIntroOpen(true);
            }}
          >
            Visa de tre skärmarna igen
          </BigButton>
          <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
            <span className="text-[18px] leading-snug">Dölj väntat saldo när jag räknar</span>
            <Switch checked={blind} onCheckedChange={setBlindMode} />
          </div>
          <DialogFooter />
        </DialogContent>
      </Dialog>

      {current && (
        <CountNoteSheet
          open={noteOpen}
          onOpenChange={setNoteOpen}
          productId={current.productId}
          productName={current.productName}
          note={notes[current.key] ?? ""}
          onSave={(text) => {
            setNotes({ ...notes, [current.key]: text });
            if (values[current.key] !== undefined) void store(current, values[current.key], text);
          }}
        />
      )}

      <IntroSlides open={introOpen} onOpenChange={setIntroOpen} />
    </div>
  );
}
