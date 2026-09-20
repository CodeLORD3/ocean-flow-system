import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, Gavel, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { StorageImage } from "@/components/storage/StorageMedia";
import {
  auctionDaySummary,
  useAuctionDay,
  useCancelAuctionPurchase,
  useCreateAuctionPurchase,
} from "@/hooks/useAuctionPurchases";
import {
  AUCTION_STATUS_LABEL,
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

  const [step, setStep] = useState<Step>("lista");
  const [price, setPrice] = useState("");
  const [colli, setColli] = useState("1");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const priceRef = useRef<HTMLInputElement>(null);
  const colliRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const rows = purchases.data ?? [];
  const summary = useMemo(() => auctionDaySummary(rows), [rows]);

  // Tangentbordet ska upp direkt när skärmen öppnas.
  useEffect(() => {
    if (step === "belopp") {
      const t = setTimeout(() => priceRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Kameran öppnas av sig själv i fotosteget.
  useEffect(() => {
    if (step === "foto" && !photo) {
      const t = setTimeout(() => cameraRef.current?.click(), 80);
      return () => clearTimeout(t);
    }
  }, [step, photo]);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const resetFlow = () => {
    setPrice("");
    setColli("1");
    setPhoto(null);
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
    if (!validated()) return;
    setStep("foto");
  };

  const save = async () => {
    const valid = validated();
    if (!valid || !photo) return;
    try {
      await create.mutateAsync({
        pricePerKg: valid.pricePerKg,
        colli: valid.colli,
        photo,
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

  const makulera = async (row: AuctionPurchaseRow) => {
    const reason = window.prompt("Varför makuleras köpet?");
    if (!reason?.trim()) return;
    await cancel.mutateAsync({ row, reason: reason.trim() });
    toast.success("Köpet är makulerat");
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
          <span className="font-heading text-[22px] font-semibold">Fota lappen</span>
        </header>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPhoto(file);
            e.target.value = "";
          }}
        />

        <div className="flex-1 overflow-hidden px-4 pt-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Lådans informationslapp"
              className="mx-auto max-h-[46vh] w-full rounded-2xl object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex h-[46vh] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 text-[19px] font-semibold text-muted-foreground"
            >
              <Camera className="h-12 w-12" />
              Öppna kameran
            </button>
          )}
          <p className="mt-3 text-[18px] leading-snug text-muted-foreground">
            {num(Number(parseDecimal(price) ?? 0))} kr per kg, {colli} kolli. Flera lådor med samma
            lapp är ett parti.
          </p>
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
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="h-16 min-h-[56px] flex-1 rounded-2xl border border-border bg-card text-[19px] font-semibold"
          >
            Ta om
          </button>
          <button
            type="button"
            disabled={!photo || create.isPending}
            onClick={save}
            className="flex h-16 min-h-[56px] flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Check className="h-7 w-7" />}
            Klar
          </button>
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
        <p className="mt-2 rounded-2xl bg-warning/15 px-4 py-3 text-[17px] font-semibold text-warning-foreground">
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
          <PurchaseCard key={row.id} row={row} onCancel={() => makulera(row)} />
        ))}
      </div>

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

function PurchaseCard({ row, onCancel }: { row: AuctionPurchaseRow; onCancel: () => void }) {
  const weight = nominalWeight(row);
  const amount = preliminaryAmount(row);
  const cancelled = row.status === "makulerat";
  const unconfirmed =
    !cancelled && !row.suggestions_confirmed_at && Object.keys(row.suggestions ?? {}).length > 0;

  return (
    <div
      className={`flex gap-3 rounded-2xl border border-border bg-card p-3 ${
        cancelled ? "opacity-60" : ""
      }`}
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
        <StorageImage
          url={row.box_photo_url}
          alt="Lådans lapp"
          className="h-full w-full object-cover"
        />
      </div>
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
        <p className="mt-1 text-[16px] font-semibold text-foreground">
          {AUCTION_STATUS_LABEL[row.status] ?? row.status}
          {cancelled && row.cancelled_reason ? ` · ${row.cancelled_reason}` : ""}
        </p>
      </div>
      {!cancelled && (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Makulera köpet"
          className="flex h-14 w-14 shrink-0 items-center justify-center self-start rounded-2xl border border-border text-muted-foreground"
        >
          <X className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
