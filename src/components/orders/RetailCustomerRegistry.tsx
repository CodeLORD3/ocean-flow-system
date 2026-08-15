import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Trash2, Pencil, History, ArrowRight } from "lucide-react";
import { CustomerHistoryDialog } from "@/components/orders/CustomerHistoryDialog";
import { RetailCustomerDialog } from "@/components/orders/RetailCustomerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/EmptyState";
import {
  useAnonymizeRetailCustomer,
  useCustomerOrders,
  useRetailCustomers,
} from "@/hooks/useCustomerOrders";
import { RetailCustomer, customerDisplayName } from "@/lib/customerOrders";

/** Kundregister för privatkunder. Skilt från B2B-kunderna i /customers. */
export function RetailCustomerRegistry({
  storeId,
  readOnly,
}: {
  storeId: string | null;
  readOnly?: boolean;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "company" | "private" | "review">("all");
  const { data: allCustomers = [], isLoading } = useRetailCustomers(storeId, search);

  const { data: orders = [] } = useCustomerOrders({ storeId });
  const anonymize = useAnonymizeRetailCustomer();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RetailCustomer | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<RetailCustomer | null>(null);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (c: RetailCustomer) => {
    setEditing(c);
    setOpen(true);
  };

  /** Kundkortet: egen sida per kund, öppnas som flik. */
  const openProfile = (c: RetailCustomer) => navigate(`/customer-orders/kund/${c.id}`);

  const historyFor = (id: string) => orders.filter((o) => o.customer_id === id);

  const reviewCount = allCustomers.filter((c) => c.name_review_needed).length;

  const customers = allCustomers.filter((c) =>
    typeFilter === "all"
      ? true
      : typeFilter === "review"
        ? c.name_review_needed
        : typeFilter === "company"
          ? c.is_company
          : !c.is_company,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Sök namn, telefon eller e-post"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ToggleGroup
          type="single"
          value={typeFilter}
          onValueChange={(v) => v && setTypeFilter(v as typeof typeFilter)}
          className="h-11"
        >
          <ToggleGroupItem value="all" className="h-11 px-3 text-xs">
            Alla
          </ToggleGroupItem>
          <ToggleGroupItem value="private" className="h-11 px-3 text-xs">
            Privat
          </ToggleGroupItem>
          <ToggleGroupItem value="company" className="h-11 px-3 text-xs">
            Organisation
          </ToggleGroupItem>
          <ToggleGroupItem value="review" className="h-11 px-3 text-xs">
            Genomgång {reviewCount > 0 && `(${reviewCount})`}
          </ToggleGroupItem>
        </ToggleGroup>

        {!readOnly && (
          <Button className="h-11" onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Ny kund
          </Button>
        )}
      </div>

      {typeFilter === "review" && (
        <p className="text-xs text-muted-foreground">
          Namn som inte kunde delas säkert i förnamn och efternamn. Öppna posten, välj person
          eller organisation och rätta fälten — posten fungerar som vanligt under tiden.
        </p>
      )}

      {!isLoading && customers.length === 0 && (
        <EmptyState
          title={typeFilter === "review" ? "Inget att gå igenom" : "Inga privatkunder ännu"}
          description="Kunder läggs upp när du tar emot första beställningen, eller här direkt."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {customers.map((c) => {
          const history = historyFor(c.id);
          const uncollected = history.filter((o) => o.status === "packad").length;
          const common = new Map<string, number>();
          for (const o of history)
            for (const l of o.customer_order_lines || []) {
              const n = (l.products?.name || l.free_text_name) as string | undefined;
              if (n) common.set(n, (common.get(n) || 0) + 1);
            }
          const top = Array.from(common.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([n]) => n);

          return (
            <Card key={c.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openProfile(c)}
                        className="truncate text-left font-semibold hover:text-primary hover:underline"
                      >
                        {customerDisplayName(c)}
                      </button>
                      {c.is_company && (
                        <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                          Organisation
                        </Badge>
                      )}
                      {c.name_review_needed && (
                        <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
                          Genomgång
                        </Badge>
                      )}
                    </div>
                    {c.is_company && (c.company_name || c.org_number) && (
                      <div className="truncate text-xs text-muted-foreground">
                        {[c.company_name, c.org_number].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {c.name_review_needed && (
                      <div className="truncate text-xs text-muted-foreground">
                        Originalnamn: {c.name || "—"}
                      </div>
                    )}

                    <div className="truncate text-xs text-muted-foreground">
                      {[c.phone, c.email].filter(Boolean).join(" · ") || "Inga kontaktuppgifter"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[c.street, c.postal_code, c.city].filter(Boolean).join(", ")}
                    </div>
                    {!storeId && (c as any).stores?.name && (
                      <div className="truncate text-xs text-muted-foreground">
                        Butik: {(c as any).stores.name}
                      </div>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              "Radera kundens personuppgifter? Ordrarna behålls anonymiserade för bokföringen.",
                            )
                          )
                            return;
                          await anonymize.mutateAsync(c.id);
                          toast.success("Kunduppgifterna är raderade.");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                {top.length > 0 && (
                  <p className="text-xs">
                    <span className="text-muted-foreground">Brukar beställa: </span>
                    {top.join(", ")}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{history.length} order</span>
                  {uncollected > 0 && <span>{uncollected} väntar på hämtning</span>}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-9"
                    onClick={() => setHistoryCustomer(c)}
                  >
                    <History className="mr-1 h-4 w-4" /> Historik
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => openProfile(c)}
                  >
                    Kundkort <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <RetailCustomerDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        storeId={storeId}
      />

      <CustomerHistoryDialog
        open={!!historyCustomer}
        onOpenChange={(v) => !v && setHistoryCustomer(null)}
        customerName={historyCustomer?.name || ""}
        orders={historyCustomer ? historyFor(historyCustomer.id) : []}
      />
    </div>
  );
}
