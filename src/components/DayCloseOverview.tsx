import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useDagsavslut } from "@/hooks/useDagsavslut";
import { useStores } from "@/hooks/useStores";
import { useCleaningToday, klockslag } from "@/hooks/useStoreCleaning";
import { withReturn } from "@/lib/navHistory";
import { getTitleForPath } from "@/contexts/TabsContext";

type Lage = {
  antal: number;
  butiker: { store_id: string; namn: string; instampling: string | null; bestallning: string | null; dagsrapport: string | null }[];
};
const KONTROLLER = [
  { k: "instampling", etikett: "instämpling" },
  { k: "bestallning", etikett: "beställning" },
  { k: "dagsrapport", etikett: "dagsrapport" },
] as const;

/** Admin: dagens avslut för alla butiker och grossisten, samlat på Översikt. */
export function DayCloseOverview() {
  const { butiker } = useDagsavslut();
  const navigate = useNavigate();
  const location = useLocation();
  const dag = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const { data: stad = {} } = useCleaningToday(dag);
  const { data: stores = [] } = useStores(true);
  const arButik = new Set(stores.filter((s: any) => s.unit_type === "butik").map((s) => s.id));
  /** Samma serverfunktion som notisen till Caisa använder. */
  const { data: lage } = useQuery({
    queryKey: ["dagslage", dag],
    refetchInterval: 120_000,
    queryFn: async (): Promise<Lage | null> => {
      const { data, error } = await (supabase as any).rpc("dagslage", { _day: dag });
      if (error) return null;
      return data as Lage;
    },
  });
  if (!butiker.length) return null;
  const kvar = butiker.filter((b) => b.saknas.length > 0).length;

  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ClipboardList className="h-4 w-4 text-primary" /> Dagens avslut
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {kvar} av {butiker.length} har något kvar
        </span>
      </div>
      {lage && lage.antal > 0 && (
        <div className="mb-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
          <p className="font-semibold tabular-nums">
            I dag:{" "}
            {KONTROLLER.map(({ k, etikett }) => {
              const klara = lage.butiker.filter((b) => b[k]).length;
              return `${etikett} ${klara} av ${lage.antal}`;
            }).join(", ")}
          </p>
          {KONTROLLER.map(({ k, etikett }) => {
            const saknas = lage.butiker.filter((b) => !b[k]).map((b) => b.namn);
            return saknas.length ? (
              <p key={k} className="break-words text-muted-foreground">
                Saknar {etikett}: {saknas.join(", ")}
              </p>
            ) : null;
          })}
        </div>
      )}
      <div className="divide-y divide-border">
        {butiker.map((b) => {
          const klar = b.saknas.length === 0;
          const s = stad[b.storeId];
          return (
            <div key={b.storeId} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="w-48 truncate text-xs font-semibold">{b.storeName}</span>
              {klar ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Klart
                </span>
              ) : (
                b.saknas.map((p) => (
                  <Button
                    key={p.nyckel}
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full px-2.5 text-[11px]"
                    onClick={() =>
                      navigate(withReturn(p.sida, `${location.pathname}${location.search}`, getTitleForPath(location.pathname)))
                    }
                  >
                    {p.etikett}
                  </Button>
                ))
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {arButik.has(b.storeId) && <>Städning: {s ? `${s.staff_name} kl ${klockslag(s.signed_at)}` : "Inte signerad"}</>}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {b.poster.length - b.saknas.length} av {b.poster.length}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
