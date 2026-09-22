import { useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, ChevronUp, X } from "lucide-react";
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
  const isPhone = useIsPhone();
  const feedRef = useRef<HTMLDivElement | null>(null);

  const doneNos = new Set(checks.filter((c) => c.step_no != null).map((c) => c.step_no as number));

  /** Börja på första steget som inte är gjort. */
  useEffect(() => {
    if (!open) return;
    const firstLeft = steps.findIndex((_s, i) => !doneNos.has(i + 1));
    setIndex(firstLeft === -1 ? Math.max(steps.length - 1, 0) : firstLeft);
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

  /** Swipa vidare i telefonen: nästa steg glider upp. */
  const scrollToStep = (i: number) => {
    const el = feedRef.current?.children[i] as HTMLElement | undefined;
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
    await onFinish();
    onClose();
  };

  /* ---------- TELEFON: flöde som swipas uppåt, ett steg per skärm ---------- */
  if (isPhone) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
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
            const i = Math.round(e.currentTarget.scrollTop / h);
            if (i !== index) setIndex(Math.min(Math.max(i, 0), steps.length - 1));
          }}
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
        >
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

                <div className="relative z-10 space-y-2 px-4 pb-6 pt-16 text-white">
                  <p className="font-mono text-xs tabular-nums text-white/70">
                    Steg {n} av {steps.length} · {taskName}
                  </p>
                  <h2 className="font-heading text-2xl font-bold leading-tight">
                    {stepTitle(st.text || `Steg ${n}`)}
                  </h2>
                  {st.text && <p className="text-[15px] leading-snug text-white/85">{st.text}</p>}
                  {st.keyPoint && (
                    <p className="text-sm text-white/90">
                      <span className="font-semibold uppercase tracking-wide">Viktigt · </span>
                      {st.keyPoint}
                    </p>
                  )}
                  {st.safety && (
                    <p className="text-sm text-amber-200">
                      <span className="font-semibold uppercase tracking-wide">Säkerhet · </span>
                      {st.safety}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      className={cn(
                        "h-14 flex-1 text-base font-semibold",
                        stepDone
                          ? "bg-white/15 text-white hover:bg-white/25"
                          : "bg-emerald-600 text-white hover:bg-emerald-700",
                      )}
                      onClick={async () => {
                        if (!stepDone) await markStep(n, st);
                        if (!isLast) scrollToStep(i + 1);
                      }}
                    >
                      {stepDone ? (
                        <>
                          Klart <ChevronUp className="ml-2 h-5 w-5" />
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-5 w-5" /> Klar {isLast ? "" : "· nästa"}
                        </>
                      )}
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
        <div className="mx-auto w-full max-w-3xl space-y-3">
          {s.image ? (
            <img
              src={s.image}
              alt={stepTitle(s.text || "")}
              className="max-h-[46vh] w-full rounded-xl bg-muted object-contain"
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
          <h2 className="font-heading text-xl font-bold leading-snug sm:text-2xl">{stepTitle(s.text || `Steg ${no}`)}</h2>
          {s.text && <p className="text-[15px] leading-snug text-muted-foreground">{s.text}</p>}
          <Detail label="Viktigt" text={s.keyPoint} tone="bg-primary/5 text-primary" />
          <Detail label="Varför" text={s.why} tone="bg-muted text-muted-foreground" />
          <Detail label="Säkerhet" text={s.safety} tone="bg-amber-500/10 text-amber-700" />
          <Detail label="HACCP" text={s.haccp} tone="bg-sky-500/10 text-sky-700" />
        </div>
      </div>

      <div className="space-y-2 border-t bg-card px-3 py-2">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <Button
            variant="outline"
            className="h-12 shrink-0 px-3"
            disabled={no === 1}
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            aria-label="Föregående steg"
          >
            <ChevronLeft className="h-5 w-5" />
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
              className={cn("h-12 flex-1 text-base", done ? "" : "bg-emerald-600 text-white hover:bg-emerald-700")}
              variant={done ? "outline" : "default"}
              onClick={markAndNext}
            >
              {done ? (
                <>
                  Nästa steg <ChevronRight className="ml-2 h-5 w-5" />
                </>
              ) : (
                <>
                  <Check className="mr-2 h-5 w-5" /> Klar {last ? "" : "· nästa steg"}
                </>
              )}
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
