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

## Viktig princip: vi optimerar arbetssättet, inte personen

Syftet med tider är inte att mäta hur snabbt någon arbetar, utan att göra arbetssättet enklare, snabbare, säkrare, mer konsekvent och med mindre onödig förflyttning. Uppgiftens tid delas därför upp i fem delar som tillsammans blir standardtiden:

```text
Städa golvet
Hämta utrustning      2 min
Förbereda             1 min
Städa                10 min
Kontrollera           1 min
Städa undan           2 min
──────────────────────────
Standardtid          16 min
```

I Genomför visas bara "Beräknad tid: ca 16 min". Uppdelningen ligger under Planering.

## Start, stopp och efterhandsregistrering

Tiden startar aldrig bara för att sidan öppnas. I Genomför står först **STARTA UPPGIFT** — då sparas starttiden, timern går och uppgiften får status "Pågår". Vid **MARKERA SOM KLAR** sparas sluttid, verklig tid, person, kontrollpunkter, bilder, kommentar och eventuella avvikelser. Det finns också **Registrera i efterhand** för arbete som redan är gjort. Admin kan senare ställa in auto-start för enstaka mycket enkla uppgifter.

## Pauser och väntetid

Datamodellen förbereds för pauser med orsak: kund, väntar på material, väntar på kollega, annat. Det ger skillnad mellan total tid och aktiv arbetstid:

```text
Standardtid     15 min
Total tid       24 min
Aktiv arbetstid 16 min
Väntetid         8 min  → varför?
```

Detta används aldrig för att bedöma personer, bara för att hitta problem i processen.

## Register över utrustning och material

Nytt register som admin sköter, gemensamt för alla butiker:

- Namn, bild, kategori, antal totalt, antal per butik, inköpspris/värde och var man köper det (leverantör + artikelnummer).
- Plats per butik: område på butikskartan + exakt plats i klartext (ST-01, hylla S-1).
- Söklista med filter på kategori och butik, samt "vad används den till" (uppgifterna som kräver saken).
- Rapportera trasigt/slut finns kvar och landar på registerposten.

Uppgiften pekar bara på saken, inte på platsen: "jag behöver städvagnen". Platsen finns på ett enda ställe i registret — flyttas städvagnen till ST-04 får alla uppgifter automatiskt rätt plats. Det är kopplingen till 5S. Fri text går fortfarande att skriva.

## Väg i butiken

Planering visar vägen: var jag är → vad jag behöver → var det finns → var arbetet görs → var sakerna ska tillbaka.

```text
KORRIDOR (start)
 ↓ 1 min
STÄDSTATION   hämta städvagn, mopp, golvmedel
 ↓ 1 min
LAGER         hämta varningsskylt
 ↓ 1 min
KORRIDOR      utför arbetet
 ↓ 1 min
STÄDSTATION   lämna tillbaka
KLAR
```

Kopplas till butikskartan. Första versionen har ingen automatisk ruttplanering, men datamodellen förbereds för gångtid och avstånd mellan områden och platser.

## Kaizen från tidsdata

Under Planering ser ansvariga standardtid mot snitt av de senaste 30 utförandena, uppdelat på hämta/förbereda, utföra och återställa. När något sticker ut visas ett förslag, till exempel: "Varningsskylt används 6 gånger per vecka och förvaras 12 meter från övrig städutrustning" med knappen **Skapa förbättringsförslag**. Systemet ändrar aldrig något själv — en människa beslutar. En godkänd förbättring kan ändra platsen i registret, ändra uppgiftens standard och skapa en ny standardversion. Så sluts loopen: arbete → data → problem → kaizen → test → ny standard.


## Standarduppgift med varianter

Samma uppgift, t.ex. "Städa toaletten", ska kunna delas mellan butiker:

- En **standard** (huvudtexten och arbetsgången) som ägs centralt.
- **Varianter** per butik som ändrar det som skiljer (annan utrustning, extra steg, annan tid) men behåller samma huvudnamn.
- Butiken kan börja från standarden, göra sin variant och föreslå att den blir ny standard.
- Registret visar per uppgift: hur många butiker som kör standarden, vilka som har egen variant och vad som skiljer.

Det gör det enkelt att söka i registret och förbättra arbetssättet både i smått och stort.

## Etapper

1. **Genomför** med Starta uppgift, kontrollpunkter som sparas som bevis, Markera som klar och Registrera i efterhand.
2. **Tre lägen** på uppgiftens sida och samma tre lägen i rulldownen i dagens lista, med standardtid i fem delar.
3. **Utrustningsregistret** med antal, värde, inköpsställe och plats per butik (5S), samt kopplingen från uppgifternas beskrivning och vägen i butiken.
4. **Hur gör vi?** utökat per steg: kort video, viktig punkt, varför, tid, säkerhet, HACCP.
5. **Pauser, uppföljning och Kaizen** — väntetid med orsak, snitt mot standardtid, förbättringsförslag.
6. **Standard och varianter** med jämförelse och förslag till ny standard.

## Tekniska detaljer

- Migration: `task_checkpoints` (per standarduppgift: text, ordning, krav) och `task_checkpoint_results` (per utförande: bockad av, tid) — bock sparas som rad, tas aldrig bort utan loggas.
- `checklist_items` utökas med `started_at`, `finished_at`, `actual_minutes`, `active_minutes`, `paused_minutes`, `time_source` (timer/efterhand), `run_status` (ej startad/pågår/pausad/klar). Ny tabell `task_pauses` (uppgift, orsak, från, till). `checklist_template_items` får `std_fetch_minutes`, `std_prepare_minutes`, `std_do_minutes`, `std_check_minutes`, `std_restore_minutes`, `auto_start`, `standard_id`, `variant_of`, `variant_note`.
- Nya tabeller `equipment_items` (namn, bild, kategori, total_count, unit_value, supplier, supplier_article_no) och `equipment_locations` (butik, `map_zone_id`, exakt plats, antal) med GRANT + RLS enligt befintligt mönster (admin skriver, personal läser). Platsen bor bara här — uppgiften sparar `equipment_id`, aldrig plats.
- Förberedd för gångtid: `map_zones` kompletteras med valfri `walk_seconds_from` (grannområden) så vägen senare kan räknas; första versionen visar stegen i ordning utan automatisk ruttberäkning.
- Ny tabell `improvement_suggestions` (uppgift, utrustning, butik, iakttagelse, föreslagen ändring, status, beslutad av) — systemet ändrar aldrig placering eller standard automatiskt.

- `guide` i `src/lib/taskGuide.ts` utökas per steg med `video`, `keyPoint`, `why`, `minutes`, `safety`, `haccp`; material får `equipmentId`. Tolerant läsning behålls så befintliga beskrivningar fungerar.
- Video laddas upp komprimerat till samma bucket som guidebilder, max ca 30 sekunder.
- Frontend: `TaskDetail.tsx` får lägesväxlare (Genomför/Hur gör vi?/Planering), ny `TaskPerformPanel`, `TaskPlanningPanel`, utökad `TaskGuideView`/`TaskGuideEditor`, nytt register `src/pages/EquipmentRegister.tsx`. Befintlig lista, kalender, kartkoppling och behörigheter rörs inte.
- Verifiering: typecheck, test för tidsberäkning och kontrollpunkter, samt inloggad genomgång i telefonbredd (390 px) av Genomför → bild → klar med tidmätning.
