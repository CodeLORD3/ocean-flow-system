import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export const BUCKET = "personaldokument";

export function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function scriveBase() {
  return (Deno.env.get("SCRIVE_BASE_URL") || "https://api-testbed.scrive.com").replace(/\/$/, "");
}

function authHeader() {
  const ck = Deno.env.get("SCRIVE_CLIENT_ID"), cs = Deno.env.get("SCRIVE_CLIENT_SECRET");
  const tk = Deno.env.get("SCRIVE_TOKEN_ID"), ts = Deno.env.get("SCRIVE_TOKEN_SECRET");
  if (!ck || !cs || !tk || !ts) throw new Error("Scrive är inte kopplat än. Uppgifterna från Scrive saknas.");
  return `oauth_signature_method="PLAINTEXT", oauth_consumer_key="${ck}", oauth_token="${tk}", oauth_signature="${cs}&${ts}"`;
}

export async function scrive(path: string, init: RequestInit = {}) {
  const res = await fetch(`${scriveBase()}/api/v2${path}`, {
    ...init,
    headers: { Authorization: authHeader(), ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Scrive svarade ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

export interface Section { id: string; title: string; body: string }

/** Enkel A4-PDF av avtalets avsnitt. */
export async function buildPdf(title: string, sections: Section[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 56, maxW = W - 2 * M;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const clean = (s: string) => s.replace(/[\u2013\u2014]/g, "-").replace(/[^\x00-\xFF\n]/g, "");
  const wrap = (text: string, f: typeof font, size: number) => {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const w of para.split(" ")) {
        const t = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const draw = (text: string, f: typeof font, size: number, gap = 4) => {
    for (const l of wrap(text, f, size)) {
      if (y < M + size) { page = pdf.addPage([W, H]); y = H - M; }
      page.drawText(l, { x: M, y: y - size, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= size + gap;
    }
  };
  draw(title, bold, 18, 10);
  y -= 8;
  sections.forEach((s, i) => {
    draw(`${i + 1}. ${s.title}`, bold, 12, 6);
    draw(s.body, font, 10.5, 4);
    y -= 10;
  });
  y -= 20;
  draw("Avtalet undertecknas elektroniskt med BankID av båda parter.", font, 9, 4);
  return await pdf.save();
}

export function splitName(n: string) {
  const parts = n.trim().split(/\s+/);
  return { first: parts.shift() ?? "", last: parts.join(" ") };
}

/** Hämtar status från Scrive och skriver till avtalet. Sparar signerad PDF när klart. */
export async function syncFromScrive(db: ReturnType<typeof admin>, contract: any) {
  const doc = await (await scrive(`/documents/${contract.scrive_document_id}/get`)).json();
  const parties = (doc.parties ?? []).filter((p: any) => p.signatory_role === "signing_party");
  const sigs = (contract.signatories ?? []).map((s: any, i: number) => ({
    ...s,
    signed_at: parties[i]?.sign_time ?? s.signed_at ?? null,
  }));
  const signedCount = sigs.filter((s: any) => s.signed_at).length;
  let status = contract.status;
  if (doc.status === "canceled" || doc.status === "rejected" || doc.status === "timedout") status = "avbrutet";
  else if (doc.status === "closed") status = "signerat";
  else if (signedCount > 0) status = "delvis_signerat";
  const patch: any = { signatories: sigs, status };
  if (status === "signerat" && !contract.signed_pdf_path) {
    const file = await scrive(`/documents/${contract.scrive_document_id}/files/main/avtal.pdf`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `${contract.employee_id}/avtal_signerat_${contract.id}.pdf`;
    await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
    patch.signed_pdf_path = path;
    patch.signed_at = new Date().toISOString();
    await db.from("employee_documents").insert({
      employee_id: contract.employee_id,
      employment_id: contract.employment_id,
      doc_type: "anstallningsavtal",
      title: `${contract.title} (signerat)`,
      file_path: path,
      mime_type: "application/pdf",
      file_size: bytes.length,
      signature_status: "signed",
      signed_at: patch.signed_at,
    });
  }
  await db.from("employment_contracts").update(patch).eq("id", contract.id);
  return patch;
}
