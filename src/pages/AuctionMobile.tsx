import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, Gavel, Loader2, Pencil, Plus, Scissors, X } from "lucide-react";
import { toast } from "sonner";
import AuctionPhotoStrip from "@/components/auction/AuctionPhotoStrip";
import SplitLotSheet from "@/components/auction/SplitLotSheet";
import { splittableWeight } from "@/lib/auctionLotSplit";
import {
  auctionDaySummary,
  useAuctionDay,
  useCancelAuctionPurchase,
  useCreateAuctionPurchase,
  useUpdateAuctionPurchase,
} from "@/hooks/useAuctionPurchases";
import {
  AUCTION_STATUS_LABEL,
  boxPhotos,
  missingPhotoCount,
  nominalWeight,
  parseDecimal,
  preliminaryAmount,
  swedishToday,
  type AuctionPurchaseRow,
} from "@/lib/auctionPurchases";

/** Kronor och kilo skrivs med mellanrum i tusental, aldrig punkt. */
const num = (n: number) => n.toLocaleString("sv-SE");
const kg = (n: number) => `${n.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg`;

type Step = "lista" | "belopp" | "foto" | "klart";

/**
 * Auktionsinköp vid ringen. Tre tryck plus foto plus prissiffror:
 * pris och kolli på en skärm, kameran, klart. Partiet föds direkt.
 */
export default function AuctionMobile() {
  const day = swedishToday();
  const purchases = useAuctionDay(day);
  const create = useCreateAuctionPurchase();
  const cancel = useCancelAuctionPurchase();
  const update = useUpdateAuctionPurchase();

  const [step, setStep] = useState<Step>("lista");
  const [price, setPrice] = useState("");
  const [colli, setColli] = useState("1");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelRow, setCancelRow] = useState<AuctionPurchaseRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [editRow, setEditRow] = useState<AuctionPurchaseRow | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editColli, setEditColli] = useState("1");
  const [splitRow, setSplitRow] = useState<AuctionPurchaseRow | null>(null);

  const priceRef = useRef<HTMLInputElement>(null);
  const colliRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const rows = purchases.data ?? [];
  const summary = useMemo(() => auctionDaySummary(rows), [rows]);

  /** Antal kolli styr hur många bilder som ska tas. */
  const colliCount = Math.max(1, Math.trunc(parseDecimal(colli) ?? 0) || 1);
  const missing = Math.max(0, colliCount - photos.length);

  // Tangentbordet ska upp direkt när skärmen öppnas.
  useEffect(() => {
    if (step === "belopp") {
      const t = setTimeout(() => priceRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Kameran öppnas av sig själv så länge det saknas bilder.
  useEffect(() => {
    if (step === "foto" && photos.length === 0) {
      const t = setTimeout(() => cameraRef.current?.click(), 80);
      return () => clearTimeout(t);
    }
  }, [step, photos.length]);

  useEffect(() => {
    const urls = photos.map((p) => URL.createObjectURL(p));
    setPhotoUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const resetFlow = () => {
    setPrice("");
    setColli("1");
    setPhotos([]);
    setError(null);
  };

  const startNew = () => {
    resetFlow();
    setStep("belopp");
  };

  const validated = () => {
    const p = parseDecimal(price);
    const c = Math.trunc(parseDecimal(colli) ?? 0);
    if (!p || p <= 0) {
      setError("Ange ett pris per kg över noll.");
      priceRef.current?.focus();
      return null;
    }
    if (!c || c < 1) {
      setError("Antal kolli måste vara minst 1.");
      colliRef.current?.focus();
      return null;
    }
    setError(null);
    return { pricePerKg: p, colli: c };
  };

  const toCamera = () => {
    const valid = validated();
    if (!valid) return;
    // Sänks antalet kolli tas de överskjutande bilderna bort.
    setPhotos((prev) => prev.slice(0, valid.colli));
    setStep("foto");
  };

  const save = async () => {
    const valid = validated();
    if (!valid) return;
    if (photos.length !== valid.colli) {
      setError(
        `Ta en bild per kolli — ${valid.colli - photos.length} ${
          valid.colli - photos.length === 1 ? "bild" : "bilder"
        } kvar.`,
      );
      return;
    }
    try {
      await create.mutateAsync({
        pricePerKg: valid.pricePerKg,
        colli: valid.colli,
        photos,
        clientKey: crypto.randomUUID(),
        purchaseDate: day,
      });
      setStep("klart");
      setTimeout(() => {
        resetFlow();
        setStep("belopp");
      }, 1000);
    } catch (e: any) {
      setError(e?.message ?? "Köpet kunde inte sparas.");
      toast.error("Köpet kunde inte sparas");
    }
  };

  /** Makulering sker i en egen skärm med orsak — aldrig i en systemruta. */
  const makulera = async () => {
    if (!cancelRow) return;
    const reason = cancelReason.trim();
    if (!reason) {
      setError("Skriv varför köpet makuleras.");
      return;
    }
    try {
      await cancel.mutateAsync({ row: cancelRow, reason });
      setCancelRow(null);
      setCancelReason("");
      setError(null);
      toast.success("Köpet är makulerat");
    } catch (e: any) {
      setError(e?.message ?? "Köpet kunde inte makuleras.");
    }
  };

  /** Rättar pris eller kolli på ett köp som redan sparats. */
  const sparaAndring = async () => {
    if (!editRow) return;
    const p = parseDecimal(editPrice);
    const c = Math.trunc(parseDecimal(editColli) ?? 0);
    if (!p || p <= 0) {
      setError("Ange ett pris per kg över noll.");
      return;
    }
    if (!c || c < 1) {
      setError("Antal kolli måste vara minst 1.");
      return;
    }
    try {
      await update.mutateAsync({ id: editRow.id, pricePerKg: p, colli: c });
      setEditRow(null);
      setError(null);
      toast.success("Köpet är rättat");
    } catch (e: any) {
      setError(e?.message ?? "Ändringen kunde inte sparas.");
    }
  };

  const openEdit = (row: AuctionPurchaseRow) => {
    setEditRow(row);
    setEditPrice(String(row.price_per_kg).replace(".", ","));
    setEditColli(String(row.colli));
    setError(null);
  };

  if (step === "klart") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-success p-6 text-success-foreground">
        <Check className="h-24 w-24" />
        <p className="font-heading text-[30px] font-semibold">Köpet är sparat</p>
      </div>
    );
  }

  if (step === "belopp") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <header className="flex items-center gap-2 border-b border-border px-3 py-3">
          <button
            type="button"
            onClick={() => setStep("lista")}
            aria-label="Tillbaka"
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <span className="font-heading text-[22px] font-semibold">Nytt inköp</span>
        </header>

        <div className="flex-1 overflow-hidden px-4 pt-4">
          <label className="block text-[15px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pris per kg
          </label>
          <input
            ref={priceRef}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                colliRef.current?.focus();
              }
            }}
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            enterKeyHint="next"
            placeholder="Ange pris"
            className="mt-2 h-16 w-full rounded-2xl border border-border bg-card px-4 text-[32px] font-semibold tabular-nums outline-none focus:border-primary"
          />

          <label className="mt-5 block text-[15px] font-semibold uppercase tracking-wide text-muted-foreground">
            Antal kolli
          </label>
          <input
            ref={colliRef}
            value={colli}
            onChange={(e) => setColli(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                toCamera();
              }
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            placeholder="Ange antal kolli"
            className="mt-2 h-16 w-full rounded-2xl border border-border bg-card px-4 text-[32px] font-semibold tabular-nums outline-none focus:border-primary"
          />

          {error && (
            <p className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-[18px] font-semibold text-destructive">
              {error}
            </p>
          )}
        </div>

        <div
          className="border-t border-border bg-background px-4 py-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <button
            type="button"
            onClick={toCamera}
            className="flex h-16 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground active:brightness-110"
          >
            <Camera className="h-7 w-7" />
            Nästa (fota lappen)
          </button>
        </div>
      </div>
    );
  }

  if (step === "foto") {
    const shown = Math.min(photos.length + (missing > 0 ? 1 : 0), colliCount);
    const lastUrl = photoUrls[photoUrls.length - 1] ?? null;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <header className="flex items-center gap-2 border-b border-border px-3 py-3">
          <button
            type="button"
            onClick={() => setStep("belopp")}
            aria-label="Tillbaka"
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <span className="font-heading text-[22px] font-semibold">
            Bild {shown} av {colliCount}
          </span>
        </header>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setPhotos((prev) => (prev.length >= colliCount ? prev : [...prev, file]));
              setError(null);
            }
            e.target.value = "";
          }}
        />

        <div className="flex-1 overflow-y-auto px-4 pt-3">
          {/* En ruta per kolli, fylls i takt med bilderna */}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: colliCount }).map((_, i) => (
              <span
                key={i}
                className={`h-4 w-9 rounded-full ${
                  i < photos.length ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {lastUrl ? (
            <img
              src={lastUrl}
              alt={`Lådans informationslapp, bild ${photos.length}`}
              className="mx-auto mt-3 max-h-[40vh] w-full rounded-2xl object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="mt-3 flex h-[40vh] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 text-[19px] font-semibold text-muted-foreground"
            >
              <Camera className="h-12 w-12" />
              Öppna kameran
            </button>
          )}

          <p className="mt-3 text-[18px] leading-snug text-muted-foreground">
            {num(Number(parseDecimal(price) ?? 0))} kr per kg, {colliCount} kolli. Ta en bild på
            varje låda — appen räknar själv.
          </p>

          {photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {photoUrls.map((url, i) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-xl bg-muted">
                  <img src={url} alt={`Bild ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Ta bort bild ${i + 1}`}
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-bl-xl bg-foreground/70 text-background"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-[18px] font-semibold text-destructive">
              {error}
            </p>
          )}
        </div>

        <div
          className="flex gap-3 border-t border-border bg-background px-4 py-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          {missing > 0 ? (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex h-16 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground active:brightness-110"
            >
              <Camera className="h-7 w-7" />
              {photos.length === 0
                ? "Ta första bilden"
                : `Nästa bild (${missing} ${missing === 1 ? "kvar" : "kvar"})`}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setPhotos((prev) => prev.slice(0, -1));
                  setTimeout(() => cameraRef.current?.click(), 60);
                }}
                className="h-16 min-h-[56px] flex-1 rounded-2xl border border-border bg-card text-[19px] font-semibold"
              >
                Ta om
              </button>
              <button
                type="button"
                disabled={create.isPending}
                onClick={save}
                className="flex h-16 min-h-[56px] flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {create.isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Check className="h-7 w-7" />
                )}
                Klar ({colliCount} {colliCount === 1 ? "bild" : "bilder"})
              </button>
            </>
          )}
        </div>
      </div>
    );
  }


  return (
    <div className="pb-28">
      <div className="flex items-center gap-3 px-1 pt-1">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Gavel className="h-7 w-7" />
        </span>
        <div>
          <h1 className="font-heading text-[24px] font-semibold leading-tight">Auktionsinköp</h1>
          <p className="text-[17px] text-muted-foreground">Fiskhamnen, {day}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Partier" value={num(summary.count)} />
        <Stat label="Nominell vikt" value={summary.weight ? kg(summary.weight) : "—"} />
        <Stat label="Preliminärt" value={summary.amount ? `${num(summary.amount)} kr` : "—"} />
      </div>
      {summary.missingWeight > 0 && (
        <p className="mt-2 rounded-2xl bg-warning/15 px-4 py-3 text-[17px] font-semibold text-warning">
          {summary.missingWeight} {summary.missingWeight === 1 ? "parti" : "partier"} saknar vikt
          ännu.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {purchases.isLoading && (
          <p className="px-1 text-[18px] text-muted-foreground">Hämtar dagens inköp …</p>
        )}
        {!purchases.isLoading && rows.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-[18px] text-muted-foreground">
            Inga inköp registrerade i dag. Tryck Nytt inköp när du vunnit ett bud.
          </p>
        )}
        {rows.map((row) => (
          <PurchaseCard
            key={row.id}
            row={row}
            onCancel={() => {
              setCancelRow(row);
              setCancelReason("");
              setError(null);
            }}
            onEdit={() => openEdit(row)}
            onSplit={() => setSplitRow(row)}
          />
        ))}
      </div>

      {splitRow && <SplitLotSheet row={splitRow} onClose={() => setSplitRow(null)} />}

      {/* Rätta pris eller kolli */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40">
          <div className="rounded-t-3xl bg-background p-4 pb-8">
            <p className="font-heading text-[22px] font-semibold">Rätta köpet</p>
            <label className="mt-4 block text-[15px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pris per kg
            </label>
            <input
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              inputMode="decimal"
              type="text"
              pattern="[0-9.,]*"
              className="mt-2 h-16 w-full rounded-2xl border border-border bg-card px-4 text-[32px] font-semibold tabular-nums outline-none focus:border-primary"
            />
            <label className="mt-4 block text-[15px] font-semibold uppercase tracking-wide text-muted-foreground">
              Antal kolli
            </label>
            <input
              value={editColli}
              onChange={(e) => setEditColli(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              type="text"
              pattern="[0-9]*"
              className="mt-2 h-16 w-full rounded-2xl border border-border bg-card px-4 text-[32px] font-semibold tabular-nums outline-none focus:border-primary"
            />
            {error && (
              <p className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-[18px] font-semibold text-destructive">
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditRow(null);
                  setError(null);
                }}
                className="h-16 flex-1 rounded-2xl border border-border bg-card text-[19px] font-semibold"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={sparaAndring}
                disabled={update.isPending}
                className="flex h-16 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                {update.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : null}
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Makulering med orsak */}
      {cancelRow && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/40">
          <div className="rounded-t-3xl bg-background p-4 pb-8">
            <p className="font-heading text-[22px] font-semibold">Makulera köpet</p>
            <p className="mt-1 text-[17px] text-muted-foreground">
              {cancelRow.colli} kolli · {num(Number(cancelRow.price_per_kg))} kr per kg. Köpet tas
              bort ur dagens lista med en motbokning — inget raderas.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Fel pris", "Fel antal kolli", "Budet gick till annan", "Dubbelregistrerat"].map(
                (r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCancelReason(r)}
                    className={`min-h-[56px] rounded-2xl border px-4 text-[17px] font-semibold ${
                      cancelReason === r
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card"
                    }`}
                  >
                    {r}
                  </button>
                ),
              )}
            </div>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Orsak"
              className="mt-3 h-16 w-full rounded-2xl border border-border bg-card px-4 text-[19px] outline-none focus:border-primary"
            />
            {error && (
              <p className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-[18px] font-semibold text-destructive">
                {error}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setCancelRow(null);
                  setError(null);
                }}
                className="h-16 flex-1 rounded-2xl border border-border bg-card text-[19px] font-semibold"
              >
                Behåll
              </button>
              <button
                type="button"
                onClick={makulera}
                disabled={cancel.isPending}
                className="flex h-16 flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-destructive text-[20px] font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {cancel.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : null}
                Makulera
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-3 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <button
          type="button"
          onClick={startNew}
          className="flex h-16 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground shadow-lg active:brightness-110"
        >
          <Plus className="h-7 w-7" />
          Nytt inköp
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3">
      <p className="text-[14px] leading-tight text-muted-foreground">{label}</p>
      <p className="font-heading text-[20px] font-semibold tabular-nums leading-tight">{value}</p>
    </div>
  );
}

function PurchaseCard({
  row,
  onCancel,
  onEdit,
  onSplit,
}: {
  row: AuctionPurchaseRow;
  onCancel: () => void;
  onEdit: () => void;
  onSplit: () => void;
}) {
  const weight = nominalWeight(row);
  const amount = preliminaryAmount(row);
  const cancelled = row.status === "makulerat";
  const photos = boxPhotos(row);
  const missing = cancelled ? 0 : missingPhotoCount(row);
  const unconfirmed =
    !cancelled && !row.suggestions_confirmed_at && Object.keys(row.suggestions ?? {}).length > 0;

  return (
    <div
      className={`flex gap-3 rounded-2xl border border-border bg-card p-3 ${
        cancelled ? "opacity-60" : ""
      }`}
    >
      <AuctionPhotoStrip photos={photos} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-heading text-[19px] font-semibold leading-tight">
            {row.lots?.commercial_name || "Ej tolkad"}
          </p>
          {unconfirmed && <span className="h-3 w-3 shrink-0 rounded-full bg-warning" />}
        </div>
        <p className="text-[17px] leading-snug text-muted-foreground">
          {row.colli} kolli · {num(Number(row.price_per_kg))} kr per kg
        </p>
        <p className="text-[17px] leading-snug text-muted-foreground">
          {weight === null ? "Vikt saknas" : `${kg(weight)} · ${num(amount ?? 0)} kr`}
        </p>
        {missing > 0 && (
          <p className="mt-1 text-[16px] font-semibold text-warning">
            Bilder saknas: {missing}
          </p>
        )}

        <p className="mt-1 text-[16px] font-semibold text-foreground">
          {AUCTION_STATUS_LABEL[row.status] ?? row.status}
          {cancelled && row.cancelled_reason ? ` · ${row.cancelled_reason}` : ""}
        </p>
      </div>
      {!cancelled && (
        <div className="flex shrink-0 flex-col gap-2 self-start">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Rätta köpet"
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border text-muted-foreground"
          >
            <Pencil className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Makulera köpet"
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border text-muted-foreground"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}
