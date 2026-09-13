# Bevisad spårbarhet: kontroll som körs, inte förhoppning

Frågan "hur vet man att spårbarheten är korrekt?" kan systemet idag inte svara på — det finns ingen kontroll som visar att kedjan håller. Kontrollen byggs, och de luckor kontrollen redan visar åtgärdas.

## Vad kontrollen visar just nu

Uppmätt i databasen idag:

- Saldona stämmer exakt mot rörelserna: 570 rader, 0 avvikelser. Den delen är vattentät.
- **Alla 238 uttag för kundbeställningar saknar parti.** Ingen av de 822 orderraderna har ett reserverat parti, så när fakturan skapas bokförs uttaget utan partikoppling. Kedjan faktura → parti → fångst bryts där. Detta är den allvarliga luckan.
- 97 inventeringsrörelser saknar helt underlagsreferens — det går inte att se vilket inventeringstillfälle som ändrade saldot.
- 948 justeringar har underlag men bara 137 har parti.
- Partiregistret är ojämnt ifyllt: av 332 partier har 266 fångstområde, 99 fartyg, 168 bäst före. Det som saknas kan inte visas i ett spårbarhetsintyg.

## Åtgärd 1 — Kundbeställningar får parti hela vägen

- Partireservationen som redan räknas fram vid orderläggning ska sparas på orderraden, inte bara visas. Saknas parti vid fakturering: fakturan stoppas med besked om vilken rad och varför, istället för att bokföra ett uttag utan spårbarhet.
- Redan fakturerade ordrar utan parti: en engångsgenomgång som kopplar dem till rätt parti där det går att härleda ur inleverans och datum, och listar de som inte går att härleda så de kan hanteras manuellt.

## Åtgärd 2 — Inventering och justering pekar på sitt underlag

- Inventeringsrörelser får referens till inventeringstillfället, så varje saldoändring går tillbaka till vem som räknade, när och i vilken butik.
- Justeringar utan parti tillåts fortsatt (de rör inte alltid en enskild vara), men märks som "utan partikoppling" i kontrollen så de aldrig göms.

## Åtgärd 3 — Spårbarhetskontroll som sida

Ny vy under Lager: **Spårbarhetskontroll**. Den kör kontrollerna direkt mot databasen och visar grönt eller rött per punkt:

1. Saldo mot rörelser — alla avvikelser listade per produkt och lagerplats.
2. Uttag utan parti — per flöde (faktura, butiksorder, kassa, produktion) med antal och kilo.
3. Rörelser utan underlag — vilket flöde som saknar referens.
4. Partier med ofullständig obligatorisk information (art, fångstområde, redskap/metod, fartyg, datum, leverantör).
5. Negativa saldon — ska alltid vara noll.
6. Slumpkontroll: systemet väljer själv fem nyligen sålda rader och följer dem hela vägen bakåt till fångstparti. Varje kedja som bryts visas med var den bröts.

Varje rad går att öppna för att se de berörda posterna, och listan kan skrivas ut som kontrollunderlag med datum och vem som körde den.

## Åtgärd 4 — Kedjan bakåt från ett kvitto eller en faktura

En sökruta där man skriver partinummer, ordernummer eller fakturanummer och får hela kedjan i båda riktningarna: inköp och auktion → parti → lagerplatser och flyttar → butik eller kund → faktura eller kvitto. Det är detta som blir svaret vid en myndighetsfråga eller ett återkallande.

## Åtgärd 5 — Automatiska tester som håller kvar reglerna

Tester som misslyckas om någon i framtiden bokför ett uttag utan parti i något av flödena, tar bort partikravet vid fakturering, eller låter en rörelse skrivas utan underlagsreferens.

## Ordning

Åtgärd 1 och 3 först — luckan i kundbeställningarna är den enda som faktiskt bryter spårbarheten idag, och kontrollsidan är det som gör läget synligt. Därefter 2, 4 och 5.

## Tekniska noteringar

- `customer_order_lines.reserved_lot_id` sätts vid reservation och krävs av `fortnox_on_invoice_created` innan `stock_movements` skrivs; funktionen kastar fel istället för att bokföra utan `lot_id`.
- Kontrollerna läggs som databasfunktioner så att både sidan och testerna använder samma definition av "korrekt".
- Inventeringsrörelser får `reference_type='stock_count_session'` med sessionens id; sätts i `StockCount.tsx` via `setBalance`.
- Slumpkontrollen följer `stock_movements.lot_id` → `lot_transformations` → inköpsrad, och rapporterar första brutna länken.
