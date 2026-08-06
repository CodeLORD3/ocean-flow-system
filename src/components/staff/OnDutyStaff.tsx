import { useStaff } from "@/hooks/useStaff";
import { useOpenShifts, shiftClock } from "@/hooks/useStaffShifts";

/**
 * Live-lista över personal som är instämplad just nu.
 * Visas i Översikt — till höger om rubriken på dator, under rubriken på mobil.
 */
export function OnDutyStaff({ storeId }: { storeId?: string | null }) {
  const { data: staffList = [] } = useStaff(storeId ?? undefined);
  const { data: openShifts = [] } = useOpenShifts(storeId ?? undefined);

  const byId = new Map(staffList.map((s: any) => [s.id, s]));
  const onDuty = openShifts
    .map((sh) => ({ shift: sh, person: byId.get(sh.staff_id) as any }))
    .filter((x) => !!x.person);

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-2.5 py-2 shadow-card">
      <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
        {onDuty.length > 0 && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 animate-ping" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            onDuty.length > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"
          }`}
        />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-foreground">
          {onDuty.length > 0 ? `Arbetar nu · ${onDuty.length}` : "Ingen instämplad"}
        </p>
        {onDuty.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Stämpla in på sidan Min profil</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {onDuty.map(({ shift, person }) => (
              <span
                key={shift.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-foreground"
              >
                {person.profile_image_url ? (
                  <img
                    src={person.profile_image_url}
                    alt={`${person.first_name} ${person.last_name}`}
                    className="h-4 w-4 rounded-full object-cover"
                  />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                )}
                <span className="font-medium">
                  {person.first_name} {person.last_name?.charAt(0)}.
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {shiftClock(shift.clocked_in_at)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
