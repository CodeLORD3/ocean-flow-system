/**
 * Arbetsgivaravgift per person och månad.
 * - Regler filtreras på bolag, giltighet och födelseår. Saknat födelseår => bara regler utan åldersgräns.
 * - Regel med salary_cap (ungdomsnedsättning): reducerad sats på lön upp till taket, ordinarie på resten.
 * - Ingen regel => 31,42 %.
 */
export type ContributionRule = {
  legal_entity_id: string | null;
  valid_from: string;
  valid_to: string | null;
  birth_year_from: number | null;
  birth_year_to: number | null;
  salary_cap: number | string | null;
  contribution_rate: number | string;
};

export const DEFAULT_RATE = 31.42;

export function employerContribution(
  gross: number,
  birthYear: number | null,
  rules: ContributionRule[],
  ctx: { legalEntityId: string; from: string; to: string },
): { amount: number; rate: number } {
  const ok = rules.filter((r) => {
    if (r.legal_entity_id && r.legal_entity_id !== ctx.legalEntityId) return false;
    if (r.valid_from > ctx.to) return false;
    if (r.valid_to && r.valid_to < ctx.from) return false;
    if (r.birth_year_from !== null && (birthYear === null || birthYear < r.birth_year_from)) return false;
    if (r.birth_year_to !== null && (birthYear === null || birthYear > r.birth_year_to)) return false;
    return true;
  });
  const uncapped = ok.filter((r) => r.salary_cap === null).map((r) => Number(r.contribution_rate));
  const ordinary = uncapped.length ? Math.min(...uncapped) : DEFAULT_RATE;
  const capped = ok
    .filter((r) => r.salary_cap !== null && Number(r.contribution_rate) < ordinary)
    .sort((a, b) => Number(a.contribution_rate) - Number(b.contribution_rate))[0];
  if (gross <= 0) return { amount: 0, rate: capped ? Number(capped.contribution_rate) : ordinary };
  let amount: number;
  if (capped) {
    const cap = Number(capped.salary_cap);
    amount = (Math.min(gross, cap) * Number(capped.contribution_rate) + Math.max(0, gross - cap) * ordinary) / 100;
  } else {
    amount = (gross * ordinary) / 100;
  }
  return { amount: Math.round(amount * 100) / 100, rate: Math.round((amount / gross) * 1e6) / 1e4 };
}
