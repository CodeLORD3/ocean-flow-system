# AP-9 (omskriven): utökad följesedelsinläsning

## Svar på dina två frågor först

**1. Följesedlar ut (delivery_notes)**
Tabellen finns med rader (`delivery_note_lines`), hooks (`useDeliveryNotes`: lista, skapa, radera) och används på exakt ett ställe: `src/pages/Wholesale.tsx` (nuvarande Admin-portal). Ingen PDF-generator är kopplad — det finns ingen `deliveryNotePdf`-modul, till skillnad från prislista och inventeringslista. Det finns heller ingen skrivning till `stock_movements` från följesedeln, så utflödet till butik bokförs inte via följesedel idag; det fångas bara indirekt av inventeringen (differens → försäljning/svinn) enligt etapp 1. Det som visas i Dashboard/OrganisationOverview är bara en räknare.

Slutsats: funktionen är halvfärdig och används inte skarpt. Utskrift sker alltså utanför systemet. Om utflödet till butik ska bokföras korrekt behövs ett separat arbetspaket (följesedel ut = överföringsrörelse Grossist → butikslager, PDF-utskrift). Det ligger utanför AP-9.

**2. Scomber-prismotorn**
Hela Scomber-spåret (`scomber_pricing_rules`, `price_overrides`, `scomber-price-resolve`, `scomber-batch-allocate`, `scomber-morning-suggest`, `scomber-pos-checkout`, `scomber-set-override`, `scomber-traceability`, `scomber-makrilltrade-sync`, `_shared/scomber.ts`) anropas bara från `src/pos/**` (`PosRegister`, `PosPricing`, `TraceabilityModal`, `scomberClient.ts`). Ingen ERP-sida, ingen prislista och ingen NRV-kod rör den. Den arbetar mot ett eget artikelbegrepp (`articles`), inte `products`.

Det vill säga: den är inte en konkurrerande prismodell inne i ERP:et, utan en isolerad kassamotor. Syftet jag kan se i koden är realtidsprissättning + spårbarhet i kassan. Den blir motstridig först om kassan ska hämta pris från kanalprislistorna (AP-8). Rekommendation: låt den ligga orörd tills POS aktiveras skarpt, och avveckla då genom att peka kassan mot `price_lists`/NRV i stället för att underhålla två modeller. Inget byggs nu.

## Vad AP-9 gör

Utökar den befintliga AI-inläsningen (`supabase/functions/parse-foljesedel`) — ingen ny parser, ingen formatigenkänning — och kopplar inköpsrapporten till lagerledgern så att inleveransen inte behöver registreras om manuellt i Receiving.

## Steg

**1. Databas (en migration)**
- `purchase_reports`: `supplier_id`, `document_type`, `document_number`, `document_date`, `delivery_date`, `total_ex_vat`, `file_hash`, `posted_at`, `posted_by`. Unikt index på `(supplier_id, document_number)` där båda finns; index på `file_hash`.
- `purchase_report_lines`: `supplier_article_no`, `latin_name`, `species_fao_code`, `lot_numbers text[]`, `catch_area`, `fishing_gear`, `fishing_gear_code`, `catch_date_from`, `catch_date_to`, `best_before`, `presentation`, `grade`, `condition`, `vessel_name`, `vessel_reg`, `vessel_nation`, `certificate`, `ordered_quantity`, `amount_mismatch boolean`, `lot_id`, `movement_id`, `match_method`.
- Ny tabell `supplier_article_map (supplier_id, supplier_article_no, product_id)`, unikt på de två första, med GRANT + RLS enligt projektets mönster.
- Ny tabell `purchase_report_rejected_lines` för otolkade rader (samma mönster som produktimportens loggning).
- `lots`: `price_status` finns redan (preliminar/bekraftad) — återanvänds.

**2. Edge function `parse-foljesedel`**
Behåller Gemini via Lovable AI Gateway och `extract_products`-verktyget, men schemat byts till `{ document: {...}, lines: [...] }` med dokumenthuvudet (leverantör, dokumenttyp, dokumentnummer, dokumentdatum, leveransdatum, totalsumma ex moms) och de nya radfälten. Alla nya fält nullable, systemprompten skärps: aldrig gissningar, `null` när fältet saknas; `lot_numbers` är alltid en array så en rad kan bära flera partinummer. Filens SHA-256 beräknas i funktionen och returneras.

**3. Leverantörs- och produktmatchning (ny `src/lib/foljesedelMatch.ts`)**
Återanvänder `supplierAliasKeys`/`buildSupplierIndex`/`lookupSupplier` från `productImport.ts` och `skuKey`/`compareKey`/`speciesKey` från `asciiFold.ts`. Matchningsordning per rad: sparad `supplier_article_map` → FAO-kod → latinskt namn → `species_group` → namnnyckel. `match_method` sparas per rad. Saknad leverantör frågas en gång i UI:t och kopplingen sparas; manuellt vald produkt skrivs till `supplier_article_map`.

**4. Dubblettspärr**
Vid uppladdning kontrolleras `file_hash` och `(supplier_id, document_number)`. Träff → dialog som kräver bekräftelse innan en ny rapport skapas, aldrig tyst dubblett.

**5. Brygga till lagerledgern**
Knappen "Bokför inleverans" på klar rapport i `PurchaseReporting.tsx`, driven av en ny `src/lib/purchaseReportPosting.ts` som anropar exakt samma partiskapande + `recordMovements` som `Receiving.tsx`: ett `lot` per partinummer (kvantiteten delas jämnt när en rad har flera batchnummer), alla spårbarhetsfält satta, `price_status = 'preliminar'`, inleveransrörelse mot Grossist Flytande via `GROSSIST_FLYTANDE_ID` i `src/lib/locations.ts`, och `lot_id`/`movement_id` tillbaka på raden. Idempotent via `posted_at`.

**6. Övrigt**
Enhetsnormalisering kg/st/låda/förp mot produktens `unit`; kontroll att `quantity × unit_price ≈ line_total` med markering vid avvikelse; `report_date` sätts från dokumentdatum i stället för uppladdningsdagen; otolkade rader loggas.

**7. Test (`src/test/foljesedel.test.ts`)**
- GFA 2026-07-28: 32 kollin, 532 kg, 15 partirader — parti 10012.6125240, Torsk 1 rensad, S158 SARON Danmark, 29 kg à 146 kr, trål, 27.3.a.n Skagerak, 2026-07-27 → ett lot med `grade = 1`, `presentation = rensad`, `price_status = preliminar`.
- JHB 2709177: artikel 71106 Hummer levande Sverige 100 kg med fyra batchnummer → fyra lots à 25,000 kg.
- Enhetsnormalisering, radsummeavvikelse och dubblettspärr som enhetstester.

## Tekniska noter
- Migrationen körs först och godkänns separat innan koden som beror på schemat skrivs.
- `product_stock_locations` och `products.stock` skrivs aldrig direkt — hela bokföringen går via `recordMovements`, så `stockLedgerGuard.test.ts` fortsätter passera med tom allowlist.
- Ingen ny prismodell införs: den preliminära följesedelskostnaden blir `unit_cost` på partiet och matas in i NRV via `avg_cost` som tidigare.
