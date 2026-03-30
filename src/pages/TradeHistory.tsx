import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import TradeOfferDetail from "@/components/trade/TradeOfferDetail";

export default function TradeHistory() {
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["trade-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*")
        .in("status", ["Closed", "Repaid", "Funded"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allPledges = [] } = useQuery({
    queryKey: ["admin-pledges-history"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pledges").select("*");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground text-sm animate-pulse">Laddar historik...</div>;
  }

  if (selectedOfferId) {
    const offer = offers.find(o => o.id === selectedOfferId);
    if (!offer) return null;
    return (
      <TradeOfferDetail
        offer={offer as any}
        pledges={allPledges.filter(p => p.offer_id === selectedOfferId)}
        onBack={() => setSelectedOfferId(null)}
        onStatusChange={() => {}}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Trade History</h1>
        <p className="text-sm text-muted-foreground">Avslutade och återbetalade erbjudanden</p>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-[10px]">
              <TableHead className="h-8">Product</TableHead>
              <TableHead className="h-8 text-right">Investment</TableHead>
              <TableHead className="h-8 text-right">Financed</TableHead>
              <TableHead className="h-8 text-right">Return %</TableHead>
              <TableHead className="h-8 text-right">Profit kr</TableHead>
              <TableHead className="h-8 text-right">Total Payout</TableHead>
              <TableHead className="h-8 text-right">Annual Return</TableHead>
              <TableHead className="h-8">Start</TableHead>
              <TableHead className="h-8">Expiry</TableHead>
              <TableHead className="h-8 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => {
              const o = offer as any;
              const target = Number(offer.target_amount);
              const funded = Number(offer.funded_amount);
              const rate = Number(offer.interest_rate);
              const progress = target > 0 ? Math.min(100, (funded / target) * 100) : 0;
              const profitKr = Math.round(funded * (rate / 100));
              const totalPayout = funded + profitKr;

              let annualReturn = o.annual_return ? Number(o.annual_return) : null;
              if (!annualReturn && o.tenor_days && Number(o.tenor_days) > 0) {
                annualReturn = Math.round((rate / Number(o.tenor_days)) * 365 * 100) / 100;
              }

              const idx = offers.indexOf(offer);
              return (
                <TableRow
                  key={offer.id}
                  className={`text-[10px] cursor-pointer hover:bg-primary/10 transition-colors ${idx % 2 === 1 ? "bg-muted/30" : ""}`}
                  onClick={() => setSelectedOfferId(offer.id)}
                >
                  <TableCell className="py-1.5 font-medium">{offer.title}</TableCell>
                  <TableCell className="py-1.5 text-right">{target.toLocaleString()} kr</TableCell>
                  <TableCell className="py-1.5 text-right">
                    <div className="space-y-0.5">
                      <span>{funded.toLocaleString()} kr</span>
                      <div className="flex items-center gap-1">
                        <Progress value={progress} className="h-1 flex-1" />
                        <span className="text-[8px] text-muted-foreground">{progress.toFixed(0)}%</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-bold text-success">{rate.toFixed(1)}%</TableCell>
                  <TableCell className="py-1.5 text-right">{profitKr.toLocaleString()} kr</TableCell>
                  <TableCell className="py-1.5 text-right font-medium">{totalPayout.toLocaleString()} kr</TableCell>
                  <TableCell className="py-1.5 text-right">{annualReturn ? `${annualReturn.toFixed(1)}%` : "—"}</TableCell>
                  <TableCell className="py-1.5 text-muted-foreground">{o.purchase_date || "—"}</TableCell>
                  <TableCell className="py-1.5 text-muted-foreground">{offer.maturity_date}</TableCell>
                  <TableCell className="py-1.5 text-center">
                    <Badge variant={offer.status === "Repaid" ? "default" : "secondary"} className="text-[9px]">
                      {offer.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {offers.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Ingen historik ännu
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
