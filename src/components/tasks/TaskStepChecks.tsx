import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import type { GuideStep } from "@/lib/taskGuide";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useClearStepCheck, useSetStepCheck, useTaskPrepChecks } from "@/hooks/useTaskPrep";

/** Kort rubrik ur stegtexten — samma princip som stegkorten. */
function stepTitle(text: string): string {
  const first = text.split(/[.!?]/)[0]?.split(",")[0]?.trim() || text.trim();
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

/** Viktigt / Varför / Säkerhet / HACCP i lika breda rader. */
function DetailRow({ label, text, tone }: { label: string; text?: string | null; tone: string }) {
  if (!text) return null;
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-md px-3 py-2 sm:flex-row sm:gap-3", tone)}>
      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      <span className="text-sm leading-snug">{text}</span>
    </div>
  );
}

/**
 * UTFÖRA — varje steg bockas av i tur och ordning. Bild och beskrivning finns
 * i samma rad: tryck på steget för att se bilden stort och läsa hur det görs,
 * tryck på knappen när steget är gjort. Fungerar lika bra i telefon som dator.
 */
export function TaskStepChecks({
  checklistItemId,
  steps,
  locked = false,
  onLockedClick,
}: {
  checklistItemId: string;
  steps: GuideStep[];
  /** Innan uppgiften är startad går stegen inte att bocka av. */
  locked?: boolean;
  onLockedClick?: () => void;
}) {
  const { data: staff } = useCurrentStaff();
  const { data: checks = [] } = useTaskPrepChecks(checklistItemId);
  const setStep = useSetStepCheck();
  const clearStep = useClearStepCheck();
  const [openNo, setOpenNo] = useState<number | null>(null);

  if (steps.length === 0) return null;
  const doneNos = new Set(checks.filter((c) => c.step_no != null).map((c) => c.step_no as number));
  const pct = Math.round((doneNos.size / steps.length) * 100);

  const toggle = (no: number, s: GuideStep, done: boolean) => {
    if (locked) {
      onLockedClick?.();
      return;
    }
    if (done) {
      clearStep.mutate({ checklistItemId, stepNo: no });
      return;
    }
    setStep.mutate({
      checklistItemId,
      stepNo: no,
      stepTitle: stepTitle(s.text || `Steg ${no}`),
      staffId: staff?.id ?? null,
    });
    /** Nästa steg fälls ut så man kan läsa vidare direkt. */
    setOpenNo(no < steps.length ? no + 1 : null);
  };

  return (
    <Card className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold uppercase tracking-wide">Så här gör du — bocka av</p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
            doneNos.size === steps.length ? "bg-emerald-500/10 text-emerald-700" : "bg-muted",
          )}
        >
          {doneNos.size} av {steps.length} klara
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {locked && (
        <p className="text-sm text-muted-foreground">
          Starta uppgiften först — tryck på ett steg så startar den.
        </p>
      )}

      <div className="space-y-2">
        {steps.map((s, i) => {
          const no = i + 1;
          const done = doneNos.has(no);
          const open = openNo === no;
          const title = stepTitle(s.text || `Steg ${no}`);
          return (
            <div
              key={no}
              className={cn(
                "overflow-hidden rounded-xl border transition-colors",
                done ? "border-emerald-500/30 bg-emerald-500/5" : open ? "border-primary/30" : "bg-card",
                locked && "opacity-70",
              )}
            >
              <div className="flex items-center gap-3 p-2">
                <button
                  type="button"
                  onClick={() => setOpenNo(open ? null : no)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  {s.image ? (
                    <img
                      src={thumbUrl(s.image, THUMB_TILE)}
                      alt={title}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-lg object-cover sm:h-16 sm:w-16"
                    />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-sm tabular-nums text-muted-foreground sm:h-16 sm:w-16">
                      {no}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                      Steg {no} av {steps.length}
                    </span>
                    <span className={cn("block truncate text-base font-semibold", done && "text-muted-foreground line-through")}>
                      {title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {open ? "Tryck för att stänga" : "Tryck för bild och beskrivning"}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                  />
                </button>

                <Button
                  size="sm"
                  variant={done ? "default" : "outline"}
                  className={cn("h-10 shrink-0 px-3 sm:px-4", done && "bg-emerald-600 text-white hover:bg-emerald-700")}
                  onClick={() => toggle(no, s, done)}
                >
                  <Check className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">{done ? "Klar" : "Klar"}</span>
                </Button>
              </div>

              {open && (
                <div className="space-y-2 border-t px-2 pb-3 pt-3 sm:px-3">
                  {s.image && (
                    <img
                      src={s.image}
                      alt={title}
                      className="max-h-[52vh] w-full rounded-lg object-contain"
                    />
                  )}
                  {s.text && <p className="text-[15px] font-medium leading-snug">{s.text}</p>}
                  <DetailRow label="Viktigt" text={s.keyPoint} tone="bg-primary/5 text-primary" />
                  <DetailRow label="Varför" text={s.why} tone="bg-muted text-muted-foreground" />
                  <DetailRow label="Säkerhet" text={s.safety} tone="bg-amber-500/10 text-amber-700" />
                  <DetailRow label="HACCP" text={s.haccp} tone="bg-sky-500/10 text-sky-700" />
                  {!done && (
                    <Button
                      className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => toggle(no, s, false)}
                    >
                      <Check className="mr-2 h-4 w-4" /> Steg {no} är klart
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
