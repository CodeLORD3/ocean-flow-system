/**
 * Avvikelser mot schemat för en dag — en rad per del (in tidigare/senare, ut
 * tidigare/senare, ej schemalagd tid, ingen stämpling). Chefen beslutar varje
 * del för sig; databasen räknar om godkänd tid och skriver journalen.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { IndustryButton, StatusLabel } from "@/components/industry";
import {
  DECISION_LABEL,
  PART_TITLE,
  decisionOptions,
  describePart,
  hasWholeDayDecision,
  partsOf,
  type PartDecision,
  type PartKind,
  type PartsAttestation,
} from "@/lib/attestParts";

export function useDecideAttestationPart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, part, decision }: { id: string; part: PartKind; decision: PartDecision | null }) => {
      const { data, error } = await supabase.rpc("decide_attestation_part", {
        _attestation_id: id,
        _part: part,
        _decision: decision as string,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attestations"] });
      qc.invalidateQueries({ queryKey: ["attestation_journal"] });
      qc.invalidateQueries({ queryKey: ["payroll-clocked"] });
      qc.invalidateQueries({ queryKey: ["payroll-day-attest"] });
    },
  });
}

export function DeviationParts({ attestation, readOnly = false, onEdit }: { attestation: PartsAttestation; readOnly?: boolean; onEdit?: () => void }) {
  const decide = useDecideAttestationPart();
  const parts = partsOf(attestation);
  if (parts.length === 0) return null;
  const whole = hasWholeDayDecision(attestation);
  const decisions = attestation.part_decisions ?? {};

  const run = async (part: PartKind, decision: PartDecision | null) => {
    try {
      await decide.mutateAsync({ id: attestation.id, part, decision });
      toast.success(decision ? `${PART_TITLE[part]}: ${DECISION_LABEL[decision].toLowerCase()}` : "Beslutet är ångrat");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Beslutet kunde inte sparas");
    }
  };

  return (
    <ul className="mt-1 space-y-1">
      {parts.map((p) => {
        const d = decisions[p.kind];
        return (
          <li key={p.kind} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1 basis-56">
              <span className="block font-medium">{PART_TITLE[p.kind]}</span>
              <span className="ind-mono block text-xs text-muted-foreground">{describePart(p)}</span>
            </span>
            {whole ? (
              <StatusLabel tone="neutral">Hela dagen beslutad</StatusLabel>
            ) : d ? (
              <>
                <StatusLabel tone={d.decision === "godkand" || d.decision === "schema" ? "ok" : "neutral"}>
                  {DECISION_LABEL[d.decision]}
                </StatusLabel>
                {!readOnly && (
                  <IndustryButton variant="ghost" className="h-11" disabled={decide.isPending} onClick={() => void run(p.kind, null)}>
                    Ångra
                  </IndustryButton>
                )}
              </>
            ) : readOnly ? (
              <StatusLabel tone="alert">Väntar på attest</StatusLabel>
            ) : (
              <span className="flex flex-wrap gap-2">
                {decisionOptions(p.kind).map((o, i) => (
                  <IndustryButton
                    key={o.value}
                    variant={i === 0 ? "primary" : "secondary"}
                    className="h-11"
                    disabled={decide.isPending}
                    onClick={() => void run(p.kind, o.value)}
                  >
                    {o.label}
                  </IndustryButton>
                ))}
              </span>
            )}
            {onEdit && !readOnly && (
              <IndustryButton variant="ghost" className="h-11" onClick={onEdit}>
                Ändra
              </IndustryButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
