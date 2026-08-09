# Kundbeställningar: Fortnox-lika rader

Målet är rader som går att läsa på en halv sekund bakom fiskdisken. Dagens rad har tre textrader med små gråa detaljer och badge-klungor. Den ersätts av en rad i taget med **hel radfärg** som i Fortnox, och all information i en rullgardin under.

## Så ska raden se ut

En kolumnrad, färgad över hela ytan efter status:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ALST-...-001   Lör 9 aug 14:00   3 varor   Joakim Berg   1 240,00 kr ⌄│  grön = packad
├──────────────────────────────────────────────────────────────────────┤
│ ALST-...-002   Sön 10 aug        1 vara    Peter W         310,00 kr ⌄│  gul = pågående
├──────────────────────────────────────────────────────────────────────┤
│ ALST-...-003   Sön 10 aug 11:30  2 varor   Laura           890,00 kr ⌄│  röd = ohämtad
└──────────────────────────────────────────────────────────────────────┘
```

Färgskala, hela raden tonad (behåller Makrilltrade-känslan, dämpad ton istället för Fortnox skrikiga pastell):

| Läge | Radfärg |
| --- | --- |
| Ohämtad, försenad | Röd |
| Packad, klar att hämta | Grön |
| Packning pågår | Gul |
| Levererad eller avhämtad | Blå |
| Ny, opackad | Neutral (kortfärg) |
| Avbruten | Grå, texten dämpad och genomstruken ordernummer |

Radens kolumner, i den ordningen: ordernummer (monospace), veckodag + datum + tid, antal varor, kundnamn, summa högerställd, pilikon. Ikoner och badge-klungor tas bort från raden — det är dem som gör dagens design tung. Bara två små markörer får finnas kvar inline: allergivarning och "köps färskt", som ren symbol utan text.

Färgen får aldrig vara den enda bäraren av status: statusordet står kvar i rullgardinen och radens vänsterkant behåller en mättad färgstapel, så det fungerar också för färgblinda och i solljus.

## Rullgardinen

Oförändrat innehåll som idag, men bättre städat: kund med klickbart telefonnummer, leveransadress, allergiruta, radlista, anteckning, totalsumma och den stora knappen "Börja packa". Bara en order kan vara utfälld i taget, så listan inte växer okontrollerat.

## Mobil

- Raden blir tvåradig på liten skärm: ordernummer + summa överst, datum + kund under. Ingen horisontell skroll, ingen avklippt text.
- Hela raden är tryckyta, minst 56 px hög.
- Kundnamnet är det största elementet på mobil, eftersom det är det man söker efter när kunden står framför disken.
- Kolumnrubriker visas bara på desktop.
- "Börja packa" fyller bredden, 48 px hög, och sitter längst ned i rullgardinen inom tumräckvidd.

## Teknisk del

- `src/components/orders/CustomerOrderRow.tsx` skrivs om: ny `rowTone()`-funktion som ger hel radbakgrund per status, kolumnlayout med `grid` på `sm:` och staplad layout under, samt borttagna ikoner och statusbadge från radhuvudet.
- Radfärgerna läggs som semantiska tokens i `src/index.css` (`--row-ok`, `--row-warn`, `--row-late`, `--row-done`) och registreras i `tailwind.config.ts`, med varianter för både ljust och mörkt läge. Inga hårdkodade färgklasser i komponenten.
- `src/pages/CustomerOrders.tsx` får en kolumnrubrik ovanför listan på desktop, tätare radavstånd (`divide-y` istället för separata kort med marginal) och behåller dagsrubrikerna.
- Utfällning lyfts till styrd state i `CustomerOrders.tsx` så att bara en rad är öppen i taget.
- Ingen förändring i datamodell, hooks eller packflöde.
