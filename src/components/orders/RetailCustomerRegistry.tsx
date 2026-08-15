import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Trash2, Pencil, History, ChevronRight } from "lucide-react";
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="Sök namn, telefon eller e-post"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ToggleGroup
          type="single"
          value={typeFilter}
          onValueChange={(v) => v && setTypeFilter(v as typeof typeFilter)}
          className="h-8"
        >
          <ToggleGroupItem value="all" className="h-8 px-2.5 text-[11px]">
            Alla
          </ToggleGroupItem>
          <ToggleGroupItem value="private" className="h-8 px-2.5 text-[11px]">
            Privat
          </ToggleGroupItem>
          <ToggleGroupItem value="company" className="h-8 px-2.5 text-[11px]">
            Organisation
          </ToggleGroupItem>
          <ToggleGroupItem value="review" className="h-8 px-2.5 text-[11px]">
            Genomgång {reviewCount > 0 && `(${reviewCount})`}
          </ToggleGroupItem>
        </ToggleGroup>

        {!readOnly && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Ny kund
          </Button>
        )}
      </div>

      {typeFilter === "review" && (
        <p className="text-[11px] text-muted-foreground">
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

      {customers.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Namn</th>
                    <th className="px-2 py-2 text-left font-medium">Kontakt</th>
                    <th className="px-2 py-2 text-left font-medium">Adress</th>
                    {!storeId && <th className="px-2 py-2 text-left font-medium">Butik</th>}
                    <th className="px-2 py-2 text-left font-medium">Brukar beställa</th>
                    <th className="px-2 py-2 text-right font-medium">Ordrar</th>
                    <th className="px-2 py-2 text-right font-medium">Åtgärder</th>
                  </tr>
                </thead>
                <tbody>
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
                      .slice(0, 2)
                      .map(([n]) => n);

                    return (
                      <tr
                        key={c.id}
                        className="border-b border-border/40 transition-colors hover:bg-muted/20"
                      >
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openProfile(c)}
                              className="max-w-[13rem] truncate text-left font-medium text-foreground hover:text-primary hover:underline"
                            >
                              {customerDisplayName(c)}
                            </button>
                            {c.is_company && (
                              <Badge
                                variant="secondary"
                                className="h-4 shrink-0 px-1 text-[9px]"
                              >
                                Org
                              </Badge>
                            )}
                            {c.name_review_needed && (
                              <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                                Genomgång
                              </Badge>
                            )}
                          </div>
                          {c.is_company && (c.company_name || c.org_number) && (
                            <div className="max-w-[13rem] truncate text-[10px] text-muted-foreground">
                              {[c.company_name, c.org_number].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">
                          <span className="block max-w-[12rem] truncate">
                            {[c.phone, c.email].filter(Boolean).join(" · ") || "–"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                          <span className="block max-w-[12rem] truncate">
                            {[c.street, c.postal_code, c.city].filter(Boolean).join(", ") || "–"}
                          </span>
                        </td>
                        {!storeId && (
                          <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                            {(c as any).stores?.name || "–"}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-[10px] text-muted-foreground">
                          <span className="block max-w-[12rem] truncate">
                            {top.join(", ") || "–"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {history.length}
                          {uncollected > 0 && (
                            <span className="ml-1 text-[10px] text-primary">
                              ({uncollected} väntar)
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-1.5 text-[10px]"
                              onClick={() => setHistoryCustomer(c)}
                            >
                              <History className="h-3 w-3" /> Historik
                            </Button>
                            {!readOnly && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 gap-1 px-1.5 text-[10px]"
                                  onClick={() => openEdit(c)}
                                >
                                  <Pencil className="h-3 w-3" /> Redigera
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 gap-1 px-1.5 text-[10px] text-destructive hover:text-destructive"
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
                                  <Trash2 className="h-3 w-3" /> Radera
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-1.5 text-[10px]"
                              onClick={() => openProfile(c)}
                            >
                              Kundkort <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
