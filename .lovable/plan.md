# Revision av tidigare beställt + fyra nya uppgifter

## Del 1: Del 2 före etapp 4

| # | Punkt | Status | Bevis |
|---|---|---|---|
| a | Skarpt bevis för saldospärrarnas felmeddelanden | **inte gjort** | Spärrarna finns i databasen (`guard_stock_balance_writes`, `enforce_movement_preconditions`) och kodspärrarna testas statiskt i `stockLedgerGuard.test.ts`, men ingen har provocerat felen skarpt. Min DB-åtkomst är läsbehörighet, så jag kan inte skriva direkt för att visa meddelandet |
| b | Nollställa avg_cost/unit_cost på nollraderna | **inte gjort** | 15 rader har `quantity = 0` men kvarvarande kostpris, bl.a. Kolja 78,00 och Långa 60,00 |
| c | Tom saldorad på inaktiverad plats borttagen | **klart** | 0 rader i `product_stock_locations` mot inaktiv plats |
| d | Tre namnuppslag ompekade | **klart** | Receiving.tsx, orderStatusSync.ts och Inventory.tsx slår upp på `location_type`; testet "de tre tidigare hålen är stängda" passerar |
| e | `locationLookupGuard.test.ts` med tom undantagslista | **klart** | Filen finns, `ALLOWED_NAME_LOOKUPS` är tom, 4 test passerar |
| f | Namnuppslag kastar vid inaktiv plats | **klart** | `locations.ts` kastar både vid flera träffar och när `active === false`; `assertActiveLocation` finns |

## Del 2: Tidigare beställt

| # | Punkt | Status | Bevis |
|---|---|---|---|
| g | Täckningskontroll i Admin | **klart** | `/coverage` (Datakvalitet) i adminmenyn, `DataCoverage.tsx` + `coverageChecks.ts` med yields, cut_models, cut_splits, detail_prices, margins_vat. 15 test passerar |
| h | Alias per styckdetalj | **delvis** | `cut_model_splits` har Rygg (backloin), Buk (bellyloin), Benfri filé, Stjärt, Kotlett/tronçon, Kontrarygg. Saknas: "tail" och "counter loin" som engelska alias, samt "buklapp" |
| i | Extern order_type på production_orders | **byggt men inte verifierat** | Kolumner + `validate_external_production_order` finns; 0 externa order skapade och ingen returvy |
| j | Konfigurerbar gräns för plocklistelarmet | **byggt men inte verifierat i gränssnittet** | `system_settings.picklist_alarm = {"hours": 4}`, `useSystemSettings.ts` finns; aldrig ändrat via UI, aldrig utlöst |
| k | `parent_location_id` på storage_locations | **klart** | Kolumnen finns, hierarkitriggern `enforce_location_hierarchy` är aktiv |
| l | AP-9 dubblettspärr + supplier_article_map | **delvis** | `file_hash`-spärren finns och används i `PurchaseReporting.tsx`. Ingen spärr på dokumentnummer. `supplier_article_map` finns men har **0 rader** — inte i drift |
| m | Etapp 5 i lagerplanen | **fanns inte** | Lagerplanen omfattade etapp 1–4; ingen etapp 5 beställdes eller byggdes |

## Del 3: Hälsokontroll

| # | Punkt | Svar |
|---|---|---|
| n | Ocommittade ändringar / ej körda migrationer | Inga ocommittade ändringar; alla migrationer i repot är körda (senast 2026-08-08 11:43) |
| o | Edge functions äldre än repot | `parse-foljesedel` saknar dokumentnummer-dedupe och skriver inte `supplier_article_map` — funktionen ligger efter det som beställts, inte efter repots kod |
| p | Test | 65 test i 6 filer, 65 passerar |
| q | Publicerat | Livesajten kör ett bundle med etapp 4-koden (`picklist_alarm`, plocklista). Exakt publiceringstidpunkt kan jag inte läsa ut — säg till om du vill att jag publicerar om för att få en känd tidsstämpel |

## Sammanfattning

**Klart och verifierat:** c, d, e, f, g, k, n, p

**Byggt men inte verifierat:** i (extern order), j (plocklistelarmets gräns), q (publicering), saldospärrarna (finns men aldrig provocerade skarpt)

**Inte gjort:** a (skarpt spärrbevis), b (nollställa 15 nollrader), h (tre alias saknas), l (dokumentnummer-dedupe + supplier_article_map i drift), m (fanns aldrig)

---

# Körordning

b → a → h → uppgift 1 → 2 → 3 → 4 → l → prisrapporten. Rapport efter varje steg.

# Före uppgift 1

## b. Nollställ de 15 nollraderna

- Bokför en korrigerande rörelse per rad så att `avg_cost` och `unit_cost` blir 0 där `quantity = 0` (bl.a. Kolja 78,00 och Långa 60,00). Ingen direktskrivning mot `product_stock_locations`.
- Ny regel i `apply_stock_movement`: när saldot efter rörelsen är 0 sätts `avg_cost` och `unit_cost` till 0, så att en tom plats aldrig kan smitta nästa inleverans genom det viktade snittet och NRV-kedjan.

## a. Skarpt bevis för spärrarna

- Tillfällig edge function med service role som medvetet försöker två saker och returnerar felmeddelandet i klartext:
  1. direktskrivning av saldot i `product_stock_locations`
  2. bokföring av en rörelse mot en inaktiverad lagerplats
- Funktionen körs, båda felmeddelandena redovisas ordagrant, sedan tas funktionen bort.

## h. Tre alias

Lägg till engelska "tail" på Stjärt, "counter loin" på Kontrarygg och "buklapp" på Slag i styckdetaljernas aliaslista.

# Uppgift 1: Vy för Registrera ankomst


Ny sida `/arrivals`, menypost under Inköp (grossist + admin).

- Lista partier med saldo i inköpslagret: produktbild, produktnamn, partinummer, inköpt kvantitet, förväntat ankomstdatum, leverantör
- Kryssruta per rad, fält för faktisk kvantitet förifyllt med inköpt kvantitet
- Avvikelse kräver orsak ur fast lista; differensen bokförs som svinnrapport på inköpslagret
- Knapp "Registrera ankomst" flyttar valda partier till grossistlagret via `purchaseArrival.ts`
- Rader med passerat ankomstdatum sorteras överst och markeras gula

Klart när ett parti kan flyttas inköpslager → grossistlager helt i gränssnittet.

# Uppgift 2: Nivåväljare på lagersidan

- Fem flikar på `/inventory` i flödesordning: Inköpslager, Grossistlager, Tillverkningslager, Leveranslager, Butik
- Per flik: totalt saldo i kilo och lagervärde
- Nivåer användaren inte får röra visas grå med låsikon och texten "Hanteras av produktion". Saldot syns, knappar avaktiverade
- `LevelSelector` ändras så att otillåtna nivåer gråas i stället för att filtreras bort

Klart när en butiksanvändare ser tillverkningslagrets saldo men inte kan göra något med det.

# Uppgift 3: Returregistrering från externt uppdrag

- Lista öppna externa produktionsuppdrag: leverantör, skickad kvantitet, förväntat returdatum, larm när datumet passerat
- Registrera retur: produkt och kvantitet, parti ärvs från råvaran via `lot_transformations`
- Faktiskt utbyte räknas och visas mot standardutbytet i `yields`
- Returen bokförs tillbaka till grossistlagret via rörelseloggen

Klart när 200 kg hel torsk kan skickas ut och 120 kg filé registreras tillbaka med partiet bevarat.

# Uppgift 4: Inloggad verifiering

Sessionen i min testmiljö är utloggad. För att kunna verifiera inloggad behöver du logga in en gång i Lovable-förhandsvisningen — då injiceras sessionen till nästa meddelande. Därefter går jag igenom varje sida som butik och som admin och rapporterar ja/nej per sida.

# Bokföring av gamla rapporter

Bara rapporter från de senaste två veckorna bokförs. Just nu finns **0 obokförda rapporter inom två veckor** — samtliga 54 är äldre. De markeras därför som historiska utan lagerpåverkan (ny status, ingen rörelse i lagret).

# Efter de fyra: lista över artgrupper utan referenspris

Ren rapport, ingen kod: artgrupper som saknar referenspris, sorterade efter hur ofta arten förekommer i inköpsrapporterna.

## Tekniska noter

- Ny sida `Arrivals.tsx` + rutt i `pageAccess.ts` (`GROSSIST`, `ADMIN`) och sidebar
- Avvikelse återanvänder `createWasteReport` så negeringen sker i rörelseloggen
- Retur skrivs via `recordMovement` — ingen direktskrivning mot `product_stock_locations`
- Nivåflikarna läser `location_type` och summerar `quantity` och `stock_value` per nivå
- Historikmarkeringen av de 54 rapporterna kräver en migration (statuskolumn/flagga), utan rörelser
