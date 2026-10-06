# Produktionen och Admin som enheter utan försäljning

## Läget idag
- Enheter har redan en typ (`unit_type`): `butik`, `grossist`, `overhead` (Administration DE No.1). Typen behöver alltså inte skapas, bara utökas med `produktion` och `admin`.
- Alla sju personer finns redan som anställda: Maebel Hassen, Mensur Mehamed, Caisa Carning, Fredric Lindqvist, Baldvin Ahlander, Tim och Joakim Hvarfvenius. Ingen ny person behöver skapas.

## Vad som byggs
1. **Enhetstyper:** `produktion` och `admin` blir tillåtna. Befintliga enheter behåller sin typ. Båda nya enheterna får POS avstängt och är undantagna från veckorapporter.
2. **Skapa enheterna:** "Produktionen" (Maebel, Mensur) och "Admin" (Caisa, Fredric, Baldvin, Tim, Joakim). Hemenheten flyttas till den nya enheten från i dag. Anställningar och anställande bolag per person rörs inte. Gamla pass, stämplingar och scheman ligger kvar på den enhet där de gjordes.
3. **En gemensam regel "har försäljning":** gäller bara för `butik` med POS. Regeln används för att helt dölja snittförsäljning och försäljningsrutor i schemavyn, på Översikt och VD-sidan, i enhetslistor ("Våra butiker"), i dags- och veckorapporter, på resultatsidan och i jämförelser mellan enheter. Produktion och Admin visas aldrig som tomma eller noll.
4. **Stämpelklocka:** varje enhet får ett eget arbetsställe. Det kopplas till samma bolag som enhetens första anställda, men lönen styrs fortfarande av den anställdes bolag. Mobilstämpling är påslagen, och platsspärren är av tills ni anger adresser.
5. **Notiser:** standardinställningen är på för alla medlemmar, med samma typer som i butikerna: publicerat schema, ändrat pass och påminnelser.
6. **Behörighet:** Caisa får schemaläggarrätt för båda enheterna. Hon kan redan göra mer som plattformsadmin, men rätten sätts ändå uttryckligen. Övriga medlemmars behörigheter ändras inte.

## Bevis jag kör och visar
1. En lista över enheter, typ och medlemmar, med anställande bolag före och efter.
2. Som Caisa: skapa och publicera ett testschema för Produktionen (Maebel och Mensur) och ett för Admin, och visa notiserna.
3. Skärmbilder av schemavyn och Översikt för Produktionen och Admin utan försäljning, bredvid en butik som visar snittförsäljning.
4. En stämpling in och ut på ett pass i Produktionen, och den registrerade tiden.
5. Frågor som visar att försäljningsrapporter och jämförelser inte innehåller enheterna.
6. Mensurs tidigare stämplingar, räknade före och efter, på hans gamla enhet.

## Beslut jag behöver från dig
- **Testdata påverkar lön.** Teststämplingen och testpassen markeras som test, så att de hålls utanför lön, attest och nyckeltal. Efter beviset rättas de på vanligt sätt, alltid med spårbar historik och utan att något raderas. Säg till om du hellre vill att de stämplingarna ligger kvar som riktiga.
- **Testpassens datum:** jag lägger dem i morgon, 7 oktober. Maebels fasta instämplingar kl. 08:00 rörs inte.

## Tekniska noter
- Migration: CHECK/hjälpfunktion `unit_has_sales(store_id)` (`unit_type='butik' AND pos_enabled`). `weekly_report_enabled=false` för nya enheter. Rapport-RPC:er och vyer som summerar försäljning filtreras på funktionen.
- Klient: `src/lib/unitTypes.ts` med `unitHasSales(store)`. Används i `OurStoresSection`, `useWeekdayRevenue`, `PosTodayLive`, `StaffSchedule`, `VD`/`Resultat`, `useWeeklyStoreReports`.
- Data: `staff.store_id` byts till ny enhet via run_sql. `employments` och `legal_entity_id` lämnas orörda. `shifts` och `time_entries` behåller sitt `store_id`.
- Behörighet via befintliga `user_scopes` med schemaroll för båda enheterna.
