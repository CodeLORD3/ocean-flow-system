# Multi-bolagsstöd med rollbaserad åtkomst

Målet: göra systemet till en riktig multi-bolags- och multi-kundplattform, där bolagsgränsen
sitter i databasen och inte i frontend-state.

## Nuläge (verifierat)

- 168 tabeller. Endast 16 har `legal_entity_id`, 48 har `store_id`, ingen har `tenant_id`.
- 146 av RLS-policyerna är enbart `is_staff()` — all inloggad personal kan idag läsa allt,
  oavsett bolag eller butik. Bolagstillhörighet styrs i praktiken av portalval i frontend.
- `legal_entities` finns redan med tre bolag: `de-no1` (DE No.1 AB), `fsab-se`
  (Fisk & Skaldjursspecialisten AB), `fsab-ch` (Fisk & Skaldjur Zollikon AG). Butiker pekar
  redan på dem via `stores.legal_entity_id`.
- Roller ligger korrekt separerat i `user_roles` (`admin` | `client`) plus `user_scopes`
  (`portal`/`store`). Det finns alltså en grund att bygga vidare på, men bara två roller.
- Integrationer är idag hårdkodade per leverantör (Shopify, Nimpos) med egna tabeller.

## Beslut som styr bygget

- Bolag = befintliga `legal_entities` (vi lägger `tenant_id` där). Ingen ny `companies`-tabell
  — den som finns används av investerarportalen och rörs inte.
- Ingen `business_units`-nivå. Hierarkin blir tenant → bolag → butik, där `stores.is_wholesale`
  skiljer grossistenhet från butik.
- Componia AG: `fsab-ch` byter namn till Componia AG. Zollikon och Morges ligger kvar under det.
- Hela specen byggs, i sex etapper nedan, så att systemet är körbart efter varje etapp.

## Etapp 1 — Datamodell

- Ny `tenants`: `id`, `name`, `type` (`owner_group` | `saas_customer`), `created_at`.
  Vår koncern blir en tenant med alla tre bolagen; varje SaaS-kund blir en egen tenant.
- `legal_entities` får `tenant_id`, `country_tag`, `functional_currency` (finns som `currency`),
  `vat_rules` (finns som `vat_regime`/`vat_registration` — kompletteras).
- `user_scopes` utökas: `scope_type` får värdena `store`, `company`, `region`, `tenant`,
  `platform`. `user_roles.role` utökas med `store_staff`, `store_manager`, `wholesale_staff`,
  `company_admin`, `region_admin`, `group_admin`, `platform_admin` (befintliga `admin`/`client`
  mappas om och behålls som alias under övergången så inget släcks).
- Bolagsstämpel på all data: varje tabell som saknar `legal_entity_id` men har `store_id`
  får bolaget härlett via trigger från butiken. Tabeller utan bådadera (globala register,
  t.ex. `products`, `allergens`, `size_grades`) hanteras i etapp 4.
- Backfill: befintlig data får `tenant_id` = vår koncern och rätt bolag utifrån butik.

## Etapp 2 — RLS i två lager

- `has_company_access(_user_id, _legal_entity_id)` som `security definer`: först tenant-gräns,
  sedan scope (platform → tenant → region via `country_tag` → company → store).
- Alla policyer som idag är `is_staff()` byts till `is_staff() AND has_company_access(...)`
  för select/insert/update/delete. Tenant-gränsen är absolut — inte ens `group_admin` kan läsa
  en annan tenant.
- Negativa tester skrivs som SQL-testfil: användare i SaaS-tenant ser noll rader i vår tenant,
  bolagsskopad användare ser inget annat bolag, butiksskopad ser bara sin butik.

## Etapp 3 — Roller i UI

- Rolladministration på personalsidan: tilldela roll + scope (butik/bolag/region/tenant).
- `pageAccess.ts` utökas från portal-baserad till roll-baserad: portal avgör layout,
  rollen avgör vad som får öppnas och om inköpspris/marginal visas.
- Ny adminsida för tenant- och bolagsadministration (endast `platform_admin` respektive
  `group_admin`).

## Etapp 4 — Produktmodell per bolag

- `products` blir global stomme (`product_master`-rollen: art-id, namn, kategori, enhet).
- Ny `company_products`: bolag + produkt, lokalt namn, pris, valuta (default bolagets),
  momssats, `is_active`. Ersätter dagens bolagsblinda pris- och aktivflaggor.
- All rapportering som slår ihop bolag matchar på produkt-id, aldrig på namn.

## Etapp 5 — Perspektivvyer

Fyra tydligt namngivna vyer, valbara i toppen på rapport- och översiktssidor:

1. **Per bolag** — bolagets egna siffror i egen valuta.
2. **Operationell "alla våra butiker"** — aggregerat över bolagsgränser, märkt
   "operationell — ej bokföringsmässig".
3. **Region/koncern (finansiellt)** — konsoliderat per `country_tag` och globalt, med
   interntransaktioner eliminerade och omräkning till vald rapportvaluta.
4. **Extern tenant-vy** — SaaS-kund ser bara sina egna bolag, aldrig vår koncern.

## Etapp 6 — Integrationslager och fusionssimulering

- `integration_providers` (referens: `zettle`, `sumup`, `shopify`, `personalkollen`,
  `custom_order_page`, kategori `payment`/`ecommerce`/`staff`/`ordering`/`other`).
- `store_integrations`: bolag (för RLS), butik (nullable), leverantör, `config` jsonb för
  icke-hemliga inställningar, status, `last_synced_at`. Valuta ärvs från bolaget med
  möjlighet till override per butik.
- Hemligheter: aldrig i RLS-läsbar tabell. Nycklar lagras krypterat och läses bara av
  edge functions; UI visar maskerade värden. Befintliga Shopify- och Nimpos-kopplingar
  flyttas in bakom samma adaptergränssnitt (`syncOrders`, `syncPayments`,
  `syncStaffSchedule`) så ny leverantör = ny adapter, inte ny kärnlogik.
- Synkfel visas i felrapporteringen, skopat per butik/bolag.
- `merger_evaluations` + `merger_evaluation_shares`: vår `group_admin` skickar förfrågan →
  målföretagets admin godkänner och väljer vilka aggregerade nyckeltal som delas och hur
  länge → skrivskyddad simuleringsvy visar målföretaget fristående och simulerat kombinerat,
  tydligt märkt "SIMULERING — ej verklig sammanslagning". Beräknas i realtid, sparas aldrig,
  kan återkallas direkt av målföretaget.
- Nytt bolag-flöde (`group_admin`) och ny tenant-flöde (`platform_admin`) via UI, utan ny kod.

## Risker och hur de hanteras

- **Största risken** är att bolagsfiltrering i RLS gör befintliga sidor tomma för personal som
  idag ser allt. Därför: alla nuvarande användare får i backfill scope på tenant-nivå, så
  ingen tappar åtkomst vid driftsättning. Åtdragning till bolags-/butiksnivå görs sedan
  medvetet per användare i etapp 3.
- Etapp 1–2 rör 168 tabeller. Migrationerna delas per tabellgrupp (lager, order, personal,
  kommunikation, ekonomi) så varje steg kan verifieras för sig.
- `company_products` i etapp 4 påverkar prissättning och kassaflöden; den läggs additivt med
  fallback till dagens produktpriser tills varje bolag fyllt i sitt sortiment.

## Tekniska noteringar

- Roller förblir i `user_roles`/`user_scopes` — aldrig på personal- eller profiltabellen,
  och all åtkomstkontroll går via `security definer`-funktioner för att undvika RLS-rekursion.
- Varje ny tabell i migrationerna får `GRANT` till `authenticated`/`service_role`, RLS på och
  policyer via `has_company_access`.
- `legal_entity_id` behålls som bolagsnyckel (text) — inga kolumnbyten i de 16 tabeller och
  ~40 kodfiler som redan använder den.
