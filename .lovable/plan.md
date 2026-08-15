# Ny kundbeställning: produkter först

Bygg om stegordningen i den befintliga modalen "Ny kundbeställning — [Butik]". Samma modal, samma progressbar-stil, samma färger och komponenter. Ingen ny databasändring behövs.

Ny ordning:

1. Lägg till produkter
2. Välj kund
3. Hämtning
4. Bekräfta

## Steg 1 — Lägg till produkter

- Sökfält "Sök efter en produkt" högst upp, livefiltrering utan Enter (Enter väljer första träffen som idag), träfflista med produktbild + namn, kategori och enhet — samma produktregister som idag.
- Vald produkt öppnar samma mängdkort som idag (antal/mängd i produktens enhet, catering-portion när det är aktuellt), och läggs sedan till i listan under sökfältet.
- Räknare ovanför listan: "Du har lagt till X produkter".
- Varje rad: bild, produktnamn, redigerbart antal direkt i raden (stepper/nummerfält), och "Ta bort" med papperskorgsikon till höger.
- Mängdformatering enligt övriga ordervyer: kg med max en decimal och utan onödig nolla ("2", "1,5"), styck utan decimal. Mindre textstorlek på artikelraderna.
- Fritextrad för catering behålls (visas när kategorin catering är valt i steg 3, annars i en diskret "Övrigt"-rad).
- Kan inte gå vidare utan minst en produkt.

Notering: allergivarning per vara bygger på allergenval som nu ligger i steg 3. Varningen körs därför om när steg 3 fylls i, och visas då som varning på berörda rader i sammanfattningen — samma varningstext som idag, ingen spärr.

## Steg 2 — Välj kund

- Samma kundsök ("Sök namn eller telefon"), samma lista, "Företag"-badge — flyttat hit oförändrat.
- Vid ingen träff: text "Ingen kund matchar" plus knapp "+ Lägg till som ny kund".
- Block "Är kunden ny?" med kort text och knapp "+ lägg till ny kund" som öppnar den befintliga kundmodalen (RetailCustomerDialog) med rubrikgrupperna Kunduppgifter, Kontaktinformation, Adress, Anteckning. Modalen har standard X-stäng.
- Nyskapad kund väljs automatiskt.
- Kan inte gå vidare utan vald kund.

## Steg 3 — Hämtning

Alla dagens fält behålls, komprimerat i ett kort:

- Hämtningsbutik: förvalt aktuell butik, valbar bland de butiker användaren har behörighet till. Byte flyttar ordern till den butiken (den sparas där) och priser/kundsök följer med.
- Hämtningsdatum och hämtningstid, med befintliga öppettids- och kapacitetsvarningar.
- Anteckning till hämtningen.
- Kategori (Vanlig/Catering med gästantal), Status (Ny/Förfrågan) och Källa (telefon/i butik/e-post) ligger kvar men grupperade i en sammanfälld sektion "Mer" tillsammans med allergianmärkning och allergenval.
- Ordertyp och leveransadress tas bort — flödet är alltid hämtning i butik.

## Steg 4 — Bekräfta

- Kund, hämtningsbutik/datum/tid, hämtningsanteckning och allergiinfo i ett kort.
- Produktrader med mängd, à-pris och radsumma, plus uppskattad totalsumma med samma "dagens pris gäller"-text.
- Varje sektion har en liten "Ändra"-länk som hoppar till respektive steg.
- Primärknapp "Skapa order".

## Navigering och stegindikator

- Progressbaren visar alla fyra steg med titel: aktivt steg markerat, kommande steg dämpade och inte klickbara.
- Fot: "Avbryt" till vänster, "Föregående" från steg 2, "Fortsätt" som primärknapp till höger, "Skapa order" på sista steget.
- Responsivt (ett fält per rad på mobil), labels kopplade till fält, fullt tangentbordsflöde.

## Tekniskt

- Allt sker i `src/components/orders/CustomerOrderWizard.tsx`. Stegen bryts ut till underkomponenter i samma mapp (`wizard/ProductsStep.tsx`, `CustomerStep.tsx`, `PickupStep.tsx`, `ConfirmStep.tsx`) så filen inte växer okontrollerat; state stannar i wizarden.
- `storeId` blir internt `pickupStoreId` (initieras från prop) och används för `fetchTodaysPrice`, `useRetailCustomers`, `useStoreOrderSettings` och `store_id` i `createOrder`.
- Butikslista via befintlig `useStores` filtrerad mot användarens store-scopes (samma källa som portalvalet).
- Kundformuläret återanvänds via `RetailCustomerDialog` istället för den duplicerade inline-varianten i wizarden.
- Mängdformatering återanvänder samma hjälpfunktion som orderraden (`qtyText`) i stället för `nf(x, 3)`.
- `order_type` sätts alltid till `upphamtning`; leveransadressfälten skickas som null.
