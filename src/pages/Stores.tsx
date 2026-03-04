import { motion } from "framer-motion";
import { MapPin, Phone, Clock, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStores } from "@/hooks/useStores";

export default function Stores() {
  const { data: stores = [], isLoading } = useStores(true); // non-wholesale stores only

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground">Butiksöversikt</h2>
        <p className="text-xs text-muted-foreground">Butiker kopplade till grossisten</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Butiker</p><p className="text-xl font-heading font-bold text-foreground">{stores.length}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Städer</p><p className="text-xl font-heading font-bold text-foreground">{new Set(stores.map(s => s.city)).size}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Total yta</p><p className="text-xl font-heading font-bold text-foreground">{stores.reduce((s, st) => s + (st.sqm || 0), 0)} m²</p></CardContent></Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Laddar butiker…</p>
      ) : stores.length === 0 ? (
        <Card className="shadow-card"><CardContent className="p-6 text-center text-sm text-muted-foreground">Inga butiker skapade ännu. Lägg till kunder via grossisten för att skapa butiker.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {stores.map((store) => (
            <Card key={store.id} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-semibold text-foreground text-sm">{store.name}</h3>
                    {store.manager && <p className="text-[10px] text-muted-foreground">{store.manager}</p>}
                  </div>
                  <Badge variant="outline" className="text-[10px]">{store.city}</Badge>
                </div>

                <div className="space-y-1.5 text-xs">
                  {store.address && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />
                      <span className="text-[10px]">{store.address}</span>
                    </div>
                  )}
                  {store.phone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0 text-primary/60" />
                      <span className="text-[10px]">{store.phone}</span>
                    </div>
                  )}
                  {store.hours && (
                    <div className="flex items-start gap-1.5 text-muted-foreground">
                      <Clock className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />
                      <span className="text-[10px]">{store.hours}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}
