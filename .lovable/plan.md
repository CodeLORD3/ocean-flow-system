# Kundbeställningar — Etapp 1 (grunden)

Bygger avsnitt 1–8, 10 och 22: privatkundregister, kundorder med faktisk vägd vikt, dagens pris, reservation/inköpsbehov, packflöde och vyerna. Etapp 2 (catering, kalender, allergener, storhelger) och Etapp 3 (etiketter, notiser, leverans, historik) tas i egna omgångar.

Helt skilt från `shop_orders` (butik → grossist) och från kassan. Egen rörelsetyp i lagerboken, så kassa- och diskförsäljning aldrig blandas med kundorder.

## Vad som byggs

**Kundregister (privat)**
- Nytt register `customers_retail`, skilt från dagens B2B-`customers`: namn, telefon (sökbart), e-post, gata/postnr/ort, butik, fritextanteckning (t.ex. portkod), vem som skapade.
- Kundkort med sökning på namn och telefon. Butiken ser sina egna kunder, admin ser alla.

**Order och rader**
- Ordernummer `BUTIKSKOD-ÅÅÅÅMMDD-NNN`, löpnummer per butik och dag.
- Ordertyp upphämtning/leverans, kategori vanlig/catering, önskat datum och tid, leveransadress som förifylls från kunden och kan ändras per order, källa (telefon/i butik/e-post), mottagen av, anteckning, totalsumma inkl moms.
- Status: förfrågan, ny, bekräftad, packad, delvis utlämnad, levererad, avhämtad, avbruten. Packstatus: opackad, pågående, packad.
- Rader: produkt, beställd kvantitet, packad (vägd) kvantitet, enhet, pris per enhet vid packning, radsumma, anteckning ("rensad", "skuren i bitar"), packstatus (opackad/packad/restnoterad/struken), reservationsstatus (reserverad/inköpsbehov), reserverat parti, ursprunglig produkt vid substitut.
- Fritextrad med eget pris tillåts (för upplägg som saknas i registret), tydligt markerad.

**Faktisk vikt vid packning**
- Vägd vikt matas in per rad, förifylld med beställd kvantitet men alltid ändringsbar. Numeriskt tangentbord.
- Lagerrörelsen bokförs alltid på packad vikt.
- Avvikelse över 20 % mot beställd kvantitet kräver bekräftelse.
- Etikettutskrift per rad (Brother QL-800-format som partietiketterna): produktnamn, vägd vikt, pris/kg, totalpris, packdatum, bäst före, partinummer, streckkod.

**Dagens pris gäller**
- Vid registrering visas uppskattat pris med texten "Uppskattat pris, dagens pris gäller vid hämtning". Pris hämtas från butikens prislista när den finns, annars produktens utpris; kan skrivas över per rad och då loggas vem och varför.
- Vid packning räknas raderna om mot dagens pris; orderkortet visar både uppskattat och verkligt belopp.
- Avvikelse över 15 % på totalen larmar i packvyn innan varan packas.
- Ingen betalstatus — betalning sker i kassan.

**Reservation och inköpsbehov (per rad)**
- Finns parti i butikens lager vars `best_before` täcker leveransdatumet med minst en dags marginal → reservera mot partiet.
- Annars inköpsbehov för leveransdagen, ingen reservation.
- Omräkning varje natt (schemalagd bakgrundskörning).
- Information (ingen spärr) när ordern ligger längre fram än artens hållbarhet: "Räkor håller 4 dagar. Ordern ligger 6 dagar fram, varan köps in inför leveransdagen."
- Lagervyn får kolumnerna saldo, reserverat, disponibelt. Reserverat dras inte från saldot. Larm när försäljning eller överföring gör disponibelt negativt.
- Ny vy "Sålt men inte köpt" för inköpare/grossist: grupperat per leveransdatum och produkt, summerat över alla butiker. Samma siffra visas i auktionskalkylen som "redan sålt till kund".

**Packning i tre steg**
- Opackad (grå, cirkel), pågående (gul, halvfylld), packad (grön, bock) — på hela ordern och per rad. Alla rader packade → ordern blir automatiskt packad.
- Packvyn: en order i taget, en rad per produkt med produktbild, stor kvantitet, viktfält och stor avbockningsknapp (minst 48×48 px, användbar med handskar).
- Vid packning per rad: reservationen nollas, lagerrörelse bokförs på butikens lager mot det reserverade partiet med referens till order och orderrad, saldot minskar och disponibelt är oförändrat.
- Avbruten order efter packning: motrörelse med orsak "avbruten order", kräver bekräftelse.
- Ohämtad efter tre dagar: ordern visas som ohämtad med knapparna "Kassera" (svinn, orsak "ohämtad order") och "Åter i lager".

**Delleverans, restnotering, substitut**
- Restnoterad rad blockerar inte utlämning; ordern står som delvis utlämnad tills alla rader är packade eller strukna. Restnoterade rader hamnar i "Sålt men inte köpt".
- Substitut byter produkt på raden, ursprunglig produkt sparas, notering om kundens godkännande krävs.

**Vyer — ny menypost `/customer-orders` under Försäljning**
- Lista: dagens och kommande order i tidsordning, filter på butik, status, packstatus, ordertyp.
- Sök: fritext mot kundnamn, telefon och ordernummer (efternamn ska räcka).
- Ny order: guidat flöde i steg — kund, ordertyp och tid, artiklar, bekräfta.
- Orderkort: alla uppgifter, packvy, statusknappar.
- Imorgon: öppnas automatiskt på butikens startsida — allt som ska hämtas eller levereras imorgon, med inköpsbehovsrader överst i gult och räknare "3 order imorgon, 2 varor behöver köpas in".
- Kundregister med sök och kundkort.
- Åtkomst: egen butik full, andra butiker läsläge (grått med låsikon), inköpare/grossist läsläge över alla butiker, admin full.

**Personuppgifter**
- Butiken ser bara sina egna kunder, admin ser alla.
- Radering av kund tar bort personuppgifterna men behåller ordern anonymiserad.
- Gallring: order äldre än 24 månader får kunduppgifterna rensade automatiskt.
- Loggning i `activity_logs` vid bulkläsning eller export av kunduppgifter.

Design enligt principerna: en uppgift per skärm, bild före text, färg alltid med ikon och ord, klarspråk, stora knappar, högst fem kolumner på mobil, synlig bekräftelse efter sparande, alla ledtexter i översättningsfilen.

## Tekniskt

- Nya tabeller: `customers_retail`, `customer_orders`, `customer_order_lines`, plus `customer_order_events` för tidslinjen (används fullt ut i etapp 3). RLS via befintliga `is_staff()` / `staff_has_store()` och GRANT per tabell.
- `stock_movements.movement_type` har idag en CHECK-lista utan kundorder. Den utökas med `kundorder` så att uttag för kundorder aldrig blandas med `forsaljning`. Rörelsen får `reference_type = 'customer_order_line'`.
- Reservationer läggs som eget fält på orderraden (reserverat parti + kvantitet) — inga saldoändringar. Disponibelt räknas i vyn som saldo minus summan av reserverade kvantiteter per produkt och lagerplats.
- Butikens lagerplats hämtas via `stores.inventory_location_id` / butikens `location_type = 'butik'`-plats, samma väg som dagens lagervyer.
- Nattlig omräkning av reservation/inköpsbehov som edge function med cron.
- Inventeringens differens jämförs mot saldo där kundorderuttagen redan är avräknade; rapporter skiljer på kundorder och övrig försäljning.
- Etiketter via befintlig etikettgenerator (samma layoutkod som partietiketterna).
- Ordernummer genereras i databasen så att två samtidiga order aldrig får samma löpnummer.

## Noteringar inför senare etapper

- Allergendata (AP-17) finns inte i systemet idag. `excluded_allergens` och `allergy_note` läggs på ordern redan nu som fritext/lista, men varningen vid artikelval i avsnitt 12 kräver att produkternas allergendata byggs först.
- Prislistorna är tomma idag, så dagens pris faller tillbaka på produktens utpris tills en butiksprislista finns.
