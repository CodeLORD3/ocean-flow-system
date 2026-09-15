import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { movementLabel } from "@/hooks/useStockMovements";
import { ChevronDown, ChevronRight, GitBranch, Search, ArrowDownRight, ArrowUpRight, Network } from "lucide-react";
import ProductMovementDag from "@/components/inventory/ProductMovementDag";

const nf = (n: number, d = 1) =>
  Number(n)
    .toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d })
    .replace(/\u00a0/g, " ");

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

type Ev = {
  id: string;
  created_at: string;
  qty: number;
  type: string;
  label: string;
  lot: string | null;
  lotId: string | null;
  location: string;
  who: string;
  reference: string | null;
  note: string | null;
};

type Branch = { key: string; label: string; lotId: string | null; events: Ev[]; balance: number };
type Node = {
  productId: string;
  name: string;
  sku: string | null;
  in: number;
  out: number;
  balance: number;
  first: string;
  last: string;
  branches: Branch[];
};

/**
 * Träd över hela lagerhistoriken för alla produkter — byggt enbart från
 * stock_movements (lagrets enda sanning), så även nollställda produkter
 * och avslutade partier går att följa bakåt i tiden.
 */
export default function AllProductsHistoryTree({
  onTraceLot,
}: {
  onTraceLot?: (lotId: string, label: string) => void;
}) {
  const [q, setQ] = useState("");
  const [shape, setShape] = useState<"graph" | "list">("graph");
  const [openProducts, setOpenProducts] = useState<Record<string, boolean>>({});
  const [openBranches, setOpenBranches] = useState<Record<string, boolean>>({});

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["all_products_history_tree"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "id, created_at, quantity_kg, movement_type, note, product_id, lot_id, reference_type, products(name, sku), storage_locations(name, stores!storage_locations_store_id_fkey(name)), lots(lot_number), staff(first_name, last_name)",
        )
        .order("created_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const nodes = useMemo<Node[]>(() => {
    const map = new Map<string, Node>();
    for (const m of movements) {
      const pid = m.product_id as string;
      if (!pid) continue;
      const qty = Number(m.quantity_kg) || 0;
      let node = map.get(pid);
      if (!node) {
        node = {
          productId: pid,
          name: m.products?.name || "Okänd produkt",
          sku: m.products?.sku ?? null,
          in: 0,
          out: 0,
          balance: 0,
          first: m.created_at,
          last: m.created_at,
          branches: [],
        };
        map.set(pid, node);
      }
      if (qty >= 0) node.in += qty;
      else node.out += Math.abs(qty);
      node.balance += qty;
      node.last = m.created_at;

      const bKey = (m.lot_id as string | null) || "no-lot";
      let branch = node.branches.find((b) => b.key === bKey);
      if (!branch) {
        branch = {
          key: bKey,
          label: m.lots?.lot_number || "Utan parti",
          lotId: (m.lot_id as string | null) ?? null,
          events: [],
          balance: 0,
        };
        node.branches.push(branch);
      }
      branch.balance += qty;
      branch.events.push({
        id: m.id,
        created_at: m.created_at,
        qty,
        type: m.movement_type,
        label: movementLabel(m.movement_type),
        lot: m.lots?.lot_number ?? null,
        lotId: (m.lot_id as string | null) ?? null,
        location: [m.storage_locations?.stores?.name, m.storage_locations?.name].filter(Boolean).join(" · "),
        who: m.staff ? `${m.staff.first_name ?? ""} ${m.staff.last_name ?? ""}`.trim() : "",
        reference: (m.reference_type as string | null) ?? null,
        note: (m.note as string | null) ?? null,
      });
    }
    return [...map.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
  }, [movements]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return nodes;
    return nodes.filter((n) =>
      [n.name, n.sku, ...n.branches.map((b) => b.label)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [nodes, q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök produkt eller parti i hela historiken"
          className="h-9 pl-7 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant={shape === "graph" ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShape("graph")}
        >
          <Network className="mr-1 h-3.5 w-3.5" />
          Visuell graf
        </Button>
        <Button
          variant={shape === "list" ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShape("list")}
        >
          Textlista
        </Button>
        <span className="text-[10px] text-muted-foreground">Öppna en produkt för att se trädet</span>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Hämtar historik…</p>}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={<GitBranch className="h-4 w-4" />}
          title={q.trim() ? "Ingen produkt matchar sökningen" : "Ingen historik ännu"}
          description="Trädet byggs av inleveranser, omvandlingar, överföringar, försäljning, svinn och inventering."
          actionLabel={q.trim() ? "Rensa sökning" : undefined}
          onAction={q.trim() ? () => setQ("") : undefined}
        />
      )}

      {filtered.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_92px] items-center gap-2 border-b border-border px-2 py-1.5 text-[10px] uppercase text-muted-foreground sm:grid-cols-[1fr_110px_110px_96px]">
              <span>Produkt</span>
              <span className="hidden text-right sm:block">In</span>
              <span className="hidden text-right sm:block">Ut</span>
              <span className="text-right">Saldo</span>
            </div>
            <div className="divide-y divide-border/50">
              {filtered.map((n) => {
                const isOpen = !!openProducts[n.productId];
                return (
                  <div key={n.productId}>
                    <button
                      type="button"
                      onClick={() => setOpenProducts((p) => ({ ...p, [n.productId]: !p[n.productId] }))}
                      className="grid w-full grid-cols-[1fr_92px] items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/40 sm:grid-cols-[1fr_110px_110px_96px]"
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 truncate text-foreground">{n.name}</span>
                        <Badge variant="secondary" className="ml-1 shrink-0 text-[10px]">
                          {n.branches.length} parti
                        </Badge>
                      </span>
                      <span className="hidden text-right font-mono tabular-nums text-success sm:block">
                        +{nf(n.in)}
                      </span>
                      <span className="hidden text-right font-mono tabular-nums text-destructive sm:block">
                        −{nf(n.out)}
                      </span>
                      <span className="text-right font-mono tabular-nums text-foreground">{nf(n.balance)}</span>
                    </button>

                    {isOpen && shape === "graph" && (
                      <div className="border-l-2 border-border/60 bg-muted/20 px-2 py-2 sm:ml-4">
                        <ProductMovementDag
                          productName={n.name}
                          branches={n.branches.map((b) => ({
                            key: b.key,
                            label: b.label,
                            lotId: b.lotId,
                            events: b.events,
                          }))}
                          onTraceLot={onTraceLot}
                        />
                      </div>
                    )}

                    {isOpen && shape === "list" && (
                      <div className="space-y-1 border-l-2 border-border/60 bg-muted/20 px-2 py-1.5 sm:ml-4">
                        {n.branches.map((b) => {
                          const bk = `${n.productId}:${b.key}`;
                          const bOpen = !!openBranches[bk];
                          return (
                            <div key={bk} className="rounded-md border border-border/50 bg-background">
                              <div className="flex items-center gap-1 px-2 py-1">
                                <button
                                  type="button"
                                  onClick={() => setOpenBranches((p) => ({ ...p, [bk]: !p[bk] }))}
                                  className="flex min-w-0 flex-1 items-center gap-1 text-left text-[11px]"
                                >
                                  {bOpen ? (
                                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="min-w-0 truncate font-medium text-foreground">{b.label}</span>
                                  <span className="ml-auto shrink-0 font-mono tabular-nums text-muted-foreground">
                                    {nf(b.balance)} · {b.events.length} händelser
                                    {b.events.length > 0
                                      ? ` · orörd ${sinceNow(b.events[b.events.length - 1].created_at)}`
                                      : ""}
                                  </span>
                                </button>
                                {b.lotId && onTraceLot && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 shrink-0"
                                    title="Visa kedjan i graf"
                                    onClick={() => onTraceLot(b.lotId!, b.label)}
                                  >
                                    <GitBranch className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>

                              {bOpen && (
                                <div className="divide-y divide-border/40 border-t border-border/40">
                                  {b.events.map((e, i) => {
                                    const saldo = b.events.slice(0, i + 1).reduce((s, x) => s + x.qty, 0);
                                    return (
                                      <div key={e.id} className="px-2 py-1 text-[11px]">
                                        <div className="flex items-center gap-1.5">
                                          {e.qty >= 0 ? (
                                            <ArrowDownRight className="h-3 w-3 shrink-0 text-success" />
                                          ) : (
                                            <ArrowUpRight className="h-3 w-3 shrink-0 text-destructive" />
                                          )}
                                          <span className="min-w-0 truncate text-foreground">
                                            {movementLabel(e.type)}
                                          </span>
                                          <span
                                            className={`ml-auto shrink-0 font-mono tabular-nums ${
                                              e.qty < 0 ? "text-destructive" : "text-success"
                                            }`}
                                          >
                                            {e.qty >= 0 ? "+" : "−"}
                                            {nf(Math.abs(e.qty))}
                                          </span>
                                          <span className="w-14 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
                                            {nf(saldo)}
                                          </span>
                                        </div>
                                        <div className="truncate text-[10px] text-muted-foreground">
                                          {stamp(e.created_at)}
                                          {e.location ? ` · ${e.location}` : ""}
                                          {` · ${e.who || "System"}`}
                                          {e.reference ? ` · ${e.reference}` : ""}
                                          {e.note ? ` · ${e.note}` : ""}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
