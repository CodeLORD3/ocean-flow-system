import { create } from "zustand";

export interface CartLine {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  unit: "piece" | "kg" | "custom";
  /** kg for weight, count for piece */
  quantity: number;
  unit_price_ore: number;
  vat_rate: number;
  /** computed: round(quantity * unit_price_ore) - per line */
  line_total_ore: number;
  discount_ore: number;
}

export interface CartTab {
  id: string;
  label: string;
  lines: CartLine[];
  createdAt: number;
}

interface CartStore {
  tabs: CartTab[];
  activeTabId: string;
  newTab: (label?: string) => string;
  switchTab: (id: string) => void;
  removeTab: (id: string) => void;
  addLine: (line: Omit<CartLine, "id" | "line_total_ore" | "discount_ore">) => void;
  updateLineQty: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  setLineDiscount: (lineId: string, discountOre: number) => void;
  clear: () => void;
}

const computeLineTotal = (l: Pick<CartLine, "quantity" | "unit_price_ore" | "discount_ore">) =>
  Math.max(0, Math.round(l.quantity * l.unit_price_ore) - (l.discount_ore || 0));

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const initialTabId = makeId();

export const useCart = create<CartStore>((set, get) => ({
  tabs: [{ id: initialTabId, label: "Kund 1", lines: [], createdAt: Date.now() }],
  activeTabId: initialTabId,

  newTab: (label) => {
    const id = makeId();
    const nextLabel = label ?? `Kund ${get().tabs.length + 1}`;
    set((s) => ({
      tabs: [...s.tabs, { id, label: nextLabel, lines: [], createdAt: Date.now() }],
      activeTabId: id,
    }));
    return id;
  },

  switchTab: (id) => set({ activeTabId: id }),

  removeTab: (id) => {
    const { tabs } = get();
    const remaining = tabs.filter((t) => t.id !== id);
    if (remaining.length === 0) {
      const fresh = { id: makeId(), label: "Kund 1", lines: [], createdAt: Date.now() };
      set({ tabs: [fresh], activeTabId: fresh.id });
    } else {
      set((s) => ({
        tabs: remaining,
        activeTabId: s.activeTabId === id ? remaining[0].id : s.activeTabId,
      }));
    }
  },

  addLine: (line) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id !== s.activeTabId
          ? t
          : {
              ...t,
              lines: [
                ...t.lines,
                {
                  ...line,
                  id: makeId(),
                  discount_ore: 0,
                  line_total_ore: computeLineTotal({
                    quantity: line.quantity,
                    unit_price_ore: line.unit_price_ore,
                    discount_ore: 0,
                  }),
                },
              ],
            }
      ),
    })),

  updateLineQty: (lineId, quantity) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id !== s.activeTabId
          ? t
          : {
              ...t,
              lines: t.lines.map((l) =>
                l.id === lineId
                  ? { ...l, quantity, line_total_ore: computeLineTotal({ ...l, quantity }) }
                  : l
              ),
            }
      ),
    })),

  removeLine: (lineId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id !== s.activeTabId ? t : { ...t, lines: t.lines.filter((l) => l.id !== lineId) }
      ),
    })),

  setLineDiscount: (lineId, discountOre) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id !== s.activeTabId
          ? t
          : {
              ...t,
              lines: t.lines.map((l) =>
                l.id === lineId
                  ? {
                      ...l,
                      discount_ore: discountOre,
                      line_total_ore: computeLineTotal({ ...l, discount_ore: discountOre }),
                    }
                  : l
              ),
            }
      ),
    })),

  clear: () =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === s.activeTabId ? { ...t, lines: [] } : t)),
    })),
}));

// Selectors
export function selectActiveTab(s: CartStore): CartTab | undefined {
  return s.tabs.find((t) => t.id === s.activeTabId);
}

export function computeTotals(lines: CartLine[]) {
  const totalOre = lines.reduce((sum, l) => sum + l.line_total_ore, 0);
  const vatGroups = new Map<number, { gross: number; net: number; vat: number }>();
  for (const l of lines) {
    const g = vatGroups.get(l.vat_rate) ?? { gross: 0, net: 0, vat: 0 };
    const gross = l.line_total_ore;
    const net = Math.round(gross / (1 + l.vat_rate / 100));
    const vat = gross - net;
    vatGroups.set(l.vat_rate, { gross: g.gross + gross, net: g.net + net, vat: g.vat + vat });
  }
  return {
    totalOre,
    vatBreakdown: Array.from(vatGroups.entries())
      .sort(([a], [b]) => a - b)
      .map(([rate, v]) => ({ rate, ...v })),
  };
}
