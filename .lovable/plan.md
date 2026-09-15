# Priskategorier och prissättning vid inleverans

## Vad som byggs

**Tre priskategorier** för grossistens försäljning till butik:
- Göteborg/Väst (SEK)
- Stockholm (SEK)
- Schweiz (CHF)

Varje butik kopplas automatiskt till sin kategori via butikens region, men kan flyttas manuellt.

**1. Sätt priser direkt när varan levereras in**
På varje inleveransrad (och efter en inköpsrapportering) får grossisten en prissättningsruta som visar:
- Inköpspris per kg nu, och vad samma produkt kostat tidigare (senaste inköp, snitt senaste 30 dagar, högsta/lägsta)
- Ett förslag per priskategori, räknat med gällande prissättningsregler
- Vad grossisten tjänar: kronor per kg och marginal i procent
- Vad butiken kan ta ut mot privatkund för att nå sin marginal, inklusive moms — med en varning om det landar över tidigare butikspris eller över taket för vad kunder brukar betala
- Låsknapp per pris: **Låst** (gäller till någon ändrar) eller **Uppskattat** (förslag som räknas om automatiskt)

Grossisten kan sätta samma pris på flera kategorier med ett klick.

**2. Butikerna ser sina priser**
- I inleveransen: priset butiken faktiskt får, i butikens valuta
- När butiken beställer: pris per produkt, markerat *Fast pris* eller *Cirkapris* (uppskattat från tidigare inleveranser), samt ett radvärde och en ordersumma som uppdateras medan man skriver

**3. Marginalöversikt**
Ny vy under Prissättning: intjäning per kategori (produktkategori), per priskategori, per butik och per leverantör — kronor och procent, för valfri period, med de sämsta marginalerna först och export.

## Tekniskt

- Ny tabell `price_tiers` (namn, region, valuta, aktiv) + `stores.price_tier_id`. Seed: Väst, Stockholm, Schweiz enligt `stores.region`.
- Ny tabell `wholesale_prices`: `product_id`, `price_tier_id`, `price`, `currency`, `lock_mode` (`locked` | `estimated`), `source_lot_id`, `basis_cost`, `margin_pct`, `retail_suggested`, `valid_from`, `set_by`, `note`, tidsstämplar. Historik behålls (ny rad per ändring, aktuellt pris = senaste `valid_from`).
- Vy/funktion `product_cost_history(product_id)` för tidigare inköpspriser (från `lots` + `incoming_delivery_lines`), och `wholesale_price_for(product_id, store_id)` som väljer butikens tier-pris, annars `products.wholesale_price`.
- Priser räknas med befintliga `pricing_rules` (`pricing_calc`) per tier; tier läggs på som scope vid val av regel (tier → butik → global).
- Butikens rekpris och moms via `margin_targets` och tierens momssats; CH får CHF och egen momssats.
- GRANT + RLS: grossist/admin skriver, butikspersonal läser bara sin egen tier.
- Frontend: `PriceTierPanel` i inleveransvyn, cirkapriser i `ShopOrders`, `MarginOverview` under Prissättning, hook `useWholesalePrices`.
- Grossistens orderrader fortsätter frysa pris vid order (`cost_at_order`) — oförändrat.

## Frågor jag antagit

- Schweiz prissätts i CHF med egen moms; SEK-kategorierna med 12 % moms mot privatkund.
- Uppskattade priser räknas om när nytt inköpspris kommer in; låsta gör det inte.
