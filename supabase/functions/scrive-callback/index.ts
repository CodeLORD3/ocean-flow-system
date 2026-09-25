import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, syncFromScrive } from "../_shared/scrive.ts";

/**
 * Scrive anropar hit när något händer med ett dokument. Vi litar inte på
 * innehållet i anropet utan hämtar alltid status direkt från Scrive.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const id = new URL(req.url).searchParams.get("contract") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("bad request", { status: 400 });
    const db = admin();
    const { data: c } = await db.from("employment_contracts").select("*").eq("id", id).maybeSingle();
    if (!c?.scrive_document_id) return new Response("ok");
    await syncFromScrive(db, c);
    return new Response("ok");
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
