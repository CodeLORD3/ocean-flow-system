import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSetting } from "@/hooks/useSystemSettings";

/**
 * Kalkylsatserna bakom personalbehovet: moms, bruttovinstmarginal, övriga
 * kostnader och vinstkrav. Gemensamma standardvärden med möjlighet att sätta
 * eget värde per försäljningsställe. Allt ligger i en enda systeminställning
 * (`margin_calc`) så inget schema behöver ändras.
 *
 * Formen: { vat_pct, gross_margin_pct, other_cost_pct, profit_target_pct,
 *           stores: { "<store-id>": { ...samma nycklar, valfria } } }
 */

export interface MarginSettings {
  /** Momssats på försäljningen, procent. */
  vatPct: number;
  /** Bruttovinstmarginal på nettoförsäljningen, procent. */
  grossMarginPct: number;
  /** Övriga kostnader (hyra, drift, gemensamt) i procent av nettoförsäljningen. */
  otherCostPct: number;
  /** Vinstkrav i procent av nettoförsäljningen. */
  profitTargetPct: number;
}

export const DEFAULT_MARGINS: MarginSettings = {
  vatPct: 6,
  grossMarginPct: 35,
  otherCostPct: 15,
  profitTargetPct: 10,
};

const SETTING_KEY = "margin_calc";

function pct(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Satserna för en enhet: enhetens egna värden först, annars de gemensamma. */
export function useMarginSettings(storeId: string | null): {
  margins: MarginSettings;
  isLoading: boolean;
  raw: any;
} {
  const q = useSystemSetting(SETTING_KEY);

  const margins = useMemo(() => {
    const root = (q.data ?? {}) as any;
    const global: MarginSettings = {
      vatPct: pct(root.vat_pct, DEFAULT_MARGINS.vatPct),
      grossMarginPct: pct(root.gross_margin_pct, DEFAULT_MARGINS.grossMarginPct),
      otherCostPct: pct(root.other_cost_pct, DEFAULT_MARGINS.otherCostPct),
      profitTargetPct: pct(root.profit_target_pct, DEFAULT_MARGINS.profitTargetPct),
    };
    const own = storeId ? (root.stores ?? {})[storeId] : null;
    if (!own) return global;
    return {
      vatPct: pct(own.vat_pct, global.vatPct),
      grossMarginPct: pct(own.gross_margin_pct, global.grossMarginPct),
      otherCostPct: pct(own.other_cost_pct, global.otherCostPct),
      profitTargetPct: pct(own.profit_target_pct, global.profitTargetPct),
    };
  }, [q.data, storeId]);

  return { margins, isLoading: q.isLoading, raw: q.data };
}

/** Sparar satser globalt eller för en enskild enhet. */
export function useSaveMarginSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      storeId,
      margins,
      current,
    }: {
      storeId: string | null;
      margins: MarginSettings;
      current: any;
    }) => {
      const root = { ...((current ?? {}) as any) };
      const payload = {
        vat_pct: margins.vatPct,
        gross_margin_pct: margins.grossMarginPct,
        other_cost_pct: margins.otherCostPct,
        profit_target_pct: margins.profitTargetPct,
      };
      if (storeId) {
        root.stores = { ...(root.stores ?? {}), [storeId]: payload };
      } else {
        Object.assign(root, payload);
      }
      const { error } = await supabase
        .from("system_settings" as any)
        .upsert({ key: SETTING_KEY, value: root } as any, { onConflict: "key" });
      if (error) throw new Error(error.message);
      return root;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system_settings", SETTING_KEY] });
    },
  });
}
