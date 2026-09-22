import { useNavigate, useLocation } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { withReturn } from "@/lib/navHistory";
import { getTitleForPath } from "@/contexts/TabsContext";
import type { DagsavslutPost } from "@/lib/dagsavslut";

/**
 * Rutan som visas vid utstämpling när något saknas för dagen. Den ligger kvar
 * tills man stänger den, i stället för att blinka förbi.
 */
export function DayCloseReminderDialog({
  open,
  onClose,
  storeName,
  saknas,
}: {
  open: boolean;
  onClose: () => void;
  storeName?: string | null;
  saknas: DagsavslutPost[];
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Dialog open={open && saknas.length > 0} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ClipboardList className="h-5 w-5" />
            Kom ihåg innan du går
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Det här är kvar i dag{storeName ? ` i ${storeName}` : ""}:
        </p>
        <div className="space-y-2">
          {saknas.map((p) => (
            <Button
              key={p.nyckel}
              variant="outline"
              className="h-11 w-full justify-start text-sm font-semibold"
              onClick={() => {
                onClose();
                navigate(
                  withReturn(
                    p.sida,
                    `${location.pathname}${location.search}`,
                    getTitleForPath(location.pathname),
                  ),
                );
              }}
            >
              {p.etikett}
            </Button>
          ))}
        </div>
        <Button className="h-11 w-full" onClick={onClose}>
          Jag har sett det
        </Button>
      </DialogContent>
    </Dialog>
  );
}
