import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStores } from "@/hooks/useStores";
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

/**
 * Inköpen görs centralt för alla butiker, så kvitteringen "inget att köpa in"
 * gäller samtliga aktiva butiker för dagen.
 */
export function KvitteraIngetInkop() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  const { data: stores = [] } = useStores(true);
  const dag = idag();

  const aktiva = stores.filter(
    (s) => s.active && !/^Administration/i.test(s.name ?? "") && !/^Testbutik/i.test(s.name ?? ""),
  );

  const { data: klara = 0 } = useQuery({
    queryKey: ["dagsavslut-kvittering-inkop", dag, aktiva.map((s) => s.id).sort()],
    enabled: aktiva.length > 0,
    queryFn: async () => {
      const res = await Promise.all(aktiva.map((s) => dagsavslutKvitteringar(s.id, dag)));
      return res.filter((r) => r.some((k) => k.vad === "inkop")).length;
    },
  });

  if (aktiva.length === 0) return null;

  if (klara >= aktiva.length) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Check className="h-4 w-4 text-primary" />
        Kvitterat: inget att köpa in i dag
      </p>
    );
  }

  const namn = staff ? `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim() : null;

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 text-xs font-semibold"
      onClick={async () => {
        try {
          for (const s of aktiva) {
            await kvitteraDagsavslut(s.id, "inkop", staff?.id ?? null, namn, null, dag);
          }
          qc.invalidateQueries({ queryKey: ["dagsavslut-kvittering-inkop"] });
          qc.invalidateQueries({ queryKey: ["dagsavslut"] });
          toast.success("Inget att köpa in i dag");
        } catch (e: any) {
          toast.error(e?.message ?? "Kunde inte kvittera");
        }
      }}
    >
      Inget att köpa in i dag
    </Button>
  );
}
