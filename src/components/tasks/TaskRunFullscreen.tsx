import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GuideStep } from "@/lib/taskGuide";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useClearStepCheck, useSetStepCheck, useTaskPrepChecks } from "@/hooks/useTaskPrep";

/** Kort rubrik ur stegtexten. */
function stepTitle(text: string): string {
  const first = text.split(/[.!?]/)[0]?.split(",")[0]?.trim() || text.trim();
  return first.length > 70 ? `${first.slice(0, 67)}…` : first;
}

function Detail({ label, text, tone }: { label: string; text?: string | null; tone: string }) {
  if (!text) return null;
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-md px-3 py-2 sm:flex-row sm:gap-3", tone)}>
      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      <span className="text-sm leading-snug">{text}</span>
    </div>
  );
}

/** Telefon eller större skärm — flödet i telefonen swipas, datorn bläddras. */
function useIsPhone() {
  const [phone, setPhone] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return phone;
}

/**
 * Helskärmsläge när uppgiften görs. I telefonen ligger stegen som ett flöde
 * man swipar uppåt — ett steg per skärm, med "2/3 klara" i högra hörnet.
 * På dator bläddras stegen med pilarna och knappen längst ned.
 */
export function TaskRunFullscreen({
  open,
  onClose,
  checklistItemId,
  taskName,
  steps,
  photoCount,
  requiresPhoto,
  blockedText,
  onAddPhoto,
  onSetStepImage,
  onFinish,
  prepNode,
  prepMissingCount = 0,
}: {
  open: boolean;
  onClose: () => void;
  checklistItemId: string;
  taskName: string;
  steps: GuideStep[];
  photoCount: number;
  requiresPhoto?: boolean | null;
  /** Det som saknas för att få bocka av uppgiften. */
  blockedText?: string;
  onAddPhoto: (file: File) => Promise<void> | void;
  /** Sätter bilden på ett steg — bilderna är det viktigaste i beskrivningen. */
  onSetStepImage?: (stepIndex: number, file: File) => Promise<void> | void;
  onFinish: () => Promise<void> | void;
  /** Kontrollen av utrustning & material — första skärmen i flödet. */
  prepNode?: ReactNode;
  prepMissingCount?: number;
}) {
  const { data: staff } = useCurrentStaff();
  const { data: checks = [] } = useTaskPrepChecks(open ? checklistItemId : null);
  const setStep = useSetStepCheck();
  const clearStep = useClearStepCheck();
  const [index, setIndex] = useState(0);
  /** Kontrollen visas först på dator, sedan stegen. */
  const [showPrep, setShowPrep] = useState(true);
  /** Textrutan i telefonen kan dras ner så hela bilden syns. */
  const [textOpen, setTextOpen] = useState(true);
  /** Varning när uppgiften stängs utan den bild som krävs. */
  const [warnPhoto, setWarnPhoto] = useState(false);
  const touchY = useRef<number | null>(null);
  const isPhone = useIsPhone();
  const feedRef = useRef<HTMLDivElement | null>(null);

  const doneNos = new Set(checks.filter((c) => c.step_no != null).map((c) => c.step_no as number));

  /** Börja på första steget som inte är gjort. */
  useEffect(() => {
    if (!open) return;
    const firstLeft = steps.findIndex((_s, i) => !doneNos.has(i + 1));
    setIndex(firstLeft === -1 ? Math.max(steps.length - 1, 0) : firstLeft);
    /** Är utrustningen redan kontrollerad hoppar vi rakt till stegen. */
    setShowPrep(prepMissingCount > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, steps.length]);

  useEffect(() => {
    if (!open || isPhone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isPhone, onClose, steps.length]);

  if (!open || steps.length === 0) return null;

  const s = steps[Math.min(index, steps.length - 1)];
  const no = Math.min(index, steps.length - 1) + 1;
  const done = doneNos.has(no);
  const last = no === steps.length;
  const allDone = doneNos.size >= steps.length;
  const pct = Math.round((doneNos.size / steps.length) * 100);

  const markStep = async (stepNo: number, step: GuideStep) => {
    await setStep.mutateAsync({
      checklistItemId,
      stepNo,
      stepTitle: stepTitle(step.text || `Steg ${stepNo}`),
      staffId: staff?.id ?? null,
    });
  };

  /** Kontrollskärmen ligger först i flödet, före steg 1. */
  const feedOffset = prepNode ? 1 : 0;

  /** Swipa vidare i telefonen: nästa steg glider upp. */
  const scrollToStep = (i: number) => {
    const el = feedRef.current?.children[i + feedOffset] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const markAndNext = async () => {
    if (!done) await markStep(no, s);
    if (!last) {
      setIndex((i) => i + 1);
      if (isPhone) setTimeout(() => scrollToStep(no), 60);
    }
  };

  const finishNow = async () => {
    /** Saknas bilden får man en tydlig varning innan uppgiften stängs. */
    if (requiresPhoto && photoCount === 0) {
      setWarnPhoto(true);
      return;
    }
    await onFinish();
    onClose();
  };

  const finishAnyway = async () => {
    setWarnPhoto(false);
    await onFinish();
    onClose();
  };

  /** Tydlig varning: bilden krävs men saknas — man kan ta den nu eller i efterhand. */
  const warnNode = warnPhoto ? (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/60 p-4 sm:items-center">
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-amber-500/40 bg-card p-4 shadow-xl">
        <p className="font-heading text-lg font-bold text-amber-700">Du missade bilden</p>
        <p className="text-sm text-muted-foreground">
          Den här uppgiften kräver en bild. Ta bilden nu, eller stäng uppgiften ändå — då står det att bilden saknas
          och du kan lägga in den i efterhand på uppgiftsraden.
        </p>
        <label className="inline-flex w-full">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = "";
              if (f) {
                await onAddPhoto(f);
                setWarnPhoto(false);
              }
            }}
          />
          <span className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Camera className="h-5 w-5" /> Ta bilden nu
          </span>
        </label>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => setWarnPhoto(false)}>
            Avbryt
          </Button>
          <Button variant="outline" className="h-11 flex-1 border-amber-500/50 text-amber-700" onClick={finishAnyway}>
            Stäng utan bild
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  /* ---------- TELEFON: flöde som swipas uppåt, ett steg per skärm ---------- */
  if (isPhone) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        {warnNode}
        {/* Räknaren i höger hörn och vägen ut i vänster */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="pointer-events-auto rounded-full bg-foreground/70 p-2 text-background backdrop-blur"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="pointer-events-none rounded-full bg-foreground/70 px-3 py-1.5 font-mono text-sm font-semibold tabular-nums text-background backdrop-blur">
            {doneNos.size}/{steps.length} klara
          </span>
        </div>

        <div
          ref={feedRef}
          onScroll={(e) => {
            const h = e.currentTarget.clientHeight || 1;
            const i = Math.round(e.currentTarget.scrollTop / h) - feedOffset;
            if (i !== index) setIndex(Math.min(Math.max(i, 0), steps.length - 1));
          }}
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
        >
          {/* Först: kontrollera utrustning & material */}
          {prepNode && (
            <section className="flex h-full snap-start flex-col overflow-y-auto px-3 pb-4 pt-14">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Steg 1 · innan du börjar
              </p>
              <h2 className="mb-3 font-heading text-xl font-bold">Kontrollera utrustning & material</h2>
              {prepNode}
              <Button
                className="mt-3 h-14 w-full text-base font-semibold"
                onClick={() => scrollToStep(0)}
              >
                {prepMissingCount > 0 ? "Fortsätt till stegen" : "Allt kontrollerat · till stegen"}
                <ChevronUp className="ml-2 h-5 w-5" />
              </Button>
            </section>
          )}

          {steps.map((st, i) => {
            const n = i + 1;
            const stepDone = doneNos.has(n);
            const isLast = n === steps.length;
            return (
              <section
                key={n}
                className="relative flex h-full snap-start flex-col justify-end bg-foreground/95"
              >
                {st.image ? (
                  <img
                    src={st.image}
                    alt={stepTitle(st.text || "")}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted">
                    <Camera className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Ingen bild på steget än</p>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20" />

                {/* Bilden är det viktigaste — byt eller lägg till den direkt här */}
                {onSetStepImage && (
                  <label className="absolute right-3 top-16 z-20 inline-flex">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.currentTarget.value = "";
                        if (f) await onSetStepImage(i, f);
                      }}
                    />
                    <span className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-foreground/70 px-3 py-1.5 text-xs text-background backdrop-blur">
                      <Camera className="h-4 w-4" /> {st.image ? "Byt bild" : "Lägg till bild"}
                    </span>
                  </label>
                )}

                {/* Texten i en tät ruta: dra ner den eller tryck "Minska" för hela bilden */}
                <div
                  className={cn(
                    "relative z-10 mx-3 mb-24 mt-3 space-y-2 rounded-2xl bg-black/70 p-4 text-white backdrop-blur-sm transition-all",
                    "",
                  )}
                  onTouchStart={(e) => {
                    touchY.current = e.touches[0]?.clientY ?? null;
                  }}
                  onTouchEnd={(e) => {
                    const from = touchY.current;
                    touchY.current = null;
                    const to = e.changedTouches[0]?.clientY;
                    if (from == null || to == null) return;
                    if (to - from > 50) setTextOpen(false);
                    if (from - to > 50) setTextOpen(true);
                  }}
                >
                  {/* Dra-handtaget och knappen för att minska eller visa texten */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTextOpen((v) => !v)}
                      className="mx-auto h-1.5 w-12 rounded-full bg-white/40"
                      aria-label={textOpen ? "Minska texten" : "Visa texten"}
                    />
                    <button
                      type="button"
                      onClick={() => setTextOpen((v) => !v)}
                      className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      {textOpen ? (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" /> Minska
                        </>
                      ) : (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" /> Visa texten
                        </>
                      )}
                    </button>
                  </div>

                  <p className="font-mono text-xs tabular-nums text-white/70">
                    Steg {n + feedOffset} av {steps.length + feedOffset} · {taskName}
                  </p>
                  <h2 className={cn("font-heading font-bold leading-tight", textOpen ? "text-2xl" : "pr-24 text-base")}>
                    {stepTitle(st.text || `Steg ${n}`)}
                  </h2>

                  {textOpen && (
                    <div className="max-h-[26vh] space-y-2 overflow-y-auto">
                      {st.text && <p className="text-[15px] leading-snug text-white">{st.text}</p>}
                      {st.keyPoint && (
                        <p className="text-sm leading-snug text-emerald-200">
                          <span className="font-semibold uppercase tracking-wide">Viktigt · </span>
                          {st.keyPoint}
                        </p>
                      )}
                      {st.why && (
                        <p className="text-sm leading-snug text-sky-200">
                          <span className="font-semibold uppercase tracking-wide">Varför · </span>
                          {st.why}
                        </p>
                      )}
                      {st.safety && (
                        <p className="text-sm leading-snug text-amber-200">
                          <span className="font-semibold uppercase tracking-wide">Säkerhet · </span>
                          {st.safety}
                        </p>
                      )}
                      {st.haccp && (
                        <p className="text-sm leading-snug text-rose-200">
                          <span className="font-semibold uppercase tracking-wide">HACCP · </span>
                          {st.haccp}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    {/* Liten blå tillbaka-knapp till vänster om Klar */}
                    <Button
                      className="h-14 w-14 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                      aria-label="Föregående steg"
                      onClick={() => {
                        if (i > 0) scrollToStep(i - 1);
                        else onClose();
                      }}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    {/* Samma gröna knapp hela vägen — bockat steg visas med kryss i knappen */}
                    <Button
                      className="h-14 flex-1 bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
                      onClick={() => {
                        /** Hoppa vidare direkt, spara i bakgrunden. */
                        if (!isLast) {
                          scrollToStep(i + 1);
                          setTimeout(() => scrollToStep(i + 1), 120);
                        }
                        if (!stepDone) void markStep(n, st);
                      }}
                    >
                      <Check className="mr-2 h-5 w-5" />
                      {stepDone ? (isLast ? "Klart" : "Klart · nästa steg") : isLast ? "Klar" : "Klar · nästa steg"}
                    </Button>
                    {requiresPhoto && (
                      <label className="inline-flex">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.currentTarget.value = "";
                            if (f) await onAddPhoto(f);
                          }}
                        />
                        <span className="inline-flex h-14 cursor-pointer items-center gap-1 rounded-md bg-white/15 px-4 text-sm text-white">
                          <Camera className="h-5 w-5" /> {photoCount > 0 ? photoCount : ""}
                        </span>
                      </label>
                    )}
                  </div>
                  {stepDone && !isLast && (
                    <p className="text-center text-xs text-white/60">Swipa upp för nästa steg</p>
                  )}
                </div>
              </section>
            );
          })}

          {/* Sista skärmen: bocka av hela uppgiften */}
          <section className="flex h-full snap-start flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="font-mono text-4xl font-bold tabular-nums">
              {doneNos.size}/{steps.length}
            </p>
            <p className="text-lg font-semibold">{allDone ? "Alla steg är klara" : "Steg kvar att bocka av"}</p>
            <Button
              className="h-14 w-full bg-emerald-600 text-base text-white hover:bg-emerald-700"
              onClick={finishNow}
            >
              <Check className="mr-2 h-5 w-5" /> MARKERA UPPGIFTEN SOM KLAR
            </Button>
            {blockedText && <p className="text-sm text-amber-700">{blockedText}</p>}
            <Button variant="ghost" onClick={onClose}>
              Stäng
            </Button>
          </section>
        </div>
      </div>
    );
  }

  /* ---------- DATOR: ett steg i taget, knapparna alltid på samma plats ---------- */
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {warnNode}
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{taskName}</p>
          <p className="font-mono text-sm tabular-nums">
            Steg {no} av {steps.length}
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 font-mono text-sm font-semibold tabular-nums">
          {doneNos.size}/{steps.length} klara
        </span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng helskärm">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="h-1 bg-muted">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* Kontrollen av utrustningen ligger först, sedan stegen */}
        {prepNode && showPrep ? (
          <div className="mx-auto w-full max-w-3xl space-y-3">
            <h2 className="font-heading text-xl font-bold">Kontrollera utrustning & material</h2>
            {prepNode}
            <Button className="h-12 w-full text-base font-semibold" onClick={() => setShowPrep(false)}>
              {prepMissingCount > 0 ? "Fortsätt till stegen" : "Allt kontrollerat · till stegen"}
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        ) : (
        // Bild till vänster, text till höger — allt ryms på en skärm utan skroll
        <div className="mx-auto grid h-full w-full max-w-6xl gap-4 lg:grid-cols-2 lg:items-start">
          <div className="flex min-h-0 flex-col gap-2">
            {s.image ? (
              <img
                src={s.image}
                alt={stepTitle(s.text || "")}
                className="max-h-[62vh] w-full rounded-xl bg-muted object-contain"
              />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-muted">
                <Camera className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Ingen bild på steget än</p>
              </div>
            )}
            {onSetStepImage && (
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (f) await onSetStepImage(index, f);
                  }}
                />
                <span className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-3 text-xs hover:bg-muted">
                  <Camera className="h-4 w-4" /> {s.image ? "Byt bild på steget" : "Lägg till bild på steget"}
                </span>
              </label>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="font-heading text-xl font-bold leading-snug sm:text-2xl">
              {stepTitle(s.text || `Steg ${no}`)}
            </h2>
            {s.text && <p className="text-[15px] leading-snug text-muted-foreground">{s.text}</p>}
            <Detail label="Viktigt" text={s.keyPoint} tone="bg-emerald-500/10 text-emerald-700" />
            <Detail label="Varför" text={s.why} tone="bg-sky-500/10 text-sky-700" />
            <Detail label="Säkerhet" text={s.safety} tone="bg-amber-500/10 text-amber-700" />
            <Detail label="HACCP" text={s.haccp} tone="bg-rose-500/10 text-rose-700" />
          </div>
        </div>
        )}
      </div>

      <div className="space-y-2 border-t bg-card px-3 py-2">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2">
          <Button
            className="h-12 shrink-0 gap-1 bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            onClick={() => (no === 1 ? onClose() : setIndex((i) => Math.max(i - 1, 0)))}
          >
            <ChevronLeft className="h-5 w-5" /> Tillbaka
          </Button>

          {allDone || (done && last) ? (
            <Button
              className="h-12 flex-1 bg-emerald-600 text-base text-white hover:bg-emerald-700"
              onClick={finishNow}
            >
              <Check className="mr-2 h-5 w-5" /> MARKERA UPPGIFTEN SOM KLAR
            </Button>
          ) : (
            <Button
              className="h-12 flex-1 bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
              onClick={markAndNext}
            >
              <Check className="mr-2 h-5 w-5" />
              {done ? "Klart · nästa steg" : last ? "Klar" : "Klar · nästa steg"}
            </Button>
          )}

          {requiresPhoto && (
            <label className="inline-flex shrink-0">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (f) await onAddPhoto(f);
                }}
              />
              <span
                className={cn(
                  "inline-flex h-12 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted",
                  photoCount === 0 && "border-amber-500/50 text-amber-700",
                )}
              >
                <Camera className="h-5 w-5" /> {photoCount > 0 ? photoCount : "Bild"}
              </span>
            </label>
          )}

          {done && !last && (
            <Button
              variant="ghost"
              className="h-12 shrink-0 px-3 text-xs text-muted-foreground"
              onClick={() => clearStep.mutate({ checklistItemId, stepNo: no })}
            >
              Ångra
            </Button>
          )}
        </div>
        {blockedText && <p className="text-center text-xs text-amber-700">{blockedText}</p>}
      </div>
    </div>
  );
}
