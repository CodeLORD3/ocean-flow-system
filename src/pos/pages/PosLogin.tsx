import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { hashPin } from "../lib/pin";
import { useCashier } from "../store/cashier";
import { Delete } from "lucide-react";
import { toast } from "sonner";

export default function PosLogin() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const setCashier = useCashier((s) => s.setCashier);

  const press = (n: string) => {
    if (busy) return;
    setPin((p) => (p.length >= 4 ? p : p + n));
  };
  const back = () => setPin((p) => p.slice(0, -1));

  const submit = async () => {
    if (pin.length !== 4) return;
    setBusy(true);
    try {
      const hash = await hashPin(pin);
      const { data, error } = await (supabase as any)
        .from("pos_cashiers")
        .select("id, display_name, role, store_id, stores(name)")
        .eq("pin_hash", hash)
        .eq("active", true)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("Fel PIN-kod");
        setPin("");
        return;
      }

      if (!data.store_id) {
        toast.error("Kassören är inte kopplad till någon butik. Kontakta admin.");
        setPin("");
        return;
      }

      // Look up an open shift to restore
      const { data: shift } = await (supabase as any)
        .from("pos_shifts")
        .select("id")
        .eq("cashier_id", data.id)
        .is("closed_at", null)
        .maybeSingle();

      setCashier({
        id: data.id,
        display_name: data.display_name,
        role: data.role,
        shift_id: shift?.id ?? null,
        store_id: data.store_id,
        store_name: data.stores?.name ?? null,
      });
      toast.success(`Välkommen, ${data.display_name}`);
      nav(shift?.id ? "/pos" : "/pos/shift", { replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Något gick fel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-[var(--pos-shadow-lg)]">
        <h1 className="text-xl font-semibold text-foreground">Logga in</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ange din 4-siffriga kassörskod (demo: 1234)
        </p>

        <div className="my-6 flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 ${
                pin.length > i ? "bg-primary border-primary" : "border-border"
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
            <Button
              key={n}
              variant="outline"
              className="h-14 text-xl tabular"
              onClick={() => press(n)}
            >
              {n}
            </Button>
          ))}
          <Button
            variant="outline"
            className="h-14"
            onClick={back}
          >
            <Delete className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            className="h-14 text-xl tabular"
            onClick={() => press("0")}
          >
            0
          </Button>
          <Button
            className="h-14"
            onClick={submit}
            disabled={pin.length !== 4 || busy}
          >
            {busy ? "..." : "OK"}
          </Button>
        </div>
      </div>
    </div>
  );
}
