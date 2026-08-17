# Varför hämtningen misslyckades — och hur vi gör den stabil

## Orsaken (verifierad)

Körningarna 21:50, 21:15 och 21:06 har ingen sluttid i historiken, och funktionsloggen visar exakt varför:

```text
21:50:02  öppnar INBOX — 427 olästa
21:50:03  hämtad uid 2273 (1 996 318 byte)
21:50:31  tolkad 2273 "Kampanj Schweizisk Bondost 15% rabatt ..."
21:50:33  hämtad uid 2274 (2 523 496 byte)
21:50:34  ERROR CPU Time exceeded  → shutdown
```

Alltså: inget IMAP-fel och inget inloggningsfel. Mejlen i inkorgen är stora nyhetsbrev (2–2,5 MB med bilder), och hela mejlet laddas ner och tolkas med mailparser innan vi ens tittar på om det är ett nyhetsbrev. Ett enda sådant mejl äter ~28 sekunder CPU, så budgeten tar slut vid mejl nummer två och körningen dör innan den hinner skriva klart historiken.

(De tre äldre körningarna 21:06 med "input.once is not a function" är ett tidigare, redan åtgärdat fel — det är inte det som gäller nu.)

## Åtgärder

1. **Läs headers först, hela mejlet sist.** Hämta bara `BODY.PEEK[HEADER]` + storlek per mejl. På headers avgörs redan i dag nyhetsbrev (List-Unsubscribe, Precedence: bulk, X-Campaign), påminnelse/inkasso (ämnesrad) och okänd avsändare. Alla tre fallen loggas och parkeras utan att hela mejlet laddas ner eller tolkas. Först när avsändaren är vitlistad och mejlet inte sållats bort hämtas hela källan och körs genom mailparser.
2. **Storleksspärr.** Mejl över en gräns (förslag 8 MB) från vitlistad avsändare hämtas inte i samma körning utan markeras som "för stort — hämta manuellt", så ett enskilt jättemejl inte kan blockera kön.
3. **Striktare budget.** Kolla tidsbudgeten även före nedladdning och före tolkning (inte bara i loopens början), och sänk standardgränsen till 2 mejl per körning så avslutet alltid hinner skrivas.
4. **Alltid stäng körningen.** Skriv `finished_at` och en tydlig felorsak även vid avbrott, så historiken slutar visa körningar som hänger utan förklaring. Körningar som redan hänger städas till "avbruten — CPU-budget".
5. **Rensa ryggsäcken.** Med headers-först kan de 427 olästa mejlen betas av snabbt: nyhetsbrev och okända avsändare sållas bort i hög takt eftersom bara headers läses.

## Tekniska detaljer

- `supabase/functions/mail-intake/imap.ts`: nytt `fetchHeaders(uid)` (`BODY.PEEK[HEADER]`) och `fetchSize(uid)` (`RFC822.SIZE`), samt enkel header-parsning till en `Map`.
- `supabase/functions/mail-intake/index.ts`: loopen omstruktureras till *headers → filter → (endast vid behov) full hämtning + mailparser*. `isNewsletter` körs på header-map + ämnesrad, `isReminder` på ämnesraden, avsändarmatchning på `From`. Bilagenamn finns inte i headers, så nyhetsbrev-/påminnelsekontrollen görs där utan filnamn och upprepas efter full tolkning för de mejl som ändå laddas ner.
- Mejl utan bilaga upptäcks först efter full tolkning; regeln "lämnas olästa" behålls oförändrad.
- Nytt statusvärde `for_stort` i `mail_intake_messages` visas i Mejlinlopp-panelen med en manuell hämtningsknapp.
