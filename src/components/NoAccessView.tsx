import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { siteLabel } from "@/lib/pageAccess";
import type { SiteMode } from "@/contexts/SiteContext";

/** Visas istället för sidan när aktuell portal saknar behörighet till rutten. */
export function NoAccessView({ site, path }: { site: SiteMode; path: string }) {
  return (
    <div className="p-4 sm:p-6">
      <Card className="mx-auto max-w-lg shadow-card">
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">Ingen behörighet</p>
          <p className="text-xs text-muted-foreground">
            Sidan <span className="font-mono">{path}</span> är inte tillgänglig i portalen{" "}
            {siteLabel(site)}. Byt portal längst upp till vänster, eller kontakta en administratör
            om du behöver åtkomst.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default NoAccessView;
