# Ny lagerstruktur: fem nivåer med underlag och godkännande

Ersätter dagens grossist/butik-modell med fem klassade nivåer, en flödesregeltabell i databasen, överföringsordrar med dubbelt godkännande, trevägsmatchning, plocklista på papper, genererad följesedel och svinn med obligatorisk orsak.

Byggs i fem etapper. Varje etapp är körbar och testbar innan nästa.

## Etapp 1 — Datamodell och regler

- `storage_locations.location_type`: `inkopslager`, `grossistlager`, `tillverkningslager`, `leveranslager`, `butik`. Ny kolumn `active` (finns inte idag) för att kunna inaktivera gamla platser.
- Ny tabell `stock_flow_rules`: från-typ, till-typ, tillåten, krävt underlag, kräver orsak, kräver admin. Reglerna är data, inte kod — de går att ändra utan att bygga om.
- Nya tabeller `transfer_orders` och `transfer_order_lines` enligt punkt 4 i beställningen (status, godkännare, tidpunkter, beställt/plockat/skickat/mottaget, avvikelseorsak per steg).
- Ny tabell `waste_reports` + rader: kvantitet, orsak ur lista, fritext, rapportör, lager.
- `production_orders.order_type` (`intern` / `extern`). Extern kräver leverantör, förväntat returdatum och avtalat pris per kilo för arbetet.
- `purchase_report_lines.expected_arrival_date` (finns inte idag) från följesedelns leveransdatum.
- Nya lagerplatser: ett **inköpslager** och ett **tillverkningslager** per enhet, samt ett **leveranslager per butik** med namnet "Leverans <butiksnamn>" — aldrig ett delat leveranslager.
- Databasspärrar (triggers):
  1. Flytt som inte finns som tillåten rad i `stock_flow_rules` avvisas.
  2. `godkänd_utleverans` kräver `source_document_type` + `source_document_id` (undantag: svinn).
  3. Inleverans kan inte godkännas med oredovisad avvikelse.
  4. Minskning av saldo med `svinn` kräver referens till en svinnrapport.
  5. Uppslag/bokföring mot en inaktiverad lagerplats kastar fel.

### Omläggning av de 64 befintliga lagerplatserna

De gamla platserna ersätts, inte etiketteras om.

- **a. Kartläggning först.** Lista alla befintliga platser med namn, enhet, saldo i kilo och värde, och ett förslag per plats: MOTSVARAR ny nivå (saldot flyttas dit), UTGÅR (saldot flyttas till närmaste nivå, platsen inaktiveras) eller BEHÅLLS som sublager med motivering. Listan visas för godkännande innan något genomförs — inget flyttas i detta steg.
- **b. Sublager.** Behålls på BUTIK och GROSSISTLAGER där de speglar fysiska platser (kyl, frys, disk). Ren kategorisortering tas bort — kategorin finns i produktregistret.
- **c. Saldon flyttas som rörelser.** Varje flytt bokförs som `overforing_ut` + `overforing_in` med noten "Omläggning till ny lagerstruktur" och samma referens-id. Inga saldon skrivs om.
- **d. Gamla platser inaktiveras när saldot är noll**, raderas aldrig. Ingen plats med rörelser får raderas.
- **e. Kod som pekar på gamla platser.** `src/lib/locations.ts` (`GROSSIST_FLYTANDE_ID`, `TRANSPORTLAGER_ID`), samt uppslagen i `purchaseReportPosting.ts`, `stockTransfer.ts`, `productionStock.ts`, `orderStatusSync.ts` (egen hårdkodad kopia), `useIncomingDeliveries.ts`, `useUpdateOrderLineStatus.ts`, `PurchaseSchedule.tsx`, `PurchaseReporting.tsx` (egen hårdkodad kopia), `ProductionReporting.tsx` och `ProductionOrderForm.tsx` pekas om till de nya platserna. Konstanterna samlas i `locations.ts` — inga lokala kopior kvar.
- **f. Verifiering efter omläggning:** antal aktiva platser före/efter, summa kilo och värde före/efter (ska vara identiska), summan av `stock_movements` mot `product_stock_locations`, att de två saldospärrarna fortfarande utlöser, och att allowlisten i `stockLedgerGuard`-testet är tom.

## Etapp 2 — Överföringsflödet i backend

- `src/lib/transferOrders.ts`: skapa order, skriv ut plocklista (sätter status), registrera plockning, godkänn utleverans, godkänn inleverans, avvisa.
- Rörelser bokförs enbart vid mottagarens godkännande, via befintliga `recordMovements`. Under transport ligger kvantiteten kvar på avsändarens saldo och visas som "under transport" på båda sidor.
- Differens mottaget mot skickat bokförs som svinn på avsändarens lager med automatiskt skapad svinnrapport.
- Delleverans: order står som delvis levererad tills allt mottagits eller restnoterats/avbeställts.

### Inköp landar i Inköpslagret

`post_purchase_report` bokför idag mot Grossist Flytande (`purchaseReportPosting.ts` skickar in `GROSSIST_FLYTANDE_ID`). Det ändras:

- Inköp bokförs mot enhetens **inköpslager**, med `expected_arrival_date` per rad.
- Ny funktion **"Registrera ankomst"**: flyttar Inköpslager → Grossistlager med ankomstkontroll. Kvantitet vid ankomst jämförs med kvantitet vid inköp; avvikelse kräver orsak och bokförs som svinn på inköpslagret.
- Underlagstyp `purchase_report` på båda stegen. Ingen andra inleveransväg får finnas kvar.

### Externt produktionsuppdrag

- Extern order håller varan i Tillverkningslagret hela tiden den är borta, märkt "Hos <leverantör>, väntas åter <datum>".
- Larm när returdatum passerats. Returen registreras manuellt (leverantören har inte systemet), med partiet från den ursprungliga råvaran.

## Etapp 3 — Utskrifter

- `src/lib/pickListPdf.ts`: A4, minst 14 pt, ingen färgad bakgrund, sorterad efter lagerplats, produktbild i miniatyr, partinummer, beställd kvantitet, tomt skrivfält för plockad kvantitet, ikryssruta per rad, signaturrader nederst.
- `src/lib/deliveryNotePdf.ts`: följesedel genererad ur ordern, med underlagsreferens, beställt/skickat per rad, spårbarhetsuppgifter för kapitel 3-varor och signaturrutor. Priser tillkommer för B2B-mottagare.
- Ingen utskrift utan befintlig `transfer_order`.

## Etapp 4 — Gränssnitt

- Lagersidan får en nivåväljare i flödesordning med antal produkter och värde per nivå. Nivåer utan behörighet visas grå med låsikon och texten "Hanteras av produktion" — aldrig dolda.
- Guidat överföringsflöde, en uppgift per skärm: välj produkter → mottagande lager → skriv ut plocklista → registrera plockning → godkänn utleverans → skriv ut följesedel.
- "Registrera plockning": samma radordning som papperet, förifylld beställd kvantitet, tangentbordshopp mellan rader, numeriskt tangentbord på mobil, produktbild per rad, orsak krävs vid avvikelse.
- **Påminnelse om oregistrerad plocklista:** larm i grossistvyn när en order stått i `plocklista_utskriven` i mer än fyra timmar — "Plocklista utskriven kl <tid> men inte registrerad", med knapp direkt till registreringsvyn.
- Mottagningsvy för butik: kontrollera, godkänn eller registrera avvikelse.
- "Planera till lager" för admin: flytta vara till tillverkningslager med anteckning; valet intern/extern uppdrag med leverantör, returdatum och pris per kilo.
- Svinnformulär tillgängligt från alla fem nivåer + svinnrapport per period (kilo och kronor per lager, produkt, orsak).

## Etapp 5 — Testfall

Automatiska tester för a–h i beställningen, inklusive de tre nekade fallen (tillverkning → butik, utleverans utan underlag, svinn utan orsak), att plocklista inte kan skrivas ut utan order, samt ankomstkontroll med avvikelse på inköpslagret.


## Tekniska noteringar

- Saldon skrivs fortsatt bara via `stock_movements`; `transfer_orders` är ett lager ovanpå, aldrig en egen skrivväg.
- Behörighet läses från `src/lib/pageAccess.ts` och utökas med lagernivå per portal.
- Underlagstyper: `purchase_report`, `production_order`, `shop_order`, `return_order`, `internal_transfer`, `waste_report`.
