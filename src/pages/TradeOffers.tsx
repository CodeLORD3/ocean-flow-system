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
import TradeOfferDetail from "@/components/trade/TradeOfferDetail";

const EMPTY_FORM = {
  title: "", description: "", quantity: "", target_amount: "",
  interest_rate: "", maturity_date: "", visibility: "all",
  min_pledge: "", max_pledge: "", purchase_date: "",
  repayment_type: "lump_sum", supplier_name: "", risk_note: "",
  product_id_display: "", sector: "Seafood Trading", structure: "Trade Finance",
  origin: "", volume: "", purchase_price: "", sales_value: "",
  gross_margin: "", collateral: "Inventory", ltv: "",
  primary_exit: "", secondary_exit: "", downside: "",
};

export default function TradeOffers() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

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

      // Calculate tenor_days from purchase_date to maturity_date
      let tenor_days: number | null = null;
      if (form.purchase_date && form.maturity_date) {
        const start = new Date(form.purchase_date);
        const end = new Date(form.maturity_date);
        tenor_days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Calculate annual return
      const rate = Number(form.interest_rate) || 0;
      let annual_return: number | null = null;
      if (tenor_days && tenor_days > 0 && rate > 0) {
        annual_return = Math.round((rate / tenor_days) * 365 * 100) / 100;
      }

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
        product_id_display: form.product_id_display || null,
        sector: form.sector || "Seafood Trading",
        structure: form.structure || "Trade Finance",
        origin: form.origin || null,
        volume: form.volume || null,
        purchase_price: Number(form.purchase_price) || 0,
        sales_value: Number(form.sales_value) || 0,
        gross_margin: form.gross_margin ? Number(form.gross_margin) : null,
        collateral: form.collateral || "Inventory",
        ltv: form.ltv ? Number(form.ltv) : null,
        primary_exit: form.primary_exit || null,
        secondary_exit: form.secondary_exit || null,
        downside: form.downside || null,
        tenor_days,
        annual_return,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Erbjudande skapat");
      setIsCreating(false);
      setForm({ ...EMPTY_FORM });
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

  // ── Detail view ──
  if (selectedOfferId) {
    const offer = offers.find(o => o.id === selectedOfferId);
    if (!offer) return null;
    return (
      <TradeOfferDetail
        offer={offer as any}
        pledges={allPledges.filter(p => p.offer_id === selectedOfferId)}
        onBack={() => setSelectedOfferId(null)}
        onStatusChange={(status) => updateStatus.mutate({ id: selectedOfferId, status })}
      />
    );
  }

  // ── Creating view ──
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
          <CardContent className="p-4 space-y-4">
            {/* Deal Summary */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wider mb-2">DEAL SUMMARY</h3>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Produkt (Titel)" value={form.title} onChange={v => setForm({...form, title: v})} />
                <FormField label="Product-ID" value={form.product_id_display} onChange={v => setForm({...form, product_id_display: v})} placeholder="t.ex. SF-2024-001" />
                <FormField label="Sektor" value={form.sector} onChange={v => setForm({...form, sector: v})} />
                <FormField label="Struktur" value={form.structure} onChange={v => setForm({...form, structure: v})} />
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] text-muted-foreground">Beskrivning</label>
                  <Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="h-8 text-xs" />
                </div>
              </div>
            </div>

            {/* Investment Terms */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wider mb-2">INVESTMENT TERMS</h3>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Total Investment (kr)" value={form.target_amount} onChange={v => setForm({...form, target_amount: v})} type="number" />
                <FormField label="Minimum Ticket (kr)" value={form.min_pledge} onChange={v => setForm({...form, min_pledge: v})} type="number" placeholder="0" />
                <FormField label="Maximum Ticket (kr, valfri)" value={form.max_pledge} onChange={v => setForm({...form, max_pledge: v})} type="number" placeholder="Ingen gräns" />
                <FormField label="Expected Return (%)" value={form.interest_rate} onChange={v => setForm({...form, interest_rate: v})} type="number" step="0.1" />
                <FormField label="Kvantitet" value={form.quantity} onChange={v => setForm({...form, quantity: v})} type="number" />
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Återbetalningstyp</label>
                  <Select value={form.repayment_type} onValueChange={v => setForm({...form, repayment_type: v})}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lump_sum">Bullet (Klumpsumma)</SelectItem>
                      <SelectItem value="rolling">Löpande</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wider mb-2">DATES</h3>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Start Date (Inköpsdatum)" value={form.purchase_date} onChange={v => setForm({...form, purchase_date: v})} type="date" />
                <FormField label="Expiry Date (Förfallodag)" value={form.maturity_date} onChange={v => setForm({...form, maturity_date: v})} type="date" />
              </div>
            </div>

            {/* Underlying Transaction */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wider mb-2">UNDERLYING TRANSACTION</h3>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Leverantör" value={form.supplier_name} onChange={v => setForm({...form, supplier_name: v})} placeholder="t.ex. Mondi AB" />
                <FormField label="Origin" value={form.origin} onChange={v => setForm({...form, origin: v})} placeholder="t.ex. Norway" />
                <FormField label="Volume (antal/kg)" value={form.volume} onChange={v => setForm({...form, volume: v})} placeholder="t.ex. 5 000 kg" />
                <FormField label="Purchase Price (kr)" value={form.purchase_price} onChange={v => {
                  const newForm = {...form, purchase_price: v};
                  const pp = Number(v); const sv = Number(form.sales_value);
                  if (pp > 0 && sv > 0) newForm.gross_margin = (((sv - pp) / sv) * 100).toFixed(1);
                  setForm(newForm);
                }} type="number" />
                <FormField label="Sales Value (kr)" value={form.sales_value} onChange={v => {
                  const newForm = {...form, sales_value: v};
                  const pp = Number(form.purchase_price); const sv = Number(v);
                  if (pp > 0 && sv > 0) newForm.gross_margin = (((sv - pp) / sv) * 100).toFixed(1);
                  setForm(newForm);
                }} type="number" />
                <FormField label="Gross Margin (%) — auto" value={form.gross_margin} onChange={v => setForm({...form, gross_margin: v})} type="number" step="0.1" />
              </div>
            </div>

            {/* Risk & Security */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wider mb-2">RISK & SECURITY</h3>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Collateral" value={form.collateral} onChange={v => setForm({...form, collateral: v})} placeholder="Inventory" />
                <FormField label="LTV (%)" value={form.ltv} onChange={v => setForm({...form, ltv: v})} type="number" step="0.1" />
                <FormField label="Primary Exit" value={form.primary_exit} onChange={v => setForm({...form, primary_exit: v})} placeholder="t.ex. Direct sales to retailers" />
                <FormField label="Secondary Exit" value={form.secondary_exit} onChange={v => setForm({...form, secondary_exit: v})} placeholder="t.ex. Wholesale liquidation" />
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] text-muted-foreground">Downside / Risknotering</label>
                  <Input value={form.downside} onChange={e => setForm({...form, downside: e.target.value, risk_note: e.target.value})} className="h-8 text-xs" placeholder="t.ex. Discount liquidation at 80% of cost" />
                </div>
              </div>
            </div>

            {/* Visibility & Files */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wider mb-2">VISIBILITY & FILES</h3>
              <div className="grid grid-cols-2 gap-3">
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
                <div />
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
        <CardContent className="p-0 overflow-x-auto">
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
                <TableHead className="h-8 text-right">Days Left</TableHead>
                <TableHead className="h-8 text-center">Status</TableHead>
                <TableHead className="h-8" />
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

                // Days left
                const now = new Date();
                const maturity = new Date(offer.maturity_date);
                const daysLeft = Math.ceil((maturity.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                // Annual return calc
                let annualReturn = o.annual_return ? Number(o.annual_return) : null;
                if (!annualReturn && o.tenor_days && Number(o.tenor_days) > 0) {
                  annualReturn = Math.round((rate / Number(o.tenor_days)) * 365 * 100) / 100;
                }

                return (
                  <TableRow
                    key={offer.id}
                    className="text-[10px] cursor-pointer hover:bg-muted/50"
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
                    <TableCell className={`py-1.5 text-right font-bold ${daysLeft <= 7 ? "text-destructive" : daysLeft <= 30 ? "text-warning" : ""}`}>
                      {daysLeft > 0 ? daysLeft : "Expired"}
                    </TableCell>
                    <TableCell className="py-1.5 text-center" onClick={e => e.stopPropagation()}>
                      <Select value={offer.status} onValueChange={s => updateStatus.mutate({ id: offer.id, status: s })}>
                        <SelectTrigger className="h-6 w-20 text-[9px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["Open", "Funded", "Closed", "Repaid"].map(s => (
                            <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-1.5" />
                  </TableRow>
                );
              })}
              {offers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                    Inga erbjudanden ännu
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text", placeholder, step }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; step?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <Input
        type={type}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 text-xs"
        placeholder={placeholder}
      />
    </div>
  );
}
