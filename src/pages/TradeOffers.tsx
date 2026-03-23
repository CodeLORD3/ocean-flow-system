import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export default function TradeOffers() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", quantity: "", target_amount: "",
    interest_rate: "", maturity_date: "", visibility: "all",
  });

  const { data: offers = [] } = useQuery({
    queryKey: ["admin-trade-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trade_offers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allPledges = [] } = useQuery({
    queryKey: ["admin-pledges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pledges")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trade_offers").insert({
        title: form.title,
        description: form.description || null,
        quantity: Number(form.quantity) || 0,
        target_amount: Number(form.target_amount) || 0,
        interest_rate: Number(form.interest_rate) || 0,
        maturity_date: form.maturity_date,
        visibility: form.visibility,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Erbjudande skapat");
      setDialogOpen(false);
      setForm({ title: "", description: "", quantity: "", target_amount: "", interest_rate: "", maturity_date: "", visibility: "all" });
      queryClient.invalidateQueries({ queryKey: ["admin-trade-offers"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("trade_offers").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-trade-offers"] });
      toast.success("Status uppdaterad");
    },
  });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      Open: "bg-success/10 text-success border-success/30",
      Funded: "bg-primary/10 text-primary border-primary/30",
      Closed: "bg-destructive/10 text-destructive border-destructive/30",
      Repaid: "bg-muted text-muted-foreground border-border",
    };
    return map[status] || "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Trade Offers</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7 text-[10px] gap-1">
              <Plus className="h-3 w-3" /> Nytt erbjudande
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">Skapa Trade Offer</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Titel</label>
                <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Beskrivning</label>
                <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="h-8 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Kvantitet</label>
                  <Input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Målbelopp (kr)</label>
                  <Input type="number" value={form.target_amount} onChange={e => setForm({...form, target_amount: e.target.value})} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Ränta (%)</label>
                  <Input type="number" step="0.1" value={form.interest_rate} onChange={e => setForm({...form, interest_rate: e.target.value})} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Förfallodag</label>
                  <Input type="date" value={form.maturity_date} onChange={e => setForm({...form, maturity_date: e.target.value})} className="h-8 text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Synlighet</label>
                <Select value={form.visibility} onValueChange={v => setForm({...form, visibility: v})}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla klienter</SelectItem>
                    <SelectItem value="specific">Specifika klienter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={!form.title || !form.maturity_date} className="w-full h-8 text-xs">
                Skapa erbjudande
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="h-8">Titel</TableHead>
                <TableHead className="h-8 text-right">Mål</TableHead>
                <TableHead className="h-8 text-right">Finansierat</TableHead>
                <TableHead className="h-8 text-right">Ränta</TableHead>
                <TableHead className="h-8">Förfall</TableHead>
                <TableHead className="h-8">Progress</TableHead>
                <TableHead className="h-8 text-center">Pledges</TableHead>
                <TableHead className="h-8 text-center">Status</TableHead>
                <TableHead className="h-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.map((offer) => {
                const pledgeCount = allPledges.filter(p => p.offer_id === offer.id).length;
                const progress = Number(offer.target_amount) > 0
                  ? Math.min(100, (Number(offer.funded_amount) / Number(offer.target_amount)) * 100)
                  : 0;
                return (
                  <TableRow key={offer.id} className="text-[10px]">
                    <TableCell className="py-1.5 font-medium">{offer.title}</TableCell>
                    <TableCell className="py-1.5 text-right">{Number(offer.target_amount).toLocaleString()} kr</TableCell>
                    <TableCell className="py-1.5 text-right">{Number(offer.funded_amount).toLocaleString()} kr</TableCell>
                    <TableCell className="py-1.5 text-right font-bold text-success">{Number(offer.interest_rate).toFixed(1)}%</TableCell>
                    <TableCell className="py-1.5 text-muted-foreground">{offer.maturity_date}</TableCell>
                    <TableCell className="py-1.5 w-24">
                      <Progress value={progress} className="h-1.5" />
                    </TableCell>
                    <TableCell className="py-1.5 text-center">{pledgeCount}</TableCell>
                    <TableCell className="py-1.5 text-center">
                      <Badge variant="outline" className={`text-[9px] ${statusBadge(offer.status)}`}>
                        {offer.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Select value={offer.status} onValueChange={s => updateStatus.mutate({ id: offer.id, status: s })}>
                        <SelectTrigger className="h-6 w-24 text-[9px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Open", "Funded", "Closed", "Repaid"].map(s => (
                            <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
