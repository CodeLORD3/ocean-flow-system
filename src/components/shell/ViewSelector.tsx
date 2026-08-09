import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SavedView = {
  id: string;
  label: string;
  description?: string;
};

/**
 * Klickbar rubrik som byter vy, som listsidorna i Dynamics 365.
 * "Kundbeställningar: Dagens packning" — vyn är en del av titeln.
 */
export function ViewSelector({
  title,
  views,
  value,
  onChange,
  count,
}: {
  title: string;
  views: SavedView[];
  value: string;
  onChange: (id: string) => void;
  count?: number;
}) {
  const current = views.find((v) => v.id === value) ?? views[0];

  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <h1 className="text-lg font-semibold sm:text-xl">{title}</h1>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex max-w-full items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="truncate">{current?.label}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
            Vyer
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {views.map((v) => (
            <DropdownMenuItem
              key={v.id}
              onClick={() => onChange(v.id)}
              className={v.id === value ? "font-semibold text-primary" : ""}
            >
              <div className="flex flex-col">
                <span>{v.label}</span>
                {v.description && (
                  <span className="text-xs text-muted-foreground">{v.description}</span>
                )}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {typeof count === "number" && (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {count} rader
        </span>
      )}
    </div>
  );
}
