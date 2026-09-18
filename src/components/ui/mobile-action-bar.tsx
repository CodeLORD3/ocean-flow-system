import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Fast åtgärdsrad på mobil — ligger ovanför bottenmenyn så spara/skicka/lås
 * alltid är nåbart med tummen. På dator visas innehållet inte alls (då finns
 * knapparna i sidhuvudet).
 */
export function MobileActionBar({
  children,
  info,
  className,
}: {
  children: React.ReactNode;
  info?: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      {/* Utfyllnad så innehållet under inte hamnar bakom raden */}
      <div className="h-20 sm:hidden" aria-hidden />
      <div
        className={cn(
          "sm:hidden fixed bottom-16 left-0 right-0 z-30 flex items-center justify-between gap-2 border-t border-border bg-background/95 px-3 py-2 backdrop-blur",
          className,
        )}
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        {info ? <div className="min-w-0 flex-1 text-[11px] leading-tight">{info}</div> : null}
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </>
  );
}

export default MobileActionBar;
