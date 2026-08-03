/**
 * Auto-godkännande i pris-/tillverkningsflödet.
 *
 * Regel (avsnitt 5):
 *  - Auto-godkänns: färdigvaror med marginal (ink. arbete) >= målet och säkerställt utbyte.
 *  - Blockeras: allt som kräver hantering (requires_processing = true), saknat utbyte
 *    eller marginal under målet — går till manuell granskning.
 */
export interface AutoApprovalInput {
  /** Produkten kräver styckning/beredning innan försäljning. */
  requiresProcessing: boolean;
  /** Utbytet är fastställt i utbytesregistret (ej gissat). */
  yieldConfirmed: boolean;
  /** Marginal inklusive förädlingsarbete, i procent. */
  marginInclWorkPct: number;
  /** Marginalmål för regionen, i procent. */
  targetMarginPct: number;
}

export interface AutoApprovalResult {
  approved: boolean;
  reasons: string[];
}

export function evaluateAutoApproval(input: AutoApprovalInput): AutoApprovalResult {
  const reasons: string[] = [];
  if (input.requiresProcessing) reasons.push("Kräver hantering (styckning/beredning) — manuell granskning");
  if (!input.yieldConfirmed) reasons.push("Utbytet är inte säkerställt i utbytesregistret");
  if (input.marginInclWorkPct < input.targetMarginPct)
    reasons.push(
      `Marginal ink. arbete ${input.marginInclWorkPct.toFixed(1)} % under målet ${input.targetMarginPct.toFixed(0)} %`,
    );
  return { approved: reasons.length === 0, reasons };
}
