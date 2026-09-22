import { useMemo, useState } from "react";
import { AlertTriangle, Check, MapPin, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ResolvedNeed } from "@/hooks/useResources";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import {
  PREP_STATUS_LABEL,
  useCheckAllPresent,
  useClearPrepCheck,
  useReportShortage,
  useSetPrepCheck,
  useTaskPrepChecks,
  type PrepStatus,
} from "@/hooks/useTaskPrep";

/**
 * FÖRBEREDA — redskapen och produkterna som arbetet kräver.
 *
 * Två arbetssätt, samma lista:
 *   1. Hämta en sak i taget och bocka av den.
 *   2. Står allt samlat: kontrollera hela listan och bocka av allt på en gång.
 *
 * Börjar något ta slut skrivs en rapport direkt — arbetet kan fortsätta,
 * men chefen ser att det behöver fyllas på.
 */
export function TaskPrepPanel({
  checklistItemId,
  storeId,
  needs,
  onShowOnMap,
}: {
  checklistItemId: string;
  storeId?: string | null;
  needs: ResolvedNeed[];
  onShowOnMap?: (zoneId: string) => void;
}) {
  const { data: staff } = useCurrentStaff();
  const { data: checks = [] } = useTaskPrepChecks(checklistItemId);
  const setCheck = useSetPrepCheck();
  const clearCheck = useClearPrepCheck();
  const checkAll = useCheckAllPresent();
  const report = useReportShortage();

  const [shortageFor, setShortageFor] = useState<ResolvedNeed | null>(null);
  const [level, setLevel] = useState<"tar_slut" | "slut">("tar_slut");
  const [note, setNote] = useState("");

  const byReq = useMemo(() => {
    const m = new Map<string, (typeof checks)[number]>();
    for (const c of checks) if (c.requirement_id) m.set(c.requirement_id, c);
    return m;
  }, [checks]);

  const done = needs.filter((n) => byReq.has(n.requirement.id)).length;
  const allDone = needs.length > 0 && done === needs.length;

  const nameOf = (n: ResolvedNeed) => n.resource?.name ?? n.requirement.requirement_name;
  const brandOf = (n: ResolvedNeed) => n.resource?.brand ?? n.resource?.supplier ?? null;

  const mark = (n: ResolvedNeed, status: PrepStatus, extraNote?: string) =>
    setCheck.mutate({
      checklistItemId,
      requirementId: n.requirement.id,
      resourceId: n.resource?.id ?? null,
      itemName: nameOf(n),
      status,
      note: extraNote ?? null,
      staffId: staff?.id ?? null,
    });

  if (needs.length === 0) return null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold uppercase tracking-wide">Kontrollera utrustning &amp; material</p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
            allDone ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700",
          )}
        >
          {done} av {needs.length} kontrollerade
        </span>
        {!allDone && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-9"
            onClick={async () => {
              await checkAll.mutateAsync({
                items: needs
                  .filter((n) => !byReq.has(n.requirement.id))
                  .map((n) => ({
                    checklistItemId,
                    requirementId: n.requirement.id,
                    resourceId: n.resource?.id ?? null,
                    itemName: nameOf(n),
                    status: "finns" as PrepStatus,
                    staffId: staff?.id ?? null,
                  })),
              });
              toast({ title: "Allt är kontrollerat", description: "Hela listan står samlad och finns." });
            }}
          >
            <PackageCheck className="mr-2 h-4 w-4" /> Allt finns samlat
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {needs.map((n) => {
          const check = byReq.get(n.requirement.id);
          const brand = brandOf(n);
          const place = n.carrierName
            ? `På ${n.carrierName.toLowerCase()}`
            : n.place || "Plats saknas";
          return (
            <div
              key={n.requirement.id}
              className={cn(
                "rounded-lg border p-2",
                check?.status === "finns" && "border-emerald-500/30 bg-emerald-500/5",
                check && check.status !== "finns" && "border-amber-500/40 bg-amber-500/5",
              )}
            >
              {/* Namnet står som rubrik så hela namnet syns */}
              <p className="mb-2 text-base font-semibold leading-snug">{nameOf(n)}</p>
              <div className="flex items-center gap-3">
              {n.resource?.image ? (
                <img
                  src={n.resource.image}
                  alt={nameOf(n)}
                  loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">
                  Ingen bild
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {[brand, n.requirement.quantity_required ? `${n.requirement.quantity_required} st` : null, place]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {check && (
                  <p
                    className={cn(
                      "text-xs",
                      check.status === "finns" ? "text-emerald-700" : "text-amber-700",
                    )}
                  >
                    {PREP_STATUS_LABEL[check.status]}
                    {check.note ? ` — ${check.note}` : ""}
                  </p>
                )}
              </div>

              {n.zoneId && onShowOnMap && !n.carrierName && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => onShowOnMap(n.zoneId!)}>
                  <MapPin className="h-4 w-4" />
                </Button>
              )}

              {check ? (
                <Button
                  size="sm"
                  className="h-10 shrink-0 bg-emerald-600 px-4 text-white hover:bg-emerald-700"
                  onClick={() => clearCheck.mutate({ id: check.id, checklistItemId })}
                  title="Tryck igen för att ångra"
                >
                  <Check className="mr-1 h-4 w-4" /> Klar
                </Button>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" className="h-10 px-4" onClick={() => mark(n, "finns")}>
                    <Check className="mr-1 h-4 w-4" /> Finns
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-amber-700"
                    onClick={() => {
                      setShortageFor(n);
                      setLevel("tar_slut");
                      setNote("");
                    }}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </Button>
                </div>
              )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!shortageFor} onOpenChange={(o) => !o && setShortageFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rapportera {shortageFor ? nameOf(shortageFor) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={level === "tar_slut" ? "default" : "outline"}
                className="h-12"
                onClick={() => setLevel("tar_slut")}
              >
                Börjar ta slut
              </Button>
              <Button
                variant={level === "slut" ? "default" : "outline"}
                className="h-12"
                onClick={() => setLevel("slut")}
              >
                Saknas helt
              </Button>
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Vad ska chefen veta? T.ex. en flaska kvar."
            />
            <Button
              size="lg"
              className="w-full"
              onClick={async () => {
                if (!shortageFor) return;
                await report.mutateAsync({
                  storeId,
                  resourceId: shortageFor.resource?.id ?? null,
                  requirementId: shortageFor.requirement.id,
                  checklistItemId,
                  itemName: nameOf(shortageFor),
                  level,
                  note,
                  staffId: staff?.id ?? null,
                });
                mark(shortageFor, level === "slut" ? "saknas" : "tar_slut", note || null ? note : undefined);
                setShortageFor(null);
                toast({
                  title: "Rapporten är skickad",
                  description: level === "slut" ? "Saken saknas helt." : "Saken börjar ta slut.",
                });
              }}
            >
              Skicka rapport
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
