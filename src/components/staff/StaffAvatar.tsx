import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Liten profilbild för den person som gjort något, med initialer som reserv. */
export function StaffAvatar({
  name,
  imageUrl,
  className,
}: {
  name?: string | null;
  imageUrl?: string | null;
  className?: string;
}) {
  const initials = (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <Avatar className={cn("h-6 w-6 border border-border", className)}>
      {imageUrl && <AvatarImage src={imageUrl} alt={name ?? ""} />}
      <AvatarFallback className="text-[10px] font-semibold">{initials || "?"}</AvatarFallback>
    </Avatar>
  );
}
