import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { movementLabel } from "@/hooks/useStockMovements";
import { Network, Search, Boxes, ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react";

const nf = (n: number, d = 1) =>
  Number(n)
    .toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d })
    .replace(/\u00a0/g, " ");

const money = (n: number | null | undefined, currency: string) =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? "—"
    : `${nf(Number(n), 2)} ${currency}`;

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

type Prod = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string | null;
  family: string | null;
  cost_price: number | null;
  wholesale_price: number | null;
  retail_suggested: number | null;
  day_price: number | null;
  shelf_life_days: number | null;
  weight_per_piece: number | null;
  active: boolean;
};

type Stock = { productId: string; location: string; quantity: number; expiry: string | null };

type Mv = {
  productId: string;
  type: string;
  qty: number;
  created_at: string;
  who: string;
  location: string;
  lot: string | null;
};

type NodeP = {
  p: Prod;
  stock: number;
  places: Stock[];
  events: Mv[];
  x: number;
  y: number;
  r: number;
};

const R_MIN = 5;
const R_MAX = 15;

/**
 * Ett enda nätverk över alla produkter i systemet — kategorinav i mitten,
 * produkter som noder med nuvarande lagersaldo, priser och all historik
 * (inventering, omvandling, försäljning, svinn). Varje produkt som läggs in
 * i produktregistret finns med i nätverket direkt, även utan lagersaldo.
 */
export default function ProductNetworkGraph({ currency = "SEK" }: { currency?: string }) {
  const [q, setQ] = useState("");
  const [onlyStock, setOnlyStock] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 0, y: 0, w: 1040, h: 900 });
  const [dragPos, setDragPos] = useState<Record<string, { x: number; y: number }>>({});
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const nodeDrag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  /** Skärmkoordinat → graf-koordinat. */
  const toGraph = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: view.x + ((clientX - rect.left) / rect.width) * view.w,
        y: view.y + ((clientY - rect.top) / rect.height) * view.h,
      };
    },
    [view],
  );

  const zoomAt = useCallback((factor: number, gx?: number, gy?: number) => {
    setView((v) => {
      const w = Math.min(2600, Math.max(220, v.w * factor));
      const h = w * (v.h / v.w);
      const px = gx ?? v.x + v.w / 2;
      const py = gy ?? v.y + v.h / 2;
      const rx = (px - v.x) / v.w;
      const ry = (py - v.y) / v.h;
      return { x: px - rx * w, y: py - ry * h, w, h };
    });
  }, []);

  const resetView = useCallback(() => {
    setView({ x: 0, y: 0, w: 1040, h: 900 });
    setDragPos({});
  }, []);

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["product_network_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, sku, category, unit, cost_price, wholesale_price, retail_suggested, day_price, shelf_life_days, weight_per_piece, active, product_families(name)",
        )
        .order("name")
        .limit(2000);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        sku: r.sku ?? null,
        category: r.category ?? null,
        unit: r.unit ?? null,
        family: r.product_families?.name ?? null,
        cost_price: r.cost_price,
        wholesale_price: r.wholesale_price,
        retail_suggested: r.retail_suggested,
        day_price: r.day_price,
        shelf_life_days: r.shelf_life_days,
        weight_per_piece: r.weight_per_piece,
        active: !!r.active,
      })) as Prod[];
    },
  });

  const { data: stockRows = [] } = useQuery({
    queryKey: ["product_network_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock_locations")
        .select(
          "product_id, quantity, expiry_date, storage_locations(name, stores!storage_locations_store_id_fkey(name))",
        )
        .neq("quantity", 0)
        .limit(3000);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        productId: r.product_id,
        quantity: Number(r.quantity) || 0,
        expiry: r.expiry_date ?? null,
        location: [r.storage_locations?.stores?.name, r.storage_locations?.name].filter(Boolean).join(" · "),
      })) as Stock[];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["product_network_movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select(
          "product_id, movement_type, quantity_kg, created_at, lots(lot_number), storage_locations(name, stores!storage_locations_store_id_fkey(name)), staff(first_name, last_name)",
        )
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        productId: r.product_id,
        type: r.movement_type,
        qty: Number(r.quantity_kg) || 0,
        created_at: r.created_at,
        who: r.staff ? `${r.staff.first_name ?? ""} ${r.staff.last_name ?? ""}`.trim() : "",
        location: [r.storage_locations?.stores?.name, r.storage_locations?.name].filter(Boolean).join(" · "),
        lot: r.lots?.lot_number ?? null,
      })) as Mv[];
    },
  });

  /** Omvandlingar mellan produkter — kanter i nätverket. */
  const { data: transforms = [] } = useQuery({
    queryKey: ["product_network_transforms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lot_transformations")
        .select("created_at, quantity_in_kg, quantity_out_kg, from_lot:lots!lot_transformations_from_lot_id_fkey(product_id), to_lot:lots!lot_transformations_to_lot_id_fkey(product_id)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) return [] as { from: string; to: string }[];
      return (data || [])
        .map((r: any) => ({ from: r.from_lot?.product_id, to: r.to_lot?.product_id }))
        .filter((e: any) => e.from && e.to && e.from !== e.to) as { from: string; to: string }[];
    },
  });

  const byProduct = useMemo(() => {
    const stock = new Map<string, Stock[]>();
    for (const s of stockRows) stock.set(s.productId, [...(stock.get(s.productId) || []), s]);
    const ev = new Map<string, Mv[]>();
    for (const m of movements) {
      if (!m.productId) continue;
      ev.set(m.productId, [...(ev.get(m.productId) || []), m]);
    }
    return { stock, ev };
  }, [stockRows, movements]);

  const filteredProducts = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => {
      if (onlyStock && !(byProduct.stock.get(p.id) || []).length) return false;
      if (!s) return true;
      return [p.name, p.sku, p.category, p.family].filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
  }, [products, q, onlyStock, byProduct]);

  /** Radiell layout: rot i mitten, ett nav per kategori, produkter runt navet. */
  const layout = useMemo(() => {
    const groups = new Map<string, Prod[]>();
    for (const p of filteredProducts) {
      const key = p.category?.trim() || "Utan kategori";
      groups.set(key, [...(groups.get(key) || []), p]);
    }
    const cats = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const maxStock = Math.max(
      1,
      ...filteredProducts.map((p) => (byProduct.stock.get(p.id) || []).reduce((s, r) => s + r.quantity, 0)),
    );

    const cx = 520;
    const cy = 440;
    const hubR = cats.length <= 1 ? 0 : 250;
    const hubs: { name: string; x: number; y: number; count: number }[] = [];
    const nodes: NodeP[] = [];

    cats.forEach(([cat, list], ci) => {
      const a = (ci / Math.max(1, cats.length)) * Math.PI * 2 - Math.PI / 2;
      const hx = cx + Math.cos(a) * hubR;
      const hy = cy + Math.sin(a) * hubR;
      const isCollapsed = collapsed.has(cat);
      hubs.push({ name: cat, x: hx, y: hy, count: list.length, collapsed: isCollapsed });

      const ring = Math.max(78, Math.min(190, 26 + list.length * 9));
      list.forEach((p, pi) => {
        const pa = a - Math.PI / 3 + (pi / Math.max(1, list.length - 1 || 1)) * ((Math.PI * 2) / 3);
        const wobble = pi % 2 === 0 ? 0 : 34;
        const places = byProduct.stock.get(p.id) || [];
        const stock = places.reduce((s, r) => s + r.quantity, 0);
        nodes.push({
          p,
          stock,
          places,
          events: byProduct.ev.get(p.id) || [],
          x: hx + Math.cos(pa) * (ring + wobble),
          y: hy + Math.sin(pa) * (ring + wobble),
          r: stock > 0 ? R_MIN + (Math.min(stock, maxStock) / maxStock) * (R_MAX - R_MIN) : R_MIN - 1,
          hidden: isCollapsed,
        });
      });
    });

    const pos = new Map(nodes.map((n) => [n.p.id, n]));
    const edges = transforms.filter((t) => pos.has(t.from) && pos.has(t.to));
    return { cx, cy, hubs, nodes, pos, edges, width: 1040, height: 900 };
  }, [filteredProducts, byProduct, transforms, collapsed]);

  /** Nodposition med hänsyn till manuell dragning. */
  const posOf = useCallback(
    (n: NodeP) => dragPos[n.p.id] ?? { x: n.x, y: n.y },
    [dragPos],
  );

  /** Produkter som hör samman med den markerade/hovrade noden. */
  const focusId = hover ?? selected;
  const related = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    for (const e of layout.edges) {
      if (e.from === focusId) set.add(e.to);
      if (e.to === focusId) set.add(e.from);
    }
    const cat = layout.pos.get(focusId)?.p.category?.trim() || "Utan kategori";
    return { set, cat };
  }, [focusId, layout]);

  const active = selected ? layout.pos.get(selected) : null;

  const summary = useMemo(() => {
    const withStock = layout.nodes.filter((n) => n.stock > 0).length;
    const total = layout.nodes.reduce((s, n) => s + n.stock, 0);
    return { withStock, total, count: layout.nodes.length };
  }, [layout]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök produkt, kategori eller familj i nätverket"
          className="h-9 pl-7 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant={onlyStock ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setOnlyStock((v) => !v)}
        >
          <Boxes className="mr-1 h-3.5 w-3.5" />
          Bara med saldo
        </Button>
        <Badge variant="secondary" className="text-[10px]">
          {summary.count} produkter · {summary.withStock} med saldo · {nf(summary.total)} i lager
        </Badge>
      </div>

      {loadingProducts && <p className="text-sm text-muted-foreground">Bygger nätverket…</p>}

      {!loadingProducts && layout.nodes.length === 0 && (
        <EmptyState
          icon={<Network className="h-4 w-4" />}
          title="Inga produkter i nätverket"
          description="Nätverket visar alla produkter i produktregistret med saldo, priser, inventeringar och omvandlingar."
          actionLabel={q.trim() || onlyStock ? "Rensa filter" : undefined}
          onAction={
            q.trim() || onlyStock
              ? () => {
                  setQ("");
                  setOnlyStock(false);
                }
              : undefined
          }
        />
      )}

      {layout.nodes.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <div className="overflow-auto rounded-lg bg-gradient-to-b from-muted/30 to-background">
              <svg width={layout.width} height={layout.height} className="block">
                <defs>
                  <marker id="pn-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0 0 L8 4 L0 8 z" className="fill-primary" />
                  </marker>
                </defs>

                {/* Kanter: rot → kategorinav */}
                {layout.hubs.map((h) => (
                  <line
                    key={`hl-${h.name}`}
                    x1={layout.cx}
                    y1={layout.cy}
                    x2={h.x}
                    y2={h.y}
                    className="stroke-border"
                    strokeWidth={1.5}
                  />
                ))}

                {/* Kanter: kategorinav → produkt */}
                {layout.nodes.map((n) => {
                  const hub = layout.hubs.find((h) => h.name === (n.p.category?.trim() || "Utan kategori"));
                  if (!hub) return null;
                  return (
                    <line
                      key={`pl-${n.p.id}`}
                      x1={hub.x}
                      y1={hub.y}
                      x2={n.x}
                      y2={n.y}
                      className="stroke-border"
                      strokeWidth={0.8}
                      opacity={0.6}
                    />
                  );
                })}

                {/* Kanter: omvandling mellan produkter */}
                {layout.edges.map((e, i) => {
                  const a = layout.pos.get(e.from)!;
                  const b = layout.pos.get(e.to)!;
                  const mx = (a.x + b.x) / 2;
                  const my = (a.y + b.y) / 2 - 40;
                  return (
                    <path
                      key={`t-${i}`}
                      d={`M${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                      className="stroke-primary"
                      strokeWidth={1.4}
                      strokeDasharray="4 3"
                      fill="none"
                      markerEnd="url(#pn-arrow)"
                      opacity={0.7}
                    />
                  );
                })}

                {/* Rot */}
                <g>
                  <circle cx={layout.cx} cy={layout.cy} r={30} className="fill-primary/20 stroke-primary/70" strokeWidth={1.5} />
                  <text x={layout.cx} y={layout.cy + 4} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
                    Lager
                  </text>
                </g>

                {/* Kategorinav */}
                {layout.hubs.map((h) => (
                  <g key={`h-${h.name}`}>
                    <circle cx={h.x} cy={h.y} r={18} className="fill-muted stroke-border" strokeWidth={1} />
                    <text x={h.x} y={h.y + 3} textAnchor="middle" className="fill-foreground text-[9px] font-medium">
                      {h.count}
                    </text>
                    <text x={h.x} y={h.y - 24} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                      {h.name.length > 18 ? `${h.name.slice(0, 17)}…` : h.name}
                    </text>
                  </g>
                ))}

                {/* Produkter */}
                {layout.nodes.map((n) => {
                  const isActive = selected === n.p.id;
                  const tone = n.stock > 0 ? "text-success" : n.p.active ? "text-muted-foreground" : "text-destructive";
                  return (
                    <g
                      key={n.p.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(isActive ? null : n.p.id)}
                    >
                      <circle cx={n.x} cy={n.y} r={Math.max(3, n.r)} className={`${tone} fill-current`} opacity={0.9} />
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={Math.max(3, n.r) + 5}
                        className={`${tone} stroke-current`}
                        strokeWidth={1}
                        fill="none"
                        opacity={isActive ? 1 : 0.25}
                      />
                      <text x={n.x} y={n.y - n.r - 8} textAnchor="middle" className="fill-foreground text-[9px]">
                        {n.p.name.length > 20 ? `${n.p.name.slice(0, 19)}…` : n.p.name}
                      </text>
                      {n.stock > 0 && (
                        <text
                          x={n.x}
                          y={n.y + n.r + 12}
                          textAnchor="middle"
                          className="fill-muted-foreground font-mono text-[9px]"
                        >
                          {nf(n.stock)} {n.p.unit || ""}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card className="shadow-card">
          <CardContent className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{active.p.name}</span>
              {active.p.sku && <Badge variant="outline" className="text-[10px]">{active.p.sku}</Badge>}
              {active.p.family && <Badge variant="secondary" className="text-[10px]">{active.p.family}</Badge>}
              {!active.p.active && <Badge variant="destructive" className="text-[10px]">Inaktiv</Badge>}
              <span className="ml-auto font-mono text-sm tabular-nums text-foreground">
                {nf(active.stock)} {active.p.unit || ""}
              </span>
            </div>

            <div className="grid gap-1 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-border/60 p-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">Inköpspris</div>
                <div className="font-mono tabular-nums">{money(active.p.cost_price, currency)}</div>
              </div>
              <div className="rounded-md border border-border/60 p-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">Grossistpris</div>
                <div className="font-mono tabular-nums">{money(active.p.wholesale_price, currency)}</div>
              </div>
              <div className="rounded-md border border-border/60 p-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">Butikspris</div>
                <div className="font-mono tabular-nums">{money(active.p.retail_suggested, currency)}</div>
              </div>
              <div className="rounded-md border border-border/60 p-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">Dagspris</div>
                <div className="font-mono tabular-nums">{money(active.p.day_price, currency)}</div>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground">
              Enhet {active.p.unit || "—"}
              {active.p.weight_per_piece ? ` · ${nf(Number(active.p.weight_per_piece), 2)} kg/st` : ""}
              {active.p.shelf_life_days ? ` · hållbarhet ${active.p.shelf_life_days} dagar` : ""}
              {active.p.category ? ` · ${active.p.category}` : ""}
            </div>

            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Lagerplatser</div>
              {active.places.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Inget saldo just nu</p>
              ) : (
                <div className="divide-y divide-border/40">
                  {active.places.map((s, i) => (
                    <div key={`${s.location}-${i}`} className="flex items-center gap-2 py-0.5 text-[11px]">
                      <span className="min-w-0 truncate">{s.location || "Okänd plats"}</span>
                      <span className="ml-auto font-mono tabular-nums">
                        {nf(s.quantity)} {active.p.unit || ""}
                      </span>
                      {s.expiry && <span className="text-muted-foreground">t.o.m. {s.expiry}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase text-muted-foreground">
                Händelser ({active.events.length})
              </div>
              {active.events.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Ingen historik ännu</p>
              ) : (
                <div className="max-h-64 divide-y divide-border/40 overflow-auto">
                  {active.events.slice(0, 60).map((e, i) => (
                    <div key={i} className="py-0.5 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 truncate text-foreground">{movementLabel(e.type)}</span>
                        <span
                          className={`ml-auto shrink-0 font-mono tabular-nums ${
                            e.qty < 0 ? "text-destructive" : "text-success"
                          }`}
                        >
                          {e.qty >= 0 ? "+" : "−"}
                          {nf(Math.abs(e.qty))}
                        </span>
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {stamp(e.created_at)}
                        {e.location ? ` · ${e.location}` : ""}
                        {` · ${e.who || "System"}`}
                        {e.lot ? ` · ${e.lot}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
