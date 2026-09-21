import { useNavigate } from "react-router-dom";
import { useStaff } from "@/hooks/useStaff";
import { cn } from "@/lib/utils";

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

/** Hittar personalposten som matchar ett fritextnamn. */
export function useStaffByName(name?: string | null) {
  const { data: staffList = [] } = useStaff();
  if (!name) return null;
  const target = norm(name);
  return (
    (staffList as any[]).find((s) => {
      const full = norm(`${s.first_name ?? ""} ${s.last_name ?? ""}`);
      return full === target || norm(s.first_name ?? "") === target;
    }) ?? null
  );
}

export function initialsOfName(name?: string | null) {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Liten profilbild för ett namn, med initialer som reserv. */
export function StaffFace({
  name,
  className,
  textClassName,
}: {
  name?: string | null;
  className?: string;
  textClassName?: string;
}) {
  const match = useStaffByName(name);
  const initials = initialsOfName(name) || "?";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground",
        "h-7 w-7 text-[11px]",
        className,
      )}
      aria-hidden="true"
    >
      {match?.profile_image_url ? (
        <img src={match.profile_image_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <span className={textClassName}>{initials}</span>
      )}
    </span>
  );
}

/** Namn med profilbild före namnet. */
export function StaffName({
  name,
  className,
  faceClassName,
  fallback = "—",
}: {
  name?: string | null;
  className?: string;
  faceClassName?: string;
  fallback?: string;
}) {
  if (!name) return <span className={className}>{fallback}</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <StaffFace name={name} className={faceClassName} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Namn med profilbild som länkar till personens egen sida, när personen finns. */
export function PersonLink({
  name,
  className,
  faceClassName,
  fallback = "—",
}: {
  name?: string | null;
  className?: string;
  faceClassName?: string;
  fallback?: string;
}) {
  const match = useStaffByName(name);
  const navigate = useNavigate();
  if (!name) return <span className={className}>{fallback}</span>;
  if (!match) return <StaffName name={name} className={className} faceClassName={faceClassName} />;
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/person/${match.id}`);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/person/${match.id}`);
        }
      }}
      className={cn("inline-flex min-w-0 cursor-pointer items-center gap-1 hover:underline", className)}
      title={`Öppna ${name}s sida`}
    >
      <StaffFace name={name} className={faceClassName} />
      <span className="truncate">{name}</span>
    </span>
  );
}
