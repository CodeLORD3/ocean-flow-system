import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GuideStep } from "@/lib/taskGuide";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useFullscreenFlowFlag } from "@/lib/fullscreenFlow";
import { useResetTaskRun } from "@/hooks/useTaskRun";
import { useClearStepCheck, useRestartTask, useSetStepCheck, useTaskPrepChecks } from "@/hooks/useTaskPrep";

/** Alla bilder på ett steg: huvudbilden först, därefter de extra bilderna. */
function stepImages(st: GuideStep): string[] {
  return [st.image ?? "", ...(st.images ?? [])].filter(Boolean) as string[];
}

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
  const restart = useRestartTask();
  const resetRun = useResetTaskRun();
  useFullscreenFlowFlag(open);
  const [index, setIndex] = useState(0);
  /** Kontrollen visas först på dator, sedan stegen. */
  const [showPrep, setShowPrep] = useState(true);
  /** Textrutan i telefonen kan dras ner så hela bilden syns. */
  const [textOpen, setTextOpen] = useState(true);
  /** Vilken bild man tittar på i varje steg — rutan göms när man bläddrar vidare. */
  const [galleryAt, setGalleryAt] = useState<Record<number, number>>({});
  /** Steg där man valt att ta fram rutan igen fastän man bläddrat i bilderna. */
  const [panelShown, setPanelShown] = useState<Record<number, boolean>>({});
  /** Varning när uppgiften stängs utan den bild som krävs. */
  const [warnPhoto, setWarnPhoto] = useState(false);
  /** Översikt över vad som är gjort och vad som är kvar. */
  const [overviewOpen, setOverviewOpen] = useState(false);
  const touchY = useRef<number | null>(null);
  const isPhone = useIsPhone();
  const feedRef = useRef<HTMLDivElement | null>(null);

  const doneNos = new Set(checks.filter((c) => c.step_no != null).map((c) => c.step_no as number));

  /** Senaste "bocka av och gå vidare" — används av Enter. */
  const markAndNextRef = useRef<(() => Promise<void>) | null>(null);

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
      /** Upp/ner byter steg — höger/vänster byter bild på steget. */
      if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
      /** Enter bockar av steget och går vidare. */
      if (e.key === "Enter") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
        e.preventDefault();
        void markAndNextRef.current?.();
      }
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

  /** Tillbaka till utrustning & material — både i telefonen och på dator. */
  const backToPrep = () => {
    setShowPrep(true);
    if (isPhone) {
      const el = feedRef.current?.children[0] as HTMLElement | undefined;
      setTimeout(() => el?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  };

  const markAndNext = async () => {
    if (!done) await markStep(no, s);
    if (!last) {
      setIndex((i) => i + 1);
      if (isPhone) setTimeout(() => scrollToStep(no), 60);
    }
  };
  markAndNextRef.current = markAndNext;

  /** Ångra: tar bort att steget är gjort. */
  const undoStep = (stepNo: number) => clearStep.mutate({ checklistItemId, stepNo });

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
    /* Rutan får inte hamna bakom menyn längst ned i telefonen */
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-foreground/60 p-4">
      <div className="my-auto w-full max-w-md space-y-3 rounded-2xl border border-amber-500/40 bg-card p-4 shadow-xl">
        <p className="font-heading text-lg font-bold text-amber-700">Du missade bilden</p>
        <p className="text-sm text-muted-foreground">
          Den här uppgiften kräver en bild. Ta bilden nu, eller stäng uppgiften ändå — då står det att bilden saknas
          och du kan lägga in den i efterhand på uppgiftsraden.
        </p>
        <label className="inline-flex w-full">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.currentTarget.value = "";
              if (files.length) {
                for (const f of files) await onAddPhoto(f);
                setWarnPhoto(false);
              }
            }}
          />
          <span className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Camera className="h-5 w-5" /> Ta bilderna nu
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

  /** Översikt: vad som är gjort och vad som är kvar — tryck på ett steg för att gå dit. */
  const overviewNode = overviewOpen ? (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-foreground/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border bg-card p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-lg font-bold">Översikt</p>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">
              {doneNos.size} av {steps.length} klara · {steps.length - doneNos.size} kvar
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOverviewOpen(false)} aria-label="Stäng översikten">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="h-1.5 rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {/* Vägen tillbaka till utrustning & material */}
        {prepNode && (
          <button
            type="button"
            onClick={() => {
              setOverviewOpen(false);
              backToPrep();
            }}
            className="mt-3 flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left hover:bg-muted/60"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <ChevronUp className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Utrustning & material</span>
              <span className="block text-[11px] text-muted-foreground">
                {prepMissingCount > 0 ? `${prepMissingCount} kvar att bocka av` : "Allt kontrollerat"}
              </span>
            </span>
          </button>
        )}

        {/* Börja om — alla steg och utrustningskontrollen nollställs */}
        <Button
          variant="outline"
          className="mt-3 h-10 w-full gap-2 text-sm"
          onClick={async () => {
            await restart.mutateAsync({ checklistItemId });
            await resetRun.mutateAsync(checklistItemId);
            setOverviewOpen(false);
            setIndex(0);
            if (prepNode) backToPrep();
            else if (isPhone) setTimeout(() => scrollToStep(0), 60);
          }}
        >
          <RotateCcw className="h-4 w-4" /> Börja om uppgiften
        </Button>

        <ul className="mt-3 space-y-1.5">
          {steps.map((st, i) => {
            const n = i + 1;
            const isDone = doneNos.has(n);
            return (
              <li key={n} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setOverviewOpen(false);
                    setShowPrep(false);
                    setIndex(i);
                    if (isPhone) setTimeout(() => scrollToStep(i), 60);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left",
                    isDone ? "border-emerald-500/40 bg-emerald-50/70" : "bg-background hover:bg-muted/60",
                    n === no && "ring-2 ring-primary",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums",
                      isDone ? "bg-emerald-600 text-white" : "bg-muted text-foreground",
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : n}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* Bara rubriken i översikten — hela texten finns i steget */}
                    <span className={cn("block break-words text-sm font-medium", isDone && "text-emerald-900")}>
                      {stepTitle(st.text || `Steg ${n}`)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{isDone ? "Klart" : "Kvar att göra"}</span>
                  </span>
                </button>
                {/* Ångra: tar bort att steget är gjort */}
                {isDone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-[11px]"
                    onClick={() => clearStep.mutate({ checklistItemId, stepNo: n })}
                  >
                    Ångra
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  ) : null;


  /* ---------- TELEFON: flöde som swipas uppåt, ett steg per skärm ---------- */
  if (isPhone) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        {warnNode}
        {overviewNode}
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
          <button
            type="button"
            onClick={() => setOverviewOpen(true)}
            aria-label="Visa översikt över stegen"
            className="pointer-events-auto rounded-full bg-foreground/70 px-3 py-1.5 font-mono text-sm font-semibold tabular-nums text-background backdrop-blur"
          >
            {doneNos.size}/{steps.length} klara
          </button>
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
            <section className="flex h-full snap-start snap-always flex-col overflow-y-auto px-3 pb-4 pt-14">
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
            /** Bläddrar man vidare i bilderna göms rutan så hela bilden syns. */
            const browsing = (galleryAt[n] ?? 0) > 0 && !panelShown[n];
            return (
              <section
                key={n}
                className="relative flex h-full snap-start snap-always flex-col justify-end bg-foreground/95"
              >
                {stepImages(st).length > 0 ? (
                  <StepGallery
                    images={stepImages(st)}
                    alt={stepTitle(st.text || "")}
                    fill
                    onIndexChange={(at) => {
                      setGalleryAt((prev) => (prev[n] === at ? prev : { ...prev, [n]: at }));
                      if (at === 0) setPanelShown((prev) => (prev[n] ? { ...prev, [n]: false } : prev));
                    }}
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

                {/* Bläddrar man i bilderna göms rutan — knappen tar fram den igen */}
                {browsing && (
                  <button
                    type="button"
                    onClick={() => setPanelShown((prev) => ({ ...prev, [n]: true }))}
                    className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-xs font-semibold text-white backdrop-blur"
                  >
                    <ChevronUp className="mr-1 inline h-3.5 w-3.5" /> Visa texten och klar-knappen
                  </button>
                )}

                {/* Texten i en tät ruta: dra ner den eller tryck "Minska" för hela bilden */}
                <div
                  className={cn(
                    "relative z-10 mx-3 mb-20 mt-3 space-y-1.5 rounded-2xl bg-black/70 px-3 py-2.5 text-white backdrop-blur-sm transition-all",
                    browsing && "hidden",
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
                      className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white"
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

                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-white/70">
                      Steg {n + feedOffset} av {steps.length + feedOffset} · {taskName}
                    </p>
                    {/* Vägen tillbaka till utrustning & material */}
                    {prepNode && (
                      <button
                        type="button"
                        onClick={backToPrep}
                        className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white"
                      >
                        Utrustning
                      </button>
                    )}
                  </div>
                  <h2 className={cn("font-heading font-bold leading-tight", textOpen ? "text-xl" : "pr-20 text-base")}>
                    {stepTitle(st.text || `Steg ${n}`)}
                  </h2>

                  {textOpen && (
                    <div className="max-h-[22vh] space-y-1.5 overflow-y-auto">
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
                      className="h-12 w-12 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                      aria-label="Föregående steg"
                      onClick={() => {
                        if (i > 0) scrollToStep(i - 1);
                        else onClose();
                      }}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    {stepDone ? (
                      /* Klart: grön bekräftelse — ångra ligger i en egen tydlig knapp */
                      <>
                        <span className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 text-sm font-semibold text-white">
                          <Check className="h-5 w-5" /> Klart
                        </span>
                        <Button
                          variant="outline"
                          className="h-12 shrink-0 border-white/30 bg-transparent px-3 text-xs text-white hover:bg-white/15 hover:text-white"
                          onClick={() => undoStep(n)}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" /> Ångra
                        </Button>
                      </>
                    ) : (
                      /* Grå och blinkande tills steget är gjort */
                      <Button
                        className="h-12 flex-1 animate-pulse bg-muted text-sm font-semibold text-foreground hover:animate-none hover:bg-emerald-600 hover:text-white"
                        onClick={() => {
                          /** Hoppa vidare direkt, spara i bakgrunden. */
                          if (!isLast) {
                            scrollToStep(i + 1);
                            setTimeout(() => scrollToStep(i + 1), 120);
                          }
                          void markStep(n, st);
                        }}
                      >
                        <Check className="mr-2 h-5 w-5" />
                        {isLast ? "Markera som klar" : "Markera som klar · nästa"}
                      </Button>
                    )}
                    {/* Kameran finns alltid, även när bild inte krävs */}
                    {(
                      <label className="inline-flex" title="Ta bilder">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={async (e) => {
                            const files = [...(e.target.files ?? [])];
                            e.currentTarget.value = "";
                            for (const f of files) await onAddPhoto(f);
                          }}
                        />

                        <span className="inline-flex h-12 cursor-pointer items-center gap-1 rounded-md bg-white/15 px-3 text-sm text-white">
                          <Camera className="h-5 w-5" /> {photoCount > 0 ? photoCount : ""}
                        </span>
                      </label>
                    )}
                  </div>
                  {stepDone && !isLast && (
                    <p className="text-center text-[10px] text-white/60">Swipa upp för nästa steg</p>
                  )}
                </div>
              </section>
            );
          })}

          {/* Sista skärmen: bocka av hela uppgiften */}
          <section className="flex h-full snap-start snap-always flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="font-mono text-4xl font-bold tabular-nums">
              {doneNos.size}/{steps.length}
            </p>
            <p className="text-lg font-semibold">{allDone ? "Alla steg är klara" : "Steg kvar att bocka av"}</p>
            {/* Uppgiften kan bara bli klar när alla steg är gjorda */}
            <Button
              className={cn(
                "h-14 w-full text-base",
                allDone ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-muted text-muted-foreground",
              )}
              disabled={!allDone}
              onClick={finishNow}
            >
              <Check className="mr-2 h-5 w-5" /> MARKERA UPPGIFTEN SOM KLAR
            </Button>
            {!allDone && (
              <p className="text-sm text-amber-700">
                {steps.length - doneNos.size} steg kvar att bocka av innan uppgiften kan bli klar.
              </p>
            )}
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
      {overviewNode}
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{taskName}</p>
          <p className="font-mono text-sm tabular-nums">
            Steg {no} av {steps.length}
          </p>
        </div>
        <Button variant="outline" className="h-8 font-mono text-sm tabular-nums" onClick={() => setOverviewOpen(true)}>
          {doneNos.size}/{steps.length} klara · Översikt
        </Button>
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
            {stepImages(s).length > 0 ? (
              <StepGallery
                images={stepImages(s)}
                alt={stepTitle(s.text || "")}
                className="h-[62vh] w-full overflow-hidden rounded-xl bg-muted"
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

          {/* Uppgiften kan bara bli klar när alla steg är gjorda */}
          {allDone ? (
            <Button
              className="h-12 flex-1 bg-emerald-600 text-base text-white hover:bg-emerald-700"
              onClick={finishNow}
            >
              <Check className="mr-2 h-5 w-5" /> MARKERA UPPGIFTEN SOM KLAR
            </Button>
          ) : (
            /* Grå tills steget är gjort — grön efteråt, och samma knapp ångrar */
            <Button
              className={cn(
                "h-12 flex-1 text-base font-semibold",
                done
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "animate-pulse bg-muted text-foreground hover:animate-none hover:bg-emerald-600 hover:text-white",
              )}
              onClick={() => (done ? undoStep(no) : void markAndNext())}
            >
              <Check className="mr-2 h-5 w-5" />
              {done ? "Klart · tryck för att ångra" : last ? "Markera som klar" : "Markera som klar · nästa (Enter)"}
            </Button>
          )}


          {/* Kameran finns alltid, även när bild inte krävs */}
          {(
            <label className="inline-flex shrink-0" title="Ta bilder">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = [...(e.target.files ?? [])];
                  e.currentTarget.value = "";
                  for (const f of files) await onAddPhoto(f);
                }}
              />

              <span
                className={cn(
                  "inline-flex h-12 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted",
                  requiresPhoto && photoCount === 0 && "border-amber-500/50 text-amber-700",
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

/**
 * Flera bilder på ett steg: dra i sidled eller tryck på pilarna höger/vänster.
 * Snäpper en bild per svaj, precis som stegflödet.
 */
function StepGallery({
  images,
  alt,
  fill,
  className,
  onIndexChange,
}: {
  images: string[];
  alt: string;
  fill?: boolean;
  className?: string;
  /** Vilken bild man tittar på — används för att gömma textrutan. */
  onIndexChange?: (at: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  useEffect(() => onIndexChange?.(at), [at]);


  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const next = Math.max(0, Math.min(images.length - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setAt(next);
  };

  /** Pilarna höger/vänster byter bild på steget. */
  useEffect(() => {
    if (images.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setAt((cur) => {
          const next = Math.min(cur + 1, images.length - 1);
          const el = ref.current;
          if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
          return next;
        });
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setAt((cur) => {
          const next = Math.max(cur - 1, 0);
          const el = ref.current;
          if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);


  /** Med musen drar man bilden i sidled precis som med fingret. */
  const drag = useRef<{ x: number; left: number } | null>(null);

  return (
    <div className={cn("relative", fill ? "absolute inset-0" : "", className)}>
      <div
        ref={ref}
        className="flex h-full w-full cursor-grab snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth active:cursor-grabbing"
        /* Svajp i sidled på bilden ska byta bild — inte byta steg */
        style={{ touchAction: "pan-x" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth > 0) setAt(Math.round(el.scrollLeft / el.clientWidth));
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") return;
          drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          e.preventDefault();
          e.currentTarget.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          /** Snäpp till närmaste bild efter draget. */
          const el = e.currentTarget;
          const moved = e.clientX - d.x;
          if (Math.abs(moved) > 40) go(at + (moved < 0 ? 1 : -1));
          else el.scrollTo({ left: at * el.clientWidth, behavior: "smooth" });
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
      >
        {images.map((src, i) => (
          <img
            key={`${src}-${i}`}
            src={src}
            alt={`${alt} — bild ${i + 1}`}
            draggable={false}
            className={cn("h-full w-full shrink-0 select-none snap-start snap-always", fill ? "object-cover" : "object-contain")}
          />
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Föregående bild"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white backdrop-blur disabled:opacity-30"
            disabled={at === 0}
            onClick={() => go(at - 1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Nästa bild"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white backdrop-blur disabled:opacity-30"
            disabled={at === images.length - 1}
            onClick={() => go(at + 1)}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 px-2 py-1 backdrop-blur">
            {images.map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 w-1.5 rounded-full", i === at ? "bg-white" : "bg-white/40")}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
