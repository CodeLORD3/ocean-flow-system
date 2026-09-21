# Uppgifter: Genomför · Hur gör vi? · Planering

Bygger vidare på dagens uppgifter (samma rader, samma butikskarta, samma bilder, samma personal). Ingen ombyggnad av systemet.

## Tre läge på uppgiftens sida

Uppgiftens sida får tre lägen högst upp. **Genomför** är alltid förvalt.

**1. Genomför** — snabbt och enkelt, det man ser först:

```text
STÄDA GOLVET
Korridor · 10:00 · beräknat 15 min

FYLL I NÄR ARBETET ÄR KLART
[ ] Golvet städat
[ ] Varningsskyltar använda
[ ] Inga hinder kvar

Kommentar [____________]   [ Lägg till bild ]

[  MARKERA SOM KLAR  ]
```

Kontrollpunkterna sätts på standarduppgiften och varje bock sparas som bevis med person och tidpunkt. En liten rad visar "Behövs: städvagn, mopp, golvmedel, skyltar" med knappen "Var finns det?" — inget mer.

**2. Hur gör vi?** — arbetsbeskrivningen som den ser ut idag, men per steg kan man lägga in bild, kort videoklipp, viktig punkt, varför, tid, säkerhet och HACCP. Korta rader och bilder, aldrig långa textblock. Öppnas bara av den som vill.

**3. Planering** — utrustning med plats, områden på kartan, tider och historik:

```text
Städvagn        Städstation · ST-01   [Visa på kartan]
Mopp            På städvagnen
Golvmedel       Städstation · hylla S-1
Varningsskylt   Lager · hylla L-03
Beräknat 15 min · snitt senaste 10: 18 min
```

## Verklig tid

Görs uppgiften i telefonen eller på datorn startar tiden när Genomför öppnas och stoppar vid Markera som klar. Man kan också fylla i efteråt: "Tog cirka … minuter" med start- och sluttid. Varje utförande sparar person, tid, verklig längd och avvikelse mot beräknad tid. På uppgiften visas snitt och kortaste tid, så arbetssättet kan förbättras.

## Register över utrustning och material

Nytt register som admin sköter, gemensamt för alla butiker:

- Namn, bild, kategori, antal totalt, antal per butik, inköpspris/värde och var man köper det (leverantör + artikelnummer).
- Plats per butik: område på butikskartan + exakt plats i klartext (ST-01, hylla S-1).
- Söklista med filter på kategori och butik, samt "vad används den till" (uppgifterna som kräver saken).
- Rapportera trasigt/slut finns kvar och landar på registerposten.

I uppgiftens beskrivning väljer man saker ur registret i stället för att skriva in dem varje gång. Fri text går fortfarande att skriva.

## Standarduppgift med varianter

Samma uppgift, t.ex. "Städa toaletten", ska kunna delas mellan butiker:

- En **standard** (huvudtexten och arbetsgången) som ägs centralt.
- **Varianter** per butik som ändrar det som skiljer (annan utrustning, extra steg, annan tid) men behåller samma huvudnamn.
- Butiken kan börja från standarden, göra sin variant och föreslå att den blir ny standard.
- Registret visar per uppgift: hur många butiker som kör standarden, vilka som har egen variant och vad som skiljer.

Det gör det enkelt att söka i registret och förbättra arbetssättet både i smått och stort.

## Etapper

1. **Genomför** med kontrollpunkter som sparas som bevis, plus tidmätning (automatisk + efterhandsifyllning).
2. **Tre lägen** på uppgiftens sida och samma tre lägen i rulldownen i dagens lista.
3. **Utrustningsregistret** med antal, värde, inköpsställe och plats per butik, samt kopplingen från uppgifternas beskrivning.
4. **Hur gör vi?** utökat per steg: kort video, viktig punkt, varför, tid, säkerhet, HACCP.
5. **Standard och varianter** med jämförelse och förslag till ny standard.

## Tekniska detaljer

- Migration: `task_checkpoints` (per standarduppgift: text, ordning, krav) och `task_checkpoint_results` (per utförande: bockad av, tid) — bock sparas som rad, tas aldrig bort utan loggas.
- `checklist_items` utökas med `started_at`, `finished_at`, `actual_minutes`, `time_source` (automatisk/efterhand). `checklist_template_items` får `standard_id`, `variant_of`, `variant_note`.
- Nya tabeller `equipment_items` (namn, bild, kategori, total_count, unit_value, supplier, supplier_article_no) och `equipment_locations` (butik, `map_zone_id`, exakt plats, antal) med GRANT + RLS enligt befintligt mönster (admin skriver, personal läser).
- `guide` i `src/lib/taskGuide.ts` utökas per steg med `video`, `keyPoint`, `why`, `minutes`, `safety`, `haccp`; material får `equipmentId`. Tolerant läsning behålls så befintliga beskrivningar fungerar.
- Video laddas upp komprimerat till samma bucket som guidebilder, max ca 30 sekunder.
- Frontend: `TaskDetail.tsx` får lägesväxlare (Genomför/Hur gör vi?/Planering), ny `TaskPerformPanel`, `TaskPlanningPanel`, utökad `TaskGuideView`/`TaskGuideEditor`, nytt register `src/pages/EquipmentRegister.tsx`. Befintlig lista, kalender, kartkoppling och behörigheter rörs inte.
- Verifiering: typecheck, test för tidsberäkning och kontrollpunkter, samt inloggad genomgång i telefonbredd (390 px) av Genomför → bild → klar med tidmätning.
