# Inventering före AP-9 (inget byggt, inget ändrat)

## DEL 1 — Befintlig följesedelsinläsning

1. **Filer**
   - `supabase/functions/parse-foljesedel/index.ts` — enda parsern (Edge Function, `verify_jwt = false`).
   - `src/pages/PurchaseReporting.tsx` (rad ~1014-1090) — enda anropspunkten: uppladdning, anrop, radskrivning.
   - `src/pages/PurchaseReportsArchive.tsx` / `src/pages/ReportsRouter.tsx` — visning av arkiverade rapporter.
   - `src/hooks/useDeliveryNotes.ts` + `src/components/DeliveryNote.tsx` / `PackingSlip.tsx` — utgående följesedlar (dokumentgenerering), helt separat från inläsningen.

2. **Format**
   - Bild (`image/*`) skickas som `image_url` direkt till modellen; PDF laddas ner och skickas som base64 `file`-del; okänt format tvingas till base64 data-URL.
   - CSV/XML/Excel stöds inte här (Excel-import finns bara för produktregistret i `ProductImportDialog.tsx`).
   - Modell: `google/gemini-2.5-flash` via Lovable AI Gateway, tool-call `extract_products` med JSON-schema, fallback till regex på `[...]` i innehållet.

3. **Fält som läses ut** (endast fem)
   - `product_name`, `quantity`, `unit`, `unit_price`, `line_total`.
   - Ingen leverantör, inget fakturanummer, inget följesedelsnummer, inget datum, ingen art/latin, inget fångstdatum, ingen FAO-zon, inget ursprungsland, inget fartyg, inget partinummer, ingen valuta, ingen frakt/avgift, ingen moms.

4. **Tabeller som skrivs**
   - Storage: `purchase-documents` (publik URL, filnamn = `uuid.ext`, originalnamnet sparas bara i `file_name`).
   - `purchase_reports`: `file_name`, `file_url`, `status` ("Bearbetar" → "Klar" / "Inga produkter hittades"), `report_date` = idag, `total_amount` = summa `line_total`.
   - `purchase_report_lines`: en rad per extraherad produkt med `product_name`, `quantity`, `unit`, `unit_price`, `line_total`, `status = "Inköpt"`, `purchase_date` = idag.
   - Skriver **inte**: `products`, `lots`, `stock_movements`, `incoming_deliveries`, `suppliers`, `detail_prices`.

5. **Produktmatchning**
   - Ingen automatisk matchning vid inläsning: `product_id` sätts aldrig av parsern, bara fritextnamn.
   - Koppling sker manuellt i UI: sökfältet i Inköpsrapportering (`name.toLowerCase().includes(...)`) eller "Ny produkt" som skapar produkt med `sku = NEW-<timestamp>` och lägger en 0-rad på rapporten.
   - Den smarta matchningslogik som redan finns används inte här: `skuKey`/`compareKey`/`speciesKey` i `src/lib/asciiFold.ts`, leverantörsmatchning och fuzzy-matchning i `src/lib/productImport.ts`, fuzzy filnamnsmatchning i `ProductImageBulkUpload.tsx`.

6. **Ofullständigt**
   - Ingen idempotens/dubblettspärr: samma fil kan laddas upp flera gånger och ger nya rapporter (orsaken till Baldvin-buggen tidigare).
   - Ingen leverantörsbindning, inget dokumentdatum från handlingen — `report_date` = uppladdningsdag, inte leveransdag.
   - Ingen brygga till lagerledger: rader blir aldrig `lots` eller `stock_movements`; inleveransen måste registreras om i `Receiving.tsx`.
   - Ingen enhetsnormalisering (kg/st/förp/liter blandas rått), ingen valuta-/FX-hantering, ingen kontroll att `quantity × unit_price = line_total`.
   - Ingen spårbarhetsdata trots att `lots` och `product_traceability_required` finns i databasen.
   - Ingen loggning av avvisade/otolkade rader (finns för produktimporten men inte här).

## DEL 2 — Systemöversikt per funktionsområde (skarpt = S, halvfärdigt = H, oanvänt = O)

**Inköp och inleverans**
- Inköpsschema `/purchase-schedule` — planering per vecka/leverantör — S.
- Inköpsrapportering `/purchase-reporting` — AI-inläsning + manuell radredigering, 54 rapporter — S.
- Inköpsarkiv via `/reports` — arkiverade rapporter — S.
- Inleveranser `/receiving` — mottag med partiskapande via ledger — S (låg volym).
- `incoming_deliveries` + `useIncomingDeliveries` — parallellt inleveransspår, 0 rader — O.
- `delivery_receiving_reports` — mottagningsrapport från butik/grossist — H.
- Leverantörer `/suppliers` — 44 poster — S.

**Lager och inventering**
- Lager `/inventory` med `InventoryRouter` (Lager/Produkter/Priser) — S.
- `stock_movements` + trigger `apply_stock_movement` — enda tillåtna saldovägen — S.
- `product_stock_locations` (9 rader) med `avg_cost` — derivat, skrivskyddad via `guard_stock_balance_writes` — S.
- `products.stock` — derivat via `sync_product_stock_total` — S (får inte skrivas direkt).
- Lagerplatser med hierarki (Försäljningslager + kategori-sublager), 56 platser — S.
- Inventering `StockCountDialog` + `stockSheetPdf` — differens bokförs som försäljning/svinn — S.
- `inventory_reports`/`inventory_report_lines` (20/10 rader) — äldre inventeringsspår parallellt med `stock_movements` — H.
- `lots` (0 rader) + `LotTraceabilityView` — nybyggt, inte i skarp drift ännu — H.
- `deleted_stock_log` — raderingslogg — O.
- Streckkoder `/barcodes` + `BarcodeScanner` — S/H (scanner används sparsamt).

**Distribution och följesedlar**
- Utgående följesedel `useDeliveryNotes` + `DeliveryNote`/`PackingSlip` PDF, `FS-2026-nnnn`, 0 rader — H/O.
- Transportschema `transport_schedules` (8 rader) — S.
- Transportlager/`Grossist Flytande` som mellanled i `src/lib/locations.ts` — S.
- Inkommande följesedel = enbart AI-parsern ovan; ingen koppling mellan in- och utgående följesedel — H.

**Produktion och tillverkning**
- Filé/Tillverkning `/production` — NRV-prissättning, partibindning, auktionskalkyl — S (nyligen byggt).
- Styckningsmodeller + utbyten (`species_cut_models` 52, `yields` 98, `cut_splits`) — S.
- `lot_transformations` — ett detaljparti per råvaruparti — S (ny).
- Produktionsschema `/production-schedule` — S.
- Produktionsrapportering `/production-reporting` + arkiv — 39 rapporter — S.
- `production_orders`/`production_order_lines` (0 rader) — ny modell, ännu inte använd skarpt — H.
- `production_batches` + `useProductionBatches` — äldre batchspår parallellt med `lots` — O.
- `yield_actuals` (0 rader) — uppföljning av faktiskt utbyte — O.
- `auction_calcs` (0) — sparade auktionskalkyler — O.

**Prissättning och prislistor**
- Prissättning `/pricing` (flik i Lager) — S.
- `detail_prices` per kanal (`butik_goteborg`, `grossist`) + `margin_targets` — S (ny).
- `processing_surcharges` (13) + `vat_rates` (3) — S.
- `price_history` — ändringslogg — S.
- Prislista-PDF: `PriceListDialog` + `priceListPdf` + `SavedPriceLists` mot `price_lists`/`price_list_items` (0 rader) — H.
- Scomber-prismotor: `scomber_pricing_rules`, `price_overrides`, `scomber-price-resolve`, `scomber-morning-suggest` — separat parallell prismodell, 0 rader — O.

**Butiksorder**
- Butiksorder `/orders` via `OrdersRouter` (ShopOrders/WholesaleOrders), 80 ordrar — S.
- `shop_order_lines` (0) + radstatus `useUpdateOrderLineStatus` + `orderStatusSync` — H (rader ligger tomma).
- Ändringsförfrågningar `shop_order_change_requests` + `autoApproval.ts` — H.
- Önskelista `shop_wishes` (0) — O.
- Kunder/Fakturor `/customers` (6), `/invoices` — S/H.

**Rapporter och uppföljning**
- Rapportnav `/reports` (butiks-, inköps-, produktionsarkiv) — S.
- Veckorapport `weekly_reports` (10) med kostnad/försäljning/social-rader, lagerplats via `stores.inventory_location_id` — S (försäljnings-/inventeringsrader 0 = H).
- Butiksrapport `shop_reports` (0) + `shopReportPdf` — O.
- Checklistor `/checklist` (141 poster) — S.
- Mötesprotokoll `/meetings` (84 poster) med `completion_note` — S.
- Kalender `/schedule` (80 events); `manual_schedule_entries` (0) — S / O.
- Revision & Logg `/audit` + `activity_logs` (1681) — S.
- Sessions/besök `user_sessions`, `page_visits` — S.
- Ekonomi `/finance`, Prognoser `/forecasts`, Administration `/settings` — `PlaceholderPage` — O.

**Kassa**
- POS `/pos` (login, skift, register, prissättning) med `pos_transactions` (2), `pos_shifts` (2), `pos_cashiers` (2) — H (kassorna är externa i drift).
- `pos_products` (0), `pos_sync_queue` (0), `pos_audit_log` (0), `batch_allocations` (0) — O.
- `scomber-commerce/` — separat Node/TS-projekt med egen prismotor, FIFO-allokerare och SQL-schema, ingår inte i appen — O.
- Makrilltrade-sync (`makrilltrade_articles_cache`, `makrilltrade_batches_cache`, `scomber-makrilltrade-sync`) — 0 rader — O.

**Administration och behörighet**
- Personalinloggning `StaffAuthContext` + `staff` (11) + portal-access, glömt lösenord/återställning — S.
- Portalväxling `SiteContext` + `PortalChooser` (Butik/Grossist/Admin) — S.
- Sidebar-synlighet `store_sidebar_prefs` (25) — S.
- Butiker `/stores` (7) med omslagsbilder/hero, `entity_images` (7) — S.
- `store_configs` (0) — O.
- Bilar & Maskiner `/vehicles` (6 fordon; `machines` 0, dynamiska kolumner 0) — S/H.
- Chatt `/chat` (10 meddelanden) + notiser (1270) — S.
- `user_roles` (0 rader) trots `has_role()` — behörighet styrs i praktiken av `staff.portal_access` — H.
- Investerarportal `/portal/*` (onboarding, KYC, pledges 7, trade offers 4) — S, separat spår.

## Markeringar

**a. Kan ha blivit överflödigt/motsägelsefullt av senaste arbetspaketen**
- `inventory_reports`/`inventory_report_lines` vs `stock_movements` — två sanningar om inventering.
- `production_batches` vs `lots`/`lot_transformations` — två partimodeller.
- Scomber-prismotorn (`scomber_pricing_rules`, `price_overrides`) vs NRV + `detail_prices`/`margin_targets`.
- `incoming_deliveries` vs `Receiving.tsx`-flödet mot ledger + `lots`.
- `products.stock` som fält i äldre UI vs derivatregeln.

**b. Finns i koden men används av ingen**
- `scomber-commerce/`, Makrilltrade-cache och sync, POS-tabellerna utom skift/kassör, `pos_products`, `batch_allocations`, `shop_wishes`, `yield_actuals`, `auction_calcs`, `manual_schedule_entries`, `deleted_stock_log`, `store_configs`, `machines`/kolumn-tabellerna, `price_lists`/`price_list_items`, `delivery_notes`, `user_roles`, `/finance`, `/forecasts`, `/settings`.

**c. Två funktioner som löser samma sak olika**
- Inleverans: AI-följesedel → `purchase_report_lines` vs manuell `Receiving.tsx` → `lots` + rörelser.
- Rapportering av butiksläge: `weekly_reports` vs `shop_reports` vs `inventory_reports`.
- Prissättning: NRV/`detail_prices` vs `scomber-price-resolve`/`price_overrides` vs `PriceListDialog`-prislistor.
- Produktmatchning: fuzzy/`compareKey` i produktimport vs enkel `includes`-sökning i inköpsrapportering.
- Partispårning: `lots` vs `production_batches` vs `batch_allocations`.
- Lagerplatsuppslag: kanoniska ID i `src/lib/locations.ts` vs namnsträngar i äldre vyer.
