# Tio omgångar: allergener, buggfixar, exportkrav, egenkontroll, bolagslager, självdiagnos

Arbetsordning: Del 1 → 6 i tur och ordning, utan stopp för godkännande mellan
delarna, och alltid avslutad med Del 7 (självdiagnosen). Del 1 och 2 är
detaljerade nedan. Del 3–6 detaljplaneras precis innan de byggs.

## Nuläge (kontrollerat nu)

- 646 aktiva produkter. `products.allergens` finns som kolumn men **0** produkter har värde. `kan_innehalla` finns inte. Ingen `allergens`-tabell.
- `shop_orders` = 83 rader, `shop_order_lines` = **4** rader. Orderraderna finns alltså nästan inte.
- `user_roles` = **0** rader, medan `has_role()` används i RLS-policyer på flera tabeller. Admin avgörs i praktiken av `staff.portal_access`.
- `/dagsrapport` finns som sida och route, men nås bara via kort på Översikt och i Checklista — den ligger inte i någon sidomeny.
- `lots` = 44 rader, `stock_movements` = 303 rader. `companies` finns redan (används av investerardelen) — bolagslagret i Del 6 måste förhålla sig till den befintliga tabellen, inte skapa en ny med samma namn.

## Del 1: Allergener (1 omgång)

- Nya kolumner på `products`: `allergens` (behålls, klartextlista) och `may_contain`.
- Ny tabell `allergens` seedad med EU:s fjorton, används i formulär i stället för fritext.
- Import: läser båda kolumnerna, `sku` som nyckel, tomt fält lämnar befintligt värde orört. Okänd kolumn i filen ska **varna** i importrapporten, inte hoppas över tyst.
- Visning: etiketter på produktkort och i produktlista. Deklarerade i fetstil, "kan innehålla" i normal stil.
- Regeln: värdet **Inga** = kontrollerat utan allergen. **Tomt** = ej kontrollerat, visas gult med "Allergener ej kontrollerade". Får aldrig se likadana ut.
- Dataimporten av `produkter_med_allergener.xlsx` körs när filen är uppladdad. Är filen inte på plats byggs kolumner, tabell, import och visning ändå, och Del 7 rapporterar att dataimporten inte kördes.
- Rapport: antal produkter per allergen, antal aktiva livsmedel med tomt fält.

## Del 2: Buggfixar (1 omgång)

**2.1 shop_order_lines** — utred först, åtgärda sedan: skapas rader idag av orderflödet, eller är skrivningen trasig? Är flödet trasigt rättas det. Historiska ordrar utan rader markeras som ofullständiga, inga rader fabriceras. Konsekvensen för trevägsmatchningen dokumenteras.

**2.2 user_roles och has_role** — lista varje RLS-policy och kodställe som anropar `has_role`, avgör om något nekas som borde tillåtas. Beslut: ett behörighetsbegrepp. `has_role` behålls som teknisk grund och fylls från `staff.portal_access`, eller tas bort ur policyerna — vilket som väljs och varför rapporteras. Det dubbla begreppet upphör.

**2.3 /dagsrapport** — läggs in i sidomenyn för butik (Översikt-sektionen), eller tas bort om Checklista ersatt den. Val och skäl anges.

## Del 3–6 (detaljplaneras var för sig innan bygget)

- **Del 3, exportfält och dokumentregister:** nytt fält `export_documentation_required` (kapitel 03 samt 1604–1605) utan att röra `traceability_required`, nya spårbarhetsfält på `lots`, nya fält på utleverans, ny tabell `lot_documents` med privat filbucket, dokumentarv vid tillverkning som referens, varningsruta (ingen spärr) vid export, samt exportunderlagsvy.
- **Del 4, identifieringsmärke:** `establishments`, `establishment_id` på butiker och lagerplatser, `requires_identification_mark` på mottagare, märket på B2B-etikett och följesedel, larm när märke saknas.
- **Del 5, egenkontroll (3 omgångar):** 5A generiskt noteringslager (`control_points`, `control_records`, `deviations`, `compliance_requirements`) med databasspärr som hindrar att en avvikelse stängs utan rotorsak och verifiering, plus sidan Egenkontroll med tre flikar. 5B mottagningstemperatur, daglig lagertemperatur med 30-dagarstrend, nedkylning, parasitfrysning med spärr mot prissättning och leverans, blötdjursdokument. 5C grundförutsättningar som återkommande krav plus instrumentregister.
- **Del 6, bolagslager (3 omgångar, byggs sist och försiktigt):** bolagsbegrepp ovanpå befintliga `companies`, `store_company_periods` med giltighetstid i stället för fast `company_id`, bolagstillhörighet på rörelser/order/partier, internförsäljning med internpris och fakturaunderlag, nummerserier i databasen per bolag, behörighetshierarki via `regions` och `user_scopes` med RLS mot scopes, samt arkivering av rörelser äldre än 24 månader med ingående balansrad. Efter varje migration verifieras att saldospärrarna och avstämningen håller: summa kilo och lagervärde före och efter, noll avvikande rader.

## Del 7: Självdiagnos (körs alltid, sist)

Byggstatus per del med bevis, hälsokontroll (a–j), datakontroll (a–k),
skarpt kedjetest på en riktig följesedel i tio steg, inloggad verifiering som
admin och som butik, vad som gick bra, vad som gick dåligt i fem kategorier,
prioriterad åtgärdslista, och svar på de tre frågorna.

Genomgående under hela bygget: det som inte blir av rapporteras som ofullständigt
i Del 7 i stället för att markeras klart, och om en senare del bryter något i en
tidigare del rapporteras det uttryckligen.

## Tekniska noter

- Kvantiteter i kilo med tre decimaler, priser med två. Alla lagerförändringar går via `stock_movements`.
- Varje ny publik tabell får GRANT, RLS och policyer i samma migration.
- Filer i nya tabeller lagras i privat bucket och läses via signerade adresser (`useSignedUrl`).
- Inga mockdata. Tomma vyer förklarar sig via `EmptyState`.
- Del 6:s främmande nycklar läggs på tabeller som redan skyddas av triggers (`guard_stock_balance_writes`, `enforce_transfer_flow`, `enforce_movement_preconditions`) — nycklarna sätts vid skapandetillfället, aldrig i efterhand, och spärrarna testas om efteråt.
