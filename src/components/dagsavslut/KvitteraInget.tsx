import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { dagsavslutKvitteringar, kvitteraDagsavslut } from "@/lib/dagsavslut";

function idag() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

/**
 * "Inget att beställa i dag" / "Inget att köpa in i dag". Kvitteringen tar bort
 * punkten från påminnelseraden och visar vem som kvitterade och när.
 */
export function KvitteraInget({
  storeId,
  vad,
  label,
}: {
  storeId?: string | null;
  vad: "grossist" | "inkop";
  label?: string;
}) {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  const dag = idag();

  const { data: kvitteringar = [] } = useQuery({
    queryKey: ["dagsavslut-kvittering", storeId, dag],
    enabled: !!storeId,
    queryFn: () => dagsavslutKvitteringar(storeId as string, dag),
  });

  if (!storeId) return null;
  const rad = kvitteringar.find((k) => k.vad === vad);

  if (rad) {
    const tid = new Date(rad.created_at).toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Stockholm",
    });
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Check className="h-4 w-4 text-primary" />
        Kvitterat{rad.staff_name ? ` av ${rad.staff_name}` : ""} kl {tid}
      </p>
    );
  }

  const text = label ?? (vad === "grossist" ? "Inget att beställa i dag" : "Inget att köpa in i dag");
  const namn = staff ? `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() : null;

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 text-xs font-semibold"
      onClick={async () => {
        try {
          await kvitteraDagsavslut(storeId, vad, staff?.id ?? null, namn, null, dag);
          qc.invalidateQueries({ queryKey: ["dagsavslut-kvittering"] });
          qc.invalidateQueries({ queryKey: ["dagsavslut"] });
          toast.success(text);
        } catch (e: any) {
          toast.error(e?.message ?? "Kunde inte kvittera");
        }
      }}
    >
      {text}
    </Button>
  );
}
