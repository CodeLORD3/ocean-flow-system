import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { edgeErrorMessage } from "@/lib/edgeError";

const db = supabase as unknown as { from: (t: string) => any };

/** Telegram-inställningar och registrering av webhook (endast admin). */
export default function TelegramAdminCard() {
  const [bot, setBot] = useState("");
  const [group, setGroup] = useState("");
  const [info, setInfo] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.from("telegram_settings").select("bot_username, staff_group_chat_id").maybeSingle().then(({ data }: any) => {
      setBot(data?.bot_username ?? "");
      setGroup(data?.staff_group_chat_id ? String(data.staff_group_chat_id) : "");
    });
  }, []);

  const save = async () => {
    const { error } = await db.from("telegram_settings").update({
      bot_username: bot.trim().replace(/^@/, ""), staff_group_chat_id: group.trim() ? Number(group.trim()) : null, updated_at: new Date().toISOString(),
    }).eq("id", true);
    error ? toast.error(error.message) : toast.success("Sparat");
  };

  const call = async (action: "register_webhook" | "webhook_info") => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("telegram-send", { body: { action } });
    setBusy(false);
    if (error) { toast.error(await edgeErrorMessage(error)); return; }
    setInfo(data);
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Telegram</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <Input placeholder="Botnamn (utan @)" value={bot} onChange={(e) => setBot(e.target.value)} />
          <Input placeholder="Personalgruppens chat-id" value={group} onChange={(e) => setGroup(e.target.value)} inputMode="numeric" />
          <Button variant="outline" onClick={save}>Spara</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => call("register_webhook")}>Registrera Telegram-webhook</Button>
          <Button variant="outline" disabled={busy} onClick={() => call("webhook_info")}>Visa webhook-status</Button>
        </div>
        {info != null && <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{JSON.stringify(info, null, 2)}</pre>}
      </CardContent>
    </Card>
  );
}
