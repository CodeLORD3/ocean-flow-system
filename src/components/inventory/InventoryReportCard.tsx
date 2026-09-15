import { useState } from "react";
import { Boxes } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StockCount from "@/pages/StockCount";

/**
 * Översiktssidans ingång till inventeringen. Använder exakt samma vy som
 * Lager → Inventering (StockCount) så flödet blir identiskt överallt.
 */
export function InventoryReportCard({ storeName }: { storeName?: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-heading">
          <Boxes className="h-4 w-4 text-primary" />
          Inventeringsrapport
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Räknade värden blir butikens lager när rapporten färdigställs
          {storeName ? ` — ${storeName}` : ""}.
        </p>
      </CardHeader>
      <CardContent>
        <Button className="h-12 w-full" onClick={() => setOpen(true)}>
          <Boxes className="mr-1.5 h-4 w-4" />
          Öppna inventering
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[95vh] w-[100vw] max-w-[100vw] overflow-y-auto overflow-x-hidden p-3 sm:w-[95vw] sm:max-w-5xl sm:p-5">
          <DialogHeader>
            <DialogTitle className="text-base">Inventering</DialogTitle>
          </DialogHeader>
          {open && <StockCount />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
