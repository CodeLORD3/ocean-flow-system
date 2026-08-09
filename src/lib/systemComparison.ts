/**
 * Underlag för jämförelsen mot etablerade affärssystem.
 *
 * Källtext: docs/positioning.md. Ändra på ett ställe — här — så följer
 * både tabellen och korten på Om systemet · Jämförelse med.
 */

export type ComparisonStatus = "starkt" | "likvardigt" | "saknas";

export const STATUS_LABELS: Record<ComparisonStatus, string> = {
  starkt: "Starkt hos oss",
  likvardigt: "Likvärdigt",
  saknas: "Saknas hos oss",
};

/** Tonade rader per status — samma språk som orderlistan. */
export const STATUS_ROW_TONE: Record<ComparisonStatus, string> = {
  starkt: "bg-row-ok",
  likvardigt: "bg-row-off",
  saknas: "bg-row-warn",
};

export const STATUS_EDGE: Record<ComparisonStatus, string> = {
  starkt: "bg-row-ok-edge",
  likvardigt: "bg-row-off-edge",
  saknas: "bg-row-warn-edge",
};

export interface ComparisonRow {
  area: string;
  ours: string;
  general: string;
  fishSpecific: string;
  status: ComparisonStatus;
}

export const SUMMARY_POINTS: string[] = [
  "Vi är ett branschsystem för fisk och skaldjur, inte ett generellt affärssystem.",
  "Systemet är byggt kring det fysiska varuflödet — parti, vikt, hållbarhet, styckning — medan generella affärssystem är byggda kring redovisningen.",
  "Vi täcker hela kedjan i samma bas: grossist, produktion, butiksportaler, kassa.",
  "Vi gör inte redovisning, reskontra eller lön själva. Det sker via integration.",
  "Vi är driftsnära och mobila: systemet ska gå att använda bakom disken med kund framför sig.",
];

export const FLOW_STEPS = [
  "Inköpslager",
  "Grossist / Produktion",
  "Transportlager",
  "Butikslager",
  "Kassa",
];

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    area: "Partispårbarhet (lot)",
    ours: "Kärnfunktion, rörelsejournal per parti",
    general: "Tillägg eller anpassning",
    fishSpecific: "Kärnfunktion",
    status: "starkt",
  },
  {
    area: "Bäst före och hållbarhet",
    ours: "Per parti, varnar i inköp och kundorder",
    general: "Begränsat",
    fishSpecific: "Ja",
    status: "starkt",
  },
  {
    area: "Ursprungsland och art",
    ours: "Normaliserad artnyckel, ursprung på etikett",
    general: "Fritextfält",
    fishSpecific: "Ja",
    status: "likvardigt",
  },
  {
    area: "Styckning och utbyte",
    ours: "Filé/tillverkning med utbyte och biprodukter",
    general: "Nej",
    fishSpecific: "Ja",
    status: "likvardigt",
  },
  {
    area: "Prissättning",
    ours: "NRV, referenspris, skalfaktor, pris per kanal",
    general: "Prislistor, statiska",
    fishSpecific: "Delvis",
    status: "starkt",
  },
  {
    area: "Lagerstruktur",
    ours: "Fem nivåer med lagerträd och godkännande",
    general: "Lagerplatser, platt",
    fishSpecific: "Lager per anläggning",
    status: "starkt",
  },
  {
    area: "Butiksdrift",
    ours: "Checklistor, instämpling, dagsrapport, chatt, önskemål",
    general: "Nej",
    fishSpecific: "Nej",
    status: "starkt",
  },
  {
    area: "Kassa (POS)",
    ours: "Inbyggd, vägning och spårbarhet på kvitto",
    general: "Separat produkt",
    fishSpecific: "Separat produkt",
    status: "starkt",
  },
  {
    area: "Kundbeställningar",
    ours: "Vägd packning, verkligt pris mot uppskattat, allergier",
    general: "Order utan vägning",
    fishSpecific: "Delvis",
    status: "starkt",
  },
  {
    area: "Investerarportal",
    ours: "Ja, i samma bas",
    general: "Nej",
    fishSpecific: "Nej",
    status: "starkt",
  },
  {
    area: "Redovisning och bokslut",
    ours: "Nej — integration",
    general: "Kärnfunktion",
    fishSpecific: "Via ERP-plattform",
    status: "saknas",
  },
  {
    area: "Kund- och leverantörsfaktura",
    ours: "Nej — integration",
    general: "Kärnfunktion",
    fishSpecific: "Ja",
    status: "saknas",
  },
  {
    area: "Lön och tidrapport",
    ours: "Instämpling finns, lön via integration",
    general: "Modul",
    fishSpecific: "Via ERP-plattform",
    status: "likvardigt",
  },
];

export const BOUNDARIES: string[] = [
  "Vi bygger inte egen redovisning, reskontra eller lönekörning — mättade, revisionsstyrda områden där befintliga system är bättre och billigare.",
  "Vi levererar underlag i deras format: bokföringsunderlag mot ekonomisystem, tid mot personalsystem.",
  "En kund behöver fortsatt ett ekonomisystem. Vi ersätter lager, produktion, pris och butiksdrift — inte huvudboken.",
];

export const DESIGN_FROM_ERP: string[] = [
  "Informationstäthet — många rader synliga samtidigt, inga onödiga marginaler.",
  "Fast kolumnraster så siffror står i lodräta linjer.",
  "Monospace med tabular-nums och mellanslag som tusenavskiljare i alla belopp och vikter.",
  "Tangentbordsflöde: Enter går vidare, Esc stänger, inga tvingade musmoment.",
];

export const DESIGN_OURS: string[] = [
  "Helt tonad radbakgrund per status — status läses på en sekund, färg plus ikon, aldrig färg enbart.",
  "Mobilt butiksläge — samma data, layout anpassad för en hand och kund framför sig.",
  "En primärhandling per rad, resten i meny.",
];

export const OPEN_GAPS: string[] = [
  "Kund- och leverantörsfakturering saknas; integrationsvägen är påbörjad men inte färdig.",
  "Lönekörning saknas; kopplingen mot personalsystem är i fas två.",
  "Momsrapport och bokslutsflöden finns inte och planeras inte.",
  "Tangentbordsnavigering mellan rader är inte genomförd i alla listor.",
  "Kolumnrastret är inte konsekvent mellan tabellhuvud och rader i alla vyer.",
];
