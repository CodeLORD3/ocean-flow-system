import jsPDF from "jspdf";
import { CustomerOrder, ORDER_TYPE_LABELS } from "@/lib/customerOrders";

/**
 * Orderbekräftelse till kunden — samma text i papper som i SMS.
 * Priset är alltid en uppskattning: dagens pris gäller vid hämtning.
 */

const nf = (v: unknown, d = 2) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

function address(order: CustomerOrder) {
  return [order.delivery_street, order.delivery_postal_code, order.delivery_city]
    .filter(Boolean)
    .join(", ");
}

/** Kort text att skicka som SMS eller läsa upp i telefon. */
export function confirmationText(order: CustomerOrder, storeName?: string | null) {
  const when = `${order.wanted_date}${order.wanted_time ? ` kl ${String(order.wanted_time).slice(0, 5)}` : ""}`;
  const lines = (order.customer_order_lines || [])
    .filter((l) => l.pack_status !== "struken")
    .map(
      (l) =>
        `- ${l.is_free_text ? l.free_text_name || "Vara" : l.products?.name || "Vara"}: ${nf(
          l.quantity_ordered,
          3,
        )} ${l.unit}`,
    );

  return [
    `Hej ${order.customers_retail?.name || order.customer_name_snapshot || ""}!`.trim(),
    `Din beställning ${order.order_number} hos ${storeName || "oss"} är mottagen.`,
    order.order_type === "leverans"
      ? `Leverans ${when} till ${address(order) || "din adress"}.`
      : `Hämtas ${when} i butiken.`,
    "",
    ...lines,
    "",
    `Uppskattat belopp: ${nf(order.estimated_total)} kr.`,
    "Dagens pris gäller vid hämtning och du betalar för den vikt vi väger upp.",
    "Betalning sker i butiken.",
  ]
    .filter((r) => r !== undefined)
    .join("\n");
}

export function buildConfirmationDoc(order: CustomerOrder, storeName?: string | null) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 16;
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Orderbekräftelse", left, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${storeName || "Butik"} · ${order.order_number}`, left, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(order.customers_retail?.name || order.customer_name_snapshot || "Kund", left, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const phone = order.customers_retail?.phone || order.customer_phone_snapshot;
  if (phone) {
    doc.text(phone, left, y);
    y += 5;
  }
  doc.text(
    `${ORDER_TYPE_LABELS[order.order_type]} ${order.wanted_date}${
      order.wanted_time ? ` kl ${String(order.wanted_time).slice(0, 5)}` : ""
    }`,
    left,
    y,
  );
  y += 5;
  if (order.order_type === "leverans" && address(order)) {
    doc.text(address(order), left, y);
    y += 5;
  }
  if (order.guest_count) {
    doc.text(`Antal gäster: ${order.guest_count}`, left, y);
    y += 5;
  }
  if (order.allergy_note || (order.excluded_allergens || []).length > 0) {
    doc.setFont("helvetica", "bold");
    doc.text(
      `Allergi: ${[order.allergy_note, (order.excluded_allergens || []).join(", ")]
        .filter(Boolean)
        .join(" · ")}`,
      left,
      y,
    );
    doc.setFont("helvetica", "normal");
    y += 5;
  }
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Vara", left, y);
  doc.text("Mängd", left + 100, y);
  doc.text("Uppskattat pris", left + 140, y);
  y += 2;
  doc.setDrawColor(200);
  doc.line(left, y, 194, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const l of (order.customer_order_lines || []).filter((x) => x.pack_status !== "struken")) {
    if (y > 265) {
      doc.addPage();
      y = 20;
    }
    const name = l.is_free_text ? l.free_text_name || "Fritextrad" : l.products?.name || "Produkt";
    doc.text(doc.splitTextToSize(name, 96)[0] ?? "", left, y);
    doc.text(`${nf(l.quantity_ordered, 3)} ${l.unit}`, left + 100, y);
    const est = l.estimated_price_per_unit;
    doc.text(
      est != null ? `${nf(Number(est) * Number(l.quantity_ordered))} kr` : "—",
      left + 140,
      y,
    );
    y += 6;
    if (l.note) {
      doc.setFontSize(8);
      doc.text(`  ${l.note}`, left, y);
      doc.setFontSize(10);
      y += 4;
    }
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Uppskattat belopp: ${nf(order.estimated_total)} kr`, left, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  for (const row of [
    "Uppskattat pris — dagens pris gäller vid hämtning.",
    "Du betalar för den vikt vi väger upp när varan packas.",
    "Betalning sker i butiken vid hämtning eller leverans.",
  ]) {
    doc.text(row, left, y);
    y += 5;
  }

  return doc;
}

export function printConfirmation(order: CustomerOrder, storeName?: string | null) {
  const doc = buildConfirmationDoc(order, storeName);
  const url = doc.output("bloburl");
  window.open(url as unknown as string, "_blank");
}

/** Laddar ner ordern som PDF-fil, för mejl eller arkiv. */
export function downloadConfirmation(order: CustomerOrder, storeName?: string | null) {
  const doc = buildConfirmationDoc(order, storeName);
  doc.save(`${order.order_number}.pdf`);
}

