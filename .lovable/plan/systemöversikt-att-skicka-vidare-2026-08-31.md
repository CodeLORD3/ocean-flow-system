# Systemöversikt att skicka vidare

Målet är ett enda dokument som beskriver hela Makrill Trade-systemet: alla moduler, hur de hänger samman, vilka integrationer som finns och hur dataflödena fungerar. Dokumentet skrivs som `docs/system-overview.md` i projektet (och levereras även som nedladdningsbar fil i chatten) så du kan klistra in det hos Claude för granskning.

## Vad dokumentet kommer innehålla

1. **Översikt och arkitektur**
   - Frontend (React/Vite/Tailwind), backend (Lovable Cloud: databas, auth, storage, edge functions).
   - Uppdelning i portaler: Admin/ERP, butiksportaler, grossist, investerarportal (/portal), bokningssida (bokafiskskaldjur.se), stämpelklockekiosk.

2. **Roller och behörighet**
   - Rollhierarkin plattform → koncern → region → bolag → butik.
   - `user_roles` + `user_scopes`, sidbehörighet via pageAccess, hur RLS och security definer-funktioner (has_role, can_see_store, has_company_access m.fl.) skyddar data.

3. **Moduler, sida för sida** (alla 100 sidor grupperade)
   - Inköp: inköpsrapportering, inkommande post/mail-intake, attestering, arkiv, inköpsschema, behovsavstämning.
   - Lager & spårbarhet: rörelselogg som enda sanning, lagerträd, överföringar, partier/lots, spårbarhet, inventering, avvikelser.
   - Produktion/Filé: recept, FEFO-partival, styckningsmodeller, produktionsrapporter.
   - Försäljning: kundbeställningar (statusflikar, totallista, packning, utskrift), butiksorder/intercompany, grossist, webbordrar.
   - Prissättning: NRV/dynamisk relativ prissättning, dagspris/vägt medel, prislistor per kanal.
   - Butiksdrift: checklistor, bilder från butiken, bildflöde/timeline, dagsrapport, chatt, notiser, fordon.
   - Personal/HR: personalregister med krypterat personnummer, schema, attest, frånvaro/semester/saldon, stämpelklocka med driftställe, kostnadsställe och geofence, offlinekö, inspektörsläge/personalliggare, regelmotor (dygnsvila, veckovila, OB), löneunderlag/export.
   - Bokningssidan: sortiment, öppettider/spärrlista, helgdagar, OTP, GDPR-gallring.
   - Investerarportalen: erbjudanden, portfölj, KYC/onboarding.

4. **Integrationer och kopplingar**
   - Fortnox (OAuth, kundmaster-import, fakturautkast, statussynk, avbokning/reversering, inbox-intake, planerad löneexport).
   - Shopify (webhooks, variant-/viktparsning, kundmatchning per bolag, backfyllnad).
   - Nimpos POS (kvitton i realtid, avstämning, replay, försäljningsvy).
   - Personalkollen (synk av personal, schema, kostnadsställen).
   - SumUp/Swish (betalningar), SMS/notiser, AI-schemaimport.

5. **Databaskarta**
   - De centrala tabellerna per domän och hur de är kopplade (nycklar/relationer), plus vilka triggers och databasfunktioner som håller regler (t.ex. lagerrörelsespärrar, intercompany-fakturor, semesterberäkning).

6. **Edge functions**
   - Lista över alla ~48 funktioner med syfte, trigger (webhook/cron/anrop från UI) och vilka tabeller de skriver till.

7. **Kända luckor och pågående arbete**
   - Öppna punkter från roadmapen (behovsavstämning, avvikelsekö för brutna vilotider, Fortnox löneexport).

## Teknisk metod

- Läs igenom `src/pages`, `src/components`, routing, `pageAccess`, hooks och `supabase/functions` samt fråga databasen om tabeller, relationer, triggers och funktioner för att beskriva verkligheten, inte antaganden.
- Inga kodändringar görs — endast ett nytt dokument under `docs/` samt en kopia som artefakt i chatten.
