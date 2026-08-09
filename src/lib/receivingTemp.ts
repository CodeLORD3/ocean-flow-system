import { supabase } from "@/integrations/supabase/client";

/**
 * Mottagningstemperatur vid ankomst.
 * Färsk fisk och färska fiskeriprodukter ska hålla issmältande temperatur,
 * 0 till 2 grader. Fryst vara ska hålla minus 18 grader eller kallare.
 * Ett värde utanför gränsen kräver orsak och blir en avvikelse.
 */
export const FRESH_TEMP_MAX = 2;
export const FRESH_TEMP_MIN = -1;
export const FROZEN_TEMP_MAX = -18;

export type TempMode = "fersk" | "fryst";

export function tempOutOfRange(value: number | null, mode: TempMode): boolean {
  if (value === null || Number.isNaN(value)) return false;
  return mode === "fryst" ? value > FROZEN_TEMP_MAX : value > FRESH_TEMP_MAX || value < FRESH_TEMP_MIN;
}

export function tempLimitText(mode: TempMode): string {
  return mode === "fryst"
    ? `högst ${FROZEN_TEMP_MAX} grader`
    : `${FRESH_TEMP_MIN} till ${FRESH_TEMP_MAX} grader`;
}

export function parseTemp(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sparar mottagningstemperaturen på partiet och skapar en avvikelse när
 * värdet ligger utanför gränsen. Orsaken sparas på partiet så att den följer
 * med spårbarheten, inte bara avvikelseloggen.
 */
export async function saveReceivingTemperature(input: {
  lotId: string;
  lotNumber?: string | null;
  productName?: string | null;
  tempC: number;
  mode: TempMode;
  reason?: string | null;
}): Promise<{ deviation: boolean }> {
  const breach = tempOutOfRange(input.tempC, input.mode);

  const { error } = await supabase
    .from("lots")
    .update({
      receiving_temp_c: input.tempC,
      receiving_temp_deviation_reason: breach ? (input.reason || null) : null,
    })
    .eq("id", input.lotId);
  if (error) throw error;

  if (breach) {
    const { data: staff } = await supabase
      .from("staff")
      .select("id")
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();

    const { error: devError } = await supabase.from("deviations").insert({
      source: "receiving_temp",
      source_id: input.lotId,
      title: `Mottagningstemperatur ${input.lotNumber ?? ""}`.trim(),
      description:
        `${input.productName ?? "Parti"} mottogs vid ${input.tempC} grader, gränsen är ${tempLimitText(input.mode)}.` +
        (input.reason ? ` Orsak: ${input.reason}` : ""),
      immediate_action: input.reason || null,
      created_by: (staff as any)?.id ?? null,
    });
    if (devError) throw devError;
  }

  return { deviation: breach };
}
