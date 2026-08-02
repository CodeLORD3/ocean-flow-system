# Nollställ produktregistret helt

Radera alla 307 produkter och all kopplad data så systemet börjar om från noll, klart för en ny import.

## Vad som händer

Följande töms helt:

- Produktregistret (307 produkter)
- Orderrader i butiksordrar (903 rader) samt ändringsförfrågningar kopplade till dessa rader
- Inköpsrapportrader (294 rader)
- Produktionsrapportrader (168 rader) och produktionspartier
- Prishistorik (267 rader), prislistor och prislisterader, prisregler och prisöverstyrningar
- Lagerplatskopplingar/lagersaldon (22 rader), lagerrapportrader och logg för raderat lager
- Kassaprodukter/POS (20 rader), POS-transaktionsrader och partitilldelningar
- Följesedelsrader, inleveransrader, önskemål, butiksrapportrader och veckorapportrader som pekar på produkter

Butiker, personal, kunder, leverantörer, lagerplatser, ordrar/rapporter som huvudposter och all annan konfiguration behålls.

**Detta går inte att ångra.** Före raderingen exporteras dagens produktregister till en fil (`produkter_backup_2026-08-02.csv` under dokument) så du har en kopia.

## Efter nollställningen

Produkter-sidan är tom med tomt tillstånd. Nytt register läggs in via Produkter → Importera (.csv/.xlsx), och bilder via Ladda upp bilder där filnamnet är sku.

## Teknisk plan

1. Exportera `products` till CSV under `/mnt/documents/` som säkerhetskopia.
2. En dataändring (insert-verktyget) som raderar i beroendeordning, barn före förälder:
   - `shop_order_change_requests` (rader kopplade till orderrader), `shop_order_lines`
   - `purchase_report_lines`, `production_report_lines`, `production_batches`
   - `price_list_items`, `price_lists`, `price_history`, `price_overrides`, `scomber_pricing_rules`
   - `inventory_report_lines`, `deleted_stock_log`, `product_stock_locations`
   - `delivery_note_lines`, `incoming_delivery_lines`, `shop_wishes`, `shop_report_lines`
   - `weekly_report_sales_lines`, `weekly_report_inventory_lines`
   - `batch_allocations`, `pos_transaction_items`, `pos_products`, `makrilltrade_batches_cache`, `makrilltrade_articles_cache`
   - sist `products` (self-FK `parent_id` hanteras genom att rensa `parent_id` innan raderingen)
3. Verifiera med en räkning att `products` och de kopplade tabellerna är tomma.
4. Inga kodändringar behövs — tomma tillstånd finns redan.
