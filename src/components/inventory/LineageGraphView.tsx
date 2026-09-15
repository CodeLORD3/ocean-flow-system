import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { GitBranch, Search, Split, Merge, RotateCcw } from "lucide-react";

/** Nodtyper och deras kategorifärger — samma färgspråk som designreferensen. */
const CATEGORY: Record<string, { label: string; ring: string; chip: string; dot: string }> = {
  inkop: { label: "Inköp", ring: "border-blue-500/60", chip: "bg-blue-500/15 text-blue-300", dot: "#3b82f6" },
  batch: { label: "Mottagning/Batch", ring: "border-cyan-500/60", chip: "bg-cyan-500/15 text-cyan-300", dot: "#06b6d4" },
  lager: { label: "Lager", ring: "border-slate-400/60", chip: "bg-slate-400/15 text-slate-300", dot: "#94a3b8" },
  omvandling: { label: "Omvandling", ring: "border-amber-500/60", chip: "bg-amber-500/15 text-amber-300", dot: "#f59e0b" },
  transport: { label: "Transport", ring: "border-indigo-500/60", chip: "bg-indigo-500/15 text-indigo-300", dot: "#6366f1" },
  butik: { label: "Butik", ring: "border-emerald-500/60", chip: "bg-emerald-500/15 text-emerald-300", dot: "#10b981" },
  kundorder: { label: "Kundorder", ring: "border-purple-500/60", chip: "bg-purple-500/15 text-purple-300", dot: "#a855f7" },
  forsaljning: { label: "Försäljning", ring: "border-pink-500/60", chip: "bg-pink-500/15 text-pink-300", dot: "#ec4899" },
  svinn: { label: "Svinn", ring: "border-red-500/60", chip: "bg-red-500/15 text-red-300", dot: "#ef4444" },
  inventering: { label: "Inventering", ring: "border-teal-500/60", chip: "bg-teal-500/15 text-teal-300", dot: "#14b8a6" },
};

/** Kolumnordning i grafen, från ursprung till slutkund. */
const COLUMN_ORDER = [
  "inkop",
  "batch",
  "omvandling",
  "inventering",
  "lager",
  "transport",
  "butik",
  "kundorder",
  "forsaljning",
  "svinn",
];

interface LineageNode {
  type: string;
  id: string;
  category: string;
  title: string;
  subtitle?: string | null;
  quantity?: number | null;
  unit?: string | null;
  amount?: number | null;
  date?: string | null;
  meta?: Record<string, any> | null;
}

interface LineageEdge {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  relation?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

const key = (type: string, id: string) => `${type}:${id}`;
const nf = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");
const dateSv = (v?: string | null) => (v ? new Date(v).toLocaleDateString("sv-SE") : "");

interface Props {
  /** Startparti, annars väljs det via sökrutan. */
  startLotId?: string | null;
  currency?: string;
}

/** Spårbarhetsgraf: läser get_lineage och ritar kedjan bakåt och framåt. */
export default function LineageGraphView({ startLotId = null, currency = "SEK" }: Props) {
  const [q, setQ] = useState("");
  const [root, setRoot] = useState<{ type: string; id: string } | null>(
    startLotId ? { type: "lot", id: startLotId } : null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const { data: lots = [] } = useQuery({
    queryKey: ["lineage_lot_picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lots")
        .select("id, lot_number, commercial_name, quantity_kg, created_at, products(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (!root && lots.length) setRoot({ type: "lot", id: lots[0].id });
  }, [lots, root]);

  const { data: lineage, isLoading } = useQuery({
    queryKey: ["lineage", root?.type, root?.id],
    enabled: !!root,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_lineage" as any, {
        p_entity_type: root!.type,
        p_entity_id: root!.id,
      });
      if (error) throw error;
      return data as unknown as { nodes: LineageNode[]; edges: LineageEdge[] };
    },
  });

  const nodes = lineage?.nodes ?? [];
  const edges = lineage?.edges ?? [];

  const filteredLots = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return lots
      .filter((l) =>
        [l.lot_number, l.commercial_name, l.products?.name]
          .filter(Boolean)
          .some((v: string) => String(v).toLowerCase().includes(s)),
      )
      .slice(0, 8);
  }, [lots, q]);

  /** Kolumnlayout: nodtyp/kategori bestämmer kolumn, index bestämmer rad. */
  const layout = useMemo(() => {
    const columns = COLUMN_ORDER.filter((c) => nodes.some((n) => n.category === c));
    const colW = 220;
    const rowH = 116;
    const pos = new Map<string, { x: number; y: number; node: LineageNode }>();
    columns.forEach((c, ci) => {
      const inCol = nodes.filter((n) => n.category === c);
      inCol.forEach((n, ri) => {
        pos.set(key(n.type, n.id), { x: ci * colW, y: ri * rowH, node: n });
      });
    });
    const maxRows = Math.max(1, ...columns.map((c) => nodes.filter((n) => n.category === c).length));
    return { pos, columns, colW, rowH, width: Math.max(1, columns.length) * colW, height: maxRows * rowH };
  }, [nodes]);

  const outCount = useMemo(() => {
    const m = new Map<string, number>();
    edges.forEach((e) => m.set(key(e.from_type, e.from_id), (m.get(key(e.from_type, e.from_id)) ?? 0) + 1));
    return m;
  }, [edges]);
  const inCount = useMemo(() => {
    const m = new Map<string, number>();
    edges.forEach((e) => m.set(key(e.to_type, e.to_id), (m.get(key(e.to_type, e.to_id)) ?? 0) + 1));
    return m;
  }, [edges]);

  /** Bidirektionell markering: alla uppströms och nedströms noder från vald nod. */
  const related = useMemo(() => {
    if (!selected) return null;
    const up = new Set<string>();
    const down = new Set<string>();
    const walk = (k: string, dir: "up" | "down", seen: Set<string>) => {
      edges.forEach((e) => {
        const from = key(e.from_type, e.from_id);
        const to = key(e.to_type, e.to_id);
        if (dir === "down" && from === k && !seen.has(to)) {
          seen.add(to);
          walk(to, dir, seen);
        }
        if (dir === "up" && to === k && !seen.has(from)) {
          seen.add(from);
          walk(from, dir, seen);
        }
      });
    };
    walk(selected, "up", up);
    walk(selected, "down", down);
    return { up, down, all: new Set<string>([selected, ...up, ...down]) };
  }, [selected, edges]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  void size;

  const selNode = selected ? layout.pos.get(selected)?.node : null;
  const directSources = selected
    ? edges.filter((e) => key(e.to_type, e.to_id) === selected).map((e) => key(e.from_type, e.from_id))
    : [];
  const directTargets = selected
    ? edges.filter((e) => key(e.from_type, e.from_id) === selected).map((e) => key(e.to_type, e.to_id))
    : [];

  const nodeCard = (k: string) => {
    const p = layout.pos.get(k);
    if (!p) return null;
    const n = p.node;
    const cat = CATEGORY[n.category] ?? CATEGORY.lager;
    const dim = related && !related.all.has(k);
    const isSel = selected === k;
    return (
      <button
        key={k}
        type="button"
        onClick={() => setSelected(isSel ? null : k)}
        onDoubleClick={() => setRoot({ type: n.type, id: n.id })}
        className={`absolute w-[204px] rounded-md border bg-card p-2 text-left transition-opacity ${cat.ring} ${
          isSel ? "ring-2 ring-primary" : ""
        } ${dim ? "opacity-25" : "opacity-100"}`}
        style={{ left: p.x, top: p.y }}
      >
        <div className="flex items-center justify-between gap-1">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cat.chip}`}>{cat.label}</span>
          <span className="flex gap-1">
            {(outCount.get(k) ?? 0) > 1 && (
              <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[9px]">
                <Split className="h-2.5 w-2.5" /> SPLIT
              </Badge>
            )}
            {(inCount.get(k) ?? 0) > 1 && (
              <Badge variant="outline" className="h-4 gap-0.5 px-1 text-[9px]">
                <Merge className="h-2.5 w-2.5" /> MERGE
              </Badge>
            )}
          </span>
        </div>
        <div className="mt-1 truncate text-xs font-semibold text-foreground">{n.title}</div>
        {n.subtitle && <div className="truncate text-[10px] text-muted-foreground">{n.subtitle}</div>}
        <div className="mt-1 flex items-center justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
          <span>
            {n.quantity != null ? `${nf(Number(n.quantity))} ${n.unit ?? "kg"}` : ""}
            {n.amount != null ? ` · ${nf(Number(n.amount), 2)} ${currency}` : ""}
          </span>
          <span>{dateSv(n.date)}</span>
        </div>
      </button>
    );
  };

  const arrows = edges
    .map((e, i) => {
      const a = layout.pos.get(key(e.from_type, e.from_id));
      const b = layout.pos.get(key(e.to_type, e.to_id));
      if (!a || !b) return null;
      const x1 = a.x + 204;
      const y1 = a.y + 40;
      const x2 = b.x;
      const y2 = b.y + 40;
      const mid = (x1 + x2) / 2;
      const dim =
        related &&
        !(related.all.has(key(e.from_type, e.from_id)) && related.all.has(key(e.to_type, e.to_id)));
      return (
        <g key={i} opacity={dim ? 0.15 : 0.85}>
          <path
            d={`M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`}
            fill="none"
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1.5}
            markerEnd="url(#lineage-arrow)"
          />
        </g>
      );
    })
    .filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sök parti att spåra (partinummer, art, produkt)"
          className="h-9 pl-8 text-sm"
        />
        {filteredLots.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
            {filteredLots.map((l) => (
              <button
                key={l.id}
                type="button"
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                onClick={() => {
                  setRoot({ type: "lot", id: l.id });
                  setSelected(null);
                  setQ("");
                }}
              >
                <span className="truncate">
                  {l.lot_number} · {l.commercial_name ?? l.products?.name ?? ""}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {nf(Number(l.quantity_kg ?? 0))} kg
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <Card>
          <CardContent className="p-2">
            {isLoading ? (
              <p className="p-6 text-center text-xs text-muted-foreground">Läser spårbarhetskedjan…</p>
            ) : nodes.length === 0 ? (
              <EmptyState
                icon={GitBranch}
                title="Ingen kedja att visa"
                description="Sök upp ett parti ovan för att rita dess spårbarhetskedja."
              />
            ) : (
              <div ref={wrapRef} className="overflow-auto">
                <div className="relative" style={{ width: layout.width + 40, height: layout.height + 40 }}>
                  <svg className="absolute inset-0" width={layout.width + 40} height={layout.height + 40}>
                    <defs>
                      <marker id="lineage-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                        <path d="M0,0 L7,3 L0,6 z" fill="currentColor" className="text-muted-foreground" />
                      </marker>
                    </defs>
                    {arrows}
                  </svg>
                  {[...layout.pos.keys()].map((k) => nodeCard(k))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-3 text-xs">
            {!selNode ? (
              <p className="text-muted-foreground">Klicka på en nod för att se dess källor och mål.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${(CATEGORY[selNode.category] ?? CATEGORY.lager).chip}`}>
                    {(CATEGORY[selNode.category] ?? CATEGORY.lager).label}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1 text-[10px]"
                    onClick={() => setRoot({ type: selNode.type, id: selNode.id })}
                  >
                    <RotateCcw className="h-3 w-3" /> Spåra härifrån
                  </Button>
                </div>
                <div className="text-sm font-semibold text-foreground">{selNode.title}</div>
                {selNode.subtitle && <div className="text-muted-foreground">{selNode.subtitle}</div>}
                <div className="flex gap-3 font-mono tabular-nums text-muted-foreground">
                  <span>{related ? related.up.size : 0} uppströms</span>
                  <span>{related ? related.down.size : 0} nedströms</span>
                </div>
                {selNode.meta && (
                  <div className="space-y-0.5 border-t pt-2">
                    {Object.entries(selNode.meta)
                      .filter(([, v]) => v !== null && v !== "" && v !== false)
                      .map(([k2, v]) => (
                        <div key={k2} className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{k2.replace(/_/g, " ")}</span>
                          <span className="truncate text-right text-foreground">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                )}
                <div className="border-t pt-2">
                  <p className="mb-1 font-medium text-foreground">Direkta källor</p>
                  {directSources.length === 0 ? (
                    <p className="text-muted-foreground">Ingen</p>
                  ) : (
                    directSources.map((k2) => (
                      <button
                        key={k2}
                        type="button"
                        onClick={() => setSelected(k2)}
                        className="block w-full truncate text-left text-primary hover:underline"
                      >
                        {layout.pos.get(k2)?.node.title ?? k2}
                      </button>
                    ))
                  )}
                </div>
                <div className="border-t pt-2">
                  <p className="mb-1 font-medium text-foreground">Direkta mål</p>
                  {directTargets.length === 0 ? (
                    <p className="text-muted-foreground">Ingen</p>
                  ) : (
                    directTargets.map((k2) => (
                      <button
                        key={k2}
                        type="button"
                        onClick={() => setSelected(k2)}
                        className="block w-full truncate text-left text-primary hover:underline"
                      >
                        {layout.pos.get(k2)?.node.title ?? k2}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Kassaförsäljning (SumUp) saknas i databasen — kedjan avslutas vid kundorder eller butik.
      </p>
    </div>
  );
}
