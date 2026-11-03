/**
 * mail-intake-manual — personal laddar upp bilagan till ett mejl som inte kunde
 * läsas in automatiskt. Dokumentet blir ett utkast (aldrig bokfört) och
 * kopplas till mejlraden i mail_intake_failures.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BUCKET = "leverantorsdokument";
const MAX_BYTES = 20 * 1024 * 1024;

const Body = z.object({
  failure_id: z.string().uuid(),
  file_name: z.string().min(1).max(200),
  content_type: z.string().max(100).optional(),
  base64: z.string().min(1),
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Inloggning krävs" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser(auth.slice(7));
  if (!u.user) return json({ error: "Inloggning krävs" }, 401);
  const { data: staff } = await userClient.rpc("is_staff");
  if (staff !== true) return json({ error: "Endast personal" }, 403);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
  const { failure_id, file_name, content_type, base64 } = parsed.data;

  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.length > MAX_BYTES) return json({ error: "Filen är större än 20 MB" }, 400);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: failure } = await db.from("mail_intake_failures").select("*").eq("id", failure_id).maybeSingle();
  if (!failure) return json({ error: "Mejlet finns inte" }, 404);
  if (failure.status === "hanterad" || failure.status === "lyckad") return json({ error: "Mejlet är redan hanterat" }, 409);

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const finish = async (documentId: string) => {
    await db.from("mail_intake_failures").update({
      status: "hanterad",
      resolved_document_id: documentId,
      resolved_by: u.user!.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", failure_id);
  };

  const { data: dupe } = await db.from("supplier_documents").select("id").eq("file_hash", hash).maybeSingle();
  if (dupe) {
    await finish(dupe.id);
    return json({ ok: true, document_id: dupe.id, duplicate: true });
  }

  const ext = file_name.includes(".") ? file_name.split(".").pop() : "pdf";
  const path = `${failure.supplier_id ?? "okand"}/${new Date().getUTCFullYear()}/${hash}.${ext}`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType: content_type || "application/pdf",
    upsert: true,
  });
  if (upErr) return json({ error: `Filen kunde inte sparas: ${upErr.message}` }, 500);

  const { data: msg } = await db.from("mail_intake_messages").select("id").eq("message_id", failure.message_id).maybeSingle();
  const { data: doc, error: docErr } = await db.from("supplier_documents").insert({
    message_id: msg?.id ?? null,
    storage_path: path,
    file_name,
    file_hash: hash,
    mime_type: content_type || null,
    supplier_id: failure.supplier_id,
    legal_entity_id: failure.legal_entity_id,
    status: "utkast",
    parse_status: "vantar",
  }).select("id").single();
  if (docErr || !doc) return json({ error: docErr?.message || "Dokumentet kunde inte sparas" }, 500);

  // Tolkning med samma motor som mailkorgen; misslyckas den ligger dokumentet
  // kvar under "Dubbletter och fel" för manuell rättning.
  let parseOk = false;
  try {
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 600);
    const fileUrl = signed!.signedUrl.startsWith("http") ? signed!.signedUrl : `${url}${signed!.signedUrl}`;
    const res = await fetch(`${url}/functions/v1/parse-foljesedel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ fileUrl, fileHash: hash }),
    });
    const out = await res.json();
    if (!res.ok || out.error) throw new Error(out.error || `status ${res.status}`);
    const h = out.document || {};
    const raw = String(h.document_type || "").toLowerCase();
    const docType = raw.includes("kredit") ? "kreditnota" : raw.includes("faktur") ? "faktura" : "foljesedel";
    await db.from("supplier_documents").update({
      doc_type: docType,
      document_number: h.document_number ?? null,
      document_date: h.document_date || null,
      delivery_date: h.delivery_date || null,
      total_ex_vat: h.total_ex_vat ?? null,
      parsed: { document: h, lines: out.products || [] },
      parse_status: "tolkad",
    }).eq("id", doc.id);
    parseOk = true;
  } catch (e) {
    await db.from("supplier_documents").update({
      parse_status: "fel",
      parse_error: e instanceof Error ? e.message : "okänt fel",
    }).eq("id", doc.id);
  }

  await finish(doc.id);
  return json({ ok: true, document_id: doc.id, parsed: parseOk });
});
