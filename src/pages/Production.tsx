import { useStaffT } from "@/lib/staffI18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Factory, Percent, Settings2, History, Gavel, CookingPot } from "lucide-react";
import { ProductionOrderForm } from "@/components/production/ProductionOrderForm";
import { CookingOrderForm } from "@/components/production/CookingOrderForm";
import { YieldRegistry } from "@/components/production/YieldRegistry";
import { ProductionSettings } from "@/components/production/ProductionSettings";
import { ProductionHistory } from "@/components/production/ProductionHistory";
import { AuctionCalculator } from "@/components/production/AuctionCalculator";


export default function Production() {
  const { t, lang, dir } = useStaffT();
  return (
    <div dir={dir} lang={lang} className="flex h-full flex-col overflow-hidden">
      <div className="px-4 pt-4">
        <h1 className="text-lg font-semibold">{t("tillverkning.text_0")}</h1>
        <p className="text-xs text-muted-foreground">
          {t("tillverkning.text_1")} </p>
      </div>
      <Tabs defaultValue="order" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 grid w-auto grid-cols-3 sm:grid-cols-6">
          <TabsTrigger value="order" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <Factory className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("tillverkning.text_2")}</span>
            <span className="sm:hidden">{t("tillverkning.text_3")}</span>
          </TabsTrigger>
          <TabsTrigger value="cooking" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <CookingPot className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("tillverkning.text_4")}</span>
            <span className="sm:hidden">{t("tillverkning.text_5")}</span>
          </TabsTrigger>
          <TabsTrigger value="auction" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <Gavel className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("tillverkning.text_6")}</span>
            <span className="sm:hidden">{t("tillverkning.text_7")}</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <History className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("tillverkning.text_8")}</span>
            <span className="sm:hidden">{t("tillverkning.text_9")}</span>
          </TabsTrigger>
          <TabsTrigger value="yields" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <Percent className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("tillverkning.text_10")}</span>
            <span className="sm:hidden">{t("tillverkning.text_11")}</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-xs data-[state=active]:text-sm">
            <Settings2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("tillverkning.text_12")}</span>
            <span className="sm:hidden">{t("tillverkning.text_13")}</span>
          </TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="order" className="mt-0"><ProductionOrderForm /></TabsContent>
          <TabsContent value="cooking" className="mt-0"><CookingOrderForm /></TabsContent>
          <TabsContent value="auction" className="mt-0"><AuctionCalculator /></TabsContent>
          <TabsContent value="history" className="mt-0"><ProductionHistory /></TabsContent>
          <TabsContent value="yields" className="mt-0"><YieldRegistry /></TabsContent>
          <TabsContent value="settings" className="mt-0"><ProductionSettings /></TabsContent>
        </div>

      </Tabs>
    </div>
  );
}

