import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { CheckCircle2, Inbox, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { mailFailureReasonText } from "@/lib/mailFailureReasons";

export interface MailFailure {
  id: string;
  message_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  sent_at: string | null;
  size_bytes: number | null;
  status: string;
  reason: string;
  detail: string | null;
  attempts: number;
  last_attempt_at: string;
}

export function useMailFailures() {
  return useQuery({
    queryKey: ["mail-intake-failures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mail_intake_failures")
        .select("*")
        .in("status", ["behover_atgard", "forsok_igen"])
        .order("last_attempt_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as MailFailure[];
    },
    refetchInterval: 60_000,
  });
}

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const sizeText = (b: number | null) => (b ? `${(Math.round((b / 1024 / 1024) * 10) / 10).toLocaleString("sv-SE")} MB` : "–");

export function MailFailuresList({ failures }: { failures: MailFailure[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mail-intake-failures"] });
    qc.invalidateQueries({ queryKey: ["supplier-documents"] });
  };

  const upload = async (file: File) => {
    if (!target) return;
    setBusy(target);
    try {
      const { data, error } = await supabase.functions.invoke("mail-intake-manual", {
        body: { failure_id: target, file_name: file.name, content_type: file.type, base64: await toBase64(file) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Ogiltig fil");
      toast({
        title: "Bilagan är inläst",
        description: data.duplicate
          ? "Filen fanns redan — mejlet är kopplat till befintligt dokument."
          : data.parsed ? "Dokumentet väntar på attest." : "Sparad, men tolkningen misslyckades — se Dubbletter och fel.",
      });
      refresh();
    } catch (e) {
      toast({ title: "Uppladdningen misslyckades", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
      setTarget(null);
    }
  };

  const markHandled = async (id: string) => {
    setBusy(id);
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("mail_intake_failures")
      .update({ status: "hanterad", resolved_by: auth.user?.id ?? null, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    setBusy(null);
    if (error || !data?.length) {
      toast({ title: "Kunde inte markera", description: error?.message ?? "Behörighet saknas", variant: "destructive" });
      return;
    }
    refresh();
  };

  return (
    <ScrollArea className="h-full">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      <div className="divide-y">
        {failures.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground">
            <Inbox className="mx-auto mb-2 h-6 w-6 opacity-40" />
            Alla mejl från kända avsändare är inlästa.
          </div>
        )}
        {failures.map((f) => (
          <div key={f.id} className="p-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <Badge variant={f.status === "behover_atgard" ? "destructive" : "outline"} className="h-4 px-1 text-[10px]">
                {f.status === "behover_atgard" ? "Behöver åtgärd" : `Försöks igen (${f.attempts} av 3)`}
              </Badge>
              <span className="break-words min-w-0">{f.subject || "(utan ämne)"}</span>
            </div>
            <p className="text-[11px] text-muted-foreground break-words">
              {f.from_name ? `${f.from_name} — ` : ""}{f.from_email}
              {f.sent_at ? ` · ${format(new Date(f.sent_at), "d MMM yyyy HH:mm", { locale: sv })}` : ""}
              {` · ${sizeText(f.size_bytes)}`}
            </p>
            <p className="text-[11px] break-words">
              {mailFailureReasonText(f.reason)}
              {f.detail ? <span className="text-muted-foreground"> — {f.detail}</span> : null}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={busy === f.id}
                onClick={() => {
                  setTarget(f.id);
                  inputRef.current?.click();
                }}
              >
                {busy === f.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                Ladda upp manuellt
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy === f.id} onClick={() => markHandled(f.id)}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Markera som hanterad
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
