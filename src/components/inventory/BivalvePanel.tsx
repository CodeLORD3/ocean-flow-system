import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shell, ShieldAlert, ShieldCheck, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  lotId: string;
}

/**
 * Levande blötdjur, som musslor och ostron. Partiet kräver upptagningsområde,
 * områdesklassificering och ett giltigt registreringsdokument. Klass B och C
 * kräver dessutom rening eller värmebehandling. Utan detta spärrar databasen
 * både prissättning och utleverans, precis som vid parasitfrysning.
 */
export default function BivalvePanel({ lotId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, any>>({});
  const [touched, setTouched] = useState(false);

  const { data: lot } = useQuery({
    queryKey: ["lot_bivalve", lotId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select(
          "id, lot_number, is_bivalve, catch_area, harvest_date, production_area_classification, bivalve_doc_number, bivalve_doc_issuer, bivalve_doc_valid_to, purification_center, bivalve_heat_treated",
        )
        .eq("id", lotId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const val = (key: string) =>
    touched && form[key] !== undefined ? form[key] : (lot?.[key] ?? "");
  const set = (key: string, v: any) => {
    setTouched(true);
    setForm((f) => ({ ...f, [key]: v }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("lots")
        .update({
          harvest_date: val("harvest_date") || null,
          production_area_classification: val("production_area_classification") || null,
          bivalve_doc_number: val("bivalve_doc_number") || null,
          bivalve_doc_issuer: val("bivalve_doc_issuer") || null,
          bivalve_doc_valid_to: val("bivalve_doc_valid_to") || null,
          purification_center: val("purification_center") || null,
          bivalve_heat_treated: !!val("bivalve_heat_treated"),
        } as any)
        .eq("id", lotId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registreringsdokumentet är sparat på partiet.");
      setTouched(false);
      setForm({});
      qc.invalidateQueries({ queryKey: ["lot_bivalve", lotId] });
      qc.invalidateQueries({ queryKey: ["lots_traceability"] });
    },
    onError: (e: any) => toast.error(e.message || "Uppgifterna kunde inte sparas."),
  });

  if (!lot?.is_bivalve) return null;

  const cls = String(val("production_area_classification") || "").toUpperCase();
  const validTo = val("bivalve_doc_valid_to") as string;
  const expired = !!validTo && validTo < new Date().toISOString().slice(0, 10);
  const needsPurification =
    (cls === "B" || cls === "C") && !val("purification_center") && !val("bivalve_heat_treated");
  const blocked = !cls || !val("bivalve_doc_number") || expired || needsPurification;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Shell className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold">Levande blötdjur</span>
        {blocked ? (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <ShieldAlert className="h-3 w-3" />
            {expired
              ? "Registreringsdokumentet har gått ut"
              : needsPurification
                ? `Klass ${cls} kräver rening eller värmebehandling`
                : "Registreringsdokument saknas"}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <ShieldCheck className="h-3 w-3" />
            Dokumenterat
          </Badge>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Upptagningsområde {lot.catch_area || "saknas"}. Utan klassificering och giltigt
        registreringsdokument kan partiet inte prissättas, överföras eller säljas.
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[11px]">Upptagningsdatum</Label>
          <Input
            type="date"
            value={(val("harvest_date") as string) || ""}
            onChange={(e) => set("harvest_date", e.target.value)}
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Klassificering</Label>
          <select
            value={cls}
            onChange={(e) => set("production_area_classification", e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Välj</option>
            <option value="A">A, får säljas direkt</option>
            <option value="B">B, kräver rening</option>
            <option value="C">C, kräver längre rening</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Dokumentnummer</Label>
          <Input
            value={(val("bivalve_doc_number") as string) || ""}
            onChange={(e) => set("bivalve_doc_number", e.target.value)}
            className="h-9 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Utfärdare</Label>
          <Input
            value={(val("bivalve_doc_issuer") as string) || ""}
            onChange={(e) => set("bivalve_doc_issuer", e.target.value)}
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Giltigt till</Label>
          <Input
            type="date"
            value={validTo || ""}
            onChange={(e) => set("bivalve_doc_valid_to", e.target.value)}
            className="h-9 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Reningscenter</Label>
          <Input
            value={(val("purification_center") as string) || ""}
            onChange={(e) => set("purification_center", e.target.value)}
            placeholder="Anläggning och godkännandenummer"
            className="h-9 text-xs"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={!!val("bivalve_heat_treated")}
          onCheckedChange={(v) => set("bivalve_heat_treated", !!v)}
        />
        Värmebehandlat i stället för rening
      </label>

      <Button
        size="sm"
        className="h-9 gap-1 text-xs"
        onClick={() => save.mutate()}
        disabled={save.isPending || !touched}
      >
        <Save className="h-3.5 w-3.5" />
        Spara blötdjursuppgifter
      </Button>
    </div>
  );
}
