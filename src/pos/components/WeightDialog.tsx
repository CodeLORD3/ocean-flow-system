import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSek } from "../lib/money";
import type { PosProduct } from "../hooks/usePosProducts";

export default function WeightDialog({
  product,
  onClose,
  onConfirm,
}: {
  product: PosProduct;
  onClose: () => void;
  onConfirm: (grams: number) => void;
}) {
  const [grams, setGrams] = useState("");
  const g = Number(grams) || 0;
  const lineOre = Math.round((g / 1000) * product.price_ore);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground tabular">
            {formatSek(product.price_ore)} / kg
          </div>

          <div>
            <Label htmlFor="grams">Vikt (gram)</Label>
            <Input
              id="grams"
              autoFocus
              inputMode="numeric"
              value={grams}
              onChange={(e) => setGrams(e.target.value.replace(/[^0-9]/g, ""))}
              className="tabular text-2xl h-14"
              placeholder="0"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[100, 250, 500, 1000].map((g) => (
              <Button
                key={g}
                variant="outline"
                className="h-10"
                onClick={() => setGrams(String(g))}
              >
                {g} g
              </Button>
            ))}
          </div>

          <div className="flex justify-between rounded-md bg-muted/60 p-3">
            <span className="text-sm">Radens belopp</span>
            <span className="font-semibold tabular">{formatSek(lineOre)}</span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Avbryt
            </Button>
            <Button
              className="flex-1"
              disabled={g <= 0}
              onClick={() => onConfirm(g)}
            >
              Lägg till
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
