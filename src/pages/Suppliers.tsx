import { motion } from "framer-motion";
import { Search, Plus, Phone, Mail } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const suppliersData = [
  { id: 1, name: "Nordic Seafarms", contact: "Erik Johansson", email: "erik@nordicsea.no", phone: "+47 123 4567", location: "Bergen, Norway", products: ["Salmon", "Cod"], rating: "A" },
  { id: 2, name: "Tokyo Fish Market", contact: "Yuki Tanaka", email: "yuki@tokyofish.jp", phone: "+81 3 1234 5678", location: "Tokyo, Japan", products: ["Bluefin Tuna"], rating: "A+" },
  { id: 3, name: "Gulf Shrimp Co.", contact: "Maria Santos", email: "maria@gulfshrimp.th", phone: "+66 2 345 6789", location: "Bangkok, Thailand", products: ["Tiger Shrimp", "White Shrimp"], rating: "B+" },
  { id: 4, name: "Alaska Wild Catch", contact: "John Miller", email: "john@alaskawild.us", phone: "+1 907 555 0123", location: "Anchorage, USA", products: ["Pacific Cod", "Salmon"], rating: "A" },
  { id: 5, name: "Maritime Shellfish", contact: "Pierre Dubois", email: "pierre@maritime.ca", phone: "+1 506 555 0456", location: "Halifax, Canada", products: ["Lobster", "Snow Crab"], rating: "A" },
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
          <h2 className="text-2xl font-heading font-bold text-foreground">Suppliers</h2>
          <p className="text-sm text-muted-foreground">Manage your seafood suppliers and vendors</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{supplier.email}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}
