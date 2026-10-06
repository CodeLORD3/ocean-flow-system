import type { ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "./supabase";

// Endast dessa fält får finnas i sammanfattningen – fritext (uppgift, innehåll, namn) loggas aldrig.
const SAFE_KEYS = new Set([
  "id", "status", "typ", "kanal", "limit", "from_date", "to_date", "store_id", "store_code",
  "legal_entity_code", "pack_status", "document_type", "atgard", "kategori", "prioritet", "lot_number",
]);

function summarize(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const parts = Object.entries(args as Record<string, unknown>).map(([k, v]) =>
    SAFE_KEYS.has(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      ? `${k}=${String(v).slice(0, 40)}`
      : k,
  );
  return parts.join(", ").slice(0, 300);
}

function uppgiftId(tool: string, args: unknown, res: unknown): number | null {
  if (!tool.includes("ai_uppgift")) return null;
  const a = (args ?? {}) as { id?: unknown };
  if (typeof a.id === "number") return a.id;
  const sc = (res as { structuredContent?: { uppgift?: { id?: unknown } } })?.structuredContent;
  return typeof sc?.uppgift?.id === "number" ? sc.uppgift.id : null;
}

function errorText(res: unknown): string | null {
  const c = (res as { content?: { type?: string; text?: string }[] })?.content;
  return c?.find((x) => x.type === "text")?.text?.slice(0, 500) ?? "fel";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withLogging<T extends { name: string; handler: (...a: any[]) => any }>(tool: T): T {
  const inner = tool.handler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = async (args: any, ctx: ToolContext, ...rest: any[]) => {
    const start = Date.now();
    let res: unknown;
    let thrown: unknown;
    try {
      res = await inner(args, ctx, ...rest);
    } catch (e) {
      thrown = e;
    }
    try {
      if (ctx.isAuthenticated() && ctx.getToken()) {
        const isErr = thrown !== undefined || (res as { isError?: boolean })?.isError === true;
        await supabaseForUser(ctx).from("mcp_calls").insert({
          user_id: ctx.getUserId(),
          agent: ctx.getClientId() ?? null,
          tool: tool.name,
          args_summary: summarize(args),
          result: isErr ? "fel" : "ok",
          error: !isErr ? null : thrown !== undefined ? String((thrown as Error)?.message ?? thrown).slice(0, 500) : errorText(res),
          duration_ms: Date.now() - start,
          ai_uppgift_id: uppgiftId(tool.name, args, res),
        });
      }
    } catch {
      // Loggningen får aldrig stoppa verktyget.
    }
    if (thrown !== undefined) throw thrown;
    return res;
  };
  return { ...tool, handler } as T;
}
