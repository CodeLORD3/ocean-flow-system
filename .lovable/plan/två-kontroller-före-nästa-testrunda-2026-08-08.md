# Två kontroller före nästa testrunda

## 1. De tre godkännandena — kontrollerat, redan utbackat

Kontrollen mot liggaren visar att de tre godkännandena skapade tre uppsättningar rörelser, att två av dem redan är motbokade och att saldot nu stämmer. Inget mer behöver backas ut.

Vad som hände (alla tider 2026-08-08, UTC):

```text
11:41  överföring de21a010   +532 kg  → grossistlagret   (den riktiga)
13:04  överföring e4eea363   +530 kg  → grossistlagret   (extra)
13:04  överföring 3e0ff598   +530 kg  → grossistlagret   (extra)
13:02  följesedel ba271073   +532 kg  → inköpslagret     (dubblett av samma sedel)
13:25  korrigering           −1 060 kg + −532 kg          (motbokning av extrarna)
```

Talen före och efter motbokningen på grossistlagret:

| | Kilo | Värde |
|---|---|---|
| Efter de tre godkännandena | 1 829 kg | — |
| Efter motbokning (nu) | 769 kg | 111 306 kr |

Avstämning mot liggaren: summan av alla rörelser på grossistlagret är exakt 769 kg (1 592 kg överföringar in − 1 120 kg korrigeringar + 297 kg inleveranser − 80 kg produktion + 80 kg teströrelser), och det är samma tal som saldotabellen visar. Inköpslagret står på 0 kg både i saldo och i liggarens summa, så dubblettsedeln har ingen rest kvar. Ingen ytterligare motbokning behövs.

## 2. Gränssnittet mot tidigare bokförda rapporter — ett hål kvar att täppa

Dagens regel visar "Bokför inleverans" för varje rapport med status Godkänd som saknar bokföringstidpunkt. Det betyder att en **ny** rapport också kan visa den gamla knappen: om användaren stänger bokföringsrutan som öppnas automatiskt vid godkännandet, faller rapporten tillbaka i exakt samma läge som de äldre. Knappen har dessutom ingen förklaring till varför den finns.

Det ska rättas så här:

**Äldre bekräftade rapporter (bekräftade före sammanslagningen)**
- Knappen visas, men märkt som eftersläpning: rubriktext "Äldre följesedel — bokfördes inte vid godkännandet".
- Kort förklaring under knappen: "Den här sedeln godkändes innan godkännande och bokföring slogs ihop. Bokför partierna här en gång, sedan sköts det automatiskt."

**Nya rapporter (godkända i det sammanslagna flödet)**
- Aldrig den gamla knappen. Om bokföringsrutan stängdes utan att bokföras visas i stället en tydlig fortsättningsrad: "Bokföringen är inte klar — öppna den igen" med knappen "Fortsätt bokföringen".
- Ingen text om "gammalt flöde", eftersom det inte gäller dem.

Gränsdragningen görs på en fast tidpunkt: rapporter som bekräftades före driftsättningen av det sammanslagna flödet räknas som äldre. Det bygger på `created_at` på rapporten tillsammans med att `posted_at` saknas, så ingen ny databaskolumn behövs.

Resultatet är att en användare aldrig ser två knappar som gör samma sak utan förklaring: en rapport visar antingen ingenting (bokförd), en eftersläpningsknapp med förklaring, eller en fortsättningsknapp i det nya flödet.

## 3. Publicering

När rättningen är inne publiceras koden till makrilltrade.com och jag rapporterar tidpunkt, så att nästa testrunda kan skickas ut.

## Tekniska detaljer

- `src/pages/PurchaseReporting.tsx`: ersätt villkoret runt bokföringsknappen (rad ~1337–1388) med tre lägen — dolt, eftersläpning (äldre rapport, förklarande text) och fortsättning (ny rapport, bokföring avbruten). Cutoff som konstant i filen.
- Ingen migration, ingen ändring i bokföringslogiken (`src/lib/purchaseReportPosting.ts`) — bara vilket läge gränssnittet visar.
- Ingen dataändring behövs för punkt 1; motbokningen är redan gjord och avstämd.
