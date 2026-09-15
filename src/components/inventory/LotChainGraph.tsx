import { useMemo, useState } from "react";
import { movementLabel } from "@/hooks/useStockMovements";
import { gapBetween, sinceNow, timeSv } from "@/lib/dwell";

export interface ChainMovement {
  id: string;
  movement_type: string;
  quantity_kg: number | string;
  created_at: string;
  note?: string | null;
  reference_id?: string | null;
  storage_locations?: { name?: string | null } | null;
  staff?: { first_name?: string | null; last_name?: string | null } | null;
}

interface Props {
  /** Rörelser i tidsordning för det valda partiet. */
  movements: ChainMovement[];
  lotNumber?: string | null;
  productName?: string | null;
  /** Inköpspris per kilo, för värdet på varje händelse. */
  unitCost?: number | null;
  currency?: string;
}

const nf = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");

const namnPa = (m: ChainMovement) =>
  m.staff ? `${m.staff.first_name ?? ""} ${m.staff.last_name ?? ""}`.trim() || "System" : "System";

const datumSv = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { weekday: "short", day: "2-digit", month: "2-digit" });

const arSv = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { year: "numeric" });

/**
 * Flödesträd för ett parti: en lodrät tidslinje där varje händelse är ett eget
 * kort med datum, tid, mängd, saldo, plats och person. Inleveranser ligger i
 * stammen, uttag grenar in åt höger, och tiden mellan händelserna står på
 * linjen. Ingen text kan krocka eftersom allt ligger i ett rutnät.
 */
export default function LotChainGraph({
  movements,
  lotNumber,
  productName,
  unitCost = null,
  currency = "SEK",
}: Props) {
  const [valdId, setValdId] = useState<string | null>(null);

  const noder = useMemo(() => {
    let saldo = 0;
    return movements.map((m, i) => {
      const kg = Number(m.quantity_kg || 0);
      saldo += kg;
      return {
        m,
        kg,
        saldo,
        gren: kg < 0,
        gap: i === 0 ? "" : gapBetween(movements[i - 1].created_at, m.created_at),
      };
    });
  }, [movements]);

  const vald = noder.find((n) => n.m.id === valdId) ?? noder[noder.length - 1] ?? null;

  if (!movements.length)
    return <p className="py-4 text-xs text-muted-foreground">Inga rörelser kopplade till partiet ännu.</p>;

  const slutSaldo = noder[noder.length - 1].saldo;
  const senaste = noder[noder.length - 1].m.created_at;
  const in_ = noder.filter((n) => n.kg > 0).reduce((s, n) => s + n.kg, 0);
  const ut = noder.filter((n) => n.kg < 0).reduce((s, n) => s + Math.abs(n.kg), 0);

  // Var ligger partiet just nu: saldo per lagerplats, senaste händelse per plats.
  const perPlats = new Map<string, { kg: number; senast: string }>();
  for (const n of noder) {
    const namn = n.m.storage_locations?.name || "Plats saknas";
    const rad = perPlats.get(namn) ?? { kg: 0, senast: n.m.created_at };
    rad.kg += n.kg;
    if (new Date(n.m.created_at) > new Date(rad.senast)) rad.senast = n.m.created_at;
    perPlats.set(namn, rad);
  }
  const platser = [...perPlats.entries()]
    .filter(([, v]) => Math.abs(v.kg) > 0.001)
    .sort((a, b) => b[1].kg - a[1].kg);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="rounded-md border border-border bg-background">
        {/* Sammanfattning */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-border px-3 py-2 text-[11px] sm:grid-cols-4">
          {[
            ["Händelser", `${noder.length}`],
            ["In totalt", `${nf(in_, 1)} kg`],
            ["Ut totalt", `${nf(ut, 1)} kg`],
            ["Saldo nu", `${nf(slutSaldo, 1)} kg`],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="uppercase tracking-[0.14em] text-muted-foreground">{k}</p>
              <p className="font-mono font-semibold tabular-nums text-foreground">{v}</p>
            </div>
          ))}
        </div>

        <ol className="divide-y divide-border/60">
          {noder.map((n, i) => {
            const aktiv = n.m.id === vald?.m.id;
            const nyDag = i === 0 || datumSv(noder[i - 1].m.created_at) !== datumSv(n.m.created_at);
            return (
              <li key={n.m.id}>
                {n.gap && (
                  <div className="flex items-center gap-2 px-3 py-1">
                    <span className="ml-[52px] h-4 w-px bg-border" />
                    <span className="text-[10px] text-muted-foreground">orörd {n.gap}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setValdId(n.m.id)}
                  className={`grid w-full grid-cols-[58px_18px_minmax(0,1fr)] items-start gap-2 px-3 py-2 text-left transition-colors ${
                    aktiv ? "bg-muted/60" : "hover:bg-muted/30"
                  }`}
                >
                  {/* Tidkolumn */}
                  <div className="pt-0.5">
                    {nyDag && (
                      <p className="text-[10px] font-medium leading-tight text-foreground">{datumSv(n.m.created_at)}</p>
                    )}
                    <p className="font-mono text-[11px] leading-tight tabular-nums text-muted-foreground">
                      {timeSv(n.m.created_at)}
                    </p>
                  </div>

                  {/* Stam och punkt */}
                  <div className="flex h-full flex-col items-center">
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        n.gren ? "bg-rose-500" : "bg-emerald-600"
                      } ${aktiv ? "ring-2 ring-foreground/30" : ""}`}
                    />
                    {i < noder.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                  </div>

                  {/* Innehåll */}
                  <div className={n.gren ? "pl-4" : ""}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-xs font-semibold text-foreground">
                        {movementLabel(n.m.movement_type)}
                      </span>
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          n.gren ? "text-rose-600" : "text-emerald-700"
                        }`}
                      >
                        {n.kg > 0 ? "+" : ""}
                        {nf(n.kg, 1)} kg
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span>{n.m.storage_locations?.name || "Plats saknas"}</span>
                      <span>{namnPa(n.m)}</span>
                      <span className="font-mono tabular-nums">saldo {nf(n.saldo, 1)} kg</span>
                      {unitCost != null && (
                        <span className="font-mono tabular-nums">
                          {nf(Math.abs(n.kg) * unitCost, 0)} {currency}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}

          {/* Live-läge */}
          <li className="grid grid-cols-[58px_18px_minmax(0,1fr)] items-start gap-2 px-3 py-2">
            <p className="pt-0.5 text-[10px] text-muted-foreground">nu</p>
            <div className="flex justify-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">
                {slutSaldo > 0 ? `I lager · ${nf(slutSaldo, 1)} kg` : "Slut i lager · 0 kg"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                senaste händelsen {sinceNow(senaste)} sedan
              </p>
            </div>
          </li>
        </ol>
      </div>

      {/* All info om vald nod */}
      {vald && (
        <div className="h-fit rounded-md border border-foreground/30 bg-background p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">All info</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{movementLabel(vald.m.movement_type)}</p>
          <dl className="mt-2 space-y-1 text-xs">
            {[
              ["Produkt", productName || "—"],
              ["Parti", lotNumber || "—"],
              ["Datum", `${datumSv(vald.m.created_at)} ${arSv(vald.m.created_at)}`],
              ["Klockslag", timeSv(vald.m.created_at)],
              ["Förändring", `${vald.kg > 0 ? "+" : ""}${nf(vald.kg, 1)} kg`],
              ["Saldo efter", `${nf(vald.saldo, 1)} kg`],
              ...(unitCost != null
                ? ([
                    ["Värde på händelsen", `${nf(Math.abs(vald.kg) * unitCost, 0)} ${currency}`],
                    ["Värde kvar", `${nf(vald.saldo * unitCost, 0)} ${currency}`],
                  ] as [string, string][])
                : []),
              ["Plats", vald.m.storage_locations?.name || "—"],
              ["Av", namnPa(vald.m)],
              ["Låg orörd innan", vald.gap || "Första händelsen"],
              ["Referens", vald.m.reference_id || "—"],
              ["Notering", vald.m.note || "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">{k}</dt>
                <dd className="break-words text-right font-medium text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
