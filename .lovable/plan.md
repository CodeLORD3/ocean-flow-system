# Dynamiska utpriser: referenspris × skalfaktor

Utpriserna slutar vara fasta. `detail_prices` blir en relativ värdering per detalj (referenspris vid en referenskostnad), och nivån skalas per tillverkningsorder utifrån verklig råvarukostnad.

Räknemodellen är kontrollräknad mot dina fyra fall och stämmer på decimalen: 89 kr ger faktor 0,8036 → 649/329/229/179, 120 kr ger 0,9840 → 798/398/249/198, 146 kr ger 1,1290 → 929/479/298/229, 160 kr ger 1,226 → 979/498/329/249. Referensintäkten räknas exkl moms (referenspris / 1,06), eftersom kostnad och påslag är exkl moms.

## Databas

**`detail_prices`** — ny kolumn `reference_cost_per_kg` (numeric). `price_incl_vat` byter betydelse till referenspris och behåller sina värden. Torsk får `reference_cost_per_kg = 120` på rygg/kontrarygg/benfri filé/slag (798/398/249/198 ligger redan inne).

**Ny tabell `detail_price_applications`** — logg över faktiskt satta priser, så gränssnittet kan visa "förra gången". Fält: prislista, art, detaljform, satt pris, referenspris, skalfaktor, råvarukostnad per kg, utbyte, om priset skrevs över manuellt, tillverkningsorder-id, satt av vem, datum. Läsbar för inloggad personal, skrivs vid registrering av tillverkningsorder. GRANT + RLS enligt projektets mönster.

Manuella prisöverskrivningar i en order skriver **inte** längre över referenspriset — de loggas som en applicering. Referenspriset ändras bara medvetet i prisregistret.

## Beräkning (ny funktion i `src/lib/filletMath.ts`)

```text
a. kostnad      = avg_cost × råvarukg + påslag × färdiga kg
b. referensintäkt = Σ (detaljkg × referenspris / (1 + moms))
c. krävd intäkt = kostnad / (1 − marginalmål)
d. skalfaktor   = krävd intäkt / referensintäkt
e. pris/detalj  = referenspris × skalfaktor, avrundat uppåt till 29/49/79/98
```

Förhållandet mellan detaljerna bevaras exakt före avrundningen. Funktionen returnerar skalfaktor, per detalj referenspris och föreslaget pris, samt om någon detalj saknar referenspris (då kan faktorn inte räknas).

## Tillverkningsordern (`ProductionOrderForm.tsx`)

Per prislista visas partiets skalfaktor. Per detaljrad: referenspris, föreslaget pris, aktuellt pris (redigerbart) och förändring mot senast satta pris i kronor och procent. En knapp fyller alla rader med de föreslagna priserna på en gång; enskilda rader kan skrivas över manuellt, och då räknas partiets faktiska marginal om direkt via befintlig NRV-kalkyl och visas som "faktisk marginal mot mål".

Spärrar och varningar:
- Skalfaktor utanför 0,80–1,20: varning om att inköpspriset ligger långt från referensnivån, med förslaget att antingen avstå från köpet eller flytta referenspriset.
- Saknad referenspris på en detalj blockerar prisförslaget för den prislistan (samma logik som idag för saknat pris).
- Alltid synligt: vad detaljen kostade förra gången den prissattes och när.

Vid registrering loggas de faktiska priserna till `detail_price_applications`.

## Oförändrat

Auktionskalkylatorn räknar vidare maxpris utifrån referenspriserna. Inköpspris, partier, lagerrörelser och sorteringslogiken (utbyte per grade, hel filé från sortering 3) berörs inte.

## Tester

Utökar `src/test/fillet.test.ts` med dina fyra verifieringsfall (29 kg, 55/20/15/10, påslag 35, moms 6 %, mål 45 %) — faktor och alla fyra priser per fall — plus fall för varningsgränsen ±20 % och för saknat referenspris.
