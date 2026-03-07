import { motion } from "framer-motion";
import { Users, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Staff() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Personalhantering</h2>
          <p className="text-xs text-muted-foreground">Hantera personal, scheman och löner</p>
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-sm font-heading font-bold text-foreground mb-1">Personalregister</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Personalhantering är inte konfigurerad ännu. Anslut Personalkollen eller lägg till personal manuellt för att komma igång.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
