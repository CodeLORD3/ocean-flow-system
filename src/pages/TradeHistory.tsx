import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function TradeHistory() {
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

  if (isLoading) {
    return <div className="text-muted-foreground text-sm animate-pulse">Laddar historik...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Trade History</h1>
        <p className="text-sm text-muted-foreground">Avslutade och återbetalade erbjudanden</p>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produkt</TableHead>
              <TableHead className="text-right">Mål</TableHead>
              <TableHead className="text-right">Finansierat</TableHead>
              <TableHead className="text-right">Ränta</TableHead>
              <TableHead>Förfallodag</TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => {
              const progress = offer.target_amount > 0
                ? Math.min(100, (Number(offer.funded_amount) / Number(offer.target_amount)) * 100)
                : 0;
              return (
                <TableRow key={offer.id}>
                  <TableCell className="font-medium">{offer.title}</TableCell>
                  <TableCell className="text-right">{Number(offer.target_amount).toLocaleString()} kr</TableCell>
                  <TableCell className="text-right">
                    <div className="space-y-1">
                      <span>{Number(offer.funded_amount).toLocaleString()} kr</span>
                      <Progress value={progress} className="h-1" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-green-600">{Number(offer.interest_rate).toFixed(1)}%</TableCell>
                  <TableCell>{offer.maturity_date}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={offer.status === "Repaid" ? "default" : offer.status === "Funded" ? "secondary" : "outline"}>
                      {offer.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {offers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
