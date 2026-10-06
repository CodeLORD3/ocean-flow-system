// Gemensam Telegram-hjälp. Anropar Telegram bara när TELEGRAM_BOT_TOKEN finns.
export const hasBotToken = () => !!Deno.env.get("TELEGRAM_BOT_TOKEN");

export async function tg(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: any; error?: string; skipped?: boolean }> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return { ok: false, skipped: true, error: "TELEGRAM_BOT_TOKEN saknas" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      const err = `[${r.status}] ${j.description ?? "okänt fel"}`;
      console.error(`Telegram ${method} misslyckades ${err}`);
      return { ok: false, error: err };
    }
    return { ok: true, result: j.result };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function tgFile(fileId: string): Promise<Response | null> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return null;
  const meta = await tg("getFile", { file_id: fileId });
  if (!meta.ok || !meta.result?.file_path) return null;
  return fetch(`https://api.telegram.org/file/bot${token}/${meta.result.file_path}`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function safeEqual(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
