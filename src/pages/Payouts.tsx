import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, Calendar } from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";

export default function Payouts() {
  const { data: offers = [] } = useQuery({
    queryKey: ["payout-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*")
        .in("status", ["Funded", "Matured", "Repaid"])
        .order("maturity_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: pledges = [] } = useQuery({
    queryKey: ["payout-pledges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("*, investor_profiles!inner(first_name, last_name, email, iban)")
        .eq("status", "Active");
      if (error) throw error;
      return data as any[];
    },
  });

  const today = new Date();

  const totalDue = offers
    .filter((o: any) => isPast(new Date(o.maturity_date)) && o.status !== "Repaid")
    .reduce((sum: number, o: any) => {
      const funded = Number(o.funded_amount) || 0;
      const rate = Number(o.interest_rate) || 0;
      return sum + funded + Math.round(funded * (rate / 100));
    }, 0);

  const upcomingCount = offers.filter((o: any) => !isPast(new Date(o.maturity_date))).length;
  const overdueCount = offers.filter((o: any) => isPast(new Date(o.maturity_date)) && o.status !== "Repaid").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">Payouts</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Total Due</div>
            <div className="text-lg font-bold text-foreground">{totalDue.toLocaleString()} kr</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Overdue</div>
            <div className="text-lg font-bold text-destructive">{overdueCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Upcoming</div>
            <div className="text-lg font-bold text-primary">{upcomingCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="h-8">Offer</TableHead>
                <TableHead className="h-8">Status</TableHead>
                <TableHead className="h-8 text-right">Funded</TableHead>
                <TableHead className="h-8 text-right">Return %</TableHead>
                <TableHead className="h-8 text-right">Total Payout</TableHead>
                <TableHead className="h-8">Maturity</TableHead>
                <TableHead className="h-8">Days to Maturity</TableHead>
                <TableHead className="h-8 text-right">Investors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground">
                    No funded offers yet.
                  </TableCell>
                </TableRow>
              ) : (
                offers.map((o: any, idx: number) => {
                  const funded = Number(o.funded_amount) || 0;
                  const rate = Number(o.interest_rate) || 0;
                  const profit = Math.round(funded * (rate / 100));
                  const totalPayout = funded + profit;
                  const matDate = new Date(o.maturity_date);
                  const daysLeft = differenceInDays(matDate, today);
                  const isOverdue = daysLeft < 0 && o.status !== "Repaid";
                  const offerPledges = pledges.filter((p: any) => p.offer_id === o.id);

                  const statusColor: Record<string, string> = {
                    Funded: "bg-primary/10 text-primary border-primary/30",
                    Matured: "bg-amber-100 text-amber-700 border-amber-300",
                    Repaid: "bg-success/10 text-success border-success/30",
                  };

                  return (
                    <TableRow
                      key={o.id}
                      className={`text-[11px] ${idx % 2 === 1 ? "bg-muted/30" : ""} hover:bg-muted/50 transition-colors`}
                    >
                      <TableCell className="py-1.5 font-medium">{o.title}</TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="outline" className={`text-[9px] ${statusColor[o.status] || ""}`}>
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 text-right">{funded.toLocaleString()} kr</TableCell>
                      <TableCell className="py-1.5 text-right font-bold text-success">{rate.toFixed(1)}%</TableCell>
                      <TableCell className="py-1.5 text-right font-medium">{totalPayout.toLocaleString()} kr</TableCell>
                      <TableCell className="py-1.5 text-muted-foreground">{format(matDate, "yyyy-MM-dd")}</TableCell>
                      <TableCell className="py-1.5">
                        {o.status === "Repaid" ? (
                          <Badge variant="outline" className="text-[9px] bg-success/10 text-success">Paid</Badge>
                        ) : isOverdue ? (
                          <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/30">
                            {Math.abs(daysLeft)}d overdue
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">{daysLeft}d</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">{offerPledges.length}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
