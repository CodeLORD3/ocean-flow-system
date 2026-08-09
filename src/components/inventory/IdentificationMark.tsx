import { cn } from "@/lib/utils";
import { markLines } from "@/lib/identificationMark";

/**
 * Ovalt identifieringsmärke för skärmvisning. Samma innehåll som utskriften:
 * landskod, godkännandenummer och EG.
 */
export default function IdentificationMark({
  markText,
  approvalNumber,
  className,
}: {
  markText?: string | null;
  approvalNumber?: string | null;
  className?: string;
}) {
  const lines = markLines({ markText, approvalNumber });
  if (!lines) return null;
  return (
    <span
      className={cn(
        "inline-flex h-11 w-20 flex-col items-center justify-center rounded-[50%] border-2 border-foreground font-semibold leading-none text-foreground",
        className,
      )}
    >
      <span className="text-[9px]">{lines.top}</span>
      <span className="font-mono text-[11px] tabular-nums">{lines.middle}</span>
      <span className="text-[9px]">{lines.bottom}</span>
    </span>
  );
}
