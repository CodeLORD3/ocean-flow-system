import { MANUAL_CHAPTERS } from "./manualContent";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Bygger en fristående, utskriftsvänlig HTML-version av manualen. */
export function buildManualPrintHtml(origin = window.location.origin) {
  const toc = MANUAL_CHAPTERS.map((c) => `<li>${esc(c.title)}</li>`).join("");

  const body = MANUAL_CHAPTERS.map(
    (c) => `
    <section class="ch">
      <h2>${esc(c.title)}</h2>
      ${c.route ? `<p class="route">Sida i menyn: ${esc(c.route)}</p>` : ""}
      <p class="purpose">${esc(c.purpose)}</p>
      ${
        c.image
          ? `<figure><img src="${origin}${c.image}" alt="Skärmdump: ${esc(c.title)}" /></figure>`
          : ""
      }
      <h3>Så gör du</h3>
      <ol>${c.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      ${
        c.tips?.length
          ? `<div class="tips"><h3>Bra att veta</h3><ul>${c.tips
              .map((t) => `<li>${esc(t)}</li>`)
              .join("")}</ul></div>`
          : ""
      }
      <h3>Om det strular</h3>
      <dl>${c.problems
        .map((p) => `<dt>${esc(p.q)}</dt><dd>${esc(p.a)}</dd>`)
        .join("")}</dl>
    </section>`
  ).join("");

  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8" />
<title>Butiksmanual – Fiskskaldjur</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #16202b; margin: 0; font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 22pt; margin: 0 0 4mm; }
  .lead { color: #55636f; margin: 0 0 8mm; }
  .toc { border: 1px solid #dfe4e8; padding: 5mm 5mm 5mm 10mm; margin-bottom: 8mm; }
  .toc h2 { font-size: 11pt; margin: 0 0 3mm; }
  .toc ol { margin: 0; padding-left: 4mm; color: #55636f; font-size: 10pt; }
  .ch { border-top: 2px solid #16202b; padding-top: 4mm; margin-top: 8mm; page-break-inside: avoid; break-inside: avoid; }
  .ch h2 { font-size: 14pt; margin: 0 0 2mm; }
  .ch h3 { font-size: 10.5pt; margin: 5mm 0 2mm; }
  .route { font-size: 9pt; color: #7b8794; margin: 0 0 2mm; }
  .purpose { margin: 0; color: #3c4a57; }
  figure { margin: 4mm 0; border: 1px solid #dfe4e8; }
  img { display: block; width: 100%; max-height: 105mm; object-fit: contain; }
  ol, ul { margin: 0; padding-left: 6mm; }
  li { margin-bottom: 1.5mm; }
  .tips { background: #f6f8f9; border: 1px solid #dfe4e8; padding: 3mm 3mm 3mm 1mm; margin-top: 4mm; }
  .tips h3 { margin: 0 0 2mm 5mm; }
  dl { margin: 0; border: 1px solid #dfe4e8; }
  dt { font-weight: 600; padding: 2.5mm 3mm 0; }
  dd { margin: 0; padding: 1mm 3mm 2.5mm; color: #55636f; font-size: 10pt; border-bottom: 1px solid #eef1f3; }
  dd:last-child { border-bottom: none; }
  footer { margin-top: 10mm; font-size: 9pt; color: #7b8794; }
</style></head>
<body>
  <h1>Butiksmanual</h1>
  <p class="lead">Så fungerar butiksportalen: vad varje funktion är till för, hur du gör steg för steg, och vad du gör när något strular.</p>
  <div class="toc"><h2>Innehåll</h2><ol>${toc}</ol></div>
  ${body}
  <footer>Fråga först din butikschef. Varor, leveranser och priser – skriv till grossisten i Chatt. Fel i systemet – använd Rapportera fel.</footer>
</body></html>`;
}

/** Öppnar manualen i ett nytt fönster och startar utskriften. */
export function printManual() {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(buildManualPrintHtml());
  w.document.close();
  const start = () => setTimeout(() => w.print(), 400);
  if (w.document.readyState === "complete") start();
  else w.addEventListener("load", start);
}
