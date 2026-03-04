import { motion } from "framer-motion";
import { MapPin, Phone, Clock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stores = [
  { id: 1, name: "Stockholm Östermalm", address: "Östermalmshallen, Östermalmstorg, Stockholm", phone: "08-123 45 67", hours: "Mån–Lör 09:30–18:00", staff: 6, city: "Stockholm", status: "Öppen" },
  { id: 2, name: "Stockholm Södermalm", address: "Hornsgatan 42, Stockholm", phone: "08-234 56 78", hours: "Mån–Lör 10:00–18:00", staff: 4, city: "Stockholm", status: "Öppen" },
  { id: 3, name: "Göteborg Haga", address: "Haga Nygata 18, Göteborg", phone: "031-345 67 89", hours: "Mån–Lör 09:00–17:30", staff: 5, city: "Göteborg", status: "Öppen" },
  { id: 4, name: "Göteborg Linné", address: "Linnégatan 56, Göteborg", phone: "031-456 78 90", hours: "Mån–Lör 10:00–18:00", staff: 4, city: "Göteborg", status: "Öppen" },
  { id: 5, name: "Göteborg Majorna", address: "Mariaplan 3, Göteborg", phone: "031-567 89 01", hours: "Mån–Fre 09:30–17:00, Lör 09:30–15:00", staff: 3, city: "Göteborg", status: "Öppen" },
  { id: 6, name: "Zürich", address: "Bahnhofstrasse 92, Zürich", phone: "+41 44 123 45 67", hours: "Mon–Sat 08:00–19:00", staff: 5, city: "Schweiz", status: "Öppen" },
];

const cityColor: Record<string, string> = {
  Stockholm: "bg-primary/10 text-primary border-primary/20",
  Göteborg: "bg-accent/15 text-accent border-accent/20",
  Schweiz: "bg-warning/15 text-warning border-warning/20",
};

export default function Stores() {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Butiker</h2>
        <p className="text-sm text-muted-foreground">Era 6 fiskaffärer i Sverige och Schweiz</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map((store) => (
          <Card key={store.id} className="shadow-card hover:shadow-card-hover transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-heading font-semibold text-foreground">{store.name}</h3>
                <Badge variant="outline" className={cityColor[store.city]}>{store.city}</Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-primary/60" />
                  <span>{store.address}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0 text-primary/60" />
                  <span>{store.phone}</span>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-primary/60" />
                  <span>{store.hours}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4 shrink-0 text-primary/60" />
                  <span>{store.staff} anställda</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}
