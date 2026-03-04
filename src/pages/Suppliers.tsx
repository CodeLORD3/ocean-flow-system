import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Mail, Phone, MapPin, Star, FileText, Truck, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const suppliersData = [
  { id: 1, name: "Norsk Sjömat AB", org: "NO-912345678", contact: "Erik Johansson", email: "erik@norsksjömat.no", phone: "+47 55 123 456", location: "Bergen, Norge", products: ["Lax", "Torsk", "Kungskrabba"], rating: "A", paymentTerms: "30 dagar", ytd: 2450000, lastOrder: "2026-03-02", deliveryScore: 96, activeContracts: 2 },
  { id: 2, name: "Göteborgs Fiskauktion", org: "SE-556789012", contact: "Anna Lindberg", email: "anna@gbgfisk.se", phone: "031-345 67 89", location: "Göteborg, Sverige", products: ["Nordhavsräkor", "Rödspätta", "Sill"], rating: "A+", paymentTerms: "15 dagar", ytd: 1820000, lastOrder: "2026-03-04", deliveryScore: 99, activeContracts: 3 },
  { id: 3, name: "Smögen Shellfish", org: "SE-556890123", contact: "Lars Pettersson", email: "lars@smogenshell.se", phone: "0523-456 78", location: "Smögen, Sverige", products: ["Hummer", "Krabba"], rating: "A", paymentTerms: "20 dagar", ytd: 980000, lastOrder: "2026-03-01", deliveryScore: 94, activeContracts: 1 },
  { id: 4, name: "Mediterranean Imports", org: "CH-456789012", contact: "Marco Rossi", email: "marco@medimport.ch", phone: "+41 44 567 89 01", location: "Zürich, Schweiz", products: ["Tonfisk", "Bläckfisk"], rating: "B+", paymentTerms: "30 dagar", ytd: 640000, lastOrder: "2026-02-28", deliveryScore: 87, activeContracts: 1 },
  { id: 5, name: "Kungshamns Fisk", org: "SE-556901234", contact: "Eva Svensson", email: "eva@kungshamnsfisk.se", phone: "0523-567 89", location: "Kungshamn, Sverige", products: ["Torsk", "Sill", "Makrill"], rating: "A", paymentTerms: "15 dagar", ytd: 520000, lastOrder: "2026-03-04", deliveryScore: 95, activeContracts: 2 },
];

const ratingColor: Record<string, string> = {
  "A+": "bg-success/15 text-success border-success/20",
  "A": "bg-primary/10 text-primary border-primary/20",
  "B+": "bg-warning/15 text-warning border-warning/20",
};

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const filtered = suppliersData.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.location.toLowerCase().includes(search.toLowerCase())
  );

  const totalYtd = suppliersData.reduce((s, l) => s + l.ytd, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Leverantörsreskontra</h2>
          <p className="text-xs text-muted-foreground">Hantera leverantörer, avtal, betyg och inköpshistorik</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs h-8">
          <Plus className="h-3 w-3" /> Ny leverantör
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Aktiva leverantörer</p><p className="text-xl font-heading font-bold text-foreground">{suppliersData.length}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Inköp YTD</p><p className="text-xl font-heading font-bold text-foreground">{totalYtd.toLocaleString("sv-SE")} kr</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Snitt leveransprecision</p><p className="text-xl font-heading font-bold text-foreground">{Math.round(suppliersData.reduce((s, l) => s + l.deliveryScore, 0) / suppliersData.length)}%</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Aktiva avtal</p><p className="text-xl font-heading font-bold text-foreground">{suppliersData.reduce((s, l) => s + l.activeContracts, 0)}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="list" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="list" className="text-xs h-7">Leverantörslista</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs h-7">Prestanda</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="relative max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Sök leverantör..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Leverantör</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Org.nr</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Kontakt</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Ort</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Produkter</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Betalning</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Inköp YTD</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Leverans %</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Betyg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((supplier) => (
                      <tr key={supplier.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-medium text-foreground">{supplier.name}</td>
                        <td className="py-2 font-mono text-muted-foreground text-[10px]">{supplier.org}</td>
                        <td className="py-2">
                          <p className="text-foreground">{supplier.contact}</p>
                          <p className="text-[10px] text-muted-foreground">{supplier.email}</p>
                        </td>
                        <td className="py-2 text-muted-foreground">{supplier.location}</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-0.5">
                            {supplier.products.map((p) => <Badge key={p} variant="secondary" className="text-[9px] px-1 py-0">{p}</Badge>)}
                          </div>
                        </td>
                        <td className="py-2 text-right text-muted-foreground">{supplier.paymentTerms}</td>
                        <td className="py-2 text-right font-medium text-foreground">{supplier.ytd.toLocaleString("sv-SE")} kr</td>
                        <td className="py-2 text-right">
                          <span className={supplier.deliveryScore >= 95 ? "text-success font-medium" : supplier.deliveryScore >= 90 ? "text-foreground" : "text-warning font-medium"}>
                            {supplier.deliveryScore}%
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <Badge variant="outline" className={`${ratingColor[supplier.rating]} text-[10px]`}>{supplier.rating}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card className="shadow-card">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Detaljerad leverantörsprestanda med leveranstider, kvalitetsindex och kostnadsanalys kommer snart.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
