/**
 * Attest av leverantörsdokument som hämtats från mejl.
 *
 * Ingenting bokförs automatiskt: dokumentet ligger som utkast tills personal
 * attesterar. Attest av en följesedel skapar exakt samma inköpsrapport och
 * rader som den manuella uppladdningen gör — samma matchning, samma fält — så
 * att partibildningen (purchaseReportPosting) fungerar identiskt.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildSupplierIndex, lookupSupplier, matchProduct } from "@/lib/foljesedelMatch";
import type { MatchProduct } from "@/lib/foljesedelMatch";
import type { SizeGrade } from "@/lib/sizeGrades";

export interface SupplierDocument {
  id: string;
  storage_path: string;
  file_name: string | null;
  file_hash: string | null;
  doc_type: string;
  supplier_id: string | null;
  legal_entity_id: string | null;
  document_number: string | null;
  document_date: string | null;
  delivery_date: string | null;
  total_ex_vat: number | null;
  parsed: { document?: Record<string, any>; lines?: any[] } | null;
  parse_status: string;
  parse_error: string | null;
  status: string;
  reject_reason: string | null;
  duplicate_of: string | null;
  purchase_report_id: string | null;
  approved_at: string | null;
  created_at: string;
  message_id: string | null;
}

export interface ApproveContext {
  products: MatchProduct[];
  suppliers: { id: string; name: string }[];
  sizeGrades: SizeGrade[];
  staffId?: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Publik-URL-formen som resten av inköpsrapporteringen använder för filvisning. */
export function documentFileUrl(path: string): string {
  const { data } = supabase.storage.from("leverantorsdokument").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Skapar inköpsrapporten med rader från ett attesterat följesedelsutkast.
 * Returnerar rapportens id — partierna bokförs sedan med samma dialog som vid
 * manuell inläsning, så att bokföringen är en enda kodväg.
 */
export async function approveDeliveryNote(
  doc: SupplierDocument,
  ctx: ApproveContext,
): Promise<string> {
  if (doc.status === "dubblett") throw new Error("Dokumentet är redan registrerat.");
  if (doc.doc_type === "paminnelse") {
    throw new Error("Påminnelser och inkassokrav kan inte bokföras som inköp.");
  }
  if (doc.parse_status !== "tolkad") throw new Error("Dokumentet är inte tolkat.");

  if (doc.purchase_report_id) return doc.purchase_report_id;

  const header = doc.parsed?.document ?? {};
  const lines = doc.parsed?.lines ?? [];
  const supplierId =
    doc.supplier_id ??
    (header.supplier_name
      ? lookupSupplier(buildSupplierIndex(ctx.suppliers as any), String(header.supplier_name))?.id ?? null
      : null);

  // Dubblettspärr mot redan bokförda rapporter innan något skapas.
  if (supplierId && (doc.document_number || doc.document_date)) {
    let q = supabase.from("purchase_reports").select("id, file_name").eq("supplier_id", supplierId);
    q = doc.document_number
      ? q.eq("document_number", doc.document_number)
      : q.eq("document_date", doc.document_date!);
    const { data: dup } = await q.limit(1).maybeSingle();
    if (dup) {
      await supabase
        .from("supplier_documents")
        .update({ status: "dubblett", reject_reason: `Redan registrerad som ${(dup as any).file_name ?? "inköpsrapport"}` })
        .eq("id", doc.id);
      throw new Error("Redan registrerad — inköpsrapport med samma dokumentnummer finns.");
    }
  }

  const docDate = doc.document_date || doc.delivery_date || today();
  const { data: report, error: reportError } = await supabase
    .from("purchase_reports")
    .insert({
      file_name: doc.file_name ?? "Mejlinlopp",
      file_url: documentFileUrl(doc.storage_path),
      file_hash: doc.file_hash,
      status: "Bearbetar",
      report_date: docDate,
      supplier_id: supplierId,
      supplier_name_raw: (header.supplier_name as string) ?? null,
      document_number: doc.document_number,
      document_type: doc.doc_type,
      document_date: doc.document_date,
      delivery_date: doc.delivery_date,
      total_ex_vat: doc.total_ex_vat,
      legal_entity_id: doc.legal_entity_id,
      notes: (header.notes as string) ?? null,
    } as any)
    .select("id")
    .single();
  if (reportError || !report) throw reportError ?? new Error("Kunde inte skapa inköpsrapport");

  const [{ data: aliases }, { data: articleMap }] = await Promise.all([
    supabase.from("species_latin_aliases").select("alias, latin_name"),
    supabase.from("supplier_article_map").select("supplier_id, supplier_article_no, product_id"),
  ]);

  const accepted: any[] = [];
  const rejected: any[] = [];

  lines.forEach((p: any, index: number) => {
    if (!p.product_name || !(Number(p.quantity) > 0)) {
      rejected.push({
        report_id: report.id,
        row_index: index + 1,
        reason: !p.product_name ? "Produktnamn saknas" : "Kvantitet saknas eller är noll",
        raw_data: p,
      });
      return;
    }

    const match = matchProduct(p, {
      products: ctx.products,
      aliases: (aliases ?? []) as any,
      articleMap: (articleMap ?? []) as any,
      supplierId,
      grades: ctx.sizeGrades as any,
    });

    const qty = Number(p.quantity) || 0;
    const unitPrice = Number(p.unit_price ?? 0) || 0;
    const lineTotal = Number(p.line_total ?? 0) || 0;
    const ordered = Number(p.ordered_quantity ?? 0) || null;

    accepted.push({
      report_id: report.id,
      product_name: p.product_name,
      product_id: match.needsConfirmation ? null : match.productId,
      match_method: match.method,
      supplier_article_no: p.supplier_article_no ?? null,
      size_grade: p.size_grade ?? null,
      quantity: qty,
      ordered_quantity: ordered,
      qty_variance_flag: !!ordered && Math.abs(qty - ordered) / ordered > 0.1,
      unit: p.unit ?? "kg",
      unit_price: unitPrice,
      line_total: lineTotal,
      amount_mismatch:
        lineTotal > 0 && unitPrice > 0 &&
        Math.abs(lineTotal - unitPrice * qty) > Math.max(1, lineTotal * 0.02),
      latin_name: p.latin_name ?? null,
      species_fao_code: p.species_fao_code ?? null,
      lot_numbers: Array.isArray(p.lot_numbers) ? p.lot_numbers.filter(Boolean) : [],
      best_before: p.best_before ?? null,
      catch_area: p.catch_area ?? null,
      catch_date_from: p.catch_date_from ?? null,
      catch_date_to: p.catch_date_to ?? null,
      fishing_gear: p.fishing_gear ?? null,
      fishing_gear_code: p.fishing_gear_code ?? null,
      vessel_name: p.vessel_name ?? null,
      vessel_reg: p.vessel_reg ?? null,
      vessel_nation: p.vessel_nation ?? null,
      presentation: p.presentation ?? null,
      condition: p.condition ?? null,
      grade: p.grade ?? null,
      certificate: p.certificate ?? null,
      supplier_name: (header.supplier_name as string) ?? null,
      status: "Inköpt",
      purchase_date: docDate,
    });
  });

  if (rejected.length) await supabase.from("purchase_report_rejected_lines").insert(rejected);
  if (accepted.length) {
    const { error } = await supabase.from("purchase_report_lines").insert(accepted);
    if (error) throw error;
  }

  const total = accepted.reduce((s, p) => s + (p.line_total ?? 0), 0);
  await supabase
    .from("purchase_reports")
    .update({ status: accepted.length ? "Klar" : "Inga produkter hittades", total_amount: total })
    .eq("id", report.id);

  await supabase
    .from("supplier_documents")
    .update({
      status: "attesterad",
      purchase_report_id: report.id,
      approved_at: new Date().toISOString(),
      supplier_id: supplierId,
    })
    .eq("id", doc.id);

  return report.id as string;
}

export interface InvoiceMatchRow {
  lotId: string;
  lotNumber: string;
  productName: string;
  previousCost: number | null;
  invoiceCost: number;
  diff: number | null;
}

/**
 * Trevägsmatchning: fakturans rader mot följesedelns partier via
 * dokumentnummer/leverantör. Visar prisdiff per rad utan att ändra något.
 */
export async function matchInvoiceToLots(doc: SupplierDocument): Promise<InvoiceMatchRow[]> {
  const lines = doc.parsed?.lines ?? [];
  if (!doc.supplier_id || lines.length === 0) return [];

  const { data: lots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_cost, product_id, products(name), supplier_id")
    .eq("supplier_id", doc.supplier_id)
    .eq("price_status", "preliminar");

  const rows: InvoiceMatchRow[] = [];
  (lines as any[]).forEach((line) => {
    const numbers: string[] = Array.isArray(line.lot_numbers) ? line.lot_numbers : [];
    const invoiceCost = Number(line.unit_price ?? 0) || 0;
    if (!invoiceCost) return;
    (lots ?? []).forEach((lot: any) => {
      const hit = numbers.some((n) => String(lot.lot_number).includes(String(n))) ||
        (line.product_name && lot.products?.name &&
          String(lot.products.name).toLowerCase() === String(line.product_name).toLowerCase());
      if (!hit) return;
      const prev = lot.unit_cost === null ? null : Number(lot.unit_cost);
      rows.push({
        lotId: lot.id,
        lotNumber: lot.lot_number,
        productName: lot.products?.name ?? line.product_name,
        previousCost: prev,
        invoiceCost,
        diff: prev === null ? null : invoiceCost - prev,
      });
    });
  });
  return rows;
}

/** Attest av faktura: fastställer partipriset via samma RPC som manuellt flöde. */
export async function approveInvoice(doc: SupplierDocument, rows: InvoiceMatchRow[]): Promise<number> {
  let updated = 0;
  for (const row of rows) {
    const { error } = await supabase.rpc("finalize_lot_price", {
      _lot_id: row.lotId,
      _final_unit_cost: row.invoiceCost,
      _invoice_number: doc.document_number,
      _invoice_date: doc.document_date,
    } as any);
    if (error) throw error;
    updated++;
  }
  await supabase
    .from("supplier_documents")
    .update({ status: "attesterad", approved_at: new Date().toISOString() })
    .eq("id", doc.id);
  return updated;
}

export async function rejectDocument(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from("supplier_documents")
    .update({ status: "avvisad", reject_reason: reason })
    .eq("id", id);
  if (error) throw error;
}
