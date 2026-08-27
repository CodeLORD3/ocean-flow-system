/**
 * "Industry" — återanvändbara UI-primitiver för Makrilltrades nya designsystem.
 *
 * Alla färger, avstånd, radier och skuggor kommer från src/styles/industry.css.
 * Ingen komponent här (eller i vyerna) får hårdkoda hex-färger.
 */
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Blueprint-hörnmarkeringar — endast vyns ytterram och primärknapp. */
export function BlueprintCorners() {
  return <span className="ind-corner-b" aria-hidden="true" />;
}

/** Ytterram för en vy: blueprint-hörn + luft. */
export function IndustryFrame({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("ind ind-corners", className)} {...rest}>
      <BlueprintCorners />
      {children}
    </div>
  );
}

/** Sektionsetikett i h6-stil (13px versaler, 0.08em spärrning). */
export function SectionLabel({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h6 className={cx("ind-label", className)} {...rest}>
      {children}
    </h6>
  );
}

export type IndustryVariant = "primary" | "secondary" | "ghost";
export type IndustrySize = "default" | "touch" | "kiosk";

interface IndustryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IndustryVariant;
  size?: IndustrySize;
  /** Blueprint-hörn — bara på vyns primära åtgärd. */
  corners?: boolean;
}

export const IndustryButton = forwardRef<HTMLButtonElement, IndustryButtonProps>(
  ({ variant = "secondary", size = "default", corners = false, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cx(
        "ind-btn",
        `ind-btn--${variant}`,
        size === "touch" && "ind-btn--touch",
        size === "kiosk" && "ind-btn--kiosk",
        corners && "ind-corners",
        className,
      )}
      {...rest}
    >
      {corners && <BlueprintCorners />}
      {children}
    </button>
  ),
);
IndustryButton.displayName = "IndustryButton";

export type StatusTone = "ok" | "progress" | "alert" | "neutral";
export type EdgeTone = "accent" | "accent-2" | "neutral" | "strong" | "alert" | "none";

/** Status = mättad vänsterkant + textetikett. Aldrig färg ensam. */
export function StatusLabel({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={cx("ind-status", `ind-status--${tone}`)}>{children}</span>;
}

/** Luftig rad med statusvänsterkant istället för ramar och zebra. */
export function IndustryRow({
  edge = "none",
  muted,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { edge?: EdgeTone; muted?: boolean }) {
  return (
    <div
      className={cx(
        "ind-row",
        edge !== "none" && `ind-row--edge-${edge}`,
        muted && "ind-row--muted",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Beslutsrad: det viktigaste överst och störst, allt annat mindre. */
export function DecisionBar({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("ind-decision", className)} {...rest}>
      {children}
    </div>
  );
}

export function DecisionMetric({ label, value, tone }: { label: string; value: ReactNode; tone?: StatusTone }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p className={cx("ind-decision__value", tone && `ind-status--${tone}`)}>{value}</p>
    </div>
  );
}

/** Sidokö för avvikelser: smal kolumn, EN åtgärd per post. */
export function SideQueue({
  label,
  empty,
  className,
  children,
}: {
  label: string;
  empty?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <aside className={cx("ind-queue", className)} aria-label={label}>
      <SectionLabel className="mb-2">{label}</SectionLabel>
      {children ?? <p className="ind-muted text-sm">{empty}</p>}
    </aside>
  );
}

export function QueueItem({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("ind-queue-item", className)} {...rest}>
      {children}
    </div>
  );
}

export const IndustryInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { kiosk?: boolean }
>(({ kiosk, className, ...rest }, ref) => (
  <input ref={ref} className={cx("ind-input", kiosk && "ind-input--kiosk", className)} {...rest} />
));
IndustryInput.displayName = "IndustryInput";
