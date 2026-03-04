import { motion } from "framer-motion";
import { Search, Plus, Mail } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const suppliersData = [
  { id: 1, name: "Norsk Sjömat AB", contact: "Erik Johansson", email: "erik@norsksjömat.no", location: "Bergen, Norge", products: ["Lax", "Torsk", "Kungskrabba"], rating: "A" },
  { id: 2, name: "Göteborgs Fiskauktion", contact: "Anna Lindberg", email: "anna@gbgfisk.se", location: "Göteborg, Sverige", products: ["Nordhavsräkor", "Rödspätta", "Sill"], rating: "A+" },
  { id: 3, name: "Smögen Shellfish", contact: "Lars Pettersson", email: "lars@smogenshell.se", location: "Smögen, Sverige", products: ["Hummer", "Krabba"], rating: "A" },
  { id: 4, name: "Mediterranean Imports", contact: "Marco Rossi", email: "marco@medimport.ch", location: "Zürich, Schweiz", products: ["Tonfisk", "Bläckfisk"], rating: "B+" },
  { id: 5, name: "Kungshamns Fisk", contact: "Eva Svensson", email: "eva@kungshamnsfisk.se", location: "Kungshamn, Sverige", products: ["Torsk", "Sill", "Makrill"], rating: "A" },
];

const ratingColor: Record<string, string> = {
  "A+": "bg-success/15 text-success border-success/20",
  "A": "bg-primary/10 text-primary border-primary/20",
  "B+": "bg-warning/15 text-warning border-warning/20",
};

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const filtered = suppliersData.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Leverantörer</h2>
          <p className="text-sm text-muted-foreground">Hantera era fisk- och skaldjursleverantörer</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Lägg till leverantör
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Sök leverantörer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((supplier) => (
          <Card key={supplier.id} className="shadow-card hover:shadow-card-hover transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-heading font-semibold text-foreground">{supplier.name}</h3>
                <Badge variant="outline" className={ratingColor[supplier.rating]}>{supplier.rating}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-1">{supplier.contact}</p>
              <p className="text-xs text-muted-foreground mb-3">{supplier.location}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {supplier.products.map((p) => (
                  <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                ))}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />{supplier.email}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}
