import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardList, Image as ImageIcon, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StaffPageShell, StaffMetric } from "@/components/staff/StaffPageShell";
import { PersonHeader } from "@/components/staff/PersonHeader";
import { PersonTimeline } from "@/components/staff/PersonTimeline";
import { StaffActivityPanel } from "@/components/staff/StaffActivityPanel";
import { usePersonProfile, usePersonTimeline } from "@/hooks/usePersonTimeline";
import { useOpenShiftMap } from "@/hooks/useStaffShifts";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useSite } from "@/contexts/SiteContext";
import { thumbUrl } from "@/lib/imageThumb";
import { imageRoute, taskRoute, eventTime } from "@/lib/personEvents";
import { dayDateLabel, dayKey } from "@/lib/imageMeta";

/** Varje anställds egen sida: enkel information om personen och hens händelser. */
export default function PersonPage({ staffId }: { staffId: string }) {
  const navigate = useNavigate();
  const { site } = useSite();
  const { staff: me } = useStaffAuth();
  const [tab, setTab] = useState("events");

  const { data: person, isLoading: loadingPerson } = usePersonProfile(staffId);
  const { data: timeline, isLoading: loadingTimeline } = usePersonTimeline(staffId, person);
  const { map: openShifts } = useOpenShiftMap();

  const openShift = openShifts.get(staffId);
  const isAdmin = site === "wholesale";
  const isSelf = me?.id === staffId;

  const tasks = timeline?.tasks ?? [];
  const assigned = useMemo(() => tasks.filter((t) => t.mine === "assigned" && !t.done), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((t) => t.done), [tasks]);

  if (loadingPerson) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!person) {
    return <p className="p-6 text-sm text-muted-foreground">Personen finns inte.</p>;
  }

  const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim() || "Personen";
  const lastActive = timeline?.lastActiveAt;

  return (
    <StaffPageShell
      label="Personal"
      title={name}
      metrics={
        <>
          <StaffMetric label="Utförda uppgifter (30 dagar)" value={timeline?.doneCount30d ?? "—"} />
          <StaffMetric label="Tilldelade nu" value={timeline?.openAssigned ?? "—"} />
          <StaffMetric label="Bilder" value={timeline?.imageCount ?? "—"} />
          <StaffMetric
            label="Senast aktiv"
            value={lastActive ? eventTime(lastActive) : "—"}
            hint={lastActive ? dayDateLabel(dayKey(lastActive)) : "Inget registrerat"}
          />
        </>
      }
    >
      <div className="border-b border-border">
        <PersonHeader person={person} clockedInSince={openShift?.clocked_in_at ?? null} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="p-0">
        <TabsList className="m-4 mb-0">
          <TabsTrigger value="events">Händelser</TabsTrigger>
          <TabsTrigger value="tasks">Uppgifter</TabsTrigger>
          <TabsTrigger value="images">Bilder</TabsTrigger>
          {(isAdmin || isSelf) && <TabsTrigger value="logins">Inloggningar</TabsTrigger>}
        </TabsList>

        <TabsContent value="events" className="mt-0">
          {loadingTimeline ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <PersonTimeline events={timeline?.events ?? []} />
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-0 p-4">
          <section className="mb-6">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4" /> Tilldelade nu ({assigned.length})
            </h3>
            {assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga tilldelade uppgifter.</p>
            ) : (
              <ul className="space-y-1">
                {assigned.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => navigate(taskRoute(t.id))}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/60"
                    >
                      <span className="truncate">{t.task}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {t.checklist_date ?? ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4" /> Utförda ({doneTasks.length})
            </h3>
            {doneTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga utförda uppgifter registrerade.</p>
            ) : (
              <ul className="space-y-1">
                {doneTasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => navigate(taskRoute(t.id))}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/60"
                    >
                      <span className="truncate">{t.task}</span>
                      <span className="shrink-0 inline-flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {t.done_at ? new Date(t.done_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : t.checklist_date}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="images" className="mt-0 p-4">
          {(timeline?.images ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <ImageIcon className="mr-1 inline h-4 w-4" /> Inga bilder från {name} ännu.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {(timeline?.images ?? []).map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => navigate(imageRoute(img.id))}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                  title={img.title || "Bild"}
                >
                  <img
                    src={thumbUrl(img.url, 320) || img.url}
                    alt={img.title || ""}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  {img.title ? (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-left text-[11px] text-white">
                      {img.title}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        {(isAdmin || isSelf) && (
          <TabsContent value="logins" className="mt-0 p-4">
            <StaffActivityPanel staffId={person.id} userId={person.user_id} staffName={name} />
          </TabsContent>
        )}
      </Tabs>
    </StaffPageShell>
  );
}
