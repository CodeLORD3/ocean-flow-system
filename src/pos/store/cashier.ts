import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CashierRole = "cashier" | "shift_lead" | "manager";

export interface CashierSession {
  id: string;
  display_name: string;
  role: CashierRole;
  shift_id: string | null;
  store_id: string | null;
  store_name: string | null;
}

interface CashierStore {
  cashier: CashierSession | null;
  setCashier: (c: CashierSession | null) => void;
  setShift: (shiftId: string | null) => void;
  signOut: () => void;
}

export const useCashier = create<CashierStore>()(
  persist(
    (set) => ({
      cashier: null,
      setCashier: (c) => set({ cashier: c }),
      setShift: (shiftId) =>
        set((s) => (s.cashier ? { cashier: { ...s.cashier, shift_id: shiftId } } : s)),
      signOut: () => set({ cashier: null }),
    }),
    { name: "pos.cashier" }
  )
);
