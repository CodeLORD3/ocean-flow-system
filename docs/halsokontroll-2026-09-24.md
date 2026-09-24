# Hälsokontroll 2026-09-24

## Fel som behöver åtgärdas
| Vad | Status | Bevis | Förslag |
|---|---|---|---|
| Veckopåminnelse om attest (måndagar 06:00) | Fel | Senaste körning 2026-09-21 misslyckades: "no unique constraint matching ON CONFLICT" | Rätta funktionen attest_weekly_reminder |
| Automatiska tester | 3 av 18 testfiler fallerar | Referenspriser (2 tester, texter/nivå har ändrats), auktionsinköp slår upp lagerplats på namn, butikskartetestet kan inte ladda appuppdateringsmodulen | Rätta auktionsinköpens platsuppslag; uppdatera testerna |
| Säkerhet | Varning | 115 databasfunktioner kan köras av alla inloggade (även investerare); 7 tabeller saknar åtkomstregler (store_configs, price_overrides, fortnox/shopify inloggningstabeller, booking_otp, booking_rate_limits) | Begränsa till personal |

## Fungerar
- 29 av 30 schemalagda jobb körde senast utan fel (lagerkontroll natt, stämpelklocka, Fortnox, Personalkollen, valutakurser, dagens avslut m.fl.).
- Personalkollen tidssynk körs varannan minut, 720 körningar senaste dygnet, senast lyckad 07:38.
- Kodkontrollen utan fel.
- Fortnox: 2 kopplingar, 15 fakturajobb.

## Byggt men inte aktiverat
- **Nimpos-kassan**: kopplingen finns, men 0 kvitton har någonsin kommit in.
- **Nedsättningsregler i POS-priser**: båda avstängda (jobbet körs varje timme men gör inget).
- **Zollikons prislista**: tom, bara Sverigelistan har priser (1 342).
- **Checklistor** (signerade, låsta): tabeller finns, 0 checklistor, inget gränssnitt.
- **Butikens stängda dagar**: tabell finns, 0 rader, inget gränssnitt.
- **Agentintegrationen (MCP)**: aktiveras först vid publicering.
- **Shopify**: inloggning och orderflöde finns men inget i appen anropar dem (styrs av Shopify självt; ej bekräftat att data kommer in).
- **Engångsfunktioner** som ligger kvar: seed-staff-users, seed-one-staff-user, personalkollen-backfill-pnr.
- **Stängningsjobb för gamla stämpeldata** (1 januari): har aldrig körts än, väntat.
- **Öppna steg från planer**: checklistor steg 1–3, POS P3–P9, Fortnox löneexport, avvikelsekö för brutna vilotider.

## Ej kontrollerat
Varje sida har inte klickats igenom i webbläsaren i denna runda.
