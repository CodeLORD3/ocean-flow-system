import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

const db = supabase as any;
const SELLER_ENTITY = "fsab-se"; // Grossist Göteborg fakturerar butikerna

/** Kopplar varje butik till en importerad Fortnox-kund. Krävs för att kunna fakturera butiksordrar. */
export function StoreFortnoxCustomerMap() {
  const qc = useQueryClient();

  const stores = useQuery({
    queryKey: ["stores_fortnox_customer"],
    queryFn: async () => {
      const { data, error } = await db
        .from("stores")
        .select("id, name, city, currency, fortnox_customer_number")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const customers = useQuery({
    queryKey: ["fortnox_customers", SELLER_ENTITY],
    queryFn: async () => {
      const { data, error } = await db
        .from("fortnox_customers")
        .select("customer_number, name")
        .eq("legal_entity_code", SELLER_ENTITY)
        .order("name");
      if (error) throw error;
      return data as { customer_number: string; name: string }[];
    },
  });

  const setCustomer = async (storeId: string, value: string) => {
    const { error } = await db
      .from("stores")
      .update({ fortnox_customer_number: value === "none" ? null : value })
      .eq("id", storeId);
    if (error) return toast.error(error.message);
    toast.success("Fortnox-kund uppdaterad");
    qc.invalidateQueries({ queryKey: ["stores_fortnox_customer"] });
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <div>
            <CardTitle className="text-sm font-heading">Fortnox-kund per butik</CardTitle>
            <CardDescription className="text-xs">
              Grossist Göteborg (FSAB SE) fakturerar butiken som kund i Fortnox. Välj importerad kund per butik.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {stores.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {(stores.data || []).map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{s.name}</span>
                <Select
                  value={s.fortnox_customer_number ?? "none"}
                  onValueChange={(v) => setCustomer(s.id, v)}
                >
                  <SelectTrigger className="h-7 w-[190px] text-[11px]">
                    <SelectValue placeholder="Ingen kund" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">
                      Ingen kund
                    </SelectItem>
                    {(customers.data || []).map((c) => (
                      <SelectItem key={c.customer_number} value={String(c.customer_number)} className="text-xs">
                        {c.customer_number} – {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
