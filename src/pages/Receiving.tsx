import { useState } from "react";
import { motion } from "framer-motion";
import {
  Package, Plus, Search, FileText, CheckCircle2, Clock, Truck, Calendar,
  ChevronDown, X, AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// --- Types ---
interface ReceivingLineInput {
  product: string;
  expectedQty: string;
  receivedQty: string;
  unit: string;
  batchNo: string;
  temp: string;
  note: string;
}

const emptyLine: ReceivingLineInput = { product: "", expectedQty: "", receivedQty: "", unit: "kg", batchNo: "", temp: "", note: "" };

// --- Data ---
const receivingHistory = [
  { id: "INL-0098", date: "2026-03-04", time: "07:15", supplier: "Norsk Sjömat AB", deliveryNote: "NS-44521", store: "Stockholm Östermalm", lines: 3, totalKg: 450, status: "Godkänd", registeredBy: "Johan E.", discrepancy: false },
  { id: "INL-0097", date: "2026-03-03", time: "06:45", supplier: "Göteborgs Fiskauktion", deliveryNote: "GF-8834", store: "Göteborg Haga", lines: 4, totalKg: 620, status: "Godkänd", registeredBy: "Anna L.", discrepancy: false },
  { id: "INL-0096", date: "2026-03-03", time: "08:20", supplier: "Smögen Shellfish", deliveryNote: "SS-2201", store: "Göteborg Linné", lines: 2, totalKg: 85, status: "Avvikelse", registeredBy: "Lars P.", discrepancy: true },
  { id: "INL-0095", date: "2026-03-02", time: "07:00", supplier: "Kungshamns Fisk", deliveryNote: "KF-1190", store: "Göteborg Majorna", lines: 3, totalKg: 380, status: "Godkänd", registeredBy: "Karl A.", discrepancy: false },
  { id: "INL-0094", date: "2026-03-02", time: "09:30", supplier: "Mediterranean Imports", deliveryNote: "MI-7782", store: "Zürich", lines: 2, totalKg: 140, status: "Godkänd", registeredBy: "Eva B.", discrepancy: false },
  { id: "INL-0093", date: "2026-03-01", time: "06:30", supplier: "Norsk Sjömat AB", deliveryNote: "NS-44498", store: "Stockholm Södermalm", lines: 5, totalKg: 720, status: "Avvikelse", registeredBy: "Maria S.", discrepancy: true },
  { id: "INL-0092", date: "2026-03-01", time: "07:45", supplier: "Göteborgs Fiskauktion", deliveryNote: "GF-8820", store: "Göteborg Haga", lines: 3, totalKg: 290, status: "Godkänd", registeredBy: "Erik J.", discrepancy: false },
  { id: "INL-0091", date: "2026-02-28", time: "08:00", supplier: "Smögen Shellfish", deliveryNote: "SS-2198", store: "Stockholm Östermalm", lines: 2, totalKg: 60, status: "Godkänd", registeredBy: "Sofia N.", discrepancy: false },
];

const suppliers = ["Norsk Sjömat AB", "Göteborgs Fiskauktion", "Smögen Shellfish", "Mediterranean Imports", "Kungshamns Fisk"];
const storeOptions = ["Stockholm Östermalm", "Stockholm Södermalm", "Göteborg Haga", "Göteborg Linné", "Göteborg Majorna", "Zürich"];
const products = ["Atlantlax", "Blåfenad tonfisk", "Jätteräkor", "Torsk", "Hummer", "Kungskrabba", "Gulfenad tonfisk", "Rödlax", "Nordhavsräkor", "Snökrabba", "Rödspätta", "Sill"];

const statusColor: Record<string, string> = {
  Godkänd: "bg-success/15 text-success border-success/20",
  Avvikelse: "bg-warning/15 text-warning border-warning/20",
  Utkast: "bg-muted text-muted-foreground border-muted",
};

export default function Receiving() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const { toast } = useToast();

  // Form state
  const [supplier, setSupplier] = useState("");
  const [store, setStore] = useState("");
  const [deliveryNoteNo, setDeliveryNoteNo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [headerNote, setHeaderNote] = useState("");
  const [lines, setLines] = useState<ReceivingLineInput[]>([{ ...emptyLine }]);

  const resetForm = () => {
    setStep(1);
    setSupplier("");
    setStore("");
    setDeliveryNoteNo("");
    setDeliveryDate(new Date().toISOString().slice(0, 10));
    setHeaderNote("");
    setLines([{ ...emptyLine }]);
  };

  const addLine = () => setLines([...lines, { ...emptyLine }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof ReceivingLineInput, value: string) => {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    setLines(updated);
  };

  const hasDiscrepancy = lines.some(l => l.expectedQty && l.receivedQty && l.expectedQty !== l.receivedQty);

  const handleSubmit = () => {
    toast({
      title: "Inleverans registrerad",
      description: `Följesedel ${deliveryNoteNo} från ${supplier} har registrerats${hasDiscrepancy ? " med avvikelse" : ""}.`,
    });
    setDialogOpen(false);
    resetForm();
  };

  const filtered = receivingHistory.filter((r) =>
    r.id.toLowerCase().includes(search.toLowerCase()) ||
    r.supplier.toLowerCase().includes(search.toLowerCase()) ||
    r.deliveryNote.toLowerCase().includes(search.toLowerCase())
  );

  const totalThisMonth = receivingHistory.length;
  const discrepancies = receivingHistory.filter(r => r.discrepancy).length;
  const totalKg = receivingHistory.reduce((s, r) => s + r.totalKg, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Inleveranser</h2>
          <p className="text-xs text-muted-foreground">Registrera mottagna leveranser från följesedel — kontrollera mot förväntad kvantitet</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 text-xs h-8">
              <Plus className="h-3 w-3" /> Registrera inleverans
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {step === 1 && "Steg 1: Följesedelsinformation"}
                {step === 2 && "Steg 2: Produktrader"}
                {step === 3 && "Steg 3: Granska och godkänn"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {step === 1 && "Fyll i uppgifterna från följesedeln — leverantör, butik och följesedelsnummer."}
                {step === 2 && "Ange varje produktrad från följesedeln. Jämför förväntad kvantitet med mottagen kvantitet."}
                {step === 3 && "Kontrollera att all information stämmer innan du godkänner."}
              </DialogDescription>
            </DialogHeader>

            {/* Step indicators */}
            <div className="flex items-center gap-2 my-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {s}
                  </div>
                  {s < 3 && <div className={`w-8 h-0.5 ${step > s ? "bg-primary" : "bg-muted"}`} />}
                </div>
              ))}
            </div>

            {/* Step 1: Header info */}
            {step === 1 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Leverantör *</Label>
                    <Select value={supplier} onValueChange={setSupplier}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj leverantör" /></SelectTrigger>
                      <SelectContent>{suppliers.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mottagande butik *</Label>
                    <Select value={store} onValueChange={setStore}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj butik" /></SelectTrigger>
                      <SelectContent>{storeOptions.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Följesedelsnummer *</Label>
                    <Input value={deliveryNoteNo} onChange={(e) => setDeliveryNoteNo(e.target.value)} placeholder="T.ex. NS-44521" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Leveransdatum</Label>
                    <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Anteckning (valfritt)</Label>
                  <Textarea value={headerNote} onChange={(e) => setHeaderNote(e.target.value)} placeholder="T.ex. del av beställning ORD-2847, chaufför ringde 10 min sent..." className="text-xs min-h-[60px]" />
                </div>
              </div>
            )}

            {/* Step 2: Product lines */}
            {step === 2 && (
              <div className="space-y-3">
                {lines.map((line, i) => (
                  <div key={i} className="p-3 rounded-md border border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">Rad {i + 1}</span>
                      {lines.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeLine(i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[10px]">Produkt *</Label>
                        <Select value={line.product} onValueChange={(v) => updateLine(i, "product", v)}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Välj" /></SelectTrigger>
                          <SelectContent>{products.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Förväntat</Label>
                        <Input value={line.expectedQty} onChange={(e) => updateLine(i, "expectedQty", e.target.value)} placeholder="kg" className="h-7 text-[11px]" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Mottaget *</Label>
                        <Input value={line.receivedQty} onChange={(e) => updateLine(i, "receivedQty", e.target.value)} placeholder="kg" className={`h-7 text-[11px] ${line.expectedQty && line.receivedQty && line.expectedQty !== line.receivedQty ? "border-warning" : ""}`} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Batch/Lot</Label>
                        <Input value={line.batchNo} onChange={(e) => updateLine(i, "batchNo", e.target.value)} placeholder="LOT-..." className="h-7 text-[11px]" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Temp °C</Label>
                        <Input value={line.temp} onChange={(e) => updateLine(i, "temp", e.target.value)} placeholder="-2" className="h-7 text-[11px]" />
                      </div>
                    </div>
                    {line.expectedQty && line.receivedQty && line.expectedQty !== line.receivedQty && (
                      <div className="flex items-center gap-1.5 text-[10px] text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        Avvikelse: förväntade {line.expectedQty} kg, mottog {line.receivedQty} kg (diff: {Number(line.receivedQty) - Number(line.expectedQty)} kg)
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-[10px]">Anmärkning</Label>
                      <Input value={line.note} onChange={(e) => updateLine(i, "note", e.target.value)} placeholder="T.ex. skadad förpackning, dålig lukt..." className="h-7 text-[11px]" />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1" onClick={addLine}>
                  <Plus className="h-3 w-3" /> Lägg till rad
                </Button>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="space-y-3">
                <Card className="shadow-card">
                  <CardContent className="p-3 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground">Leverantör:</span> <span className="font-medium">{supplier}</span></div>
                      <div><span className="text-muted-foreground">Butik:</span> <span className="font-medium">{store}</span></div>
                      <div><span className="text-muted-foreground">Följesedel:</span> <span className="font-mono font-medium">{deliveryNoteNo}</span></div>
                      <div><span className="text-muted-foreground">Datum:</span> <span className="font-medium">{deliveryDate}</span></div>
                    </div>
                    {headerNote && <div><span className="text-muted-foreground">Anteckning:</span> {headerNote}</div>}
                  </CardContent>
                </Card>

                <div className="text-xs font-semibold text-muted-foreground">Produktrader</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-1.5 text-left font-medium text-muted-foreground">Produkt</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Förväntat</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Mottaget</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Diff</th>
                        <th className="pb-1.5 text-left font-medium text-muted-foreground">Batch</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Temp</th>
                        <th className="pb-1.5 text-left font-medium text-muted-foreground">Anm.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.filter(l => l.product).map((line, i) => {
                        const diff = Number(line.receivedQty) - Number(line.expectedQty);
                        const hasDiff = line.expectedQty && line.receivedQty && diff !== 0;
                        return (
                          <tr key={i} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5 font-medium text-foreground">{line.product}</td>
                            <td className="py-1.5 text-right text-muted-foreground">{line.expectedQty || "—"} kg</td>
                            <td className="py-1.5 text-right font-medium text-foreground">{line.receivedQty} kg</td>
                            <td className={`py-1.5 text-right font-medium ${hasDiff ? "text-warning" : "text-success"}`}>
                              {hasDiff ? `${diff > 0 ? "+" : ""}${diff} kg` : "OK"}
                            </td>
                            <td className="py-1.5 text-muted-foreground font-mono">{line.batchNo || "—"}</td>
                            <td className="py-1.5 text-right text-muted-foreground">{line.temp ? `${line.temp}°C` : "—"}</td>
                            <td className="py-1.5 text-muted-foreground truncate max-w-24">{line.note || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {hasDiscrepancy && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-warning/10 border border-warning/20 text-xs text-warning">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Avvikelse upptäckt — inleveransen markeras för uppföljning.</span>
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground">
                  Total mottagen kvantitet: <span className="font-bold text-foreground">{lines.reduce((s, l) => s + (Number(l.receivedQty) || 0), 0)} kg</span> · {lines.filter(l => l.product).length} rader
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              {step > 1 && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setStep((step - 1) as 1 | 2)}>
                  ← Tillbaka
                </Button>
              )}
              {step < 3 ? (
                <Button size="sm" className="text-xs" onClick={() => setStep((step + 1) as 2 | 3)}
                  disabled={step === 1 ? (!supplier || !store || !deliveryNoteNo) : lines.every(l => !l.product || !l.receivedQty)}>
                  Nästa →
                </Button>
              ) : (
                <Button size="sm" className="text-xs gap-1.5" onClick={handleSubmit}>
                  <CheckCircle2 className="h-3 w-3" /> Godkänn inleverans
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Inleveranser denna månad</p><p className="text-xl font-heading font-bold text-foreground">{totalThisMonth}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Total mottagen kvantitet</p><p className="text-xl font-heading font-bold text-foreground">{totalKg.toLocaleString("sv-SE")} kg</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" />Avvikelser</p><p className="text-xl font-heading font-bold text-warning">{discrepancies}</p><p className="text-[10px] text-muted-foreground">{Math.round((discrepancies / totalThisMonth) * 100)}% av leveranser</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Leverantörer</p><p className="text-xl font-heading font-bold text-foreground">{new Set(receivingHistory.map(r => r.supplier)).size}</p></CardContent></Card>
      </div>

      {/* History table */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <div>
              <CardTitle className="text-sm font-heading">Inleveranshistorik</CardTitle>
              <CardDescription className="text-xs">Alla registrerade inleveranser med följesedelreferens</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Sök ID, leverantör eller följesedel..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">INL-ID</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Datum</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Leverantör</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Följesedel</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Rader</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Kvantitet</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Registrerad av</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 font-mono font-medium text-foreground">{r.id}</td>
                    <td className="py-2 text-muted-foreground">{r.date} {r.time}</td>
                    <td className="py-2 text-foreground">{r.supplier}</td>
                    <td className="py-2 font-mono text-muted-foreground">{r.deliveryNote}</td>
                    <td className="py-2 text-muted-foreground">{r.store}</td>
                    <td className="py-2 text-right text-foreground">{r.lines}</td>
                    <td className="py-2 text-right font-medium text-foreground">{r.totalKg} kg</td>
                    <td className="py-2 text-muted-foreground">{r.registeredBy}</td>
                    <td className="py-2 text-right">
                      <Badge variant="outline" className={`${statusColor[r.status]} text-[10px] gap-1`}>
                        {r.discrepancy && <AlertTriangle className="h-2.5 w-2.5" />}
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground">
            <span>Visar {filtered.length} av {receivingHistory.length} inleveranser</span>
            <span>Lagret uppdateras automatiskt vid godkänd inleverans</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
