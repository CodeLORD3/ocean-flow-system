import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { isAuctionLotNumber, extractAuctionLotNumber } from "@/lib/lotNumbers";

/**
 * Fiskauktionens eget spårbarhetsnummer (t.ex. 10012.6194994) sparas på partiet
 * som leverantörens partinummer, så det följer med i spårbarhetsrapporterna
 * hela vägen ut till exportfakturan.
 */
export default function AuctionLotNumberField({
  lotId,
  value,
  readOnly = false,
}: {
  lotId: string;
  value?: string | null;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");

  useEffect(() => {
    setText(value ?? "");
  }, [value]);

  const save = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await supabase
        .from("lots")
        .update({ supplier_lot_id: next || null })
        .eq("id", lotId);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["lots_traceability"] });
      toast.success(next ? `Auktionsnummer sparat: ${next}` : "Auktionsnummer rensat");
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Kunde inte spara auktionsnummer"),
  });

  const commit = () => {
    const clean = extractAuctionLotNumber(text) ?? text.trim();
    if (clean && !isAuctionLotNumber(clean)) {
      toast.error("Auktionsnummer skrivs som 10012.6194994");
      return;
    }
    save.mutate(clean);
  };

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">Auktionsnummer</span>
        {value ? (
          <span className="font-mono tabular-nums text-emerald-600">{value}</span>
        ) : (
          <span className="text-muted-foreground/60">saknas</span>
        )}
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1 text-[10px] print:hidden"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 print:hidden">
      <Input
        autoFocus
        className="h-6 w-[150px] px-1.5 font-mono text-[11px]"
        placeholder="10012.6194994"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setText(value ?? "");
            setEditing(false);
          }
        }}
      />
      <Button variant="ghost" size="sm" className="h-6 px-1" onClick={commit} disabled={save.isPending}>
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-1"
        onClick={() => {
          setText(value ?? "");
          setEditing(false);
        }}
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </span>
  );
}
