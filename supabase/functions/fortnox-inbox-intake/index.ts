/**
 * fortnox-inbox-intake — hämtar digital post från Fortnox in i samma mejlinlopp
 * som IMAP-läsningen (supplier_documents.status = 'utkast').
 *
 * Hämtar tre källor för ett bolag (standard: fsab-se):
 *  1. Fortnox Inbox (inbox, inbox_s, inbox_v, inbox_d) — filer som skickats till bolaget
 *  2. Fortnox arkiv (Arkivplats) — mappar och filer, rekursivt med djupgräns
 *  3. Registrerade leverantörsfakturor — läses in som tolkade utkast för matchning
 *
 * Grundregler (samma som mail-intake):
 *  - Ingenting bokförs automatiskt. Allt landar som utkast för attest.
 *  - Dubbletter stoppas på filhash och på dokumentnummer + leverantör.
 *  - Påminnelser/inkasso arkiveras som information och kan aldrig attesteras.
 */
import { adminClient, corsHeaders, fortnoxRequest, getAccessToken, json, FORTNOX_API } from "../_shared/fortnox.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "leverantorsdokument";
const INBOX_PATHS = ["inbox", "inbox_s", "inbox_v", "inbox_d"];
const MAX_DEPTH = 3;

type Json = Record<string, unknown>;

const sha256 = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const REMINDER_WORDS = [
  "paminnelse", "påminnelse", "betalningspaminnelse", "betalningspåminnelse",
  "inkasso", "kravbrev", "betalningskrav", "dröjsmål", "drojsmal", "förfallen",
  "forfallen", "obetald", "reminder", "overdue", "dunning", "mahnung",
];
const isReminder = (text: string) => {
  const hay = text.toLowerCase();
  return REMINDER_WORDS.some((w) => hay.includes(w));
};

const isDoc = (name: string) => /\.(pdf|png|jpe?g|webp|gif|tiff?)$/i.test(name);

function classify(name: string): string {
  const hay = name.toLowerCase();
  if (isReminder(hay)) return "paminnelse";
  if (hay.includes("kredit")) return "kreditnota";
  if (hay.includes("faktura") || hay.includes("invoice") || hay.includes("rechnung")) return "faktura";
  if (hay.includes("följesedel") || hay.includes("foljesedel") || hay.includes("avräkning") ||
      hay.includes("avrakning") || hay.includes("auktion") || hay.includes("packsedel")) return "foljesedel";
  return "ovrigt";
}

const mimeFor = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
};

/**
 * Laddar ner en fil som binär. fortnoxRequest kan bara JSON, så vi hämtar själva.
 * Inboxfiler ligger under /inbox/{id}, arkivfiler under /archive/{id}.
 */
async function downloadFile(
  sb: SupabaseClient,
  entity: string,
  fileId: string,
  base: "inbox" | "archive",
): Promise<Uint8Array> {
  const token = await getAccessToken(sb, entity);
  const res = await fetch(`${FORTNOX_API}/${base}/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" },
  });
  if (!res.ok) throw new Error(`Kunde inte hämta fil ${fileId} från Fortnox (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

type ArchiveFile = { id: string; name: string; path: string; date: string | null; base: "inbox" | "archive" };

/** Läser en mapp i inbox eller arkiv och returnerar filer + undermappar. */
async function readFolder(
  sb: SupabaseClient,
  entity: string,
  base: "inbox" | "archive",
  query: string,
  label: string,
): Promise<{ files: ArchiveFile[]; folders: { id: string; name: string }[] }> {
  const res = await fortnoxRequest<any>(sb, entity, "GET", `/${base}/${query}`);
  const folder = res?.Folder ?? res;
  const files: ArchiveFile[] = (folder?.Files ?? [])
    .map((f: any) => ({
      id: String(f.Id ?? f.ArchiveFileId ?? ""),
      name: String(f.Name ?? "fil"),
      path: label,
      base,
      date: (() => {
        const raw = f.CreatedAt ?? f.Created ?? f.Date ?? f.UploadDate ?? null;
        return raw ? String(raw).slice(0, 10) : null;
      })(),
    }))
    .filter((f: ArchiveFile) => f.id);

  const folders = (folder?.Folders ?? [])
    .map((f: any) => ({ id: String(f.Id ?? ""), name: String(f.Name ?? "") }))
    .filter((f: { id: string }) => f.id);
  return { files, folders };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = adminClient();

  let body: Json = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch { body = {}; }

  const entity = typeof body.entity === "string" && body.entity ? body.entity : "fsab-se";
  const limit = typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 40) : 15;
  const includeArchive = body.archive !== false;
  const includeInvoices = body.invoices !== false;
  /**
   * Startgräns: bara post från och med detta datum hämtas — aldrig hela historiken.
   * Standard = 14 dagar bakåt (svensk tid), så färsk post inte missas när
   * körningen sker någon dag efter att filen kom in. Överstyrs med { since }.
   */
  const daysBack = typeof body.days === "number" && body.days > 0 ? Math.min(body.days, 120) : 14;
  const since =
    typeof body.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.since)
      ? body.since
      : new Date(Date.now() + 2 * 3600_000 - daysBack * 86_400_000).toISOString().slice(0, 10);
  const tooOld = (date?: string | null) => !!date && date.slice(0, 10) < since;



  const { data: run } = await sb
    .from("mail_intake_runs")
    .insert({ folder: `fortnox:${entity}` })
    .select("id")
    .single();
  const runId = run?.id as string | undefined;

  const finish = async (patch: Json, status = 200) => {
    if (runId) {
      const { results: _drop, ...columns } = patch as Json & { results?: unknown };
      await sb.from("mail_intake_runs")
        .update({ finished_at: new Date().toISOString(), ...columns })
        .eq("id", runId);
    }
    return json({ entity, ...patch }, status);
  };

  // Leverantörsuppslag ur dokumentets namn (samma normalisering som mail-intake).
  const { data: allSuppliers } = await sb.from("suppliers").select("id, name");
  const norm = (v: string) =>
    v.toLowerCase()
      .replace(/\b(ab|aktiebolag|as|a\/s|oy|gmbh|ag|hb|kb|sarl|ltd)\b/g, "")
      .replace(/[^a-z0-9åäö]+/g, " ")
      .trim();
  const resolveSupplier = (name?: string | null) => {
    if (!name) return null;
    const target = norm(String(name));
    if (!target) return null;
    const list = allSuppliers ?? [];
    const exact = list.find((s) => norm(s.name as string) === target);
    if (exact) return exact.id as string;
    const partial = list.find((s) => {
      const n = norm(s.name as string);
      return n.length >= 4 && (target.includes(n) || n.includes(target));
    });
    return (partial?.id as string) ?? null;
  };

  let fetched = 0;
  let stored = 0;
  let skipped = 0;
  const results: Json[] = [];

  try {
    // ---------- 1 + 2: Inbox och arkiv ----------
    const candidates: ArchiveFile[] = [];

    for (const path of INBOX_PATHS) {
      try {
        // Digital post ligger i inbox-API:t (/inbox/?path=inbox_s), inte i arkivet.
        const { files, folders } = await readFolder(sb, entity, "inbox", `?path=${path}`, path);
        candidates.push(...files);
        for (const folder of folders) {
          try {
            const sub = await readFolder(sb, entity, "inbox", `?folderid=${folder.id}`, `${path}/${folder.name}`);
            candidates.push(...sub.files);
          } catch { /* hoppa över undermappar vi inte får läsa */ }
        }
      } catch (e) {
        results.push({ source: `inbox:${path}`, action: "kunde_inte_lasas", error: String(e instanceof Error ? e.message : e) });
      }
    }


    if (includeArchive) {
      try {
        const root = await readFolder(sb, entity, "archive", "", "arkiv");
        candidates.push(...root.files);
        let level = root.folders.map((f) => ({ ...f, depth: 1 }));
        while (level.length && level[0].depth <= MAX_DEPTH) {
          const next: { id: string; name: string; depth: number }[] = [];
          for (const folder of level) {
            if (candidates.length >= limit * 3) break;
            try {
              const sub = await readFolder(sb, entity, "archive", `?folderid=${folder.id}`, `arkiv/${folder.name}`);
              candidates.push(...sub.files);
              next.push(...sub.folders.map((f) => ({ ...f, depth: folder.depth + 1 })));
            } catch { /* hoppa över mappar vi inte får läsa */ }
          }
          level = next;
        }
      } catch (e) {
        results.push({ source: "arkiv", action: "kunde_inte_lasas", error: String(e instanceof Error ? e.message : e) });
      }
    }

    for (const file of candidates) {

      if (stored >= limit) break;
      if (!isDoc(file.name)) { skipped++; continue; }
      if (tooOld(file.date)) { skipped++; continue; }

      fetched++;

      // Redan hämtad? Fortnox-ID:t ligger i storage_path, så vi slipper ladda om filen.
      const path = `fortnox/${entity}/${file.id}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { data: seen } = await sb
        .from("supplier_documents")
        .select("id")
        .eq("storage_path", path)
        .maybeSingle();
      if (seen) { skipped++; continue; }

      let bytes: Uint8Array;
      try {
        bytes = await downloadFile(sb, entity, file.id, file.base);
      } catch (e) {
        results.push({ file: file.name, action: "nedladdning_misslyckades", error: String(e instanceof Error ? e.message : e) });
        continue;
      }
      const hash = await sha256(bytes);

      const { data: dupe } = await sb
        .from("supplier_documents")
        .select("id")
        .eq("file_hash", hash)
        .maybeSingle();
      if (dupe) {
        skipped++;
        results.push({ file: file.name, action: "dubblett_stoppad", duplicateOf: dupe.id });
        continue;
      }

      await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mimeFor(file.name), upsert: true });

      const { data: doc, error: docErr } = await sb
        .from("supplier_documents")
        .insert({
          storage_path: path,
          file_name: file.name,
          file_hash: hash,
          mime_type: mimeFor(file.name),
          legal_entity_id: entity,
          supplier_id: resolveSupplier(file.name),
          status: "utkast",
          parse_status: "vantar",
        })
        .select("id")
        .single();
      if (docErr || !doc) {
        results.push({ file: file.name, action: "kunde_inte_sparas", error: docErr?.message });
        continue;
      }
      stored++;

      if (isReminder(file.name)) {
        await sb.from("supplier_documents").update({
          doc_type: "paminnelse",
          parse_status: "ej_tolkad",
          status: "endast_info",
          reject_reason: "Betalningspåminnelse/inkasso — påverkar inte inköp eller priser",
        }).eq("id", doc.id);
        results.push({ file: file.name, action: "paminnelse_arkiverad" });
        continue;
      }

      // Tolkning med samma motor som IMAP-inloppet och den manuella inläsningen.
      try {
        const { data: signed, error: signErr } = await sb.storage.from(BUCKET).createSignedUrl(path, 600);
        if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || "kunde inte signera fil-URL");
        const fileUrl = signed.signedUrl.startsWith("http")
          ? signed.signedUrl
          : `${Deno.env.get("SUPABASE_URL")}${signed.signedUrl}`;

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

        const header = (parsed.document ?? {}) as Json;
        const rawType = String(header.document_type ?? "");
        const docType = rawType ? classify(`${rawType} ${file.name}`) : classify(file.name);
        const documentNumber = (header.document_number as string | null) ??
          (docType === "foljesedel" ? (header.document_date as string | null) : null);

        let docSupplierId = resolveSupplier(
          (header.supplier_name as string) ?? (header.supplier as string) ?? file.name,
        );
        if (docSupplierId) {
          await sb.from("supplier_documents").update({ supplier_id: docSupplierId }).eq("id", doc.id);
        }

        let duplicateOf: string | null = null;
        if (documentNumber && docSupplierId) {
          const { data: prev } = await sb
            .from("supplier_documents")
            .select("id")
            .eq("supplier_id", docSupplierId)
            .eq("doc_type", docType)
            .ilike("document_number", documentNumber)
            .neq("id", doc.id)
            .maybeSingle();
          duplicateOf = prev?.id ?? null;
        }

        await sb.from("supplier_documents").update({
          doc_type: docType,
          document_number: duplicateOf ? null : documentNumber,
          document_date: (header.document_date as string) || null,
          delivery_date: (header.delivery_date as string) || null,
          total_ex_vat: (header.total_ex_vat as number) ?? null,
          parsed: { document: header, lines: parsed.products ?? [] },
          parse_status: "tolkad",
          status: duplicateOf ? "dubblett" : "utkast",
          duplicate_of: duplicateOf,
        }).eq("id", doc.id);

        results.push({
          file: file.name,
          source: file.path,
          action: duplicateOf ? "dubblett_stoppad" : "utkast_skapat",
          docType,
          documentNumber,
          lines: (parsed.products ?? []).length,
        });
      } catch (e) {
        await sb.from("supplier_documents")
          .update({ parse_status: "fel", parse_error: e instanceof Error ? e.message : "okänt fel" })
          .eq("id", doc.id);
        results.push({ file: file.name, action: "tolkningsfel", error: String(e) });
      }
    }

    // ---------- 3: Registrerade leverantörsfakturor ----------
    let invoices = 0;
    if (includeInvoices) {
      try {
        const list = await fortnoxRequest<any>(sb, entity, "GET", "/supplierinvoices?limit=50&sortorder=descending");
        for (const head of (list?.SupplierInvoices ?? [])) {
          const nr = String(head.GivenNumber ?? head.DocumentNumber ?? "");
          if (!nr) continue;
          // Historiska fakturor hoppas över — bara från startgränsen och framåt.
          if (tooOld(head.InvoiceDate ?? head.DueDate ?? null)) { skipped++; continue; }
          const supplierName = String(head.SupplierName ?? "");

          const supplierId = resolveSupplier(supplierName);
          const storagePath = `fortnox/${entity}/supplierinvoice-${nr}.json`;

          const { data: seen } = await sb
            .from("supplier_documents")
            .select("id")
            .eq("storage_path", storagePath)
            .maybeSingle();
          if (seen) { skipped++; continue; }

          const detail = await fortnoxRequest<any>(sb, entity, "GET", `/supplierinvoices/${encodeURIComponent(nr)}`);
          const inv = detail?.SupplierInvoice ?? head;

          // Fortnox SupplierInvoiceRows är BOKFÖRINGSrader (konto, debet/kredit) —
          // de innehåller inga artiklar, mängder eller à-priser. Vi visar dem därför
          // som konteringsinformation och aldrig som inköpsrader.
          const accountRows = (inv?.SupplierInvoiceRows ?? [])
            .map((r: any) => {
              const debit = Number(r.Debit ?? 0) || 0;
              const credit = Number(r.Credit ?? 0) || 0;
              return {
                account: r.Account != null ? String(r.Account) : null,
                description: String(r.Description ?? r.Information ?? r.TransactionInformation ?? "").trim() || null,
                amount: debit - credit || null,
              };
            })
            .filter((r: { account: string | null; amount: number | null }) => r.account || r.amount);

          // Riktiga artikelrader finns bara i den bifogade fakturafilen. Den läses in
          // separat via mejlinloppet/arkivet, så här skapas inga produktrader.
          const rows: Json[] = [];

          const payload = JSON.stringify({ source: "fortnox_supplierinvoice", invoice: inv }, null, 2);
          const bytes = new TextEncoder().encode(payload);
          await sb.storage.from(BUCKET).upload(storagePath, bytes, {
            contentType: "application/json",
            upsert: true,
          });

          const reminder = isReminder(`${inv?.Comments ?? ""} ${supplierName}`);
          const { error: invErr } = await sb.from("supplier_documents").insert({
            storage_path: storagePath,
            file_name: `Leverantörsfaktura ${nr} – ${supplierName || "okänd leverantör"}`,
            file_hash: await sha256(bytes),
            mime_type: "application/json",
            legal_entity_id: entity,
            supplier_id: supplierId,
            doc_type: reminder ? "paminnelse" : (Number(inv?.Total ?? 0) < 0 ? "kreditnota" : "faktura"),
            document_number: nr,
            document_date: (inv?.InvoiceDate as string) || null,
            delivery_date: (inv?.DueDate as string) || null,
            total_ex_vat: Number(inv?.Total ?? 0) - Number(inv?.VAT ?? 0) || null,
            currency: inv?.Currency ?? null,
            parsed: {
              document: {
                document_number: nr,
                document_type: "faktura",
                supplier_name: supplierName,
                document_date: inv?.InvoiceDate ?? null,
                total_ex_vat: Number(inv?.Total ?? 0) - Number(inv?.VAT ?? 0) || null,
                currency: inv?.Currency ?? null,
                source: "fortnox_supplierinvoice",
              },
              lines: rows,
              account_rows: accountRows,
            },
            parse_status: rows.length ? "tolkad" : "ej_tolkad",
            status: "endast_info",
            reject_reason: reminder
              ? "Betalningspåminnelse/inkasso — påverkar inte inköp eller priser"
              : "Redan registrerad leverantörsfaktura i Fortnox — referens, saknar artikelrader",
          });
          if (invErr) {
            results.push({ invoice: nr, action: "kunde_inte_sparas", error: invErr.message });
            continue;
          }
          invoices++;
          stored++;
          results.push({ invoice: nr, supplier: supplierName, action: "utkast_skapat", lines: rows.length });
        }
      } catch (e) {
        results.push({ source: "supplierinvoices", action: "kunde_inte_lasas", error: String(e instanceof Error ? e.message : e) });
      }
    }

    return await finish({ ok: true, fetched, stored, skipped, invoices, unread_without_attachment: 0, results });
  } catch (e) {
    console.error("fortnox-inbox-intake error:", e);
    return await finish({
      ok: false,
      error: e instanceof Error ? e.message : "okänt fel",
      fetched, stored, skipped,
      unread_without_attachment: 0,
    }, 500);
  }
});
