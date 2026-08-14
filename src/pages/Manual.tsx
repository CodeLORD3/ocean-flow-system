import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, Search, BookOpen, HelpCircle, ListChecks, Lightbulb } from "lucide-react";
import { MANUAL_CHAPTERS } from "@/lib/manualContent";

export default function Manual() {
  const [query, setQuery] = useState("");

  const chapters = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MANUAL_CHAPTERS;
    return MANUAL_CHAPTERS.filter((c) =>
      [c.title, c.purpose, ...c.steps, ...(c.tips ?? []), ...c.problems.flatMap((p) => [p.q, p.a])]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query]);

  return (
    <div className="p-4 md:p-6 space-y-6 print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          aside, header, nav, [data-sidebar], .no-print { display: none !important; }
          .manual-chapter { break-inside: avoid; page-break-inside: avoid; }
          .manual-chapter img { max-height: 120mm; }
        }
      `}</style>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-600" /> Butiksmanual
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Så fungerar butiksportalen: vad varje funktion är till för, hur du gör steg för steg,
            och vad du gör när något strular. Skärmdumparna är tagna ur systemet.
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök i manualen…"
              className="pl-8 w-56"
            />
          </div>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Skriv ut / PDF
          </Button>
        </div>
      </div>

      {/* Innehållsförteckning */}
      <Card className="p-4 no-print">
        <h2 className="text-sm font-semibold mb-3">Innehåll</h2>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {MANUAL_CHAPTERS.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {c.title}
            </a>
          ))}
        </div>
      </Card>

      {chapters.length === 0 && (
        <p className="text-sm text-muted-foreground">Inget i manualen matchar ”{query}”.</p>
      )}

      <div className="space-y-6">
        {chapters.map((c) => (
          <Card key={c.id} id={c.id} className="p-5 space-y-4 manual-chapter scroll-mt-20">
            <div>
              <h2 className="text-base font-bold text-foreground">{c.title}</h2>
              {c.route && (
                <p className="text-xs text-muted-foreground mt-0.5">Sida i menyn: {c.route}</p>
              )}
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{c.purpose}</p>
            </div>

            {c.image && (
              <figure className="border border-border overflow-hidden bg-muted/30">
                <img
                  src={c.image}
                  alt={`Skärmdump: ${c.title}`}
                  loading="lazy"
                  className="w-full h-auto"
                />
                <figcaption className="text-[11px] text-muted-foreground px-3 py-2 border-t border-border">
                  Skärmdump ur butiksportalen — {c.title.replace(/^\d+\.\s*/, "")}
                </figcaption>
              </figure>
            )}

            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                <ListChecks className="h-4 w-4 text-emerald-600" /> Så gör du
              </h3>
              <ol className="space-y-1.5 list-decimal pl-5">
                {c.steps.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground leading-relaxed">{s}</li>
                ))}
              </ol>
            </div>

            {c.tips && c.tips.length > 0 && (
              <div className="border border-border bg-muted/30 p-3">
                <h3 className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Bra att veta
                </h3>
                <ul className="space-y-1 list-disc pl-5">
                  {c.tips.map((t, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed">{t}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                <HelpCircle className="h-4 w-4 text-emerald-600" /> Om det strular
              </h3>
              <div className="divide-y divide-border border border-border">
                {c.problems.map((p) => (
                  <div key={p.q} className="p-3">
                    <p className="text-sm font-medium text-foreground">{p.q}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.a}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="text-base font-bold text-foreground">Hjälp och kontakt</h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Fråga först din butikschef. Handlar det om varor, leveranser eller priser – skriv till
          grossisten i Chatt. Handlar det om ett fel i systemet – använd knappen Rapportera fel nere
          till höger, så går ärendet direkt till admin med sida, butik och tidpunkt.
        </p>
      </Card>
    </div>
  );
}
