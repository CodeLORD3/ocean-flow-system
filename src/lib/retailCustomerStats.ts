import { CustomerOrder, isUncollected, TOTAL_DEVIATION_LIMIT } from "@/lib/customerOrders";

/** Vikt: max en decimal på kilo (2 kg blir "2"), heltal på styck. */
export const qtyText = (v: unknown, unit?: string | null) =>
  Number(v ?? 0).toLocaleString("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: String(unit ?? "").toLowerCase().startsWith("st") ? 0 : 1,
  });

/** Belopp i kronor utan decimaler, mellanslag som tusenavskiljare. */
export const money = (v: unknown) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const shortDate = (iso?: string | null) =>
  iso
    ? new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("sv-SE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export const longDate = (iso: string) => {
  const s = new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const today = () => new Date().toISOString().slice(0, 10);

export const orderTotal = (o: CustomerOrder) =>
  Number(o.total_incl_vat || o.estimated_total || 0);

/** Order som ännu inte är utlämnad, avbruten eller ohämtad — dvs. kommande. */
export function isUpcoming(o: CustomerOrder) {
  if (["avbruten", "levererad", "avhamtad"].includes(o.status)) return false;
  return o.wanted_date >= today();
}

export function isCompleted(o: CustomerOrder) {
  return ["levererad", "avhamtad"].includes(o.status);
}

/** Avviker verkligt belopp mer än 15 % från uppskattningen? */
export function hasTotalDeviation(o: CustomerOrder) {
  const est = Number(o.estimated_total || 0);
  const act = Number(o.total_incl_vat || 0);
  if (!est || !act) return false;
  return Math.abs(act - est) / est > TOTAL_DEVIATION_LIMIT;
}

export interface ShareRow {
  label: string;
  count: number;
  share: number;
}

export interface ProductRow {
  name: string;
  orders: number;
  quantity: number;
  unit: string;
  last: string;
}

export interface CustomerStats {
  total: number;
  thisYear: number;
  totalValue: number;
  average: number;
  first: string | null;
  last: string | null;
  /** Ordrar per månad, räknat från första ordern. */
  perMonth: number;
  cancelled: number;
  uncollected: number;
  upcoming: CustomerOrder[];
  stores: ShareRow[];
  mainStore: string | null;
  products: ProductRow[];
  categories: ShareRow[];
}

/** All statistik på kundkortet räknas fram från kundens verkliga ordrar. */
export function computeCustomerStats(orders: CustomerOrder[]): CustomerStats {
  const sorted = [...orders].sort((a, b) => a.wanted_date.localeCompare(b.wanted_date));
  const year = String(new Date().getFullYear());
  const totalValue = sorted.reduce((s, o) => s + orderTotal(o), 0);
  const first = sorted[0]?.wanted_date ?? null;
  const last = sorted[sorted.length - 1]?.wanted_date ?? null;

  let perMonth = 0;
  if (first && sorted.length > 0) {
    const months = Math.max(
      1,
      (Date.now() - new Date(first + "T00:00:00").getTime()) / (30.44 * 24 * 3600 * 1000),
    );
    perMonth = sorted.length / months;
  }

  const storeCount = new Map<string, number>();
  const productMap = new Map<string, ProductRow>();
  const catCount = new Map<string, number>();

  for (const o of sorted) {
    const storeName = o.stores?.name || "Okänd butik";
    storeCount.set(storeName, (storeCount.get(storeName) || 0) + 1);
    for (const l of o.customer_order_lines || []) {
      if (l.pack_status === "struken") continue;
      const name = (l.is_free_text ? l.free_text_name : l.products?.name) || "Övrigt";
      const qty = Number(l.quantity_packed ?? l.quantity_ordered ?? 0);
      const prev = productMap.get(name) ?? {
        name,
        orders: 0,
        quantity: 0,
        unit: l.unit || "kg",
        last: o.wanted_date,
      };
      prev.orders += 1;
      prev.quantity += qty;
      prev.last = prev.last > o.wanted_date ? prev.last : o.wanted_date;
      productMap.set(name, prev);

      const cat = l.products?.category || "Övrigt";
      catCount.set(cat, (catCount.get(cat) || 0) + 1);
    }
  }

  const toShares = (m: Map<string, number>): ShareRow[] => {
    const total = Array.from(m.values()).reduce((s, v) => s + v, 0) || 1;
    return Array.from(m.entries())
      .map(([label, count]) => ({ label, count, share: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  };

  const stores = toShares(storeCount);

  return {
    total: sorted.length,
    thisYear: sorted.filter((o) => o.wanted_date.startsWith(year)).length,
    totalValue,
    average: sorted.length ? totalValue / sorted.length : 0,
    first,
    last,
    perMonth,
    cancelled: sorted.filter((o) => o.status === "avbruten").length,
    uncollected: sorted.filter((o) => isUncollected(o)).length,
    upcoming: sorted.filter(isUpcoming),
    stores,
    mainStore: stores[0]?.label ?? null,
    products: Array.from(productMap.values())
      .sort((a, b) => b.orders - a.orders || b.quantity - a.quantity)
      .slice(0, 12),
    categories: toShares(catCount),
  };
}
