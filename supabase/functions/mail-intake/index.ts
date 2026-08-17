/**
 * mail-intake — hämtar följesedlar och fakturor från inkop@fiskskaldjur.se via IMAP.
 *
 * Grundregler:
 *  - Ingenting bokförs automatiskt. Allt landar som utkast (supplier_documents.status = 'utkast')
 *    som personal attesterar i inköpsrapporteringen.
 *  - Bara vitlistade avsändare tolkas. Okända avsändare parkeras utan att bilagan öppnas.
 *  - Mejl utan bilaga lämnas olästa i inkorgen så att en människa ser dem.
 *
 * IMAP-sessionen hålls kort och stängs varje körning (Loopia begränsar samtidiga anslutningar).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1.0.164";
import { simpleParser } from "npm:mailparser@3.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "leverantorsdokument";
const PROCESSED = "Behandlade";
const PARKED = "Parkerade";

type Json = Record<string, unknown>;

const sha256 = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const isDoc = (a: { contentType?: string; filename?: string }) => {
  const type = (a.contentType || "").toLowerCase();
  const name = (a.filename || "").toLowerCase();
  return type.includes("pdf") || type.startsWith("image/") ||
    /\.(pdf|png|jpe?g|webp|gif|tiff?)$/.test(name);
};

function classify(docType: string | null | undefined, subject: string, fileName: string): string {
  const raw = (docType || "").toLowerCase();
  if (raw.includes("kredit")) return "kreditnota";
  if (raw.includes("faktur")) return "faktura";
  if (raw.includes("foljesedel") || raw.includes("följesedel") || raw.includes("auktion")) return "foljesedel";
  const hay = `${subject} ${fileName}`.toLowerCase();
  if (hay.includes("kredit")) return "kreditnota";
  if (hay.includes("faktura") || hay.includes("invoice")) return "faktura";
  if (hay.includes("följesedel") || hay.includes("foljesedel") || hay.includes("avräkning") || hay.includes("auktion")) {
    return "foljesedel";
  }
  return "ovrigt";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: Json = {};
  try {
    body = req.method === "POST" ? await req.json() : {};
  } catch {
    body = {};
  }
  // Verifiering sker mot en testmapp först — inkorgen pekas ut explicit.
  const folder = typeof body.folder === "string" && body.folder ? body.folder : "Test";
  const limit = typeof body.limit === "number" ? Math.min(body.limit, 50) : 20;
  const moveMail = body.move !== false;

  const { data: run } = await supabase
    .from("mail_intake_runs")
    .insert({ folder })
    .select("id")
    .single();
  const runId = run?.id as string | undefined;

  const user = Deno.env.get("MAIL_INTAKE_USER");
  const pass = Deno.env.get("MAIL_INTAKE_PASSWORD");
  const finish = async (patch: Json, status = 200) => {
    if (runId) {
      await supabase.from("mail_intake_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", runId);
    }
    return new Response(JSON.stringify({ folder, ...patch }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  if (!user || !pass) return await finish({ ok: false, error: "MAIL_INTAKE_USER/PASSWORD saknas" }, 500);

  const { data: senders } = await supabase
    .from("mail_intake_senders")
    .select("pattern, kind, supplier_id, legal_entity_id, active")
    .eq("active", true);

  const matchSender = (email: string) => {
    const addr = email.toLowerCase();
    const domain = addr.split("@")[1] || "";
    return (senders || []).find((s) => {
      const p = (s.pattern || "").toLowerCase().replace(/^@/, "");
      return s.kind === "domain" ? domain === p || domain.endsWith(`.${p}`) : addr === p;
    }) || null;
  };

  const client = new ImapFlow({
    host: "mailcluster.loopia.se",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let fetched = 0;
  let stored = 0;
  let skipped = 0;
  let noAttachment = 0;
  const results: Json[] = [];

  try {
    await client.connect();
    for (const name of [PROCESSED, PARKED]) {
      try {
        await client.mailboxCreate(name);
      } catch {
        /* finns redan */
      }
    }

    const lock = await client.getMailboxLock(folder);
    try {
      const uids = (await client.search({ seen: false })) || [];
      const batch = (uids as number[]).slice(0, limit);

      for (const uid of batch) {
        fetched++;
        const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
        if (!msg?.source) continue;
        const parsedMail = await simpleParser(msg.source as Uint8Array);
        const messageId = parsedMail.messageId || `uid-${folder}-${uid}`;
        const fromAddr = parsedMail.from?.value?.[0];
        const fromEmail = (fromAddr?.address || "").toLowerCase();
        const subject = parsedMail.subject || "";
        const attachments = (parsedMail.attachments || []).filter(isDoc);

        // Mejl utan bilaga rörs aldrig — de lämnas olästa så att en människa ser dem.
        if (attachments.length === 0) {
          noAttachment++;
          skipped++;
          results.push({ messageId, fromEmail, subject, action: "lamnad_olast_utan_bilaga" });
          continue;
        }

        const { data: existing } = await supabase
          .from("mail_intake_messages")
          .select("id")
          .eq("message_id", messageId)
          .maybeSingle();
        if (existing) {
          skipped++;
          results.push({ messageId, action: "redan_hamtat" });
          if (moveMail) {
            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
            await client.messageMove(String(uid), PROCESSED, { uid: true });
          }
          continue;
        }

        const sender = matchSender(fromEmail);
        const { data: msgRow } = await supabase
          .from("mail_intake_messages")
          .insert({
            message_id: messageId,
            from_email: fromEmail,
            from_name: fromAddr?.name || null,
            subject,
            sent_at: parsedMail.date ? new Date(parsedMail.date).toISOString() : null,
            folder,
            attachment_count: attachments.length,
            supplier_id: sender?.supplier_id ?? null,
            status: sender ? "behandlad" : "okand_avsandare",
          })
          .select("id")
          .single();

        // Okänd avsändare: parkeras, bilagan öppnas eller tolkas aldrig.
        if (!sender) {
          if (moveMail) {
            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
            await client.messageMove(String(uid), PARKED, { uid: true });
          }
          results.push({ messageId, fromEmail, subject, action: "parkerad_okand_avsandare" });
          continue;
        }

        for (const att of attachments) {
          const bytes = new Uint8Array(att.content as ArrayBufferLike);
          const hash = await sha256(bytes);
          const fileName = att.filename || `bilaga-${hash.slice(0, 8)}.pdf`;
          const ext = fileName.includes(".") ? fileName.split(".").pop() : "pdf";
          const path = `${(sender.supplier_id ?? "okand")}/${new Date().getUTCFullYear()}/${hash}.${ext}`;

          const { data: dupe } = await supabase
            .from("supplier_documents")
            .select("id, document_number")
            .eq("file_hash", hash)
            .maybeSingle();
          if (dupe) {
            skipped++;
            results.push({ messageId, fileName, action: "dubblett_stoppad", duplicateOf: dupe.id });
            continue;
          }

          await supabase.storage.from(BUCKET).upload(path, bytes, {
            contentType: att.contentType || "application/pdf",
            upsert: true,
          });

          const { data: doc, error: docErr } = await supabase
            .from("supplier_documents")
            .insert({
              message_id: msgRow?.id ?? null,
              storage_path: path,
              file_name: fileName,
              file_hash: hash,
              mime_type: att.contentType || null,
              supplier_id: sender.supplier_id ?? null,
              legal_entity_id: sender.legal_entity_id ?? null,
              status: "utkast",
              parse_status: "vantar",
            })
            .select("id")
            .single();
          if (docErr || !doc) {
            results.push({ messageId, fileName, action: "kunde_inte_sparas", error: docErr?.message });
            continue;
          }
          stored++;

          // Tolkning med samma motor som den manuella inläsningen.
          try {
            const fileUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/${BUCKET}/${encodeURI(path)}`;
            const parseRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/parse-foljesedel`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ fileUrl, fileHash: hash }),
            });
            const parsed = await parseRes.json();
            if (!parseRes.ok || parsed.error) throw new Error(parsed.error || `status ${parseRes.status}`);

            const header = (parsed.document || {}) as Json;
            const docType = classify(header.document_type as string, subject, fileName);
            const documentNumber = (header.document_number as string | null) ??
              (docType === "foljesedel" ? (header.document_date as string | null) : null);

            // Dubblettspärr på dokumentnummer + leverantör.
            let duplicateOf: string | null = null;
            if (documentNumber && sender.supplier_id) {
              const { data: prev } = await supabase
                .from("supplier_documents")
                .select("id")
                .eq("supplier_id", sender.supplier_id)
                .eq("doc_type", docType)
                .ilike("document_number", documentNumber)
                .neq("id", doc.id)
                .maybeSingle();
              duplicateOf = prev?.id ?? null;
            }

            await supabase
              .from("supplier_documents")
              .update({
                doc_type: docType,
                document_number: duplicateOf ? null : documentNumber,
                document_date: (header.document_date as string) || null,
                delivery_date: (header.delivery_date as string) || null,
                total_ex_vat: (header.total_ex_vat as number) ?? null,
                parsed: { document: header, lines: parsed.products || [] },
                parse_status: "tolkad",
                status: duplicateOf ? "dubblett" : "utkast",
                duplicate_of: duplicateOf,
              })
              .eq("id", doc.id);

            results.push({
              messageId,
              fileName,
              action: duplicateOf ? "dubblett_stoppad" : "utkast_skapat",
              docType,
              documentNumber,
              lines: (parsed.products || []).length,
            });
          } catch (e) {
            await supabase
              .from("supplier_documents")
              .update({ parse_status: "fel", parse_error: e instanceof Error ? e.message : "okänt fel" })
              .eq("id", doc.id);
            results.push({ messageId, fileName, action: "tolkningsfel", error: String(e) });
          }
        }

        if (moveMail) {
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          await client.messageMove(String(uid), PROCESSED, { uid: true });
        }
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    console.error("mail-intake error:", e);
    try {
      await client.logout();
    } catch { /* ignore */ }
    return await finish(
      { ok: false, error: e instanceof Error ? e.message : "okänt fel", fetched, stored, skipped, unread_without_attachment: noAttachment },
      500,
    );
  }

  try {
    await client.logout();
  } catch { /* ignore */ }

  return await finish({
    ok: true,
    fetched,
    stored,
    skipped,
    unread_without_attachment: noAttachment,
    results,
  } as Json);
});
