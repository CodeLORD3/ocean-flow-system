import { useStaff } from "@/hooks/useStaff";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

type Props = {
  /** Namnet som sparats på ordern, t.ex. "Anna Andersson". */
  name?: string | null;
  className?: string;
  size?: "xs" | "sm";
};

/**
 * Visar beställarens namn med profilbilden direkt efter namnet.
 * Bilden hämtas genom att matcha namnet mot personalregistret.
 */
export function OrdererName({ name, className = "", size = "xs" }: Props) {
  const { data: staffList = [] } = useStaff();

  if (!name) return <span className={className}>–</span>;

  const target = norm(name);
  const match = staffList.find((s: any) => {
    const full = norm(`${s.first_name ?? ""} ${s.last_name ?? ""}`);
    return full === target || norm(s.first_name ?? "") === target;
  });

  const dim = size === "sm" ? "h-5 w-5" : "h-4 w-4";
  const initials = `${(match?.first_name ?? name)[0] ?? ""}${match?.last_name?.[0] ?? ""}`.toUpperCase();

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <span className="truncate">{name}</span>
      <Avatar className={`${dim} shrink-0 border border-grid-line/70`}>
        {match?.profile_image_url && <AvatarImage src={match.profile_image_url} alt={`Profilbild ${name}`} />}
        <AvatarFallback className="text-[8px] font-semibold">{initials}</AvatarFallback>
      </Avatar>
    </span>
  );
}
