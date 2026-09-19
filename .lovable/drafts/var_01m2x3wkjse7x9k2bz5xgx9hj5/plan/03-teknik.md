## Teknisk genomförande

**Burkläge (endast CH)**
- Ny hjälpare `src/lib/countPack.ts`: `packMode(product, countryCode)` → `{ mode: "burk" | "kg", packKg }`. Burkläge när butikens bolag har `legal_entities.country = 'CH'` och varans `category` matchar sås/röra-grupperna. `packKg = products.weight_per_piece || 0.1`.
- `CountMobile.tsx`: raden "Räknas i …" och `CountStepper` får `mode`; i burkläge heltalssteg, `allowDecimal={false}` i knappsatsen, inget kilofält. Visade värden är burkar; `values[key]` lagras fortsatt i kilo (`burkar × packKg`, avrundat till en decimal) så sparvägen, `expectedQty`-jämförelsen och rimlighetskontrollen är oförändrade.
- Sammanfattningsraden visar "N burkar (X,X kg)" i burkläge.
- Inga ändringar i `stock_movements`, godkännandeflöde eller `inventory_report_lines` — kilo skrivs som förut.
- Butikens land hämtas via `stores.legal_entity_id → legal_entities.country` i en liten hook, cachead per butik.

**Beständig anteckning på varan**
- Additiv migration stageas (gäller när utkastet accepteras): tabell `product_notes` (`id`, `product_id` FK, `store_id` nullable FK, `note text`, `created_by` FK staff, `created_at`, `updated_at`) med GRANT till `authenticated`/`service_role`, RLS-policy som följer befintlig butiksåtkomst (`can_see_store`), samt unikt index på `(product_id, coalesce(store_id,...))` via uttryck eller `store_id` NOT NULL med butiksbunden anteckning.
- Ny hook `useProductNotes(storeId, productIds)` för läsning i räkningen och `useSaveProductNote` för skrivning; `CountNoteSheet` sparar både i lokalt `notes`-state (följer räkningen) och som beständig anteckning.
- Anteckningen visas under varunamnet i räknevyn med namn och datum (befintlig `StaffName`-komponent), och som en rad i sammanfattningen med en pennknapp som öppnar samma `CountNoteSheet`.
- Tom text tar bort raden.

**Tester**
- `src/test/countPack.test.ts`: burkläge bara för CH + såskategori, kg-omräkning med och utan styckvikt, svensk butik oförändrad.

Tabellen för anteckningarna skapas när du accepterar utkastet — själva anteckningsfunktionen kan därför inte provköras här förrän dess.
