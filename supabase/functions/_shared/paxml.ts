/**
 * PAXml 2.2 (www.paxml.se/2.2/paxml.xsd) — ren funktion så att filen kan testas mot schemat.
 * Tid och frånvaro blir <tidtrans>, belopp blir <lonetrans>, och varje persons timlön
 * skrivs i <personal> (<timlon datum="…">) — bara anställningsnummer, namn, löneform och timlön.
 */
export interface PaxmlLine {
  anstid: string;
  code: string;
  kind: "attendance" | "absence" | "salary";
  date: string;
  quantity: number;
  extent_pct: number | null;
  unit_amount: number | null;
  cost_center: string | null;
}
export interface PaxmlPerson {
  anstid: string;
  first_name: string;
  last_name: string;
  hourly: { from: string; rate: number }[];
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dec = (v: number | null | undefined) => (Math.round(Number(v ?? 0) * 100) / 100).toFixed(2);
// Våra koder utan svenska tecken → PAXml:s kodlista.
const TIDKOD: Record<string, string> = { NAR: "NÄR", OT1: "ÖT1", OT2: "ÖT2", OT3: "ÖT3", OT4: "ÖT4", OT5: "ÖT5" };

export function buildPaxml(opts: { lines: PaxmlLine[]; persons: PaxmlPerson[]; companyName?: string; orgNr?: string; createdAt?: string }): string {
  const tid: string[] = [];
  const lon: string[] = [];
  for (const l of opts.lines) {
    if (l.kind === "salary") {
      const antal = Number(l.quantity ?? 0);
      const apris = Number(l.unit_amount ?? 0);
      lon.push(
        `    <lonetrans anstid="${esc(l.anstid)}"><lonart>${esc(l.code)}</lonart><datum>${l.date}</datum><antal>${dec(antal)}</antal><apris>${dec(apris)}</apris><belopp>${dec(antal * apris)}</belopp></lonetrans>`,
      );
      continue;
    }
    const code = TIDKOD[l.code] ?? l.code;
    const omf = l.kind === "absence" && l.extent_pct != null && Number(l.extent_pct) > 0 ? `<omfattning>${dec(l.extent_pct)}</omfattning>` : "";
    tid.push(`    <tidtrans anstid="${esc(l.anstid)}"><tidkod>${esc(code)}</tidkod><datum>${l.date}</datum><timmar>${dec(l.quantity)}</timmar>${omf}</tidtrans>`);
  }
  const people = opts.persons
    .filter((p) => p.hourly.length > 0)
    .map((p) => {
      const last = p.hourly[p.hourly.length - 1];
      return `    <person anstid="${esc(p.anstid)}"><fornamn>${esc(p.first_name)}</fornamn><efternamn>${esc(p.last_name)}</efternamn><lonform>TIM</lonform><timlon datum="${last.from}">${dec(last.rate)}</timlon></person>`;
    });
  const header = [
    "<format>LÖNIN</format>",
    "<version>2.2</version>",
    `<datum>${opts.createdAt ?? new Date().toISOString()}</datum>`,
    opts.orgNr ? `<foretagorgnr>${esc(opts.orgNr.replace(/\D/g, "").slice(0, 12))}</foretagorgnr>` : "",
    opts.companyName ? `<foretagnamn>${esc(opts.companyName)}</foretagnamn>` : "",
    "<programnamn>Makrilltrade</programnamn>",
  ].filter(Boolean).join("");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<paxml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.paxml.se/2.2/paxml.xsd">`,
    `  <header>${header}</header>`,
    tid.length ? `  <tidtransaktioner>\n${tid.join("\n")}\n  </tidtransaktioner>` : "",
    lon.length ? `  <lonetransaktioner>\n${lon.join("\n")}\n  </lonetransaktioner>` : "",
    people.length ? `  <personal>\n${people.join("\n")}\n  </personal>` : "",
    `</paxml>`,
  ].filter(Boolean).join("\n");
}
