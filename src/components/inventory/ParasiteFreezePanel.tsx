import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Snowflake, ShieldAlert, ShieldCheck, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Props {
  lotId: string;
}

/**
 * Parasitfrysning och blötdjursdokumentation per parti.
 * Ett parti som ska ätas rått måste ha antingen dokumenterad frysbehandling
 * (minus 20 grader i 24 timmar, eller minus 35 grader i 15 timmar) eller ett
 * registrerat undantag med källa. Utan det spärrar databasen både
 * prissättning och utleverans.
 */
export default function ParasiteFreezePanel({ lotId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  const { data: lot } = useQuery({
    queryKey: ["lot_parasite", lotId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select(
          "id, lot_number, parasite_treatment_required, freeze_temp, freeze_start, freeze_end, freeze_by, exemption_reason, exemption_source, receiving_temp_c, receiving_temp_deviation_reason, bivalve_registration_doc, production_area_classification",
        )
        .eq("id", lotId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const val = (key: string) =>
    touched && form[key] !== undefined ? form[key] : ((lot?.[key] ?? "") as string);
  const set = (key: string, v: string) => {
    setTouched(true);
    setForm((f) => ({ ...f, [key]: v }));
  };

  const localDT = (v: string) => (v ? v.slice(0, 16) : "");

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        freeze_temp: val("freeze_temp") === "" ? null : Number(String(val("freeze_temp")).replace(",", ".")),
        freeze_start: val("freeze_start") ? new Date(val("freeze_start")).toISOString() : null,
        freeze_end: val("freeze_end") ? new Date(val("freeze_end")).toISOString() : null,
        freeze_by: val("freeze_by") || null,
        exemption_reason: val("exemption_reason") || null,
        exemption_source: val("exemption_source") || null,
        bivalve_registration_doc: val("bivalve_registration_doc") || null,
        production_area_classification: val("production_area_classification") || null,
      };
      const { error } = await supabase.from("lots").update(payload).eq("id", lotId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Behandlingen är dokumenterad på partiet.");
      setTouched(false);
      setForm({});
      qc.invalidateQueries({ queryKey: ["lot_parasite", lotId] });
      qc.invalidateQueries({ queryKey: ["lots_traceability"] });
    },
    onError: (e: any) => toast.error(e.message || "Behandlingen kunde inte sparas."),
  });

  if (!lot) return null;

  const frozen = !!(lot.freeze_start && lot.freeze_end && lot.freeze_temp !== null);
  const exempt = !!(lot.exemption_reason && lot.exemption_source);
  const required = !!lot.parasite_treatment_required;
  const blocked = required && !frozen && !exempt;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Parasitfrysning
        </p>
        {!required ? (
          <Badge variant="outline" className="text-[10px]">
            Behandling krävs inte
          </Badge>
        ) : blocked ? (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <ShieldAlert className="h-3 w-3" /> Spärrad — får inte prissättas eller levereras
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-emerald-500/50 text-[10px] text-emerald-600">
            <ShieldCheck className="h-3 w-3" /> {frozen ? "Frysbehandlad" : "Undantag registrerat"}
          </Badge>
        )}
        {lot.receiving_temp_c !== null && (
          <span className="text-[11px] text-muted-foreground">
            Mottagen vid {lot.receiving_temp_c} grader
            {lot.receiving_temp_deviation_reason ? ` (${lot.receiving_temp_deviation_reason})` : ""}
          </span>
        )}
      </div>

      {required && (
        <p className="text-[11px] text-muted-foreground">
          Kravet gäller produkter som äts råa eller nästan råa, som gravad lax, sashimi och inlagd
          sill. Godkänd behandling är minus 20 grader i minst 24 timmar, eller minus 35 grader i
          minst 15 timmar. Tiderna kontrolleras när du sparar.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-[11px]">Frystemperatur</Label>
          <Input
            value={val("freeze_temp") as string}
            onChange={(e) => set("freeze_temp", e.target.value)}
            inputMode="decimal"
            placeholder="-20"
            className="h-8 font-mono text-xs tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Start</Label>
          <Input
            type="datetime-local"
            value={localDT(val("freeze_start") as string)}
            onChange={(e) => set("freeze_start", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Slut</Label>
          <Input
            type="datetime-local"
            value={localDT(val("freeze_end") as string)}
            onChange={(e) => set("freeze_end", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Utförd av</Label>
          <Input
            value={val("freeze_by") as string}
            onChange={(e) => set("freeze_by", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-[11px]">Undantag, skäl</Label>
          <Input
            value={val("exemption_reason") as string}
            onChange={(e) => set("exemption_reason", e.target.value)}
            placeholder="Odlad lax utan parasitrisk"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-[11px]">Undantag, källa</Label>
          <Input
            value={val("exemption_source") as string}
            onChange={(e) => set("exemption_source", e.target.value)}
            placeholder="Leverantörsintyg nr, eller 1276/2011 bilaga"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-[11px]">Blötdjur, registreringsdokument</Label>
          <Input
            value={val("bivalve_registration_doc") as string}
            onChange={(e) => set("bivalve_registration_doc", e.target.value)}
            placeholder="Nummer på registreringsdokumentet"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-[11px]">Områdesklassificering (A, B eller C)</Label>
          <Input
            value={val("production_area_classification") as string}
            onChange={(e) => set("production_area_classification", e.target.value)}
            placeholder="A"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <Button
        size="sm"
        className="h-8 gap-1 text-xs"
        disabled={!touched || save.isPending}
        onClick={() => save.mutate()}
      >
        {frozen ? <Snowflake className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
        Spara behandling
      </Button>
    </div>
  );
}
