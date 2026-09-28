import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type Ctx = Parameters<typeof supabaseForUser>[0] & { isAuthenticated: () => boolean };
const deny = { content: [{ type: "text" as const, text: "Inte inloggad." }], isError: true };
const fail = (m: string) => ({ content: [{ type: "text" as const, text: m }], isError: true });
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const ok = (key: string, v: unknown) => {
  const json = JSON.parse(JSON.stringify(v ?? null)) as Json;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(json) }],
    structuredContent: { [key]: json } as { [k: string]: Json },
  };
};
const uppgiftStatus = z.enum(["öppen", "pågår", "väntar på vd", "klar"]);
const utkastStatus = z.enum(["utkast", "redigerat", "godkänt", "skickat", "avslaget"]);
const read = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const listaAiUppgifter = defineTool({
  name: "lista_ai_uppgifter",
  title: "Lista AI-uppgifter",
  description: "Listar AI-teamets uppgifter. Kan filtreras på status och tilldelad.",
  inputSchema: {
    status: uppgiftStatus.optional(),
    tilldelad: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: read,
  handler: async ({ status, tilldelad, limit }, ctx) => {
    if (!(ctx as Ctx).isAuthenticated()) return deny;
    let q = supabaseForUser(ctx).from("ai_uppgifter" as never).select("*").order("skapad", { ascending: false }).limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (tilldelad) q = q.eq("tilldelad", tilldelad);
    const { data, error } = await q;
    return error ? fail(error.message) : ok("uppgifter", data ?? []);
  },
});

export const skapaAiUppgift = defineTool({
  name: "skapa_ai_uppgift",
  title: "Skapa AI-uppgift",
  description: "Skapar en ny uppgift på tavlan.",
  inputSchema: {
    uppgift: z.string().trim().min(1),
    tilldelad: z.string().trim().optional(),
    skapad_av: z.string().trim().optional(),
    prioritet: z.number().int().min(1).max(5).optional(),
    deadline: z.string().optional().describe("ISO-tidpunkt."),
    underlag: z.string().optional(),
    status: uppgiftStatus.optional(),
  },
  annotations: write,
  handler: async (input, ctx) => {
    if (!(ctx as Ctx).isAuthenticated()) return deny;
    const { data, error } = await supabaseForUser(ctx).from("ai_uppgifter" as never).insert(input as never).select().single();
    return error ? fail(error.message) : ok("uppgift", data);
  },
});

export const uppdateraAiUppgift = defineTool({
  name: "uppdatera_ai_uppgift",
  title: "Uppdatera AI-uppgift",
  description: "Uppdaterar status och resultat på en AI-uppgift.",
  inputSchema: {
    id: z.number().int(),
    status: uppgiftStatus.optional(),
    resultat: z.string().optional(),
  },
  annotations: { ...write, idempotentHint: true },
  handler: async ({ id, status, resultat }, ctx) => {
    if (!(ctx as Ctx).isAuthenticated()) return deny;
    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (resultat !== undefined) patch.resultat = resultat;
    const { data, error } = await supabaseForUser(ctx).from("ai_uppgifter" as never).update(patch as never).eq("id", id).select().single();
    return error ? fail(error.message) : ok("uppgift", data);
  },
});

export const listaAiUtkast = defineTool({
  name: "lista_ai_utkast",
  title: "Lista AI-utkast",
  description: "Listar utkast som väntar på eller har passerat VD:s attest. Kan filtreras på status och typ.",
  inputSchema: {
    status: utkastStatus.optional(),
    typ: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: read,
  handler: async ({ status, typ, limit }, ctx) => {
    if (!(ctx as Ctx).isAuthenticated()) return deny;
    let q = supabaseForUser(ctx).from("ai_utkast" as never).select("*").order("skapad", { ascending: false }).limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    if (typ) q = q.eq("typ", typ);
    const { data, error } = await q;
    return error ? fail(error.message) : ok("utkast", data ?? []);
  },
});

export const skapaAiUtkast = defineTool({
  name: "skapa_ai_utkast",
  title: "Skapa AI-utkast",
  description: "Skapar ett nytt utkast för VD:s attest.",
  inputSchema: {
    titel: z.string().trim().min(1),
    typ: z.string().optional(),
    mottagare: z.string().optional(),
    kanal: z.string().optional(),
    innehall: z.string().optional().describe("Markdown."),
    bilaga_url: z.string().url().optional(),
    skapad_av: z.string().optional(),
  },
  annotations: write,
  handler: async (input, ctx) => {
    if (!(ctx as Ctx).isAuthenticated()) return deny;
    const { data, error } = await supabaseForUser(ctx).from("ai_utkast" as never).insert(input as never).select().single();
    return error ? fail(error.message) : ok("utkast", data);
  },
});

export const uppdateraAiUtkast = defineTool({
  name: "uppdatera_ai_utkast",
  title: "Uppdatera AI-utkast",
  description: "Uppdaterar ett utkast: innehåll, titel, mottagare, kanal, bilaga eller status.",
  inputSchema: {
    id: z.number().int(),
    titel: z.string().trim().min(1).optional(),
    mottagare: z.string().optional(),
    kanal: z.string().optional(),
    innehall: z.string().optional(),
    bilaga_url: z.string().url().optional(),
    status: utkastStatus.optional(),
  },
  annotations: { ...write, idempotentHint: true },
  handler: async ({ id, ...rest }, ctx) => {
    if (!(ctx as Ctx).isAuthenticated()) return deny;
    const patch: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    if (patch.status === "skickat") patch.skickad = new Date().toISOString();
    const { data, error } = await supabaseForUser(ctx).from("ai_utkast" as never).update(patch as never).eq("id", id).select().single();
    return error ? fail(error.message) : ok("utkast", data);
  },
});
