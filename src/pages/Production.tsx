import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Factory, Percent, Settings2, History } from "lucide-react";
import { ProductionOrderForm } from "@/components/production/ProductionOrderForm";
import { YieldRegistry } from "@/components/production/YieldRegistry";
import { ProductionSettings } from "@/components/production/ProductionSettings";
import { ProductionHistory } from "@/components/production/ProductionHistory";

export default function Production() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-4 pt-4">
        <h1 className="text-lg font-semibold">Filé/Tillverkning</h1>
        <p className="text-xs text-muted-foreground">
          Omvandlar inköpt hel råvara till säljbara styckdetaljer med utbyte, kostpris och utpris.
        </p>
      </div>
      <Tabs defaultValue="order" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 grid w-auto grid-cols-4">
          <TabsTrigger value="order" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <Factory className="h-3.5 w-3.5" /> Tillverkningsorder
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <History className="h-3.5 w-3.5" /> Historik & utfall
          </TabsTrigger>
          <TabsTrigger value="yields" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <Percent className="h-3.5 w-3.5" /> Utbytesregister
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <Settings2 className="h-3.5 w-3.5" /> Inställningar
          </TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="order" className="mt-0"><ProductionOrderForm /></TabsContent>
          <TabsContent value="history" className="mt-0"><ProductionHistory /></TabsContent>
          <TabsContent value="yields" className="mt-0"><YieldRegistry /></TabsContent>
          <TabsContent value="settings" className="mt-0"><ProductionSettings /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
