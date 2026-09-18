import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Ett registrerat kort — företagskort eller någons privata kort (utlägg). */
export interface PaymentCard {
  id: string;
  store_id: string | null;
  staff_id: string | null;
  card_brand: string | null;
  /** Banken eller utgivaren som står på kortet, t.ex. PostFinance, UBS, SEB. */
  bank: string | null;
  card_last4: string;
  card_holder: string | null;
  label: string | null;
  /** "foretag" = butikens kort, "privat" = eget kort som ska ersättas som utlägg. */
  card_kind: "foretag" | "privat";
  active: boolean;
  /** Fylls i av hooken. */
  staff_name?: string | null;
  staff_image?: string | null;
}

export function usePaymentCards() {
  return useQuery({
    queryKey: ["payment-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_cards")
        .select("*")
        .eq("active", true)
        .order("card_kind")
        .order("card_last4");
      if (error) throw error;
      const rows = (data ?? []) as unknown as PaymentCard[];

      const ids = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))] as string[];
      let byStaff: Record<string, { name: string; image: string | null }> = {};
      if (ids.length) {
        const { data: staff } = await supabase
          .from("staff")
          .select("id, first_name, last_name, profile_image_url")
          .in("id", ids);
        byStaff = Object.fromEntries(
          (staff ?? []).map((s: any) => [
            s.id,
            { name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(), image: s.profile_image_url ?? null },
          ]),
        );
      }
      return rows.map((r) => ({
        ...r,
        staff_name: r.staff_id ? byStaff[r.staff_id]?.name ?? null : null,
        staff_image: r.staff_id ? byStaff[r.staff_id]?.image ?? null : null,
      }));
    },
  });
}

export interface PaymentCardInput {
  id?: string;
  storeId?: string | null;
  staffId?: string | null;
  cardBrand?: string | null;
  bank?: string | null;
  cardLast4: string;
  cardHolder?: string | null;
  label?: string | null;
  cardKind: "foretag" | "privat";
}

export function useSavePaymentCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentCardInput) => {
      const row = {
        store_id: input.storeId ?? null,
        staff_id: input.staffId ?? null,
        card_brand: input.cardBrand?.trim() || null,
        bank: input.bank?.trim() || null,
        card_last4: input.cardLast4.trim(),
        card_holder: input.cardHolder?.trim() || null,
        label: input.label?.trim() || null,
        card_kind: input.cardKind,
      };
      if (input.id) {
        const { error } = await supabase.from("payment_cards").update(row).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase.from("payment_cards").insert(row).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-cards"] }),
  });
}

export function useRemovePaymentCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payment_cards").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-cards"] }),
  });
}

/** Hittar kortet som matchar de fyra sista siffrorna. */
export function matchCard(cards: PaymentCard[], last4: string) {
  if (!/^\d{4}$/.test(last4)) return null;
  return cards.find((c) => c.card_last4 === last4) ?? null;
}

export function cardLabel(c: PaymentCard) {
  const who = c.staff_name || c.card_holder;
  return [c.bank, c.card_brand || "Kort", `••${c.card_last4}`, who, c.card_kind === "privat" ? "privat" : null]
    .filter(Boolean)
    .join(" · ");
}
