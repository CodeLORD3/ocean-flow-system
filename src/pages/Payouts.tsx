import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, Filter, CheckCircle, Clock } from "lucide-react";
import { format, differenceInDays, isPast, parseISO } from "date-fns";
import CountryFlag from "@/components/CountryFlag";
import { getCurrency } from "@/lib/currency";

type TabKey = "completed" | "upcoming";

export default function Payouts() {
  const [tab, setTab] = useState<TabKey>("completed");

  // Completed payouts — pledges with status "Paid Out"
  const { data: paidOutPledges = [], isLoading: loadingPaid } = useQuery({
    queryKey: ["payouts-paid-out"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("*, trade_offers(id, title, interest_rate, maturity_date, company_id), investor_profiles!inner(first_name, last_name, email, iban)")
        .eq("status", "Paid Out")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch companies for currency
      const companyIds = [...new Set((data || []).map((p: any) => p.trade_offers?.company_id).filter(Boolean))];
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, country")
        .in("id", companyIds.length ? companyIds : ["none"]);
      const companyMap = Object.fromEntries((companies || []).map((c: any) => [c.id, c]));

      // Fetch payment event timestamps
      const pledgeIds = (data || []).map((p: any) => p.id);
      const { data: events } = await supabase
        .from("payment_events")
        .select("pledge_id, created_at")
        .eq("event_type", "paid_out")
        .in("pledge_id", pledgeIds.length ? pledgeIds : ["none"]);
      const eventMap = Object.fromEntries((events || []).map((e: any) => [e.pledge_id, e.created_at]));

      return (data || []).map((p: any) => {
        const company = p.trade_offers?.company_id ? companyMap[p.trade_offers.company_id] : null;
        return {
          ...p,
          company,
          currency: getCurrency(company?.country),
          paid_out_at: eventMap[p.id] || p.created_at,
        };
      });
    },
  });

  // Upcoming payouts — offers that are funded/active but not yet paid out
  const { data: upcomingOffers = [], isLoading: loadingUpcoming } = useQuery({
    queryKey: ["payout-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*, companies(id, name, country)")
        .in("status", ["Funded", "Open"])
        .order("maturity_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: activePledges = [] } = useQuery({
    queryKey: ["payout-active-pledges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("id, offer_id, amount, status")
        .in("status", ["Active", "Matured"]);
      if (error) throw error;
      return data || [];
    },
  });

  const today = new Date();

  // Stats
  const totalPaidOut = paidOutPledges.reduce((s: number, p: any) => {
    const rate = p.trade_offers ? Number(p.trade_offers.interest_rate) : 0;
    return s + Math.round(Number(p.amount) * (1 + rate / 100));
  }, 0);

  const totalUpcomingDue = upcomingOffers.reduce((s: number, o: any) => {
    const pledgesForOffer = activePledges.filter((p: any) => p.offer_id === o.id);
    return s + pledgesForOffer.reduce((ps: number, p: any) => {
      const rate = Number(o.interest_rate) || 0;
      return ps + Math.round(Number(p.amount) * (1 + rate / 100));
    }, 0);
  }, 0);

  const overdueOffers = upcomingOffers.filter((o: any) => isPast(new Date(o.maturity_date)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">Payouts</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Completed Payouts</div>
            <div className="text-lg font-bold text-primary">{paidOutPledges.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Total Paid Out</div>
            <div className="text-lg font-bold text-foreground">{totalPaidOut.toLocaleString()} kr</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Upcoming Due</div>
            <div className="text-lg font-bold text-amber-600">{totalUpcomingDue.toLocaleString()} kr</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground mb-1">Overdue</div>
            <div className="text-lg font-bold text-destructive">{overdueOffers.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <button
          onClick={() => setTab("completed")}
          className={`px-3 py-1 text-[11px] rounded border transition-colors ${
            tab === "completed"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          <CheckCircle className="inline h-3 w-3 mr-1" />
          Completed ({paidOutPledges.length})
        </button>
        <button
          onClick={() => setTab("upcoming")}
          className={`px-3 py-1 text-[11px] rounded border transition-colors ${
            tab === "upcoming"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          <Clock className="inline h-3 w-3 mr-1" />
          Upcoming ({upcomingOffers.length})
        </button>
      </div>

      {/* Completed payouts table */}
      {tab === "completed" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="h-8">Paid Out</TableHead>
                  <TableHead className="h-8">Investor</TableHead>
                  <TableHead className="h-8">Offer</TableHead>
                  <TableHead className="h-8">Company</TableHead>
                  <TableHead className="h-8 text-right">Principal</TableHead>
                  <TableHead className="h-8 text-right">Return</TableHead>
                  <TableHead className="h-8 text-right">Total Payout</TableHead>
                  <TableHead className="h-8">Investor IBAN</TableHead>
                  <TableHead className="h-8">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPaid ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-xs text-muted-foreground animate-pulse">Loading...</TableCell>
                  </TableRow>
                ) : paidOutPledges.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-xs text-muted-foreground">No payouts recorded yet.</TableCell>
                  </TableRow>
                ) : (
                  paidOutPledges.map((p: any, idx: number) => {
                    const investor = p.investor_profiles;
                    const offer = p.trade_offers;
                    const rate = offer ? Number(offer.interest_rate) : 0;
                    const principal = Number(p.amount);
                    const returnAmt = Math.round(principal * (rate / 100));
                    const totalPayout = principal + returnAmt;
                    const cur = p.currency || "SEK";

                    return (
                      <TableRow
                        key={p.id}
                        className={`text-[11px] ${idx % 2 === 1 ? "bg-muted/30" : ""} hover:bg-muted/50 transition-colors`}
                      >
                        <TableCell className="py-1.5 text-muted-foreground">
                          {format(parseISO(p.paid_out_at), "yyyy-MM-dd HH:mm")}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <div className="font-medium">{investor?.first_name} {investor?.last_name}</div>
                          <div className="text-[10px] text-muted-foreground">{investor?.email}</div>
                        </TableCell>
                        <TableCell className="py-1.5 font-medium">{offer?.title || "—"}</TableCell>
                        <TableCell className="py-1.5">
                          {p.company ? (
                            <div className="flex items-center gap-1.5">
                              <CountryFlag country={p.company.country} size={14} />
                              <span className="text-xs">{p.company.name}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="py-1.5 text-right font-mono">{principal.toLocaleString()} {cur}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono text-emerald-600">+{returnAmt.toLocaleString()} {cur}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono font-semibold">{totalPayout.toLocaleString()} {cur}</TableCell>
                        <TableCell className="py-1.5 font-mono text-[10px]">{investor?.iban || "—"}</TableCell>
                        <TableCell className="py-1.5 font-mono text-[10px] text-muted-foreground">{p.payment_reference || "—"}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Upcoming payouts table */}
      {tab === "upcoming" && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="h-8">Offer</TableHead>
                  <TableHead className="h-8">Status</TableHead>
                  <TableHead className="h-8 text-right">Active Pledges</TableHead>
                  <TableHead className="h-8 text-right">Total Due</TableHead>
                  <TableHead className="h-8">Maturity</TableHead>
                  <TableHead className="h-8">Days to Maturity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUpcoming ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground animate-pulse">Loading...</TableCell>
                  </TableRow>
                ) : upcomingOffers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">No upcoming payouts.</TableCell>
                  </TableRow>
                ) : (
                  upcomingOffers.map((o: any, idx: number) => {
                    const matDate = new Date(o.maturity_date);
                    const daysLeft = differenceInDays(matDate, today);
                    const isOverdue = daysLeft < 0;
                    const pledgesForOffer = activePledges.filter((p: any) => p.offer_id === o.id);
                    const rate = Number(o.interest_rate) || 0;
                    const totalDue = pledgesForOffer.reduce((s: number, p: any) => s + Math.round(Number(p.amount) * (1 + rate / 100)), 0);
                    const company = o.companies;
                    const cur = getCurrency(company?.country);

                    return (
                      <TableRow
                        key={o.id}
                        className={`text-[11px] ${idx % 2 === 1 ? "bg-muted/30" : ""} hover:bg-muted/50 transition-colors`}
                      >
                        <TableCell className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            {company && <CountryFlag country={company.country} size={14} />}
                            <span className="font-medium">{o.title}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Badge variant="outline" className={`text-[9px] ${o.status === "Funded" ? "bg-primary/10 text-primary border-primary/30" : ""}`}>
                            {o.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-1.5 text-right font-mono">{pledgesForOffer.length}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono font-semibold">{totalDue.toLocaleString()} {cur}</TableCell>
                        <TableCell className="py-1.5 text-muted-foreground">{format(matDate, "yyyy-MM-dd")}</TableCell>
                        <TableCell className="py-1.5">
                          {isOverdue ? (
                            <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/30">
                              {Math.abs(daysLeft)}d overdue
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">{daysLeft}d</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
