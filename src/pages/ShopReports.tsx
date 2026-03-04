import { useState } from "react";
import { useSite } from "@/contexts/SiteContext";
import { useShopReports, useUpsertShopReport } from "@/hooks/useShopReports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Save, BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ShopReports() {
  const { activeStoreId, activeStoreName } = useSite();
  const { data: reports, isLoading } = useShopReports(activeStoreId);
  const upsert = useUpsertShopReport();
  const [open, setOpen] = useState(false);

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [form, setForm] = useState({
    report_month: defaultMonth,
    purchase: "",
    sales: "",
    opening_inventory: "",
    closing_inventory: "",
    notes: "",
  });

  const resetForm = () => {
    setForm({
      report_month: defaultMonth,
      purchase: "",
      sales: "",
      opening_inventory: "",
      closing_inventory: "",
      notes: "",
    });
  };

  const handleSubmit = () => {
    if (!activeStoreId) return;
    upsert.mutate(
      {
        store_id: activeStoreId,
        report_month: form.report_month,
        purchase: Number(form.purchase) || 0,
        sales: Number(form.sales) || 0,
        opening_inventory: Number(form.opening_inventory) || 0,
        closing_inventory: Number(form.closing_inventory) || 0,
        notes: form.notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Rapport sparad");
          setOpen(false);
          resetForm();
        },
        onError: (e) => toast.error("Fel: " + e.message),
      }
    );
  };

  const handleEdit = (report: any) => {
    setForm({
      report_month: report.report_month,
      purchase: String(report.purchase),
      sales: String(report.sales),
      opening_inventory: String(report.opening_inventory),
      closing_inventory: String(report.closing_inventory),
      notes: report.notes || "",
    });
    setOpen(true);
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(v);

  const fmtMonth = (m: string) => {
    const [y, mo] = m.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
    return `${months[Number(mo) - 1]} ${y}`;
  };

  if (!activeStoreId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Välj en butik för att se rapporter.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Rapporter — {activeStoreName}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Registrera inköp, försäljning, ingående och utgående lager per månad
          </p>
        </div>

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Ny rapport
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Månadsrapport</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Månad</Label>
                <Input
                  type="month"
                  value={form.report_month}
                  onChange={(e) => setForm({ ...form, report_month: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Inköp (SEK)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.purchase}
                    onChange={(e) => setForm({ ...form, purchase: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Försäljning (SEK)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.sales}
                    onChange={(e) => setForm({ ...form, sales: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ingående lager (SEK)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.opening_inventory}
                    onChange={(e) => setForm({ ...form, opening_inventory: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Utgående lager (SEK)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={form.closing_inventory}
                    onChange={(e) => setForm({ ...form, closing_inventory: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Anteckningar</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Valfria anteckningar..."
                />
              </div>
              <Button onClick={handleSubmit} disabled={upsert.isPending} className="w-full">
                <Save className="h-4 w-4 mr-2" />
                {upsert.isPending ? "Sparar..." : "Spara rapport"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Månadsrapporter</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Laddar...</p>
          ) : !reports?.length ? (
            <p className="text-muted-foreground text-sm">Inga rapporter ännu. Klicka "Ny rapport" för att börja.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Månad</TableHead>
                  <TableHead className="text-right">Inköp</TableHead>
                  <TableHead className="text-right">Försäljning</TableHead>
                  <TableHead className="text-right">Ingående lager</TableHead>
                  <TableHead className="text-right">Utgående lager</TableHead>
                  <TableHead>Anteckningar</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{fmtMonth(r.report_month)}</TableCell>
                    <TableCell className="text-right">{fmt(Number(r.purchase))}</TableCell>
                    <TableCell className="text-right">{fmt(Number(r.sales))}</TableCell>
                    <TableCell className="text-right">{fmt(Number(r.opening_inventory))}</TableCell>
                    <TableCell className="text-right">{fmt(Number(r.closing_inventory))}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {r.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(r)}>
                        Redigera
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
