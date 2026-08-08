# Ny lagerstruktur: fem nivåer med underlag och godkännande

Ersätter dagens grossist/butik-modell med fem klassade nivåer, en flödesregeltabell i databasen, överföringsordrar med dubbelt godkännande, trevägsmatchning, plocklista på papper, genererad följesedel och svinn med obligatorisk orsak.

Byggs i fem etapper. Varje etapp är körbar och testbar innan nästa.

## Etapp 1 — Datamodell och regler

- `storage_locations.location_type`: `inkopslager`, `grossistlager`, `tillverkningslager`, `leveranslager`, `butik`.
- Ny tabell `stock_flow_rules`: från-typ, till-typ, tillåten, krävt underlag, kräver orsak, kräver admin. Reglerna är data, inte kod — de går att ändra utan att bygga om.
- Nya tabeller `transfer_orders` och `transfer_order_lines` enligt punkt 4 i beställningen (status, godkännare, tidpunkter, beställt/plockat/skickat/mottaget, avvikelseorsak per steg).
- Ny tabell `waste_reports` + rader: kvantitet, orsak ur lista, fritext, rapportör, lager.
- Nya rörelsetyper: `svinn` finns redan; `overforing_ut`/`overforing_in` används för transporter.
- Databasspärrar (triggers):
  1. Flytt som inte finns som tillåten rad i `stock_flow_rules` avvisas.
  2. `godkänd_utleverans` kräver `source_document_type` + `source_document_id` (undantag: svinn).
  3. Inleverans kan inte godkännas med oredovisad avvikelse.
  4. Minskning av saldo med `svinn` kräver referens till en svinnrapport.
- Migrering: Grossist Flytande + de tre grossistlagren → `grossistlager`, butikernas platser → `butik`. Inköps-, tillverknings- och leveranslager skapas per enhet. Saldon rörs inte.
- Efter migrering: kontroll att de befintliga saldospärrarna fortfarande utlöser och att allowlisten i `stockLedgerGuard`-testet är tom.

## Etapp 2 — Överföringsflödet i backend

- `src/lib/transferOrders.ts`: skapa order, skriv ut plocklista (sätter status), registrera plockning, godkänn utleverans, godkänn inleverans, avvisa.
- Rörelser bokförs enbart vid mottagarens godkännande, via befintliga `recordMovements`. Under transport ligger kvantiteten kvar på avsändarens saldo och visas som "under transport" på båda sidor.
- Differens mottaget mot skickat bokförs som svinn på avsändarens lager med automatiskt skapad svinnrapport.
- Delleverans: order står som delvis levererad tills allt mottagits eller restnoterats/avbeställts.

## Etapp 3 — Utskrifter

- `src/lib/pickListPdf.ts`: A4, minst 14 pt, ingen färgad bakgrund, sorterad efter lagerplats, produktbild i miniatyr, partinummer, beställd kvantitet, tomt skrivfält för plockad kvantitet, ikryssruta per rad, signaturrader nederst.
- `src/lib/deliveryNotePdf.ts`: följesedel genererad ur ordern, med underlagsreferens, beställt/skickat per rad, spårbarhetsuppgifter för kapitel 3-varor och signaturrutor. Priser tillkommer för B2B-mottagare.
- Ingen utskrift utan befintlig `transfer_order`.

## Etapp 4 — Gränssnitt

- Lagersidan får en nivåväljare i flödesordning med antal produkter och värde per nivå. Nivåer utan behörighet visas grå med låsikon och texten "Hanteras av produktion" — aldrig dolda.
- Guidat överföringsflöde, en uppgift per skärm: välj produkter → mottagande lager → skriv ut plocklista → registrera plockning → godkänn utleverans → skriv ut följesedel.
- "Registrera plockning": samma radordning som papperet, förifylld beställd kvantitet, tangentbordshopp mellan rader, numeriskt tangentbord på mobil, produktbild per rad, orsak krävs vid avvikelse.
- Mottagningsvy för butik: kontrollera, godkänn eller registrera avvikelse.
- "Planera till lager" för admin: flytta vara till tillverkningslager med anteckning.
- Svinnformulär tillgängligt från alla fem nivåer + svinnrapport per period (kilo och kronor per lager, produkt, orsak).

## Etapp 5 — Testfall

Automatiska tester för a–h i beställningen, inklusive de tre nekade fallen (tillverkning → butik, utleverans utan underlag, svinn utan orsak) och att plocklista inte kan skrivas ut utan order.

## Tekniska noteringar

- Saldon skrivs fortsatt bara via `stock_movements`; `transfer_orders` är ett lager ovanpå, aldrig en egen skrivväg.
- Behörighet läses från `src/lib/pageAccess.ts` och utökas med lagernivå per portal.
- Underlagstyper: `purchase_report`, `production_order`, `shop_order`, `return_order`, `internal_transfer`, `waste_report`.
