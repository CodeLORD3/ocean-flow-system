# Dynamiska utpriser: referenspris × skalfaktor

Utpriserna slutar vara fasta. `detail_prices` blir en relativ värdering per detalj (referenspris vid en referenskostnad), och nivån skalas per tillverkningsorder utifrån verklig råvarukostnad (avg_cost).

Räknemodellen är kontrollräknad mot dina fyra fall och stämmer på decimalen: 89 kr ger faktor 0,8036 → 649/329/229/179, 120 kr ger 0,9840 → 798/398/249/198, 146 kr ger 1,1290 → 929/479/298/229, 160 kr ger 1,226 → 979/498/329/249. Referensintäkten räknas exkl moms (referenspris / 1,06), eftersom kostnad och påslag är exkl moms.

## Databas

**`detail_prices`** — ny kolumn `reference_cost_per_kg` (numeric). `price_incl_vat` byter betydelse till referenspris och behåller sina värden. Torsk får `reference_cost_per_kg = 120` på rygg/kontrarygg/benfri filé/slag.

**`margin_targets`** — nya kolumner `scale_warn_low` (standard 0,75) och `scale_warn_high` (standard 1,25), per prislista. Bandet är en informationsruta, aldrig en spärr.

**Ny tabell `detail_price_applications`** — logg över faktiskt satta priser: prislista, art, detaljform, produkt, satt pris, referenspris, skalfaktor, avg_cost per kg, utbyte, manuell överskrivning ja/nej, tillverkningsorder-id, satt av vem, tidpunkt. GRANT + RLS enligt projektets mönster. Manuella överskrivningar loggas här och ändrar aldrig referenspriset.

## Beräkning (ny funktion i `src/lib/filletMath.ts`)

```text
a. kostnad      = avg_cost × råvarukg + påslag × färdiga kg
b. referensintäkt = Σ (detaljkg × referenspris / (1 + moms))
c. krävd intäkt = kostnad / (1 − marginalmål)
d. skalfaktor   = krävd intäkt / referensintäkt
e. pris/detalj  = referenspris × skalfaktor, avrundat uppåt till 29/49/79/98
```

Förhållandet mellan detaljerna bevaras exakt före avrundningen.

## Tillverkningsordern (`ProductionOrderForm.tsx`)

Per prislista visas partiets skalfaktor. Per detaljrad: referenspris, föreslaget pris, aktuellt pris (redigerbart) och förändring mot senast satta pris i kronor och procent, med datum. En knapp fyller alla rader med förslagen; enskilda rader kan skrivas över, och då räknas faktisk marginal om direkt via befintlig NRV-kalkyl.

Varningar och spärrar:
- Skalfaktor utanför prislistans band (standard 0,75–1,25): informationsruta om att inköpspriset ligger långt från referensnivån — överväg att avstå eller flytta referenspriset. Blockerar inget.
- Saknat referenspris på en detalj blockerar prisförslaget för den prislistan.
- **Samma dygn-kontroll:** om produkten och prislistan redan har en applicering inom 24 timmar visas en bekräftelsedialog: "Priset sattes 09:14 idag till 798 kr. Nytt pris 929 kr." Priset ändras först efter bekräftelse.

## Var priset landar (butikens väg)

Vid applicering skrivs, per detaljprodukt:
1. `products.retail_suggested` för butikskanalen (inkl moms) respektive `products.wholesale_price` för grossistkanalen (exkl moms) — det är dessa fält butikssidan Priser redan läser och visar.
2. En rad i `price_history` med reason "Tillverkningsorder <nr>" så prisändringen syns i produktens historik.
3. En rad i `detail_price_applications` som revisionsspår med referenspris, faktor och kostnad.

Loggen ensam räcker alltså inte: butikerna ser priset via `retail_suggested` på Priser-fliken.

## Ny vy: Referenspriser (under Priser)

Egen flik med en rad per `species_group` × detaljform enligt artens styckningsmodell, per prislista. Saknade referenspriser och referenskostnader visas som tomma fält som går att fylla i direkt i tabellen.

- Sortering: efter inköpsfrekvens (antal rader i `purchase_report_lines` per artgrupp), vanligast först — havskräfta, räka nordhav, långa, taskkrabba, sej … därefter arter utan inköp.
- `reference_cost_per_kg` förifylls som förslag med artens rullande snitt av de tre senaste inköpen (inköpspris per kg ur inköpsrapportraderna) och kan skrivas över.
- Täckningskontrollen i Admin får en punkt för arter som saknar referenspris eller referenskostnad.

## Oförändrat

Auktionskalkylatorn räknar vidare maxpris utifrån referenspriserna. Inköpspris, partier, lagerrörelser och sorteringslogiken (utbyte per grade, hel filé från sortering 3) berörs inte.

## Tester

Utökar `src/test/fillet.test.ts` med dina fyra verifieringsfall (29 kg, 55/20/15/10, påslag 35, moms 6 %, mål 45 %) — faktor och alla fyra priser per fall — plus fall för det konfigurerbara varningsbandet, saknat referenspris och rullande snitt av tre inköp.
