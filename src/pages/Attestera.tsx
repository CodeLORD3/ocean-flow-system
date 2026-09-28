import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import MarkdownDoc from "@/components/MarkdownDoc";
import { useAiUtkast, useUpdateAiUtkast, UTKAST_STATUS, fmtDateTime, type AiUtkast } from "@/hooks/useAiTeam";
import { cn } from "@/lib/utils";
import { PrisUtkastPanel } from "@/components/ai/PrisUtkastPanel";

const ALL = "__alla";

export default function Attestera() {
  const { data = [], isLoading, error } = useAiUtkast();
  const update = useUpdateAiUtkast();
  const [status, setStatus] = useState(ALL);
  const [typ, setTyp] = useState(ALL);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [innehall, setInnehall] = useState("");
  const [kommentar, setKommentar] = useState("");
  const [preview, setPreview] = useState(false);

  const typer = useMemo(() => Array.from(new Set(data.map((d) => d.typ).filter(Boolean))) as string[], [data]);
  const list = data.filter(
    (d) =>
      (status === ALL || d.status === status) &&
      (typ === ALL || d.typ === typ) &&
      (!q || d.titel.toLowerCase().includes(q.toLowerCase())),
  );
  const sel: AiUtkast | undefined = data.find((d) => d.id === selectedId);

  useEffect(() => {
    setInnehall(sel?.innehall ?? "");
    setKommentar(sel?.vd_kommentar ?? "");
    setPreview(false);
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch: Partial<AiUtkast>, msg: string) => {
    if (!sel) return;
    try {
      await update.mutateAsync({ id: sel.id, innehall, vd_kommentar: kommentar || null, ...patch });
      toast.success(msg);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-6 grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Attestera</h1>
        <Input placeholder="Sök på titel" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alla statusar</SelectItem>
              {UTKAST_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typ} onValueChange={setTyp}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alla typer</SelectItem>
              {typer.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
        {error && <p className="text-sm text-destructive">Kunde inte hämta utkast.</p>}
        {!isLoading && list.length === 0 && <p className="text-sm text-muted-foreground">Inga utkast.</p>}
        <div className="space-y-1">
          {list.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={cn(
                "w-full text-left rounded-md border p-3 hover:bg-muted/50",
                d.id === selectedId && "border-primary bg-muted/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{d.titel}</span>
                <Badge variant="outline">{d.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {[d.typ, d.mottagare, fmtDateTime(d.skapad)].filter(Boolean).join(" · ")}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        {!sel ? (
          <p className="text-sm text-muted-foreground mt-12">Välj ett utkast i listan.</p>
        ) : (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">{sel.titel}</h2>
              <Badge>{sel.status}</Badge>
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <div><dt className="text-muted-foreground">Typ</dt><dd>{sel.typ ?? ""}</dd></div>
              <div><dt className="text-muted-foreground">Mottagare</dt><dd>{sel.mottagare ?? ""}</dd></div>
              <div><dt className="text-muted-foreground">Kanal</dt><dd>{sel.kanal ?? ""}</dd></div>
              <div><dt className="text-muted-foreground">Skapad</dt><dd>{fmtDateTime(sel.skapad)}</dd></div>
              <div><dt className="text-muted-foreground">Skapad av</dt><dd>{sel.skapad_av ?? ""}</dd></div>
              {sel.skickad && <div><dt className="text-muted-foreground">Skickad</dt><dd>{fmtDateTime(sel.skickad)}</dd></div>}
            </dl>
            {sel.bilaga_url && (
              <a href={sel.bilaga_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                Öppna bilaga
              </a>
            )}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Innehåll (markdown)</Label>
                <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
                  {preview ? "Redigera" : "Förhandsvisa"}
                </Button>
              </div>
              {preview ? (
                <div className="rounded-md border p-3"><MarkdownDoc source={innehall} /></div>
              ) : (
                <Textarea className="min-h-[320px] font-mono text-sm" value={innehall} onChange={(e) => setInnehall(e.target.value)} />
              )}
            </div>
            {sel.typ === "pris" && (
              <PrisUtkastPanel utkastId={sel.id} innehall={innehall} kommentar={kommentar} onApproved={() => update.reset()} />
            )}
            <div className="space-y-1">
              <Label>VD-kommentar</Label>
              <Textarea value={kommentar} onChange={(e) => setKommentar(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => save({ status: "redigerat" }, "Sparat")}>Spara</Button>
              {sel.typ !== "pris" && <Button onClick={() => save({ status: "godkänt" }, "Godkänt")}>Godkänn</Button>}
              <Button
                variant="destructive"
                onClick={() => {
                  if (!kommentar.trim()) return toast.error("Skriv en VD-kommentar innan du avslår.");
                  save({ status: "avslaget" }, "Avslaget");
                }}
              >
                Avslå
              </Button>
              <Button variant="secondary" onClick={() => save({ status: "skickat", skickad: new Date().toISOString() }, "Markerat som skickat")}>
                Markera som skickad
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(innehall).then(() => toast.success("Texten kopierad"))}
              >
                Kopiera text
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
