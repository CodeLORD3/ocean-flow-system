import { useActorNames } from "@/hooks/useActorNames";

interface Props {
  createdBy?: string | null;
  createdAt?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
  /** true = en rad per uppgift, annars allt på samma rad (listvy) */
  stacked?: boolean;
  className?: string;
}

function fmt(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Diskret spårbarhetssignatur: vem skapade och vem ändrade senast.
 * Liten, ljusgrå text som aldrig ska konkurrera med orderns innehåll.
 */
export function OrderAuditLine({
  createdBy,
  createdAt,
  updatedBy,
  updatedAt,
  stacked,
  className = "",
}: Props) {
  const { nameOf } = useActorNames();

  const created = createdAt
    ? `Skapad av ${nameOf(createdBy) || "okänd"} · ${fmt(createdAt)}`
    : null;
  const changed =
    updatedAt && createdAt && new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 60000
      ? `Senast ändrad av ${nameOf(updatedBy) || "okänd"} · ${fmt(updatedAt)}`
      : null;

  if (!created && !changed) return null;

  return (
    <div
      className={`text-[11px] font-normal leading-tight text-muted-foreground/60 ${
        stacked ? "space-y-0.5" : "flex flex-wrap items-center gap-x-2"
      } ${className}`}
    >
      {created && <span>{created}</span>}
      {changed && <span>{changed}</span>}
    </div>
  );
}
