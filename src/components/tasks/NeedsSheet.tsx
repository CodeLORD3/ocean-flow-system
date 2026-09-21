import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ResolvedNeed } from "@/hooks/useResources";

/**
 * "Var finns det?" — kompakt lista med sakerna och deras platser just nu.
 * Ska gå att förstå på några sekunder.
 */
export function NeedsSheet({
  open,
  onOpenChange,
  needs,
  onShowOnMap,
  onShowAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  needs: ResolvedNeed[];
  onShowOnMap?: (zoneId: string) => void;
  onShowAll?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Var finns det?</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {needs.map((n) => (
            <div key={n.requirement.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold uppercase">{n.requirement.requirement_name}</p>
                <p className="text-sm text-muted-foreground">
                  {n.carrierName
                    ? `På ${n.carrierName.toLowerCase()}`
                    : [n.resource?.name, n.place].filter(Boolean).join(" · ") || "Plats saknas"}
                </p>
                {!n.resource && <p className="text-xs text-amber-700">Butikens sak är inte vald ännu.</p>}
              </div>
              {n.zoneId && onShowOnMap && !n.carrierName && (
                <Button variant="outline" size="sm" className="h-12" onClick={() => onShowOnMap(n.zoneId!)}>
                  Visa
                </Button>
              )}
            </div>
          ))}
          {needs.length === 0 && <p className="text-sm text-muted-foreground">Uppgiften kräver inget särskilt.</p>}
        </div>
        {onShowAll && needs.length > 0 && (
          <Button variant="outline" size="lg" className="mt-4 h-14 w-full" onClick={onShowAll}>
            <MapPin className="mr-2 h-5 w-5" /> Visa allt på kartan
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
