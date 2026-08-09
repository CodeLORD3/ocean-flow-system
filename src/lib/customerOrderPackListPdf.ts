import jsPDF from "jspdf";
import { CustomerOrder, ORDER_TYPE_LABELS } from "@/lib/customerOrders";

/**
 * Papperslista att packa efter — reservrutin när skärmen inte räcker.
 * En rad per orderrad med rutor för vägd vikt, så listan kan fyllas i för hand.
 */

const nf = (v: unknown, d = 2) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

export function buildPackListDoc(params: {
  orders: CustomerOrder[];
  storeName?: string | null;
  dateLabel: string;
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 14;
  const right = 196;
  let y = 18;

  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Packlista kundbeställningar", left, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      [params.storeName || "Butik", params.dateLabel, `${params.orders.length} order`]
        .filter(Boolean)
        .join(" · "),
      left,
      y,
    );
    y += 6;
    doc.setDrawColor(180);
    doc.line(left, y, right, y);
    y += 6;
  };

  const pageBreak = (need = 20) => {
    if (y + need > 285) {
      doc.addPage();
      y = 18;
      header();
    }
  };

  header();

  for (const o of params.orders) {
    pageBreak(34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${o.order_number} — ${o.customers_retail?.name || o.customer_name_snapshot || "Kund"}`, left, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const meta = [
      ORDER_TYPE_LABELS[o.order_type],
      o.wanted_time ? `kl ${String(o.wanted_time).slice(0, 5)}` : null,
      o.customers_retail?.phone || o.customer_phone_snapshot || null,
      o.order_type === "leverans"
        ? [o.delivery_street, o.delivery_postal_code, o.delivery_city].filter(Boolean).join(", ")
        : null,
      o.guest_count ? `${o.guest_count} gäster` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    doc.text(meta, left, y);
    y += 5;

    if (o.allergy_note || (o.excluded_allergens || []).length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text(
        `Allergi: ${[o.allergy_note, (o.excluded_allergens || []).join(", ")].filter(Boolean).join(" · ")}`,
        left,
        y,
      );
      doc.setFont("helvetica", "normal");
      y += 5;
    }

    doc.setFontSize(8);
    doc.text("Vara", left, y);
    doc.text("Beställt", left + 96, y);
    doc.text("Vägd vikt", left + 126, y);
    doc.text("Packad", left + 160, y);
    y += 2;
    doc.setDrawColor(210);
    doc.line(left, y, right, y);
    y += 4;

    const lines = [...(o.customer_order_lines || [])]
      .filter((l) => l.pack_status !== "struken")
      .sort((a, b) => a.sort_order - b.sort_order);

    doc.setFontSize(9.5);
    for (const l of lines) {
      pageBreak(10);
      const name = l.is_free_text ? l.free_text_name || "Fritextrad" : l.products?.name || "Produkt";
      doc.text(doc.splitTextToSize(name, 92)[0] ?? "", left, y);
      doc.text(`${nf(l.quantity_ordered, 3)} ${l.unit}`, left + 96, y);
      doc.setDrawColor(150);
      doc.rect(left + 126, y - 3.5, 28, 5);
      doc.rect(left + 160, y - 3.5, 5, 5);
      if (l.note) {
        y += 4;
        doc.setFontSize(8);
        doc.text(`  ${l.note}`, left, y);
        doc.setFontSize(9.5);
      }
      y += 7;
    }

    if (o.note) {
      pageBreak(8);
      doc.setFontSize(8.5);
      doc.text(`Anteckning: ${o.note}`, left, y);
      y += 5;
    }

    doc.setDrawColor(180);
    pageBreak(8);
    doc.line(left, y, right, y);
    y += 7;
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("Dagens pris gäller vid hämtning. Vikten som packas är den vikt kunden betalar för.", left, 290);

  return doc;
}

export function printPackList(params: {
  orders: CustomerOrder[];
  storeName?: string | null;
  dateLabel: string;
}) {
  if (params.orders.length === 0) return;
  const doc = buildPackListDoc(params);
  const url = doc.output("bloburl");
  window.open(url as unknown as string, "_blank");
}
