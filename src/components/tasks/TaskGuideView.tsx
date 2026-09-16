import { Target } from "lucide-react";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import type { TaskGuide } from "@/lib/taskGuide";

/** Visar arbetsbeskrivningen: målet, vad man behöver och steg för steg. */
export function TaskGuideView({ guide }: { guide: TaskGuide }) {
  const hasGoal = guide.goal.trim() || guide.goalImages.length > 0;
  const hasMaterials = guide.materials.length > 0;
  const hasSteps = guide.steps.length > 0;

  if (!hasGoal && !hasMaterials && !hasSteps) return null;

  return (
    <div className="space-y-4">
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
          <h3 className="mb-2 text-sm font-semibold">Utrustning och material</h3>
          <div className="flex flex-wrap gap-3">
            {guide.materials.map((m, i) => (
              <div key={i} className="w-24 text-center">
                {m.image ? (
                  <img src={thumbUrl(m.image, THUMB_TILE)} alt="" className="h-24 w-24 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                    Ingen bild
                  </div>
                )}
                <p className="mt-1 text-xs">{m.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasSteps && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Arbetsgång</h3>
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
                      <img
                        src={thumbUrl(s.image, THUMB_TILE)}
                        alt=""
                        className="mt-1 h-32 w-full max-w-[220px] rounded-lg object-cover"
                      />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
