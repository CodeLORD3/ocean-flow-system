import { AlertTriangle, MapPin, RotateCcw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import type { TaskGuide } from "@/lib/taskGuide";
import type { GuideZone } from "@/components/tasks/TaskGuideEditor";

/**
 * Visar arbetsbeskrivningen som ett flöde: godkänt läge, hämta fram med plats
 * på kartan, arbetsgången steg för steg, ställ tillbaka och rapportera fel.
 */
export function TaskGuideView({
  guide,
  zones = [],
  onShowOnMap,
  onReport,
}: {
  guide: TaskGuide;
  zones?: GuideZone[];
  onShowOnMap?: (zoneId: string) => void;
  onReport?: (materialName?: string) => void;
}) {
  const hasGoal = guide.goal.trim() || guide.goalImages.length > 0;
  const hasMaterials = guide.materials.length > 0;
  const hasSteps = guide.steps.length > 0;
  const hasPutBack = guide.putBack.trim() || guide.putBackImages.length > 0;

  if (!hasGoal && !hasMaterials && !hasSteps && !hasPutBack) return null;

  const zoneOf = (id?: string | null) => (id ? zones.find((z) => z.id === id) ?? null : null);
  const zoneText = (z: GuideZone) => `${z.number ? `${z.number}. ` : ""}${z.name}`;

  return (
    <div className="space-y-5">
      {hasGoal && (
        <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Target className="h-4 w-4" /> Godkänt läge
          </h3>
          {guide.goal.trim() && <p className="text-sm">{guide.goal}</p>}
          {guide.goalImages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {guide.goalImages.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img src={thumbUrl(url, THUMB_TILE)} alt="" className="h-28 w-28 rounded-lg object-cover" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {hasMaterials && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">1. Hämta fram</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {guide.materials.map((m, i) => {
              const z = zoneOf(m.zoneId);
              return (
                <div key={i} className="flex items-start gap-3 rounded-lg border p-2">
                  {m.image ? (
                    <a href={m.image} target="_blank" rel="noreferrer">
                      <img src={thumbUrl(m.image, THUMB_TILE)} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    </a>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">
                      Ingen bild
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    {m.place && <p className="text-xs text-muted-foreground">{m.place}</p>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {z && onShowOnMap && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onShowOnMap(z.id)}>
                          <MapPin className="mr-1 h-3.5 w-3.5" /> {zoneText(z)}
                        </Button>
                      )}
                      {onReport && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onReport(m.name)}>
                          <AlertTriangle className="mr-1 h-3.5 w-3.5 text-amber-600" /> Rapportera
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {hasSteps && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">2. Arbetsgång</h3>
          <ol className="space-y-3">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{s.text}</p>
                  {s.image && (
                    <a href={s.image} target="_blank" rel="noreferrer">
                      <img src={thumbUrl(s.image, THUMB_TILE)} alt="" className="mt-1 h-28 w-28 rounded-lg object-cover" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {hasPutBack && (
        <section className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-sky-700">
            <RotateCcw className="h-4 w-4" /> 3. Ställ tillbaka
          </h3>
          {guide.putBack.trim() && <p className="text-sm">{guide.putBack}</p>}
          {guide.putBackImages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {guide.putBackImages.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img src={thumbUrl(url, THUMB_TILE)} alt="" className="h-24 w-24 rounded-lg object-cover" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {onReport && (
        <Button variant="outline" onClick={() => onReport()} className="w-full sm:w-auto">
          <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" /> Rapportera trasigt eller slut
        </Button>
      )}
    </div>
  );
}
