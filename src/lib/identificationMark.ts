import type jsPDF from "jspdf";

/**
 * Ovalt identifieringsmärke enligt förordning (EG) 853/2004 bilaga II avsnitt I.
 * Märket ritas som vektor så att det alltid blir läsbart och outplånligt i
 * utskriften, även när ingen bildfil finns uppladdad på anläggningen.
 *
 * Innehåll: landskod (SE), godkännandenummer och förkortningen EG.
 */

export interface MarkContent {
  /** Landskod, normalt SE. */
  countryCode?: string | null;
  /** Godkännandenummer, exempelvis 6742. */
  approvalNumber?: string | null;
  /** Färdig märkestext, exempelvis "SE 6742 EG". Används om den finns. */
  markText?: string | null;
}

/** Delar upp märkestexten i tre rader: land, nummer, EG. */
export function markLines(mark: MarkContent): { top: string; middle: string; bottom: string } | null {
  const text = (mark.markText || "").trim();
  if (text) {
    const parts = text.split(/\s+/);
    if (parts.length >= 3) {
      return { top: parts[0], middle: parts.slice(1, -1).join(" "), bottom: parts[parts.length - 1] };
    }
    if (parts.length === 2) return { top: parts[0], middle: parts[1], bottom: "EG" };
  }
  const number = (mark.approvalNumber || "").trim();
  if (!number) return null;
  return { top: (mark.countryCode || "SE").trim().toUpperCase(), middle: number, bottom: "EG" };
}

/** Ritar märket centrerat i den angivna rutan. Returnerar false om uppgifter saknas. */
export function drawIdentificationMark(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  mark: MarkContent,
): boolean {
  const lines = markLines(mark);
  if (!lines) return false;

  const cx = x + width / 2;
  const cy = y + height / 2;

  doc.setDrawColor(0);
  doc.setLineWidth(Math.max(0.25, height * 0.035));
  doc.ellipse(cx, cy, width / 2, height / 2, "S");

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");

  const topSize = Math.max(4, height * 0.9);
  const midSize = Math.max(4.5, height * 1.05);

  doc.setFontSize(topSize);
  doc.text(lines.top, cx, cy - height * 0.16, { align: "center" });

  doc.setFontSize(midSize);
  doc.text(lines.middle, cx, cy + height * 0.14, { align: "center" });

  doc.setFontSize(topSize);
  doc.text(lines.bottom, cx, cy + height * 0.42, { align: "center" });

  return true;
}
