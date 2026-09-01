# Schema: gör Personal & Schema lik referensdesignen

Sidan Personal & Schema (`/staff-schedule`) byggs om visuellt så den följer den uppladdade prototypen. Ingen ändring i schemalogik, kostnadsberäkning, behörigheter eller databas — bara layout, typografi och komponentstruktur.

## Varför det inte ser ut så idag

Dagens sida är byggd med vanliga kort (`Card`) och en bred tabell: rubrik med Vecka/Kalender-knappar, en filterrad, fyra KPI-kort och en veckotabell där varje rad är en anställd. Prototypen har istället en mörk arbetsytehuvud, Vecka/Dag som segmenterad växlare, beslutsrad med nyckeltal i mono, butiker som korta koder istället för färgade etiketter, och en högerpanel för dagens detaljer. Det är alltså två olika layouter, inte en trasig sida.

## Vad som byggs

1. **Arbetsytehuvud** — mörk rad med titel, vecka/datumnavigering, enhets- och stadsfilter samt primär åtgärd (Planera pass). Ersätter dagens rubrik plus separat filterkort.
2. **Segmenterad vyväxlare** — Vecka | Dag | Kalender i ett spår istället för tre lösa knappar. Dagvyn är ny som vy, men använder befintlig passdata för valt datum.
3. **Beslutsrad med nyckeltal** — planerade timmar, lönekostnad, andel av omsättning och antal som kräver åtgärd, i en tät rad med monosiffror istället för fyra stora kort.
4. **Veckogrid** — samma data som idag, men med tydliga kolumnlinjer, tonad dagkolumn för idag, kompakta passblock och butikskoder (t.ex. B03, GRO) i stället för långa etiketter.
5. **Dagpanel** — höger sida visar valt pass/dag: personens namn, tid, enhet, avvikelse mot stämpling och avtalsinformation kopplad till anställningen.
6. **Status- och legendspråk** — Publicerat, Utkast, Regelbrott, Öppet pass som enhetliga statusmärken.

Allt görs responsivt: på telefon och surfplatta staplas beslutsraden, gridet scrollar horisontellt och dagpanelen blir en panel underifrån.
