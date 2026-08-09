# Jämförelsedokument: Makrill Trade mot etablerade affärssystem

Ett internt underlag som beskriver hur systemet står sig mot generella affärssystem (Pyramid, Vitec, Monitor) och de fiskspecifika systemen (Wisefish, inecta, Loop ERP). Tänkt att användas vid sälj, introduktion av ny personal och vid prioritering av vidareutveckling.

## Vad som byggs

**1. Dokumentet `docs/positioning.md`**

Källan till innehållet, versionshanterad tillsammans med koden. Struktur:

- Sammanfattning i fem punkter — vad vi är, vad vi inte är.
- Utgångspunkt: generella affärssystem är byggda kring redovisningen, vårt system kring det fysiska varuflödet.
- Funktionsjämförelse i tabellform, område för område: partispårbarhet, bäst före, ursprung, styckning och utbyte, prissättning per kanal, lagerstruktur i fem nivåer, butiksdrift (checklistor, instämpling, dagsrapport, chatt, önskemål), kassa, investerarportal, redovisning, fakturering, lön.
- Vad vi medvetet inte gör själva: redovisning, reskontra, lön — och vilken integrationsväg som gäller i stället.
- Design och interaktion: vad vi tar från ERP-traditionen (täthet, kolumnraster, tangentbordsflöde, tabellsiffror) och vad som är vårt eget (tonade statusrader, mobilt butiksläge).
- Öppna gap, listade utan påståenden om att de redan är åtgärdade.

**2. En läsbar sida i systemet: "Om systemet · Jämförelse"**

Ny flik på befintliga `/about-settings` (Admin), så inget nytt sidebar-utrymme tas. Sidan visar samma innehåll som dokumentet, formaterat för skärm:

- Sammanfattningskort högst upp.
- Jämförelsetabell med tre kolumner: område, vi, generella/fiskspecifika system. Statusmarkering per rad — starkt hos oss, likvärdigt, saknas hos oss.
- Avsnitt för medvetna avgränsningar och för öppna gap.
- Mobilanpassad: tabellen faller ner till kort på små skärmar.

Ingen databas, inga nya behörigheter — innehållet ligger i en typad datafil så tabellen kan uppdateras på ett ställe.

## Teknisk översikt

- `docs/positioning.md` — markdown, ingen kodkoppling.
- `src/lib/systemComparison.ts` — typad datamodell för jämförelseraderna (område, vår förmåga, deras förmåga, status).
- `src/pages/AboutComparison.tsx` — presentationskomponent som renderar datafilen.
- `src/pages/AboutSettings.tsx` — får en flik som monterar den nya vyn.
- Enbart befintliga designtokens: tonade rader i samma stil som orderlistan, monospace tabular-nums där tal förekommer, inga hårdkodade färger.

## Avgränsning

Ingen funktionell förändring i affärslogik, inga migrationer, inga ändringar i orderlistan eller lagerflödet. Dokumentet påstår inget om systemets tillstånd som inte går att läsa ur koden — osäkra punkter listas som öppna gap.
