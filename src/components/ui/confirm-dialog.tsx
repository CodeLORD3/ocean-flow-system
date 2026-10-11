import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let push: ((p: Pending) => void) | null = null;

/**
 * Ersätter webbläsarens confirm(): `if (!(await confirmDialog({ title: "Ta bort?" }))) return;`
 */
export function confirmDialog(opts: ConfirmOptions | string): Promise<boolean> {
  const o: ConfirmOptions =
    typeof opts === "string"
      ? { title: opts, destructive: /^(Ta bort|Kassera|Radera|Avbryt)/i.test(opts) }
      : opts;
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm(o.title));
    push({ ...o, resolve });
  });
}

/** Monteras en gång i appen. */
export function ConfirmDialogHost() {
  const [cur, setCur] = useState<Pending | null>(null);
  useEffect(() => {
    push = (p) => setCur(p);
    return () => {
      push = null;
    };
  }, []);

  const close = (ok: boolean) => {
    cur?.resolve(ok);
    setCur(null);
  };

  return (
    <AlertDialog open={!!cur} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl leading-snug">{cur?.title}</AlertDialogTitle>
          {cur?.description && (
            <AlertDialogDescription className="text-base">{cur.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-12 text-base sm:h-10 sm:text-sm" onClick={() => close(false)}>
            {cur?.cancelLabel ?? "Avbryt"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              "h-12 text-base sm:h-10 sm:text-sm",
              cur?.destructive && buttonVariants({ variant: "destructive" }),
            )}
            onClick={() => close(true)}
          >
            {cur?.confirmLabel ?? (cur?.destructive ? "Ta bort" : "OK")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Ångra-avisering i 5 sekunder för borttag av rader.
 * `doDelete` körs först när tiden gått ut utan att Ångra tryckts.
 */
export function undoToast(message: string, doDelete: () => void | Promise<void>, onUndo?: () => void) {
  let undone = false;
  toast(message, {
    duration: 5000,
    action: {
      label: "Ångra",
      onClick: () => {
        undone = true;
        onUndo?.();
      },
    },
    onAutoClose: () => {
      if (!undone) void doDelete();
    },
    onDismiss: () => {
      if (!undone) void doDelete();
      undone = true;
    },
  });
}
