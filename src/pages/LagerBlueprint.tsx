import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MarkdownDoc from "@/components/MarkdownDoc";
import blueprint from "../../docs/LAGER-BLUEPRINT.md?raw";

export default function LagerBlueprint() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Skrivskyddad</Badge>
        <span className="text-xs text-muted-foreground">
          Källa: docs/LAGER-BLUEPRINT.md — byggd genom inspektion av databasen
        </span>
      </div>
      <Card>
        <CardContent className="p-4 md:p-6">
          <MarkdownDoc source={blueprint} />
        </CardContent>
      </Card>
    </div>
  );
}
