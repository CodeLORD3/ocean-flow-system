import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Lock } from "lucide-react";
import { useStoreSidebarPrefs } from "@/hooks/useStoreSidebarPrefs";

export type VisibilityNavItem = { title: string; url: string };
export type VisibilitySection = { label: string; items: VisibilityNavItem[] };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: VisibilitySection[];
  lockedUrls?: string[];
}

export function SidebarVisibilityDialog({ open, onOpenChange, sections, lockedUrls = [] }: Props) {
  const { isHidden, setHidden, hasStore } = useStoreSidebarPrefs();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Anpassa meny</DialogTitle>
          <DialogDescription>
            Stäng av flikar som butiken inte använder. Inget tas bort – du kan slå på dem igen när som helst.
          </DialogDescription>
        </DialogHeader>

        {!hasStore && (
          <p className="text-sm text-muted-foreground">Ingen aktiv butik valdt – välj butik först.</p>
        )}

        {hasStore && (
          <div className="space-y-5">
            {sections.map((section) => (
              <div key={section.label} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const locked = lockedUrls.includes(item.url);
                    return (
                      <div
                        key={item.url}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          {item.title}
                          {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </span>
                        <Switch
                          checked={locked ? true : !isHidden(item.url)}
                          disabled={locked || setHidden.isPending}
                          onCheckedChange={(checked) =>
                            setHidden.mutate({ navUrl: item.url, hidden: !checked })
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
