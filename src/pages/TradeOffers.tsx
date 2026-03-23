import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, TrendingUp, Upload, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

export default function TradeOffers() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    title: "", description: "", quantity: "", target_amount: "",
    interest_rate: "", maturity_date: "", visibility: "all",
    min_pledge: "", max_pledge: "", purchase_date: "",
    repayment_type: "lump_sum", supplier_name: "", risk_note: "",
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

  const uploadFile = async (file: File, folder: string) => {
    const ext = file.name.split(".").pop();
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("trade-offers").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("trade-offers").getPublicUrl(path);
    return data.publicUrl;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      let product_image_url: string | null = null;
      let document_url: string | null = null;
      if (imageFile) product_image_url = await uploadFile(imageFile, "images");
      if (docFile) document_url = await uploadFile(docFile, "documents");

      const { error } = await supabase.from("trade_offers").insert({
        title: form.title,
        description: form.description || null,
        quantity: Number(form.quantity) || 0,
        target_amount: Number(form.target_amount) || 0,
        interest_rate: Number(form.interest_rate) || 0,
        maturity_date: form.maturity_date,
        visibility: form.visibility,
        min_pledge: Number(form.min_pledge) || 0,
        max_pledge: form.max_pledge ? Number(form.max_pledge) : null,
        purchase_date: form.purchase_date || null,
        repayment_type: form.repayment_type,
        supplier_name: form.supplier_name || null,
        risk_note: form.risk_note || null,
        product_image_url,
        document_url,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Erbjudande skapat");
      setIsCreating(false);
      setForm({ title: "", description: "", quantity: "", target_amount: "", interest_rate: "", maturity_date: "", visibility: "all", min_pledge: "", max_pledge: "", purchase_date: "", repayment_type: "lump_sum", supplier_name: "", risk_note: "" });
      setImageFile(null);
      setDocFile(null);
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

  // ── Creating view (inline, not a dialog) ──
  if (isCreating) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setIsCreating(false)}>
            <ArrowLeft className="h-3 w-3" /> Tillbaka
          </Button>
          <h1 className="text-lg font-bold">Skapa Trade Offer</h1>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-muted-foreground">Titel</label>
                <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="h-8 text-xs" />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-muted-foreground">Beskrivning</label>
                <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="h-8 text-xs" />
              </div>
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
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Minsta insats (kr)</label>
                <Input type="number" value={form.min_pledge} onChange={e => setForm({...form, min_pledge: e.target.value})} className="h-8 text-xs" placeholder="0" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Högsta insats (kr, valfri)</label>
                <Input type="number" value={form.max_pledge} onChange={e => setForm({...form, max_pledge: e.target.value})} className="h-8 text-xs" placeholder="Ingen gräns" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Inköpsdatum</label>
                <Input type="date" value={form.purchase_date} onChange={e => setForm({...form, purchase_date: e.target.value})} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Återbetalningstyp</label>
                <Select value={form.repayment_type} onValueChange={v => setForm({...form, repayment_type: v})}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lump_sum">Klumpsumma vid förfall</SelectItem>
                    <SelectItem value="rolling">Löpande när produkter säljs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Leverantör</label>
                <Input value={form.supplier_name} onChange={e => setForm({...form, supplier_name: e.target.value})} className="h-8 text-xs" placeholder="t.ex. Mondi AB" />
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
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-muted-foreground">Risknotering</label>
                <Input value={form.risk_note} onChange={e => setForm({...form, risk_note: e.target.value})} className="h-8 text-xs" placeholder="T.ex. vad händer om produkter ej säljs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Produktbild</label>
                <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e => setImageFile(e.target.files?.[0] || null)} />
                <Button type="button" variant="outline" className="w-full h-8 text-xs gap-1" onClick={() => imageRef.current?.click()}>
                  <Upload className="h-3 w-3" /> {imageFile ? imageFile.name.slice(0, 20) : "Välj bild"}
                </Button>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Bifoga dokument</label>
                <input ref={docRef} type="file" accept=".pdf" className="hidden" onChange={e => setDocFile(e.target.files?.[0] || null)} />
                <Button type="button" variant="outline" className="w-full h-8 text-xs gap-1" onClick={() => docRef.current?.click()}>
                  <Upload className="h-3 w-3" /> {docFile ? docFile.name.slice(0, 20) : "Välj PDF"}
                </Button>
              </div>
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={!form.title || !form.maturity_date || createMutation.isPending} className="w-full h-8 text-xs mt-2">
              {createMutation.isPending ? "Skapar..." : "Skapa erbjudande"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">Trade Offers</h1>
        </div>
        <Button size="sm" className="h-7 text-[10px] gap-1" onClick={() => setIsCreating(true)}>
          <Plus className="h-3 w-3" /> Nytt erbjudande
        </Button>
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
