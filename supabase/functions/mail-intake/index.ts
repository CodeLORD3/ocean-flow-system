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
import { SimpleImap } from "./imap.ts";
import { simpleParser } from "npm:mailparser@3.7.1";
import { Buffer } from "node:buffer";

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

// Påminnelser, kravbrev och inkasso är rena betalningsärenden. De får aldrig
// bli inköpsrapport eller påverka partipriser, så de plockas ut FÖRE tolkningen.
const REMINDER_WORDS = [
  "paminnelse", "påminnelse", "betalningspaminnelse", "betalningspåminnelse",
  "inkasso", "kravbrev", "betalningskrav", "dröjsmål", "drojsmal",
  "dröjsmålsränta", "drojsmalsranta", "förfallen", "forfallen", "obetald",
  "reminder", "overdue", "dunning", "debt collection", "collection notice",
  "rappel", "mahnung", "sollecito",
];

export function isReminder(subject: string, fileName: string, docType?: string | null): boolean {
  const hay = `${subject} ${fileName} ${docType ?? ""}`.toLowerCase();
  return REMINDER_WORDS.some((w) => hay.includes(w));
}

// Nyhetsbrev och marknadsföring ska aldrig tolkas som inköpsdokument. De känns
// igen på massutskicks-headers (List-Unsubscribe, Precedence: bulk) eller på
// typiska reklamord i ämnesraden.
const NEWSLETTER_WORDS = [
  "nyhetsbrev", "newsletter", "infolettre", "kampanj", "erbjudande", "rabatt",
  "förboka", "forboka", "säsongens", "sasongens", "avregistrera", "prenumer",
  "unsubscribe", "nyheter från", "nyheter fran", "inbjudan", "promotion",
  "angebot", "aktion", "veckans erbjudande", "vårt sortiment", "vart sortiment",
];

// Ord som visar att mejlet trots allt är ett affärsdokument.
const DOC_WORDS = [
  "faktura", "invoice", "följesedel", "foljesedel", "avräkning", "avrakning",
  "auktion", "kredit", "leveransbesked", "packsedel", "rechnung", "facture",
];

export function isNewsletter(
  subject: string,
  headers?: Map<string, unknown> | null,
  fileNames: string[] = [],
): boolean {
  const hay = `${subject} ${fileNames.join(" ")}`.toLowerCase();
  if (DOC_WORDS.some((w) => hay.includes(w))) return false;
  const get = (k: string) => {
    const v = headers?.get(k);
    return typeof v === "string" ? v.toLowerCase() : v ? String(v).toLowerCase() : "";
  };
  if (headers) {
    if (get("list-unsubscribe") || get("list-id") || get("list-help")) return true;
    if (/bulk|list|junk/.test(get("precedence"))) return true;
    if (get("x-campaign") || get("x-mailer-lid") || get("x-mailchimp-campaign-id")) return true;
    if (/mailchimp|sendgrid|mailerlite|klaviyo|hubspot|apsis|rule\.io|getanewsletter/.test(get("x-mailer"))) return true;
  }
  return NEWSLETTER_WORDS.some((w) => hay.includes(w));
}

function classify(docType: string | null | undefined, subject: string, fileName: string): string {
  if (isReminder(subject, fileName, docType)) return "paminnelse";
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
  // Inkorgen är standard; en testmapp kan pekas ut explicit.
  const folder = typeof body.folder === "string" && body.folder ? body.folder : "INBOX";
  // Varje mejl kostar mycket CPU (mailparser + tolkning), så vi tar få per körning
  // och avbryter innan edge-runtimens CPU-budget tar slut.
  const limit = typeof body.limit === "number" ? Math.min(body.limit, 10) : 3;
  const moveMail = body.move !== false;
  const startedAt = Date.now();
  const BUDGET_MS = 55_000;


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
    .select("pattern, kind, supplier_id, legal_entity_id, active, is_portal")
    .eq("active", true);

  const matchSender = (email: string) => {
    const addr = email.toLowerCase();
    const domain = addr.split("@")[1] || "";
    return (senders || []).find((s) => {
      const p = (s.pattern || "").toLowerCase().replace(/^@/, "");
      return s.kind === "domain" ? domain === p || domain.endsWith(`.${p}`) : addr === p;
    }) || null;
  };


  // Förmedlare (t.ex. Fortnox) skickar från samma adress för många leverantörer.
  // Då avgörs leverantören per dokument utifrån namnet i PDF:en.
  const { data: allSuppliers } = await supabase.from("suppliers").select("id, name");
  const norm = (v: string) => v.toLowerCase().replace(/\b(ab|aktiebolag|as|a\/s|oy|gmbh|ag|hb|kb|sarl|ltd)\b/g, "").replace(/[^a-z0-9åäö]+/g, " ").trim();
  const resolveSupplier = (name?: string | null) => {
    if (!name) return null;
    const target = norm(String(name));
    if (!target) return null;
    const list = allSuppliers || [];
    const exact = list.find((s) => norm(s.name) === target);
    if (exact) return exact.id as string;
    const partial = list.find((s) => {
      const n = norm(s.name);
      return n.length >= 4 && (target.includes(n) || n.includes(target));
    });
    return (partial?.id as string) ?? null;
  };

  const client = new SimpleImap("mailcluster.loopia.se", 993);

  let fetched = 0;
  let stored = 0;
  let skipped = 0;
  let noAttachment = 0;
  const results: Json[] = [];

  try {
    await client.connect(user, pass);
    for (const name of [PROCESSED, PARKED]) {
      await client.createMailbox(name);
    }

    // Hitta rätt mapp (case-insensitivt), annars fall tillbaka till INBOX
    let targetFolder = folder;
    if (folder.toUpperCase() !== "INBOX") {
      const boxes = await client.listMailboxes();
      const hit = boxes.find(
        (p) =>
          p.toLowerCase() === folder.toLowerCase() ||
          p.toLowerCase().endsWith(`.${folder.toLowerCase()}`) ||
          p.toLowerCase().endsWith(`/${folder.toLowerCase()}`),
      );
      targetFolder = hit || "INBOX";
    }
    console.log("mail-intake: öppnar mapp", targetFolder);

    {
      await client.select(targetFolder);
      const uids = await client.searchUnseenUids();
      console.log("mail-intake: olästa", uids.length);
      const batch = uids.slice(-limit);

      for (const uid of batch) {
        if (Date.now() - startedAt > BUDGET_MS) {
          console.log("mail-intake: avbryter, tidsbudget slut");
          break;
        }
        fetched++;
        console.log("mail-intake: hämtar uid", uid);
        let source: Uint8Array | null = null;
        try {

          source = await client.fetchSource(uid);
        } catch (e) {
          console.log("mail-intake: kunde inte hämta uid", uid, String(e));
        }
        console.log("mail-intake: hämtad", uid, source?.length ?? 0);
        if (!source) continue;
        const parsedMail = await simpleParser(Buffer.from(source));
        console.log("mail-intake: tolkad", uid, parsedMail.subject || "");
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
            await client.markSeen(uid);
            await client.moveUid(uid, PROCESSED);
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
            await client.markSeen(uid);
            await client.moveUid(uid, PARKED);
          }
          results.push({ messageId, fromEmail, subject, action: "parkerad_okand_avsandare" });
          continue;
        }

        for (const att of attachments) {
          const bytes = new Uint8Array(att.content as ArrayBufferLike);
          const hash = await sha256(bytes);
          const fileName = att.filename || `bilaga-${hash.slice(0, 8)}.pdf`;
          const ext = fileName.includes(".") ? fileName.split(".").pop() : "pdf";
          const path = `${(sender.supplier_id ?? (sender.is_portal ? "formedlare" : "okand"))}/${new Date().getUTCFullYear()}/${hash}.${ext}`;

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

          // Påminnelse/inkasso: arkiveras som information, tolkas inte och kan
          // aldrig attesteras — den ska inte påverka inköp, lager eller priser.
          if (isReminder(subject, fileName)) {
            await supabase
              .from("supplier_documents")
              .update({
                doc_type: "paminnelse",
                parse_status: "ej_tolkad",
                status: "endast_info",
                reject_reason: "Betalningspåminnelse/inkasso — påverkar inte inköp eller priser",
              })
              .eq("id", doc.id);
            results.push({ messageId, fileName, action: "paminnelse_arkiverad" });
            continue;
          }



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

            // Förmedlaravsändare: identifiera leverantören ur dokumentet.
            let docSupplierId: string | null = sender.supplier_id ?? null;
            if (!docSupplierId) {
              docSupplierId = resolveSupplier(
                (header.supplier_name as string) ?? (header.supplier as string) ?? null,
              );
              if (docSupplierId) {
                await supabase.from("supplier_documents").update({ supplier_id: docSupplierId }).eq("id", doc.id);
              }
            }

            // Dubblettspärr på dokumentnummer + leverantör.
            let duplicateOf: string | null = null;
            if (documentNumber && docSupplierId) {
              const { data: prev } = await supabase
                .from("supplier_documents")
                .select("id")
                .eq("supplier_id", docSupplierId)
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
              supplierResolved: !!docSupplierId,
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
          await client.markSeen(uid);
          await client.moveUid(uid, PROCESSED);
        }
      }
    }
  } catch (e) {
    console.error("mail-intake error:", e);
    try {
      await client.close();
    } catch { /* ignore */ }
    return await finish(
      { ok: false, error: e instanceof Error ? e.message : "okänt fel", fetched, stored, skipped, unread_without_attachment: noAttachment },
      500,
    );
  }

  try {
    await client.close();
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
