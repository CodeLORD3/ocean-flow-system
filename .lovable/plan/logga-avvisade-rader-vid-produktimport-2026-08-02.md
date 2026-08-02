# Logga avvisade rader vid produktimport

Idag sparar importloggen bara antal (`inserted`, `updated`, `skipped`, `file`). När rader avvisas av valideringen finns felen bara i dialogen under körningen — efteråt går det inte att se vilka SKU:er som stoppades eller varför. Det är därför de 3 överhoppade raderna i dagens sista import inte kan spåras.

## Vad som byggs

1. Importen sparar varje avvisad rad i loggen: radnummer i filen, `sku`, `name` och alla felmeddelanden.
2. Loggen sparas även när alla rader avvisas (idag loggas inget om inget kunde importeras).
3. En liten vy i importdialogen: "Senaste importer" som listar de senaste körningarna med antal och, om det finns avvisade rader, en expanderbar lista med SKU + felmeddelande.
4. Möjlighet att ladda ner de avvisade raderna som CSV direkt från den vyn, så filen kan rättas och köras om.

## Teknisk beskrivning

- `src/components/products/ProductImportDialog.tsx`: utöka `logActivity`-anropet med `rejected` i `details` — en array `{ line, sku, name, errors[] }` byggd från de diff-rader som har `status === "error"`. Begränsa till t.ex. 200 rader i loggen för att hålla `details`-jsonb rimlig, med `rejected_total` som sanning för antalet. Flytta loggningen så den körs även när `importable.length === 0`.
- Ny komponent `src/components/products/ImportHistory.tsx`: läser `activity_logs` där `action_type = 'product_import'`, sorterat på `created_at desc`, limit 10. Renderar tabell + expanderbar lista över `details.rejected`, plus CSV-nedladdning via befintligt export-mönster i dialogen.
- Inga schemaändringar behövs: `activity_logs.details` är redan `jsonb`. Ingen migration, ingen dataändring.

## Notering

Ändringen är framåtblickande — de 3 avvisade raderna från dagens körning finns inte kvar någonstans. För att identifiera dem behöver `produkter_import_KLAR.xlsx` köras genom dialogen igen (validering sker före skrivning, så en förhandsgranskning räcker och skriver inget).
