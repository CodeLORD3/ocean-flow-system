import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StaffPicker } from "@/components/orders/StaffPicker";
import { useActiveUser } from "@/contexts/ActiveUserContext";

/**
 * Kräver att någon anges som packare innan beställningen markeras packad.
 */
export function PackedByDialog({
  open,
  onOpenChange,
  storeId,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId?: string;
  onConfirm: (packedBy: { staffId: string; name: string }) => void;
  pending?: boolean;
}) {
  const { activeUser } = useActiveUser();
  const [value, setValue] = useState<{ staffId: string; name: string } | null>(null);

  useEffect(() => {
    if (open && !value && activeUser)
      setValue({
        staffId: activeUser.id,
        name: `${activeUser.first_name} ${activeUser.last_name}`.trim(),
      });
  }, [open, activeUser, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vem packade beställningen?</DialogTitle>
          <DialogDescription>Namnet sparas på beställningen och syns i listan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>
            Packad av <span className="text-destructive">*</span>
          </Label>
          <StaffPicker
            storeId={storeId}
            staffId={value?.staffId ?? null}
            onChange={setValue}
            placeholder="Välj person"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button disabled={!value || pending} onClick={() => value && onConfirm(value)}>
            Markera packad
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
