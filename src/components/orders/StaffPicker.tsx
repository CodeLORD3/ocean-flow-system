import { useStaff } from "@/hooks/useStaff";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  storeId?: string;
  /** Vald person (staff.id). */
  staffId?: string | null;
  onChange: (value: { staffId: string; name: string }) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Obligatoriskt personval med namn och profilbild.
 * Används för "Vem tog emot beställningen" och "Vem packade beställningen".
 */
export function StaffPicker({ storeId, staffId, onChange, placeholder = "Välj person", className = "" }: Props) {
  const { data: staffList = [] } = useStaff(storeId);

  return (
    <Select
      value={staffId ?? undefined}
      onValueChange={(id) => {
        const s: any = staffList.find((p: any) => p.id === id);
        if (!s) return;
        onChange({ staffId: id, name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() });
      }}
    >
      <SelectTrigger className={`h-12 ${className}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {staffList.map((s: any) => {
          const name = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
          const initials = `${s.first_name?.[0] ?? ""}${s.last_name?.[0] ?? ""}`.toUpperCase();
          return (
            <SelectItem key={s.id} value={s.id}>
              <span className="flex items-center gap-2">
                <Avatar className="h-9 w-9 border border-grid-line/70">
                  {s.profile_image_url && <AvatarImage src={s.profile_image_url} alt={`Profilbild ${name}`} />}
                  <AvatarFallback className="text-[9px] font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <span>{name}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
