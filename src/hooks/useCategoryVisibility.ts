import { useMemo } from "react";
import { useCategories } from "@/hooks/useCategories";
import { normalizeCategoryKey } from "@/lib/productCategories";

/**
 * Kategorier kan begränsas till vissa butiker (categories.visible_store_ids).
 * Tom lista = kategorin visas överallt. Grossisten styrs av wholesale_visible.
 *
 * Returnerar ett predikat som filtrerar produktlistor i beställningsvyerna.
 */
export function useCategoryVisibility(storeId?: string | null, isWholesale = false) {
  const { data: categories = [] } = useCategories();

  return useMemo(() => {
    const restricted = new Map<string, { stores: string[]; wholesale: boolean }>();
    for (const c of categories) {
      const stores = c.visible_store_ids ?? [];
      const wholesale = c.wholesale_visible !== false;
      if (stores.length > 0 || !wholesale) {
        restricted.set(normalizeCategoryKey(c.name), { stores, wholesale });
      }
    }

    const isCategoryVisible = (category?: string | null) => {
      const rule = restricted.get(normalizeCategoryKey(category));
      if (!rule) return true;
      if (isWholesale) return rule.wholesale;
      if (rule.stores.length === 0) return true;
      return !!storeId && rule.stores.includes(storeId);
    };

    return {
      isCategoryVisible,
      filterByCategory: <T extends { category?: string | null }>(rows: T[]) =>
        rows.filter((r) => isCategoryVisible(r.category)),
    };
  }, [categories, storeId, isWholesale]);
}
