# Spårbarhet i egen tillverkning: arbetssätt och byggordning

## Dina antaganden
- Stämmer: senaste raden i lot_transformations är från 18 september 08:14. Det finns 23 partier PROD-20260915-nnn.
- Avviker: systemet visar 220 aktiva partier totalt. Siffran 161 för färskvara och 5 187 kg är inte kontrollerad än. Det görs i steg 1.
- Risk: senaste provet av perform_lot_transformation nekades med "permission denied". Funktionen kan alltså vara oanvändbar för vanliga konton just nu. Det kontrolleras först.

## A. Papperet (minsta antal fält)
Tillverkningsjournal, en rad per sats:
1. Datum och klockslag
2. Satsnummer på dagen (1, 2, 3)
3. Färdig produkt
4. Råvara och radnummer från mottagningsjournalen (eller partinummer från etiketten), en rad per råvaruparti
5. Vikt in per råvaruparti, kg med en decimal
6. Vikt ut, kg, och antal förpackningar
7. Svinn, kg
8. Signatur

Kokning har samma fält plus kokt eller rå. Bäst före skrivs inte på papperet. Systemet räknar fram det.

## B. Funktion för efterregistrering
- Använd perform_lot_transformation via TransformFlow på partisidan, eftersom allt sparas i ett enda steg där.
- Den tar _performed_at. Tillverkning i går kan därför sparas på stock_transformations.
- Men stock_movements har bara created_at, inte affärsdatum. Rörelserna hamnar alltså på registreringsdagen.
- CookingOrderForm räknar bäst före från dagens datum (shelf_life_days). Vid efterregistrering ska bäst före i stället räknas från tillverkningsdatum.
- ProductionOrderForm och CookingOrderForm skriver i flera separata steg. De ska inte användas för efterregistrering förrän de går via funktionen.

## C. Blandad produkt (räksallad, skagenröra, gratäng)
- lot_transformations klarar redan flera källor till ett parti, med en rad per källparti.
- perform_lot_transformation tar däremot bara ett källparti.
- Minsta ändring: en ny funktion, perform_lot_blend, som tar en lista av källpartier i en transaktion. Ett utparti märks med alla källor. Fångstfälten ärvs från den största råvaran och resten visas i kedjan.

## D. Varan har redan plockats innan tillverkningen registrerats
- Plocket drar då från PROD-partiet eller utan parti, och kan bli negativt.
- I dag finns ingen funktion som byter parti på en befintlig rörelse.
- Förslag: en funktion relink_movement_lot där admin flyttar plocket till rätt parti genom en motrörelse plus en ny rörelse, med orsak. Inget skrivs över.

## E. Inleverans och etiketter
- Preliminärt pris finns redan: lots.price_status och finalize_lot_price.
- Etiketter kan skrivas ut från Arrivals men skrivs inte ut automatiskt per kolli. Antal kolli och radnummer från journalen saknas på inleveransraden. Båda behöver läggas till.

## F. Avsluta gamla partier
Detta görs per produkt och plats med inventeringsrörelser:
1. Räkna fysiskt.
2. Nollställ PROD-partierna och de gamla råvarupartierna med svinn eller inventering minus.
3. Lägg in det räknade på ett nytt startparti, "Ingående saldo 2026-10" (okänd härkomst).

Saldot per produkt blir då lika med räkningen. Ingen saldorad skrivs direkt.

## G. Spärrar, i den här ordningen
1. Varning, inte spärr: plock av egen produkt utan parti eller från PROD-parti.
2. Daglig avstämning: kvittade journalrader mot registrerade satser och inleveranser. Visas på adminsidan och i dagsläget.
3. Efter två rena veckor i Amhult: spärr mot plock av egen produkt utan giltigt parti. Undantag kräver orsak från admin.
4. Därefter samma krav för Schweizexport, där plocket redan går efter färskaste partiet.

## H. Byggordning, minsta först
1. Kontrollera och rätta EXECUTE-behörigheten på perform_lot_transformation. Verifiera siffrorna för öppna partier.
2. Bäst före från tillverkningsdatum: perform_lot_transformation (som standard shelf_life_days från _performed_at) och TransformFlow (datumfält "Tillverkat").
3. Varning vid plock utan parti: useUpdateOrderLineStatus och packvyn.
4. Antal kolli och journalradnummer på inleveransraden. Etiketter skrivs ut per kolli i Arrivals, via lotQrLabelPdf.
5. perform_lot_blend och ett formulär för flera källpartier i TransformFlow.
6. relink_movement_lot med logg.
7. Startpartier och nollställning av gamla partier via inventeringsflödet, efter fysisk räkning.
8. Avstämningsvy, journal mot system.
9. Spärrtrigger på stock_movements för egna produkter, med kvalificering via products.is_production_item.

## Tekniska detaljer
- Tabeller som berörs: lots, lot_transformations, stock_transformations, stock_movements, incoming_delivery_lines, products.
- Inga saldon skrivs direkt. Allt går via stock_movements. Kg har högst en decimal. Inget bokförs.
