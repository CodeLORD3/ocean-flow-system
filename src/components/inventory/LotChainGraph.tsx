import { useMemo, useState } from "react";
import { movementLabel } from "@/hooks/useStockMovements";
import { gapBetweenLong, sinceNow, sinceNowLong, timeSv } from "@/lib/dwell";

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
        gap: i === 0 ? "" : gapBetweenLong(movements[i - 1].created_at, m.created_at),
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
        {/* Var ligger partiet just nu */}
        <div
          className={`border-b px-3 py-3 ${
            platser.length ? "border-emerald-600/30 bg-emerald-600/5" : "border-rose-600/30 bg-rose-600/5"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Var ligger partiet just nu
          </p>
          {platser.length ? (
            <>
              <p className="mt-1 text-sm font-semibold text-emerald-700">
                {platser.length === 1 ? "1 lagerplats" : `${platser.length} lagerplatser`} ·{" "}
                <span className="font-mono tabular-nums">{nf(slutSaldo, 1)} kg</span> totalt
              </p>
              <ul className="mt-2 space-y-1">
                {platser.map(([namn, v]) => (
                  <li
                    key={namn}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded border border-emerald-600/20 bg-background px-2 py-1.5"
                  >
                    <span className="text-xs font-semibold text-foreground">{namn}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="text-[10px] text-muted-foreground">
                        senast rört {datumSv(v.senast)} {timeSv(v.senast)}
                      </span>
                      <span className="font-mono text-xs font-semibold tabular-nums text-emerald-700">
                        {nf(v.kg, 1)} kg
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm font-semibold text-rose-600">
              Partiet ligger inte på någon lagerplats – slut i lager (0 kg)
            </p>
          )}
        </div>

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

        {/* Symmetriskt flöde: IN till vänster, tid och saldo i mitten, UT till höger */}
        <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_112px_minmax(0,1fr)] items-center gap-x-2 border-b-2 border-border bg-muted/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur">
          <p className="text-right text-emerald-700">In till lagret</p>
          <p className="text-center text-muted-foreground">Tid · saldo</p>
          <p className="text-rose-600">Ut ur lagret</p>
        </div>

        <ol>
          {/* Live-läge först: senaste läget högst upp, tydligt markerat */}
          <li
            className={`border-b-2 px-3 py-4 ${
              slutSaldo > 0
                ? "border-emerald-600/40 bg-emerald-600/10"
                : "border-rose-600/40 bg-rose-600/10"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="relative grid h-5 w-5 place-items-center">
                  <span
                    className={`absolute h-5 w-5 animate-ping rounded-full ${
                      slutSaldo > 0 ? "bg-emerald-500/40" : "bg-rose-500/40"
                    }`}
                  />
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${slutSaldo > 0 ? "bg-emerald-600" : "bg-rose-600"}`}
                  />
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-background ${
                    slutSaldo > 0 ? "bg-emerald-600" : "bg-rose-600"
                  }`}
                >
                  live nu
                </span>
                <p
                  className={`text-lg font-bold leading-none ${
                    slutSaldo > 0 ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {slutSaldo > 0 ? `${nf(slutSaldo, 1)} kg i lager` : "Slut i lager · 0 kg"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold tabular-nums text-foreground">
                  {sinceNowLong(senaste)} sedan senaste händelsen
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {datumSv(senaste)} {arSv(senaste)} · {timeSv(senaste)}
                </p>
              </div>
            </div>
            {platser.length > 0 && (
              <p className="mt-2 text-[11px] font-medium text-foreground/80">
                Ligger nu på: {platser.map(([namn, v]) => `${namn} (${nf(v.kg, 1)} kg)`).join(" · ")}
              </p>
            )}
            <div className="mt-2 flex flex-col items-center">
              <span className="h-4 w-0.5 bg-border" />
              <span className="rounded-md border border-border bg-background px-2 py-1 text-center text-[11px] font-medium text-foreground">
                {slutSaldo > 0
                  ? `har legat på lagret ${sinceNowLong(senaste)}`
                  : `slut sedan ${sinceNowLong(senaste)}`}
              </span>
              <span className="h-4 w-0.5 bg-border" />
            </div>
          </li>


          {[...noder].reverse().map((n, j) => {
            const i = noder.length - 1 - j;
            const aktiv = n.m.id === vald?.m.id;
            const nyDag = j === 0 || datumSv(noder[i + 1].m.created_at) !== datumSv(n.m.created_at);
            const steg = i + 1;
            const kort = (
              <button
                type="button"
                onClick={() => setValdId(n.m.id)}
                className={`w-full rounded-md border-2 px-2.5 py-2 text-left transition-colors ${
                  n.gren
                    ? "border-rose-600/40 bg-rose-600/[0.07] hover:bg-rose-600/15"
                    : "border-emerald-600/40 bg-emerald-600/[0.07] hover:bg-emerald-600/15"
                } ${aktiv ? "ring-2 ring-foreground/40" : ""}`}
              >
                <div className={`flex items-center gap-2 ${n.gren ? "" : "flex-row-reverse"}`}>
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                      n.gren ? "bg-rose-600/15 text-rose-700" : "bg-emerald-600/15 text-emerald-700"
                    }`}
                  >
                    {steg}
                  </span>
                  <span className="flex-1 truncate text-sm font-semibold text-foreground">
                    {movementLabel(n.m.movement_type)}
                  </span>
                  <span
                    className={`shrink-0 font-mono text-sm font-bold tabular-nums ${
                      n.gren ? "text-rose-600" : "text-emerald-700"
                    }`}
                  >
                    {n.kg > 0 ? "+" : ""}
                    {nf(n.kg, 1)} kg
                  </span>
                </div>
                <div
                  className={`mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground ${
                    n.gren ? "" : "justify-end"
                  }`}
                >
                  <span className="truncate font-medium text-foreground/80">
                    {n.gren ? "från " : "till "}
                    {n.m.storage_locations?.name || "plats saknas"}
                  </span>
                  <span className="truncate">{namnPa(n.m)}</span>
                  {unitCost != null && (
                    <span className="font-mono tabular-nums">
                      {nf(Math.abs(n.kg) * unitCost, 0)} {currency}
                    </span>
                  )}
                </div>
              </button>
            );
            const pil = (
              <span
                aria-hidden
                className={`shrink-0 text-sm font-bold ${n.gren ? "text-rose-500" : "text-emerald-600"}`}
              >
                {n.gren ? "→" : "→"}
              </span>
            );
            return (
              <li key={n.m.id}>
                {nyDag && (
                  <div className="flex items-center gap-2 bg-muted/40 px-3 py-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
                      {datumSv(n.m.created_at)}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                    {j === 0 && (
                      <span className="rounded-full border border-primary/40 px-1.5 py-px text-[9px] font-bold uppercase text-primary">
                        senaste
                      </span>
                    )}
                  </div>
                )}
                <div
                  className={`grid grid-cols-[minmax(0,1fr)_112px_minmax(0,1fr)] items-center gap-x-2 px-3 py-1.5 ${
                    aktiv ? "bg-muted/40" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">{!n.gren && <>{kort}{pil}</>}</div>

                  {/* Mittspår med genomgående linje */}
                  <div className="relative flex flex-col items-center py-1">
                    <span aria-hidden className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
                    <p className="relative font-mono text-[11px] font-semibold leading-tight tabular-nums text-muted-foreground">
                      {timeSv(n.m.created_at)}
                    </p>
                    <span
                      className={`relative my-1 h-4 w-4 rounded-full border-2 border-background shadow ${
                        n.gren ? "bg-rose-500" : "bg-emerald-600"
                      } ${aktiv ? "ring-2 ring-foreground/50" : ""}`}
                    />
                    <p className="relative rounded bg-background px-1 font-mono text-[11px] font-bold leading-tight tabular-nums text-foreground">
                      {nf(n.saldo, 1)} kg
                    </p>
                  </div>

                  <div className="flex items-center gap-2">{n.gren && <>{pil}{kort}</>}</div>
                </div>

                {/* Tiden ned till den äldre händelsen */}
                {n.gap && (
                  <div className="grid grid-cols-[minmax(0,1fr)_112px_minmax(0,1fr)] items-center gap-x-2 px-3">
                    <span className="h-px" />
                    <span className="flex flex-col items-center">
                      <span className="h-4 w-0.5 bg-border" />
                      <span className="flex flex-col items-center whitespace-nowrap rounded-md border border-border bg-muted/60 px-2 py-1 text-center">
                        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                          legat på lagret
                        </span>
                        <span className="text-[12px] font-bold text-foreground">{n.gap}</span>
                      </span>
                      <span className="h-4 w-0.5 bg-border" />
                    </span>
                    <span className="h-px" />
                  </div>
                )}

                {/* Startpunkt: äldsta händelsen ligger längst ned */}
                {i === 0 && (
                  <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-1">
                    <span className="rounded-full border border-emerald-600/40 px-1.5 py-px text-[9px] font-bold uppercase text-emerald-700">
                      start
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      partiets första händelse {datumSv(n.m.created_at)} {timeSv(n.m.created_at)}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
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
