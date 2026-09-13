# Mobilanpassning av hela systemet

Målet: personalen ska kunna använda systemet i telefonen som en app — stora tryckytor, sifferbord vid antal, inget sidoskroll, och de vanligaste uppgifterna nåbara med en tumme.

## Så jobbar vi

Systemet har över 100 sidor och 88 av dem innehåller breda tabeller. Att skriva om varje sida för sig blir dyrt och ojämnt. Därför bygger vi först en gemensam mobilgrund, och sveper sedan sidorna i prioriterad ordning — mest använda först.

## Steg 1 — Mobilgrund (app-känsla)

- **Bottenmeny på mobil**: fast rad längst ned med 5 genvägar som byts efter portal, t.ex. butik: Start, Lager, Inventering, Beställningar, Mer. "Mer" öppnar hela menyn.
- **Fast topprad**: sidans namn, butik/portal-väljare, notiser och konto — resten döljs.
- **Säkra ytor**: plats för telefonens hemknapp/notch, inget innehåll under bottenmenyn.
- **Tryckytor**: knappar och fält minst 40 px höga på mobil, kompakt kvar på dator.
- **Sifferbord**: alla antal-, vikt-, pris- och telefonfält öppnar rätt tangentbord med komma tillåtet.
- **Tabeller blir kort**: en gemensam lösning som visar samma data som staplade kort på mobil, tabell på dator — inget sidoskroll.
- **Fast åtgärdsrad**: spara/skicka/lås ligger alltid synligt längst ned på mobil i sidor med formulär.
- **Dialoger blir dragskivor**: popup-fönster glider upp från underkanten på mobil och går att skrolla.

## Steg 2 — Sidor personalen använder varje dag

1. Start/Översikt och Dagsrapport
2. Lager, Inleveranser, Inventering (inventeringen är redan klar)
3. Beställningar och Kundbeställningar (inkl. totallistan)
4. Butiksordrar, Önskelista, Plockning/Packning
5. Stämpelklocka, Mina tider, Mina skift, Schema
6. Checklistor och Egenkontroll
7. Chatt och Bildflöde

## Steg 3 — Övriga sidor

Personal/HR, rapporter, kunder, produkter, priser, bolag, integrationer och inställningar. Samma mönster som steg 1, sida för sida.

## Steg 4 — Genomgång i telefonstorlek

Varje omgjord sida kontrolleras i mobilstorlek: inget sidoskroll, ingen text som klipps, alla knappar nåbara, och listor som går snabbt att skrolla.

## Teknisk sammanfattning

- Ny `MobileTabBar` + ändringar i `AppLayout.tsx` (bottenmeny, safe-area-padding på `main`, mobilrubrik).
- Nya delade komponenter: `ResponsiveTable` (tabell/kort), `MobileActionBar`, `NumberField` (inputMode/decimal, komma-parsning), `ResponsiveDialog` (Dialog på dator, Drawer på mobil).
- Bas-höjder i `button.tsx`/`input.tsx` varianter: `h-10 sm:h-8`, semantiska tokens genomgående.
- Sidor migreras till dessa primitiver i grupper, med typkontroll efter varje grupp.
- Mobilkontroll via Playwright i 390x844 för de sidor som ändras.

## Omfattning

Steg 1 + steg 2 är huvudleveransen i den här omgången. Steg 3 tas i följande omgångar så att inget hastas igenom.
