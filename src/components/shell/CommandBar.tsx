import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

export type CommandAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  /** Primär åtgärd får accentfärg, som "Ny" i Dynamics 365. */
  primary?: boolean;
  /** Destruktiv åtgärd, t.ex. Radera. */
  danger?: boolean;
  /** Lägger en avdelare före knappen. */
  separatorBefore?: boolean;
  hideLabelOnMobile?: boolean;
};

/**
 * Handlingsrad i Dynamics 365-modell: alltid högst upp på sidan, alltid
 * samma ordning. Sidor fyller den med sina åtgärder i stället för att
 * strö knappar över ytan.
 */
export function CommandBar({
  actions,
  children,
}: {
  actions: CommandAction[];
  /** Fri högerzon, t.ex. sökfält. */
  children?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 -mx-3 flex items-center gap-1 overflow-x-auto border-b border-grid-line bg-background px-2 py-1 sm:mx-0 sm:rounded-t-sm">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <div key={a.key} className="flex shrink-0 items-center">
            {a.separatorBefore && <span className="mx-1 h-6 w-px bg-grid-line" aria-hidden />}
            <button
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              className={`flex h-10 items-center gap-2 rounded-sm px-3 text-[13px] font-medium transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent ${
                a.primary
                  ? "text-primary"
                  : a.danger
                    ? "text-destructive"
                    : "text-foreground"
              }`}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              <span className={a.hideLabelOnMobile ? "hidden sm:inline" : ""}>{a.label}</span>
            </button>
          </div>
        );
      })}
      {children && <div className="ml-auto flex shrink-0 items-center pl-2">{children}</div>}
    </div>
  );
}
