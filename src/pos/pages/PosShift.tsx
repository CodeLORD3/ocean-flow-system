import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCashier } from "../store/cashier";
import { useOpenShift } from "../hooks/useShift";
import { supabase } from "@/integrations/supabase/client";
import { sekToOre, formatSek } from "../lib/money";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function PosShift() {
  const cashier = useCashier((s) => s.cashier);
  const setShift = useCashier((s) => s.setShift);
  const { data: openShift, isLoading } = useOpenShift(cashier?.id);
  const nav = useNavigate();
  const qc = useQueryClient();

  const [openingFloat, setOpeningFloat] = useState("2000");
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (!cashier) return null;

  const openShift = async () => {
    setBusy(true);
    try {
      const { data, error } = await (supabase as any)
        .from("pos_shifts")
        .insert({
          cashier_id: cashier.id,
          opening_float_ore: sekToOre(parseFloat(openingFloat || "0")),
        })
        .select("id")
        .single();
      if (error) throw error;
      setShift(data.id);
      qc.invalidateQueries({ queryKey: ["pos_open_shift"] });
      toast.success("Skift öppnat");
      nav("/pos");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte öppna skift");
    } finally {
      setBusy(false);
    }
  };

  const closeShift = async () => {
    if (!openShift) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any)
        .from("pos_shifts")
        .update({
          closed_at: new Date().toISOString(),
          closing_cash_ore: sekToOre(parseFloat(closingCash || "0")),
          notes: notes || null,
        })
        .eq("id", openShift.id);
      if (error) throw error;
      setShift(null);
      qc.invalidateQueries({ queryKey: ["pos_open_shift"] });
      toast.success("Skift avslutat");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte stänga skift");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Laddar skift…</div>
      ) : openShift ? (
        <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--pos-shadow)]">
          <h1 className="text-xl font-semibold">Avsluta skift</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Öppnat {new Date(openShift.opened_at).toLocaleString("sv-SE")} · Växelkassa{" "}
            <span className="tabular">{formatSek(openShift.opening_float_ore)}</span>
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="closing">Räknad kontantkassa (SEK)</Label>
              <Input
                id="closing"
                inputMode="decimal"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value.replace(",", "."))}
                placeholder="0,00"
                className="tabular"
              />
            </div>
            <div>
              <Label htmlFor="notes">Anteckningar</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="mt-6 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => nav("/pos")}>
              Tillbaka till kassan
            </Button>
            <Button className="flex-1" onClick={closeShift} disabled={busy}>
              Avsluta skift &amp; Z-rapport
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 shadow-[var(--pos-shadow)]">
          <h1 className="text-xl font-semibold">Öppna skift</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Räkna växelkassan och ange beloppet i kassalådan.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="float">Växelkassa (SEK)</Label>
              <Input
                id="float"
                inputMode="decimal"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value.replace(",", "."))}
                className="tabular text-lg"
              />
            </div>
          </div>

          <Button className="mt-6 w-full" onClick={openShift} disabled={busy}>
            Öppna skift
          </Button>
        </div>
      )}
    </div>
  );
}
