import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { edgeErrorMessage } from "@/lib/edgeError";

export interface VoiceLine { product_id: string; product_name: string; mangd: number; enhet: string; typ: string; orsak: string | null }
export interface VoiceReport {
  id: string; created_at: string; source: string; status: string; transcript: string | null; lines: VoiceLine[];
  questions: string[]; error: string | null; store_id: string | null; employee_id: string | null; user_id: string | null;
  audio_path: string | null; saved_at: string | null; movement_count: number | null;
}

export const VR_STATUS: Record<string, string> = {
  mottagen: "Mottagen", vantar_nyckel: "Väntar på nyckel", tolkad: "Tolkad", vantar_spara: "Väntar på Spara", sparad: "Sparad", fel: "Fel",
};
const TYP: Record<string, string> = { inventering: "Inventering", svinn: "Svinn", inleverans: "Inleverans" };
const fmtQ = (n: number, u: string) => (u === "kg" ? n.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : String(Math.round(n))) + " " + u;

export function VoiceReportBody({ r, onChanged }: { r: VoiceReport; onChanged?: (r?: any) => void }) {
  const [busy, setBusy] = useState(false);
  const call = async (action: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("voice-report", { body: { action, id: r.id } });
    setBusy(false);
    if (error) { toast.error(await edgeErrorMessage(error)); return; }
    if (action === "save") toast.success((data as any)?.already ? "Redan sparad" : `Sparat (${(data as any)?.count ?? 0} rader)`);
    onChanged?.(data);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={r.status === "fel" ? "destructive" : r.status === "sparad" ? "secondary" : "default"}>{VR_STATUS[r.status] ?? r.status}</Badge>
        {r.error && <span className="text-xs text-destructive break-words">{r.error}</span>}
      </div>
      {r.transcript && <p className="whitespace-pre-wrap break-words text-sm italic">"{r.transcript}"</p>}
      {r.lines?.length > 0 && (
        <ul className="space-y-1 text-sm">
          {r.lines.map((l, i) => (
            <li key={i} className="break-words">
              <span className="text-muted-foreground">{TYP[l.typ] ?? l.typ}:</span> {l.product_name}{" "}
              <span className="font-mono tabular-nums">{fmtQ(l.mangd, l.enhet)}</span>{l.orsak ? ` (${l.orsak})` : ""}
            </li>
          ))}
        </ul>
      )}
      {r.questions?.length > 0 && (
        <div className="rounded border border-border p-2 text-sm">
          <p className="font-medium">Behöver svar innan något sparas:</p>
          <ul className="list-disc pl-5">{r.questions.map((q, i) => <li key={i} className="break-words">{q}</li>)}</ul>
          <p className="text-xs text-muted-foreground">Spela in igen med rättelsen.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {r.status === "vantar_spara" && <Button size="sm" disabled={busy} onClick={() => call("save")}>Spara</Button>}
        {["vantar_nyckel", "fel", "mottagen"].includes(r.status) && r.audio_path && <Button size="sm" variant="outline" disabled={busy} onClick={() => call("retry")}>Tolka igen</Button>}
      </div>
    </div>
  );
}

export function VoiceAudio({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const load = async () => {
    const { data, error } = await supabase.functions.invoke("voice-report", { body: { action: "audio", id } });
    if (error) { toast.error(await edgeErrorMessage(error)); return; }
    setUrl((data as any)?.url ?? null);
  };
  if (!url) return <Button size="sm" variant="ghost" onClick={load}>Spela upp</Button>;
  return <audio controls autoPlay src={url} className="w-full max-w-xs" />;
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf); let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Mikrofonknapp: spelar in i webbläsaren och skickar till samma tolkning som Telegram. */
export function VoiceRecordButton({ storeId }: { storeId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<VoiceReport | null>(null);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  useEffect(() => {
    let alive = true;
    (supabase as any).from("stores").select("voice_report_enabled").eq("id", storeId).maybeSingle()
      .then(({ data }: any) => alive && setEnabled(!!data?.voice_report_enabled));
    return () => { alive = false; };
  }, [storeId]);
  if (!enabled) return null;

  const start = async () => {
    setReport(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      chunks.current = [];
      m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: m.mimeType || "audio/webm" });
        setBusy(true);
        const { data, error } = await supabase.functions.invoke("voice-report", {
          body: { action: "record", store_id: storeId, mime: blob.type, audio: toBase64(await blob.arrayBuffer()) },
        });
        setBusy(false);
        if (error) { toast.error(await edgeErrorMessage(error)); return; }
        setReport(data as VoiceReport);
      };
      mr.current = m; m.start(); setRec(true);
    } catch { toast.error("Mikrofonen kunde inte startas"); }
  };
  const stop = () => { mr.current?.stop(); setRec(false); };

  return (
    <>
      <Button type="button" variant="outline" size="icon" aria-label="Röstrapport" onClick={() => setOpen(true)}><Mic className="h-5 w-5" /></Button>
      <Dialog open={open} onOpenChange={(o) => { if (rec) stop(); setOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Röstrapport</DialogTitle>
            <DialogDescription>Säg vara, mängd och om det är inventering, svinn eller inleverans. Inget sparas förrän du trycker Spara.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!rec ? (
              <Button className="h-14 w-full text-base" disabled={busy} onClick={start}><Mic className="mr-2 h-5 w-5" />{busy ? "Tolkar…" : "Spela in"}</Button>
            ) : (
              <Button className="h-14 w-full text-base" variant="destructive" onClick={stop}><Square className="mr-2 h-5 w-5" />Stoppa</Button>
            )}
            {report && <VoiceReportBody r={report} onChanged={(d) => {
              if (d && (d as any).status) setReport(d as VoiceReport);
              else if (d && "count" in (d as any)) setReport({ ...report, status: "sparad" });
            }} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
