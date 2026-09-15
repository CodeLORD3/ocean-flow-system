/**
 * Byggstenar för personalmodulens ljusa designspråk.
 *
 * Enbart presentation — ingen komponent här läser databasen eller räknar.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";

export type SlTone = "blue" | "yellow" | "purple" | "green";

/** Nyckeltalskort: ikonrundel, etikett, stort tal och jämförelserad. */
export function KpiCard({
  label,
  value,
  tone = "blue",
  icon,
  history,
  diff,
  diffDirection,
}: {
  label: string;
  value: ReactNode;
  tone?: SlTone;
  icon: ReactNode;
  history?: ReactNode;
  diff?: ReactNode;
  diffDirection?: "up" | "down" | null;
}) {
  return (
    <div className="sl-card sl-kpi">
      <span className={`sl-kpi__icon sl-kpi__icon--${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="sl-label">{label}</div>
        <div className="sl-kpi__value sl-num mt-1 truncate">{value}</div>
        {history !== undefined ? <div className="mt-2 text-[13px] italic sl-muted">Historik {history}</div> : null}
        {diff !== undefined ? (
          <div className="text-[13px] sl-muted">
            Differens{" "}
            <span
              className={cn(
                "sl-num font-medium",
                diffDirection === "up" && "sl-kpi__diff--up",
                diffDirection === "down" && "sl-kpi__diff--down",
              )}
            >
              {diff}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type PillTone = "ok" | "warn" | "alert" | "neutral" | "info";

export function StatusPill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={`sl-pill sl-pill--${tone}`}>{children}</span>;
}

/** Initialer eller bild för en person. */
export function Avatar({ name, url }: { name: string; url?: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="sl-avatar" aria-hidden="true">
      {url ? <img src={url} alt="" loading="lazy" /> : initials || "?"}
    </span>
  );
}

/** Sektionsrubrik med valfri åtgärdsknapp till höger. */
export function SectionHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="sl-h2">{title}</h2>
      {action}
    </div>
  );
}

export function GroupHeader({ children }: { children: ReactNode }) {
  return <div className="sl-group-head">{children}</div>;
}

export function SubHeader({ children }: { children: ReactNode }) {
  return <div className="sl-sub-head">{children}</div>;
}

/** Personrad: bild, namn + underrad, mittkolumn, status och slutvärde. */
export function PersonRow({
  name,
  secondary,
  avatarUrl,
  middle,
  status,
  trailing,
  onClick,
}: {
  name: string;
  secondary?: string | null;
  avatarUrl?: string | null;
  middle?: ReactNode;
  status?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <Avatar name={name} url={avatarUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{name}</span>
        {secondary ? <span className="block truncate text-[13.5px] sl-muted">{secondary}</span> : null}
      </span>
      {middle ? <span className="hidden shrink-0 text-[14px] sl-muted sm:block">{middle}</span> : null}
      <span className="flex shrink-0 flex-col items-end gap-1">
        {status}
        {trailing ? <span className="sl-num text-[13.5px] sl-muted">{trailing}</span> : null}
      </span>
    </>
  );
  if (!onClick) return <div className="sl-row">{body}</div>;
  return (
    <button type="button" onClick={onClick} className="sl-row sl-row--link">
      {body}
    </button>
  );
}

/** Segmenterad växlare (Vecka | Dag, Historik | Prognos | Ingen …). */
export function SegmentSwitch<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="sl-seg" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("sl-seg__item inline-flex items-center gap-1.5", value === option.value && "sl-seg__item--active")}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Knapp i modulens stil, t.ex. "Gå till schema". */
export function SlButton({
  children,
  onClick,
  variant = "default",
  ariaLabel,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "ghost";
  ariaLabel?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn("sl-btn", variant === "primary" && "sl-btn--primary", variant === "ghost" && "sl-btn--ghost")}
    >
      {children}
    </button>
  );
}

/** Länkkort till en undersida i modulen. */
export function LinkCard({ title, desc, icon }: { title: string; desc: string; icon: ReactNode }) {
  return (
    <div className="sl-card group flex items-start gap-3 p-4">
      <span className="sl-kpi__icon sl-kpi__icon--blue" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-[15px] font-semibold">{title}</span>
          <ArrowUpRight size={15} className="shrink-0 sl-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
        <span className="mt-1 block text-[13px] sl-muted">{desc}</span>
      </span>
    </div>
  );
}

/** Tom yta i modulens stil. */
export function SlEmpty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-[14px] sl-muted">{children}</div>;
}
