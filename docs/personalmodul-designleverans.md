# Makrilltrade personalmodul — komplett designleverans

Från designsidan till arkitektursidan, 2026-08-31. **Detta dokument ersätter alla tidigare designdokument i tråden.** Det innehåller designkoden, samtliga vyer i leveransordning, alla fattade beslut med motivering, och de sex frågor som återstår — märkta som frågor, inte gömda som antaganden.

Läs avsnitt A och B först. Resten är referens per vy.

---

## A. Beslutslogg — vad som är avgjort och av vem

Ingenting nedan är öppet. Där arkitektursidan svarat står svaret. Där ingen svarat har designsidan avgjort, med skäl, och det är markerat så att ni kan invända mot en enskild rad utan att riva upp resten.

| # | Fråga | Avgjort | Av |
|---|---|---|---|
| A1 | Avtalsområde på anställning eller enhet? | `employments.agreement_area`. Inget kollektivavtal binder bolagen — Handels är benchmark för egen policy. **En OB-tabell för alla som stämplar.** | Arkitektur |
| A2 | Finns skärmbilder av nuläget? | Personalkollen genomgången i sin helhet. Makrilltrades egen `/clock` sedd och kritiserad i avsnitt 7. Övriga Makrilltrade-vyer designas som nya. | Baldvin |
| A3 | Leveransordning | Inspektörsläget först, sedan etapp 4, täckningskarta, delad personal, etapp 5, flexsaldo. | Arkitektur |
| F1 | Tvångslåsning av periodlås? | Ja. `forced = true`, obligatoriskt skäl, loggat, notis till överkörd chef. Låskravet gäller **stämplande enheter**. | Arkitektur |
| F2 | Marginalkostnad med tröskelkännedom? | Ja, `preliminar_manadskostnad()` byggs. Fallback tills dess: utelämna arbetsgivaravgiften helt. | Arkitektur |
| F3 | Aftnarna | Typfält i `holiday_calendar`: helgdag eller halvdag. Seedade 2026–2027. | Arkitektur |
| F4 | Notisleverans | Per driftställe till enhetens chef, endast vid nya avvikelser. Admin opt-in. | Arkitektur |
| S1 | Finns scheman att räkna mot? | Ja — vecka 9 2026: 405,25 tim, 107 016 kr. Frågan var felställd. | Bevis i data |
| S2 | Varför slutade schemaläggningen? | Personalkollens schemavy var dålig att arbeta i. Inget ägarbyte, ingen verksamhetsförändring. | Baldvin |
| — | Liggarpolicy | Varje enhet för egen liggare via sin station. Butikernas är frivilliga men förs med samma formkrav. Inspektörsläget är standardvy, inte grossistnisch. | Baldvin |
| F5 | Grundpass som mall-tabell? | **Ja — `shift_templates`.** Se 0b. Utan den går femminuterskravet inte att uppfylla. | Design |
| F6 | Lönens tid läsbar per dag? | **Ja — `attestations.basis` + `payroll_in/out`.** Se 0d. | Design |
| F7 | Kodalfabet | **27 otvetydiga tecken, tre block om fyra.** Se 0e. | Design |
| F8 | Frånvaro period- eller dagbaserad? | **Periodbaserad med härledda dagrader.** Se 0c. | Design |

---

## B. Designkoden — reglerna som gäller varje vy

Detta är inte smak. Varje regel har ett skäl, och skälet står med, eftersom en regel utan skäl bryts vid första motstånd.

**1. Ett fokus per vy.** Det viktigaste störst och överst. Konkurrerar två saker blir den ena en sidokolumn på cirka 300 px.

**2. Beslutsrad, inte tre likvärdiga kort.** Ett larm, ett verktyg och ett mätvärde är inte samma sak och ska inte se lika ut. Personalkollens startsida visar fem kort som alla står på noll — det är vad likvärdighet leder till.

**3. Sidokö för avvikelser.** Smal kolumn till höger, en åtgärd per post, konsekvensen i kronor eller löneart. Aldrig röda band i huvudflödet.

**4. Luft istället för linjer.** Whitespace och sektionsetiketter, inte ramar och zebra. Ingen `.hr`.

**5. Status = 3 px mättad vänsterkant plus textetikett.** I schemat och i paneler: 7–8 px prick plus etikett i mörk brödtext. **Aldrig färg som ensam bärare** — vid färgblindhet och i motljus försvinner den.

**6. Färg kodar status, därför kodar den aldrig enhet.** Nio enheter får monokoder i grå platta: `B01`–`B07`, `GRO`, `ADM`. Namnet primärt, koden sekundärt — personalen läser "Ålstens Fisk", inte "B01". Grundpassens egna färger är en separat palett, skild från funktionsfärgerna.

**7. Blueprint-hörnmarkeringar endast på vyns ytterram och primärknappen.** Inte på nästlade lådor.

**8. Alla tal i mono, tabulära och högerställda.** `font-variant-numeric: tabular-nums`. Utan det går kolumner inte att jämföra med ögat, och detta är ett system där jämförelse av tal är själva arbetet.

**9. Tid som `8 h 11 min`, aldrig `8,11`.** Personalkollen skriver `64,51` för 64 timmar 51 minuter, vilket inte går att skilja från 64,51 decimaltimmar. De använder själva det bättre formatet på andra ställen. Decimaltimmar bara där talet verkligen är ett decimaltal, och då med enhet.

**10. Två visuella register.** Admin på kontorsskärm får hårfina ramar och registreringsmärken. Kiosken ärver färger, typsnitt och radie men **aldrig hårstrecken** — solida fält, kanter minst 3 px, inga märken, ingen skugga. Skälet är mätbart: utrustning som läses i starkt ljus behöver stora solida ytor. Detta är regeln för den kontexten, inte ett undantag.

**11. Kiosk-mått.** ISO 9241-411 skiljer på sammanhang: stationär touch 7–8 mm, mobil 9–11 mm, **delad kiosk 12–15 mm**. Primärknappar minst 88 px, sifferknappar 96 × 96, avstånd minst 42 px, text minst 24 px, namn och klockslag minst 40 px. Ingen animation över 150 ms. Inget hovertillstånd — det finns ingen mus.

**12. Mobil för personalen.** Träffytor minst 48 px, ett innehåll per skärm, ingen horisontell scroll, inga tooltips.

**13. Alla belopp märks preliminära.** Fortnox är master för kronor. Märkningen sitter **på talet**, inte som fotnot — Baldvin läser nettot som ett besked om inget annat står.

**14. Felmeddelanden är instruktioner, inte koder.** Varje fel säger vad personen ska **göra**: `Geofence validation failed` → *"Du är 340 meter från butiken. Gå närmare och försök igen."*

**15. Svenska i alla kontroll- och liggarvyer.** Databasen behåller `in`, `rast_start`, `correction`. Gränssnittet visar Instämpling, Rast börjar, Rättelse.

**16. Journalen är append-only och designen visar det.** Rättelser som tilläggsrader — "ersätter 16:04" — aldrig som redigerade original. SKVFS 2015:6 6 § kräver det; er trigger är minimikravet, inte överambition.

**17. Ingen roll ser mer än den behöver.** Chefer ser egen enhet. Anställda ser sig själva. Lönerollen läser men ändrar aldrig en stämpling. Ingen attesterar sin egen tid.

**18. Tomläget är ett designat tillstånd, inte ett tomt rutnät.** Det vanligaste tillståndet i en ny vy är tomt, och det är där vyn vinner eller dör. Ett tomläge ska föreslå nästa åtgärd.

**19. Ikoner: Lucide, stroke 1,5.** Ingen handritad SVG, inga emoji.

**20. Aldrig dragning som enda väg in.** Varje schemaoperation behöver en tangentbords- och formulärväg vid sidan av dragningen, annars är vyn otillgänglig för den som inte kan använda mus precist.

---

## C. Vyerna

Ett avsnitt per vy i leveransordning. Varje avsnitt anger syfte, layout, mått, alla tillstånd inklusive tomläge och felfall, samt vad som inte ska finnas.

**Fastställda förutsättningar:**

- **En OB-tabell för alla som stämplar.** 50 % vardag 18.15–20.00, 70 % efter 20.00, 100 % lördag efter 12.00, 100 % söndag och helgdag, aftnar jämställs med lördag. Lördag före 12.00 är vanlig tid. Ingen annan nivå finns.
- **Nio enheter.** DE No.1 AB: Ålsten (B01), Kungsholmen (B02). FSAB: Torslanda Torg (B03), Amhult (B04), Särö (B05), Eriksberg (B06), Marstrand (B07), Grossist Göteborg (GRO), Administration (ADM). Zollikon vilande. Auktionen är annans lokal — arbete där konteras GRO.
- **ADM stämplar inte.**
- **Två Personalkollen-konton migreras**, ett per bolag. Samma person kan finnas i båda — dubblettkontroll på personnummerhash. Sätt enhet från kostnadsställe, aldrig från PK:s grupp, som är "Administration" för alla oavsett var tiden bokförs.

## 0. Tokens och fyra avgjorda modellfrågor

Detta avsnitt är en förutsättning. Ingenting nedan byggs innan det är på plats.

### 0a. Funktionsfärgerna som tokens

`industry.css` har accent och neutralramp. De tre funktionsfärgerna saknas. Lägg in dem med tre steg per roll — plattan, kanten, texten:

```css
--color-alert-100: #fbeeeb;  --color-alert-600: #a1402f;  --color-alert-800: #84321f;
--color-warn-100:  #fdf6e7;  --color-warn-600:  #9d6f1e;  --color-warn-800:  #7a5518;
--color-ok-100:    #edf5f0;  --color-ok-600:    #2f6b4f;  --color-ok-800:    #245139;
```

**600-stegen** bär 3–4 px kanter, ramar och prickar. **800-stegen** bär all text i funktionsfärg. **100-stegen** är plattor. Ingen text får någonsin sättas i ett 600-steg.

Kontrasten är räknad mot båda underlagen — grund `#f2f2f3` och yta `#e9e9ea`, det senare är det svårare fallet:

| Token | Mot yta | Krav | Klarar |
|---|---|---|---|
| alert-800 | 6,8:1 | 4,5:1 text | ja |
| warn-800 | 5,3:1 | 4,5:1 text | ja |
| ok-800 | 7,2:1 | 4,5:1 text | ja |
| alert-600 | 5,0:1 | 3:1 komponent | ja |
| warn-600 | 3,5:1 | 3:1 komponent | ja |
| ok-600 | 5,0:1 | 3:1 komponent | ja |

**Notera att bärnstenen justerades.** Mitt tidigare förslag `#b8842c` gav 2,6:1 mot ytan och underkände sig som komponentfärg. Gult är alltid den som faller — det är den ljusaste kuloren vid samma upplevda mättnad. `#9d6f1e` klarar 3,5:1. Verifiera gärna om, men ändra inte tillbaka.

Regeln som inte får brytas: **aldrig fyllning på hel rad, aldrig ensam bärare av information.** Färg plus ord, varje gång.

Lägg samtidigt in princip 8: `font-variant-numeric: tabular-nums` och högerställning på varje tal, i alla vyer.

### 0b. Grundpass som egen tabell — F5 avgjord

`shifts` med fria tider räcker inte. Grundpasset är det som gör femminuterskravet i 3b möjligt, alltså är det en egen tabell:

```
shift_templates
  id, work_site_id, name, start_time, end_time,
  break_minutes, color_index (1–8), sort_order, is_active
```

`shifts.template_id` pekar hit, och `shifts` behåller sina egna tider så att ett justerat pass kan avvika från mallen utan att mallen ändras. **Färgen ligger som index, inte som hex** — då kan temat byta palett utan migrering, och paletten kan hållas åtskild från funktionsfärgerna.

Seed ur Personalkollens verkliga mallar: Inköp 06:15–09:00, Försäljning Särö 09:00–18:30, Försäljning Amhult 08:30–18:30, Produktion Amhult 08:30–18:00, Försäljning Torget 11:00–18:45, Allt-i-allo 08:00–18:00.

Adminvy för mallarna per enhet: namn, tider, rast, färg, ordning. Den behövs sällan men utan den blir mallarna en utvecklaruppgift.

### 0c. Frånvaro är periodbaserad — F8 avgjord

En ledighet är en period, inte tio dagar. Personalkollens dagrader är felet vi rättar:

```
absence_requests
  id, employee_id, type, date_from, date_to,
  extent_pct, basis ('enligt_schema' | 'manuell'),
  status, decided_by, decided_at, reason
absence_days   (härledda, ej redigerbara direkt)
  request_id, date, extent_pct, shift_id, hours
```

Dagraderna genereras ur perioden och får bara avvika där något skiljer sig — halvdag, ett pass som inte fanns, en dag som redan var ledig. Borttagning och ändring gäller **perioden**, aldrig en enskild dag, om användaren inte uttryckligen delar perioden.

`basis = 'enligt_schema'` tar omfattningen från passet. Det är standardvärdet och Personalkollens bästa fält.

### 0d. Lönens tid som egen kolumn — F6 avgjord

Kontrollvyn ska visa liggarens tid och lönens tid sida vid sida. Det kräver att attestens valda underlag går att läsa per dag:

```
attestations
  ... + basis ('schematid' | 'stamplad' | 'justerad')
  + payroll_in, payroll_out   (satta endast när basis = 'justerad')
```

Är `basis` inte `justerad` är lönens tid identisk med den stämplade, och kolumnerna visar samma värde — precis som i Personalkollens rapport. Skiljer de sig ska båda synas, för då är det en justering en inspektör har rätt att se.

### 0e. Aktiveringskodens alfabet — F7 avgjord

Koden läses upp i telefon mellan butiker. Uteslut allt tvetydigt:

```
Alfabet: 2 3 4 6 7 8 9 A C D E F G H J K M N P Q R T U V W X Y
Format:  XXXX-XXXX-XXXX  (12 tecken, tre block om fyra)
```

Uteslutna: `0` och `O`, `1` och `I` och `L`, `5` och `S`, `B` (mot `8`), `Z` (mot `2`). Kvar är 27 tecken — omkring 57 bitar på tolv positioner, vilket är mer än nog.

QR-koden står först i dialogen. Den skrivna koden är andra alternativet, i mono, med blocken åtskilda.

## 1. Inspektörsläget — levereras först

**Syfte:** en handling som kan visas upp för Skatteverket vid oanmält besök, i en butik, utan förberedelse.

**Standardvy för varje enhet, inte en grossistnisch.** Enligt fastställd policy för varje enhet sin egen liggare, omfattande dem som stämplar på den enhetens klocka. Butikernas liggare är frivilliga men förs med samma formkrav. En enhet behöver därför aldrig "aktivera" liggaren — den finns i och med klockan, och vyn ska aldrig visa ett läge som antyder att den måste slås på.

**Detta är inte ett gränssnitt, det är ett dokument.** Vit botten, svart text, inga Industry-ramar, inga registreringsmärken, inga knappar i utskriften. En inspektör ska kunna läsa den utan att veta vad systemet heter.

**Layout, uppifrån:**

1. Rubrikblock: bolagets namn och organisationsnummer, driftställets namn och adress, och intervallet som visas. Detta är liggarens huvud och ska överleva utskrift på varje sida.
2. Två datumfilter, tydligt åtskilda och namngivna i klartext: **"Arbetet utfördes"** (`occurred_at`) och **"Uppgiften fördes in"** (`registered_at`). Det senare är vad 13 § efterfrågar, och skillnaden mellan dem är just efterregistreringarna. Standardvärde: dagens datum i båda.
3. Tabellen. Kolumner: efternamn, förnamn, personnummer, **tid in**, **tid in (lön)**, **tid ut**, **tid ut (lön)**, tid för införande, källa, anmärkning.

   Kolumnparen är övertagna från Personalkollen och är deras bästa idé: liggarens tid och lönens tid i egna kolumner, identiska när ingen justering skett. Det är tydligare än att gömma justeringen i en tilläggsrad — en inspektör ser direkt att originalet står kvar.

   **Personalkollens rapport brister på två formkrav**, och det är värt att veta: den saknar införandetidpunkt helt, och dess Arbetsplats-fält står till bolaget i stället för till lokalen, så rapporten innehåller personal från samtliga enheter. Ni har alltså kört personalliggare i flera år på ett underlag som inte uppfyller 13 § och som lämnar ut mer personuppgifter än kontrollen kräver. Vår vy rättar båda.
4. Under tabellen: en not om vilka personer som är verksamma men inte redovisas här, med skäl — exempelvis personal på annat driftställe.

**Mått och format:**

- Alla tider med sekunder, i formaten `ÅÅÅÅ:MM:DD` och `TT:MM:SS`. **Kolon i datumet, inte bindestreck** — det är föreskriftens format och det ser fel ut om man inte vet det.
- Personnummer i klartext, tolv siffror. Detta är den enda vy i hela systemet där det sker. Varje visning loggas i `pnr_access_log`.
- Svenska ord för varje statusvärde: Instämpling, Utstämpling, Rast börjar, Rast slutar, Rättelse, Klocka, Manuell, Import.
- Brödtext minst 12 pt i utskrift.

**Tillstånd:**

- **Aktiv session:** ett diskret band överst med återstående tid och en knapp "Avsluta". Två timmar, enligt `inspector_sessions`.
- **Rättad post:** originalet står kvar, rättelsen som en tilläggsrad direkt under, indragen, med texten "ersätter 16:04" och vem som gjorde tillägget. Aldrig ett redigerat original.
- **Tomläge:** "Inga personer var verksamma på detta driftställe under valt intervall." Inte en tom tabell.
- **Utskriftsläge:** knappar och sessionsband försvinner, huvudet repeteras per sida.

**Ska inte finnas:** ingen sökruta, inga filter utöver de två datumen, ingen export till Excel, ingen möjlighet att ändra något. Vyn är läsning.

**Scope:** ett driftställe. Nio butiker betyder nio liggare, och personal på åtta andra enheter får inte synas — både enligt föreskriften och som personuppgiftsfråga.

---

## 2. Etapp 4-vyerna — största nyttan

Fem vyer. Två för personalen på mobil, tre för chefen. Detta är de vyer femtio personer möter varje månad, och de avgör om systemet upplevs som en förbättring eller som en till sak att lära sig.

**Genomgående för de mobila vyerna:** träffytor minst 48 px, ett innehåll per skärm, ingen horisontell scroll, inga tooltips. Personalen använder dem på en telefon, ofta med en hand, ofta utomhus.

---

### 2a. "Sjuk idag" — en knapp

Detta är den mest tidskritiska interaktionen i hela systemet. Klockan är sex på morgonen, personen är sjuk, någon måste veta det inom minuter.

**Placering:** överst i `/my-shifts`, men **endast de dagar personen har ett pass**. Har hon inget pass i dag finns knappen inte — då är hon inte sjuk från arbetet.

**Utseende:** full bredd, 56 px hög, sekundär stil med tydlig kant. Inte primär: den primära platsen tillhör dagens pass. Text: **"Sjukanmäl dig idag"**.

**Flöde — ett tryck, ingen dialog:**
1. Tryck.
2. Bekräftelseremsa i `--color-ok-100` ersätter knappen: *"Sjukanmäld 06:12. Elin Norrback är meddelad."* Namnet på den som fått notisen, inte "din chef" — det gör att personen vet att någon verklig människa sett det.
3. Under remsan en länk: **"Ångra"**, aktiv i 10 minuter. Efter det krävs kontakt med chefen.

**Ingen fråga om orsak, ingen fritext, ingen filuppladdning.** Inget av det behövs klockan sex, och varje fält är en anledning att skjuta upp anmälan. Läkarintyg och detaljer hanteras senare, i frånvaroposten.

**Flerdagarsfallet:** dag två visas knappen som **"Fortsätt sjukanmälan"** med texten *"Du sjukanmälde dig igår. Är du sjuk idag också?"* Tvinga aldrig personen att anmäla från noll varje dag, men fråga aldrig heller åt henne — en sjukperiod som förlängs automatiskt blir en löneavvikelse ingen upptäcker.

**Tillstånd:** ej anmäld, anmäld idag (med ångra), anmäld igår (fortsätt), sjukperiod pågår sedan datum, inget pass idag (knappen finns inte).

**Felfall:** ingen uppkoppling. Då säger remsan *"Sparad. Skickas när du får nät igen."* och anmälan köas — samma modell som stämplingen, och tidpunkten som sparas är trycket, inte synken.

---

### 2b. "Ansök om frånvaro" — tre fält och ett saldo

**Tre fält, i denna ordning:**

1. **Typ** — segmenterad kontroll om det ryms, annars lista. Semester, Föräldraledighet, VAB, Tjänstledigt, Kompledigt, Annat. Inte en dropdown med tjugo lönearter: visa de fem vanligaste och lägg resten bakom "Annat".
2. **Datum** — en kalender med intervallval. Standard: idag. Under fältet, direkt: **"= 5 kalenderdagar, 4 arbetsdagar enligt ditt schema."** Skillnaden mellan de två talen är den vanligaste källan till missförstånd i semesteransökningar.
3. **Omfattning** — standardvärde **"Enligt schema"**, med "Halvdag" och "Ange själv" som alternativ. Enligt schema är rätt i nio fall av tio och ska inte kräva ett val.

**Saldoförhandsvisningen är det som gör ansökan begriplig.** En platta i `--color-ok-100` ovanför skickaknappen:

> **Semester** — 18 dagar kvar i år
> Efter denna ansökan: **13 dagar**
> 4 sparade dagar från 2021 förfaller 31 dec 2026

Sista raden bara när den är sann, och i `--color-warn-800`. Den raden får personen att lägga semestern där den behövs, vilket är hela poängen med att visa saldot.

**Krock med schemalagt pass** visas i formuläret, före skickaknappen, aldrig efter:

> Du har ett pass **onsdag 3 sep, Försäljning Amhult 08:30–18:30**.
> Chefen avgör om passet öppnas för någon annan eller avbokas.

**Skickaknappen** är primär, full bredd, 56 px: **"Skicka ansökan"**.

**Tillstånd:** tom, ifylld, saldo otillräckligt (varning men inte spärr — chefen kan godkänna ändå), väntande, godkänd, avslagen med skäl, återkallad av personen.

**Väntande ansökan syns på startvyn** med typ och datum, inte begravd i en historik. En ansökan man inte ser är en ansökan man skickar igen.

**Tomläge i historiken:** *"Du har inga tidigare ansökningar."*

---

### 2c. Chefens frånvarokö

SideQueue, 320 px, till höger om dagens huvudinnehåll. Beslutsordning: äldst först, men allt som rör **imorgon eller idag** går överst oavsett ålder.

**Varje post:**

```
[3 px kant i warn-600]
Sara Öberg                          Deltid 50 %
Semester · 3–7 sep · enligt schema
Saldo efter: 13 av 18 dagar
⚠ Krockar med Försäljning Amhult ons 3 sep
[Godkänn]  [Avslå]
```

Namnet störst, typ och intervall under, **saldot efter godkännande** som eget tal, och krocken bara när den finns. Två knappar: Godkänn primär, Avslå sekundär.

**Avslå kräver skäl** i en kort fritext — det går till personen och blir en del av ansökan. Ett avslag utan skäl är den vanligaste källan till att någon slutar använda systemet.

**Krockdialogen** är det enda modala i vyn, och den formuleras som konsekvenser, aldrig som systemtermer:

> **Passet onsdag 3 sep blir obemannat**
> Försäljning Amhult 08:30–18:30. Bemanningen faller från 4 till 3 personer den dagen.
>
> ○ **Öppna passet för anmälan** — synligt för 6 personer med rätt kompetens
> ○ **Avboka passet** — bemanningen blir 3, ingen ersättare söks
>
> [Godkänn frånvaron]  [Avbryt]

Bemanningstalet före och efter är beslutsunderlaget. Utan det är valet en gissning.

**Bulkgodkännande** för det vanligaste fallet: flera ansökningar utan krockar och med tillräckligt saldo. Kryssa och godkänn i ett svep. Men **aldrig bulk över en krock** — den kräver ett val per post.

**Tomläge:** *"Inga ansökningar att behandla."* Plus en rad om vad som är nästa deadline: *"Periodlåset för augusti stänger 3 sep."* Det är den kön faktiskt konkurrerar med om chefens uppmärksamhet.

---

### 2d. Frånvaro i veckogriden

Godkänd frånvaro ritas som ett block med **diagonalt streckmönster, ingen fyllning**, och typen skriven. Skillnaden mot ett pass ska vara omedelbar: pass är solida, frånvaro är skuggad.

Ligger frånvaron ovanpå ett tidigare schemalagt pass: passet ritas nedtonat **under** frånvaroblocket, så att både "skulle jobbat" och "gör det inte" syns. Det är Personalkollens mönster och det är rätt.

**Öppet pass som uppstått ur frånvaro** får streckad ram och texten "öppet efter frånvaro" — chefen ser orsakskedjan utan att klicka.

**Väntande ansökan** ritas som en tunn streckad linje längs cellens överkant, inte som ett block. Den är inte ett faktum än, och ska inte ta plats som om den vore det.

---

### 2e. Semesterårsvy i personkortet

En rad per årgång, senaste först. Kolumner: **Intjänat, Uttaget, Kvar, Sparat**. Alla tal tabulära och högerställda, med enheten "dagar" i kolumnrubriken och inte i varje cell.

Under tabellen, som egna rader och inte som ikoner:

- **Förfallovarning** i `--color-warn-800`: *"4 sparade dagar från 2021 förfaller 31 dec 2026."* Med en åtgärd: **"Föreslå datum"** som öppnar schemat på de veckor där bemanningen tillåter det. En varning utan åtgärd är bara en påminnelse om att någon annan har ett problem.
- **Semesterskuld** som informativ rad: intjänade ej uttagna dagar × dagsvärde + arbetsgivaravgift, märkt *"preliminär — Fortnox avgör"*.

**Tomläge** för en nyanställd: *"Semesterår 2026 påbörjat 15 aug. Intjäning visas efter första hela månaden."* Inte en tom tabell med nollor, som ser ut som ett fel.

---

### 2f. Notiscentret

Klockikon i sidhuvudet med olästräknare. Panel, 380 px, poster i omvänd kronologisk ordning grupperade per dag med rubriken "Idag", "Igår", sedan datum.

**Varje post:** ikon för typ, en rads text, tidpunkt, och en åtgärd där en åtgärd finns. Olästa har 3 px accentkant. Klick på posten går till det den handlar om och markerar som läst.

**Enhetsdimension.** En butikschef ser sin enhet. En admin ser det hon prenumererar på, inte allt — femton enheters notiser i en panel är brus för alla. Filterrad överst när användaren har fler än en enhet.

**Den hårda gränsen gäller varje post:** notiser avslöjar aldrig frånvarotyp eller hälsodetaljer.

| Fel | Rätt |
|---|---|
| "Sjukanmälan från Sara Öberg" | "Frånvaroansökan från Sara Öberg" |
| "VAB 3–7 sep" | "Frånvaro 3–7 sep · väntar på beslut" |
| "Sara är sjuk idag" | "Sara Öberg är frånvarande idag" |

Samma sak i SMS och e-post, där risken är större eftersom meddelandet syns på en låst skärm. Detaljer först inloggad.

**Posttyper:** frånvaroansökan att behandla, ansökan godkänd eller avslagen, saknad utstämpling, sen ankomst, stämpling utanför platslås, avvikelse att attestera, periodlås närmar sig, tvångslåsning utförd, helgdagar för nästa år saknas, station tyst under pass.

**Tomläge:** *"Inget nytt."* Två ord. En tom notispanel behöver ingen förklaring.

**Ingen notis utan åtgärd eller konsekvens.** Om en post inte leder någonstans och inte kräver något ska den inte finnas — den lär bara användaren att panelen kan ignoreras.

## 3. Täckningskartan — nivå 1 i schemat

**Syfte:** svara på vilka av nio enheter som behöver chefen i dag.

Nio rader, sju kolumner. Rader i bolagsordning med en tunn avdelare mellan DE No.1 och FSAB. ADM har ingen bemanning och visas som en grå rad med "ingen stämpling" — den ska finnas med, annars undrar man var den blev av.

Varje cell: ett tal, bemanning mot behov, `4/4`. Cellen är neutral när det går ihop och får 3 px kant plus talet i alert-800 när det inte gör det. Ingen fyllning.

Under talet, bara vid avvikelse, en rad i 10,5 px: "1 saknas" eller "2 över".

Radslut till höger: veckans timmar och kostnad för enheten, båda preliminära.

**Klick på cell** går till dagvyn för den enheten och dagen. Klick på radnamn går till veckovyn.

**Inte längre blockerad.** Produktionsdata från vecka 9 2026 visar fullständiga scheman med 405,25 timmar och 107 016 kr i personalkostnad — se `observationer-personalkollen.md` punkt 10. Behovet finns att jämföra mot.

**Tomläge:** en enhet utan publicerat schema visar "utkast" i bärnsten över hela raden, inte tomma celler — skillnaden mellan "ingen behöver jobba" och "ingen har lagt schemat" är hela poängen.

---

## 3b. Schemavyn — taket är fem minuter per vecka

Personalkollens schemavy övergavs för att den var dålig att arbeta i. Vår vy konkurrerar därför **inte med ett fungerande arbetssätt utan med att inte schemalägga alls.** Den vinner bara om kostnaden per pass är nära noll.

**Måttet är hårt och ska testas, inte antas:** klarar en stressad butikschef en hel vecka på under fem minuter? En vecka är omkring 30–35 pass. Fem minuter betyder alltså ungefär åtta sekunder per pass om hon bygger från grunden — vilket är omöjligt. Slutsatsen är att **hon aldrig ska bygga från grunden.**

### Tomläget föreslår, det visar aldrig ett tomt rutnät

En oschemalagd vecka är det vanligaste tillståndet i dag, och det är där vyn vinner eller dör. Aldrig ett tomt rutnät med en plusknapp. I stället tre förslag, det första fyllt:

- **"Kopiera vecka 35"** med antalet pass skrivet: *"34 pass, 5 personer."* De flesta veckor är förra veckan med två ändringar.
- **"Importera från fil"** — Excel eller CSV, samma granskningsvy som AI-importen.
- **"Börja tomt"** som tredje och minst framträdande val.

Kopiera vecka och importen är alltså **huvudflödena**, inte bekvämligheter. De ska ha primär plats i vyn, inte ligga bakom en meny.

### Kopiering visar en diff, inte ett resultat

Blind kopiering av 34 pass skapar tystnad om det som ändrats sedan förra veckan. Efter kopiering: en sammanfattning som går att godkänna i ett svep, med undantagen brutna ut.

*"34 pass kopierade. 2 kräver åtgärd: Eva Ahlander har godkänd semester onsdag, Melker Björndal slutar 3 sep."* Med de två posterna listade och en åtgärd var. Resten godkänns med en knapp.

Samma granskningsvy för filimporten. Det är samma problem och ska inte ha två lösningar.

### Att lägga ett pass är ett val, inte ett formulär

Grundpassen gör detta möjligt. Klick i en cell öppnar inte en dialog med Personal, Grundpass, Schemalagd tid, Rast och Beskrivning — den visar **enhetens grundpass som en kort lista**, och under dem de personer som brukar ta det passet.

Två tryck: grundpass, person. Klart. Tiderna följer av grundpasset och behöver bara ändras i undantagsfallen, bakom en "Justera tid"-länk.

Omvänd väg ska också finnas: dra en person från en lista till en grundpassrad. **Men aldrig bara dragning** — varje operation behöver en tangentbords- och formulärväg vid sidan av, annars är vyn otillgänglig för den som inte kan använda mus precist.

### Publicering är en handling för hela veckan

Inte per pass, inte per dag. En knapp, med regelkontrollen körd över alla pass och krockar samlade i en lista. Spärren enligt väg 1 säger att en krock finns men aldrig var, med två åtgärdsförslag.

Och publiceringen ska säga vad den kostar: *"Publicera vecka 36 — 318,5 timmar, 62 940 kr preliminärt."* Beloppet är det som gör publiceringen till ett beslut i stället för en formalitet, och sedan deltidsmertiden räknas mot schemat är det dessutom ekonomiskt bindande.

### Mät det

Räkna klicken innan vyn byggs klart. En kopierad vecka med två undantag ska landa på **fem till sju åtgärder totalt**: kopiera, granska, lös två undantag, publicera. Kommer ni över tio behöver flödet göras om, för då är ni tillbaka i det som redan har övergivits en gång.

## 4. Delad personal — admin only

**Syfte:** fånga det ingen enhetschef kan se.

Lista över alla schemalagda i mer än en enhet samma vecka. Per person: namn, sysselsättningsgrad, enheterna med monokod, veckans timmar mot grad, och regelstatus över enhetsgräns.

**Detta är vyn där dygnsvila och mertid faktiskt kontrolleras**, eftersom `berakna_arbetstid()` räknar per person över alla enheter. En deltidare i tre butiker har en grad, inte tre — skriv det i vyns underrubrik så ingen tvivlar.

Rad med brott: 3 px alert-kant, texten "Dygnsvila 7 h mellan pass i B03 och GRO — 13 § ATL", och två åtgärdsförslag.

**Tomläge, som är det normala:** "Ingen är schemalagd i mer än en enhet denna vecka." En tom vy här är goda nyheter och ska läsa som det.

**Motsvarande i chefens vy:** publiceringsspärren enligt väg 1 säger att en krock finns men **aldrig var**. Panelen ger två åtgärder — "Begär ändring hos admin" och "Flytta passet" — utan att nämna enhet eller kollega.

---

## 5. Flexsaldo för kontorstypen — designa, bygg inte

Etapp 7. ADM och tjänstemän registrerar närvaro utan stämpelplikt.

Ett tal överst: saldot i timmar och minuter, med tecken. Under: en lista per dag med förväntad tid, registrerad tid och differens. Längst ned periodens summa och gränserna för saldot om sådana finns.

Ingen stämpelknapp, ingen rast, ingen OB. Det är en annan produkt än tidrapportering för lön och ska inte låna kioskens vokabulär.

---

## 6. Etapp 5 — löneunderlag och Fortnox i sin helhet

Detta är den mest sammansatta delen, och den enda där en felaktig design kostar pengar direkt. Sex vyer som hänger ihop i en kedja: **policy → periodlås → beräkning → granskning → export → rättelse.**

### 6a. Policyadmin — OB, övertid och mertid

Reglerna är data, inte kod, och adminvyn är beviset. En tabell per regeltyp, versionerad med `giltig_from` och `giltig_tom`.

**OB-tabellen** som redigerbara rader: namn, veckodagar, från-tid, till-tid, procent, helgdagsflagga, Fortnox-löneart. Seedad med de fem raderna. Varje rad visar sin giltighetsperiod, och en ändring skapar en ny version istället för att skriva över — samma princip som journalen.

**Två regler som behöver egen förklaring i vyn:**

- **"OB och övertid utgår ej samtidigt — högsta gäller."** En policyflagga, men den måste förklaras där den syns, annars ser en chef två rader i dagdetaljen och tror att något fattas. Skriv ut: "När både OB och övertid gäller samma minut betalas endast den högsta."
- **Deltidsmertid från 2026-04-01:** 35 % första 2 h per dag över **schemalagd** tid, sedan 70 %. Notera i vyn att detta räknas per dag mot schemat, inte per period mot graden — det är två olika regler och de förväxlas lätt.

**`holiday_calendar` har ett typfält:** helgdag eller halvdag. Aftnarna seedas som halvdagar och jämställs med lördag, alltså 100 % efter 12.00. Vyn ska kunna skapa och redigera båda typerna — typen är ett val i formuläret, inte två separata flöden. Novemberpåminnelsen "helgdagar för nästa år saknas" finns i specen och behöver en plats i notiscentret.

### 6b. Periodlåsvyn — den operativa flaskhalsen

Perioden kan inte beräknas förrän alla **stämplande** enheters `period_locks` är låsta — B01–B07 plus GRO, alltså åtta. ADM stämplar inte och ingår via bolagsperioden med frånvaro och förmåner. **Åtta chefer, och en sen chef stoppar femtio personers lön.**

Vyn måste därför göra läget synligt, inte gömt i ett felmeddelande vid beräkning:

- En rad per enhet: monokod, namn, ansvarig chef, status, och tidpunkt för låsning.
- Ett tal överst: "7 av 8 enheter låsta." Räkna aldrig ADM här — en enhet som inte kan låsas ska inte se ut som en enhet som inte har låst.
- Per olåst enhet: en knapp "Påminn" som skickar notis, och senaste påminnelse i klartext.
- **Administratörens tvångslåsning** som en sekundär, tydligt märkt åtgärd: sätter `forced = true`, kräver skäl i fritext, loggas, och skickar notis till chefen som blev överkörd. Aldrig en tyst knapp. En tvångslåst enhet bär märkningen vidare i granskningsvyn — den som läser underlaget ska se att en attest saknas.

### 6c. Beräkningen — ett tillstånd, inte en vy

Beräkningen är en process med förlopp, inte en knapp som blockerar. `payroll-compute` orkestrerar och `berakna_arbetstid()` räknar.

Statusen syns som ett band: `open` → `computed` → `reviewed` → `exported` → `reexported`. Bandet visar var perioden står och vad som krävs för nästa steg. Ett spärrat steg säger varför, inte bara att det är spärrat.

### 6d. Granskningsvyn

DecisionBar överst, SideQueue för fel, enligt designkoden. Personalkollens lönekörningsmodal är mallen — den var faktiskt bra på det här.

**DecisionBar per bolag och period:** personer, timmar, OB-timmar per nivå separat, frånvarodagar, förmåner, preliminär bruttokostnad, och diff mot föregående period i procent. Diffen är det viktigaste talet i hela vyn — det är så man upptäcker ett fel innan lönen går ut. Ge den störst plats och en riktning, inte bara ett tal.

**Personlista → dagdetalj.** Raden per person: namn, anställningsnummer, timmar, OB-summa, preliminär bruttolön. Expanderad dagdetalj: datum, schematid, stämplad tid, valt underlag, OB-fördelning per nivå, frånvaro, förmåner.

**Schematid och stämplad tid ska stå sida vid sida**, eftersom deltidsmertiden räknas mot schemat. En chef som ser bara den ena kan inte kontrollera mertiden.

**Preliminärmärkningen.** Bruttolön, skatt och netto visas — och varje sådant tal bär märkningen "preliminär — Fortnox avgör". Inte en fotnot längst ned, utan på talet. Detta är den enskilt viktigaste texten i vyn: Baldvin är icke-teknisk och kommer att läsa nettot som ett besked om det inte står något annat.

**Felkön i SideQueue**, fyra typer, varje post med sin åtgärd:

1. Rad utan löneartsmappning → "Mappa löneart"
2. Person utan `fortnox_employee_id` → "Öppna personkort"
3. Datum utanför anställningstid → "Rätta anställning"
4. Saknad `tax_table` → "Sätt skattetabell"

**Perioden kan inte exporteras med fel i kön.** Exportknappen är därför inte grå och tyst — den säger "4 fel måste åtgärdas först" och länkar till kön.

**Varje spärrad rad bär sitt eget skäl och sin egen åtgärd, på raden.** Personalkollen gör motsatsen: fem personer med statusen "Kan inte godkännas" utan angivet skäl, och skälen som kollapsade varningsrader högst upp i vyn utan koppling till person. Läsaren måste då själv gissa vilken varning som hör till vem. En samlad varningslista får finnas som summering, men aldrig som enda plats där skälet står.

**Anställningsnummer som egen kolumn intill namnet.** I dag används personnummer för att skilja personer med liknande namn — det är därför Personalkollen visar dem i klartext i listor. Tas den möjligheten bort utan ersättning kringgår någon regeln genom att exportera till Excel.

Knapp "Markera granskad" när kön är tom.

### 6e. Fortnox-kopplingen

**Adminvy "Fortnox-koppling", en rad per bolag.** Kolumner: bolag, kopplingsstatus, scopes, giltighet.

Det centrala designproblemet: befintliga kopplingar för fakturor saknar `salary`-scope, och scopes kan inte läggas till i efterhand. Vyn måste därför förklara **varför** en omauktorisering krävs, inte bara erbjuda den. Föreslagen text: "Kopplingen har inte behörighet för lön. Fortnox tillåter inte att behörigheter läggs till i efterhand — kopplingen måste göras om. Fakturakopplingen påverkas inte."

Knapp "Auktorisera om med lönescope" per bolag. Efter genomfört flöde: scopes listade i klartext, och en rad om att refresh-token roterar automatiskt.

**Ingen token, ingen nyckel och inget personnummer får synas i denna vy.**

**Löneartsmappningen** som egen adminvy, per bolag: intern `line_type` → Fortnox löneart eller CauseCode + transaktionstyp. Rader med saknad mappning står överst med bärnstenskant, eftersom de blockerar exporten. Seed-defaults ifyllda, tomma fält markerade som "måste fyllas".

### 6f. Exportförloppet

För femtio personer med tre transaktionstyper blir det hundratals anrop, begränsade till 25 per 5 sekunder med token bucket. Det tar minuter.

**Därför: en förloppsvy som går att lämna och komma tillbaka till.** Aldrig en modal som måste stå öppen, aldrig en spinner utan tal.

Vyn visar fyra sekvenssteg med eget förlopp: Anställda, Närvarotransaktioner, Frånvarotransaktioner, Lönetransaktioner. Per steg: antal klara av totalt, antal fel.

- **Väntan på grund av hastighetsgräns är normalt och ska sägas så:** "Väntar 4 s — Fortnox tillåter 25 anrop per 5 sekunder." Inte ett fel, inte en varning. En användare som ser en paus utan förklaring avbryter.
- **429 med backoff** visas som "Försöker igen, försök 3 av 5". Efter fem misslyckade: posten hamnar i felkön med Fortnox svar i klartext.
- **Ingen webhook finns** — status verifieras med GET efter batchen. Det steget ska synas som "Verifierar mot Fortnox", annars ser exporten klar ut innan den är det.
- Efter genomförd export: perioden markeras `exported`, och varje personkort visar "Exporterad till Fortnox 2026-09-05".

### 6g. Rättelse och omexport

En exporterad period kan öppnas för rättelse av admin, med loggat skäl. Det är en allvarlig handling och ska se ut som en.

Efter omkörning visas en **diffvy före export** — det viktigaste skyddet i hela kedjan. Tre grupper, var och en med antal och belopp:

- **Nya rader** (POST)
- **Ändrade rader** (PUT med Id) — med före- och eftervärde sida vid sida
- **Borttagna rader** (DELETE med Id)

Ingen omexport utan att någon har sett diffen. Efteråt: status `reexported`, och en rad om att detta är underlaget för AGI-rättelse som sker i Fortnox.

### 6h. PAXml-exporten

Knapp per bolag och period: "Exportera PAXml". En rad under knappen förklarar vad det är: "Lönesystemsoberoende format. Används om Fortnox byts ut." Validering mot XSD sker före nedladdning, och ett valideringsfel visas som text — inte som en nedladdning som tystnar.

### 6i. Tre rapporter

**Kostnadsställesrapport:** per enhet och period — timmar, OB per nivå, kostnad, kostnad per timme, med drill-down till person och dag. Personalkollens version är mallen. Kostnadsdefinitionen skrivs ut i vyn, eftersom talet annars inte går att jämföra med något: timlön + tillägg + OB + semesterlönereserv + förmåner + arbetsgivaravgift, exklusive frånvaro.

**Kontrakterade timmar:** schemalagd och arbetad tid mot sysselsättningsgrad per person och vecka. Detta är deltidsmertidsövervakningen — och den ska visa trend, inte bara nuläge, eftersom en deltidare som varje vecka arbetar över sin grad är en anställningsfråga och inte en lönefråga.

**Semesterskuld:** per person intjänade ej uttagna dagar × dagsvärde + arbetsgivaravgift, och totalsumma per bolag. Informativ, för kontroll mot Fortnox — märks som sådan.

### 6j. Förmåner och avdrag — två känsliga fall

**Friskvård över 5 000 kr per år är en spärr, inte en varning.** Överskridande gör **hela** beloppet skattepliktigt, inte bara överskottet. Fältet ska därför vägra inmatningen och skriva skälet: "5 000 kr är gränsen per år. Överskrids den blir hela friskvårdsbidraget skattepliktigt, inte bara den överskjutande delen." Att acceptera och varna efteråt är fel design här.

**Utmätning och kvittning är det känsligaste i hela systemet.** Kronofogde-referens, förbehållsbelopp, medgivandedokument. Designregeln är hårdare än RLS:

- Ingen kolumn i någon översikt.
- Ingen rad i någon lista.
- Aldrig i någon vy som visar typ eller referens.
- Endast på personkortet, bakom en egen flik, för de roller som verkligen behöver det.

En butikschef ska inte kunna se att en medarbetare har utmätning. Inte ens som ett tomt fält, eftersom ett tomt fält på en person och ett ifyllt på en annan säger allt.

**Undantag som är avsiktligt:** i exportloggen, som är admin-only och krävs för felsökning mot Fortnox, syns posten som löneartskod utan typetikett. Den avslöjar inget i någon vy men får inte raderas — spårbarheten mot Fortnox kräver den. Designen ska alltså inte försöka filtrera bort den där.

### 6k. Kostnadsförhandsvisningen i schemat ljuger om ungdomsreduktionen

Detta är den enda punkten där jag tror att en rimlig implementation blir fel.

Arbetsgivaravgiften är 20,81 % för födda 2003–2007 med månadslön upp till 25 000 kr, och 31,42 % däröver. **Tröskeln slår på hela månadslönen, inte på de marginella timmarna.** Ett extrapass som tar en 22-åring från 24 800 till 25 200 kr kostar därför tusenlappar mer än passet.

En kostnadsförhandsvisning som räknar passets marginalkostnad visar ett tal som är fel med stora belopp, i just det fall där chefen mest behöver kunna lita på det.

**Referensfall ur produktionsdata:** Adam Sandström, juni 2026, bruttolön 25 182,00 kr, född 2005. Personalkollen skriver ut arbetsgivaravgiften som 5 259,68 kr med texten "Beräknat på 20,81 %, 31,42 %" — den vet att tröskeln passerades men säger inget om att de sista 182 kronorna kostade tusenlappar. Tröskeleffekten är alltså inte hypotetisk; den inträffade i juni.

**Designkravet:** förhandsvisningen anropar `preliminar_manadskostnad(person, månad, hypotetiskt_pass)` och räknar hela månaden när personen är född 2003–2007 och ligger inom 3 000 kr från taket. Varningen ska komma **när passet läggs**, inte i lönekörningen — hade chefen sett den i juni kunde beslutet blivit ett annat. Passet får då en varning i bärnsten: "Amira passerar 25 000 kr denna månad med detta pass — arbetsgivaravgiften stiger från 20,81 % till 31,42 % på hela månadslönen. Ökad kostnad: 2 640 kr."

**Fallback som gäller tills funktionen finns:** utelämna arbetsgivaravgiften helt ur förhandsvisningen. Ett saknat tal är ärligare än ett marginaltal som är fel med tusenlappar vid tröskeln.

---

## Grundpass — begrepp som ska in i schemavyn

Personalkollen bygger scheman av **namngivna passmallar per enhet** med egen färg: Inköp 06:15–09:00, Försäljning Särö 09:00–18:30, Försäljning Amhult 08:30–18:30, Produktion Amhult 08:30–18:00, Försäljning Torget 11:00–18:45, Allt-i-allo 08:00–18:00.

Det är bättre än fria klockslag: schemaläggning blir "vem tar Försäljning Amhult på onsdag" — ett val i stället för fyra fält. Adoptera det som förstaklassbegrepp.

**Griden grupperas i fyra nivåer:** bolag → enhet → grundpass → person, med tre summeringsrader per nivå: schemalagt, personalkostnad, försäljningsprognos. Prognosen ska vara manuellt redigerbar även när kassakopplingen finns — en butikschef som vet att det är kräftpremiär gissar bättre än historiken.

Frånvaro ritas som ett block ovanpå passet med passet nedtonat under, så att både "skulle jobbat" och "gör det inte" syns.

**Kvarstående verksamhetsfråga S2:** scheman lades i februari men inte i augusti. Varför det slutade avgör om vår schemavy behöver vara enklare än Personalkollens för att bli använd. Det blockerar ingen vy men styr hur mycket vi får kosta i klick per pass.

## Frånvaroansökan: en period, inte tio dagar

Personalkollen skapar en rad per dag — tio rader för en semestervecka, var och en med egen borttagningsknapp. Vår ansökan skapar **en** post med intervall och expanderar till dagar bara där något skiljer sig.

Behåll två saker från deras dialog: fältet **"Enligt schema"** som tar omfattningen från passet i stället för manuell inmatning, och dagtabellen som visar pass, rapporterad tid och frånvaro sida vid sida — frånvaro och verklig stämpling samexisterar på samma dag och det måste synas.

## Stämplingen sker på webben, med kod per kostnadsställe

Inte på monterad iPad. Enheten är okänd: butiksdator, surfplatta eller telefon. Tre följder:

- **Responsiv layout**, en kolumn under 600 px bredd, men aldrig under 88 px träffytor i stämplingsstegen. Aktiveringssteget får vara normalstort — det görs en gång av en chef med tangentbord.
- **Koden är en engångsaktivering per stämpelklocka**, inte ett lösenord som används vid varje stämpling. Efter aktivering identifierar sig personalen med personnummer. I Personalkollen kan koden inte ändras efteråt — vår modell har både rotation och återkallelse, och det är en verklig förbättring, men den måste förklaras i dialogen eftersom ingen känner igen begreppen:

  **Rotera:** *"Den nya koden ersätter den gamla. Enheter som redan är aktiverade fortsätter fungera; endast nya aktiveringar kräver den nya koden."*

  **Återkalla:** *"Enheten slutar fungera omedelbart. Personal som står vid den kan inte stämpla förrän en ny enhet aktiverats."* Kräver bekräftelse med enhetens namn skrivet, eftersom åtgärden slår mitt i ett skift.

  Aktiveringsvyn ska dessutom säga var koden finns och att den visas en gång: *"Aktiveringskoden skapas av en administratör under Stämpelklocka → Stationer. Koden visas en gång — be om en ny om den tappats."*
- **Bekräftelsesteget visar grundpasset**, inte bara namnet: "Ditt schemalagda pass: 14:30–21:00, Grundpass: Kväll". Det fångar fel person och fel dag på en gång.

## 7. Stämpelklockan — sex ändringar mot det som redan är byggt

Klockan finns i drift: aktiveringsvy, personnummerinmatning, IN/UT/RAST med förslag, "På plats nu", och adminvyn med stationer, QR-kod, rotera och återkalla. Grunden är rätt. Nedan är ändringar, inte nybygge — i fallande ordning efter risk.

### 7a. Färgen säger IN medan texten säger UT

Detta är det enda felet som kommer att skapa felaktiga stämplingar.

I dagens vy är **IN** en fylld mörkblå knapp och **UT** en ljus mintknapp — IN dominerar visuellt. Under knapparna står "Föreslaget nästa steg: Utstämpling". Designen skriker alltså IN och viskar UT, samtidigt.

Någon som är instämplad sedan morgonen, står i kö och trycker på det som ser ut som huvudknappen får en dubbel instämpling. Det är exakt den avvikelse som sedan ska rättas manuellt av en chef.

**Ändring:** den föreslagna åtgärden är den fyllda knappen. Alltid. Övriga blir sekundära med tydlig kant men utan fyllning. Texten "Föreslaget nästa steg" kan då tas bort helt — hierarkin säger det redan, och en förklaring som behövs är ett tecken på att formen inte bär.

### 7b. Klockan är minst på skärmen och borde vara störst

Klockslaget ligger i en liten ruta uppe till höger, ungefär 14 px. Både Personalkollens klocka och all kioskpraxis gör motsatsen: tiden är det största elementet.

Skälet är inte estetiskt. En stämpelklocka granskas på sin egen klocka — personalen kontrollerar att den går rätt innan de litar på stämplingen, och en stor korrekt tid är beviset att enheten lever och har kontakt. En liten tid i ett hörn ser ut som en dekoration.

**Ändring:** klockslag och datum överst, centrerat, minst 56 px för tiden och 20 px för datumet. **Med sekunder** — en tid som rör sig är beviset att sidan inte hängt sig.

### 7c. Fyra knappar där bara två kan vara giltiga

RAST börjar och RAST slutar visas alltid, båda grå. Men bara en av dem är någonsin möjlig: är man inte på rast går det inte att sluta rasten.

**Ändring:** visa den giltiga. Är personen instämplad: UT (fylld) och RAST börjar. Är personen på rast: RAST slutar (fylld) och UT. Är personen inte instämplad: bara IN. Antalet knappar går från fyra till en–två, och risken att träffa fel halveras.

### 7d. "Fortsätt" är grå och säger inte varför

En avaktiverad primärknapp utan förklaring läser som ett trasigt system, särskilt för den som stämplar en gång i veckan. Samma sak i aktiveringsvyn där **Aktivera** är grå.

**Ändring:** behåll knappen aktiv och validera vid tryck, med felet i klartext: *"Skriv tio siffror, till exempel 900101-1234."* Eller — om avaktiverad ska behållas — sätt en hjälptext under fältet från början, inte bara ett gråmönster i fältet.

### 7e. Aktiveringskoden är svår att läsa högt

Koden är tolv tecken i blandat alfanumeriskt format. Åtta mot B, fem mot S, noll mot O — och den ska ofta läsas upp i telefon till någon i en annan butik.

**Ändring:** generera ur ett otvetydigt alfabet (uteslut noll, O, ett, I, L, fem, S, åtta, B), och gruppera i block om fyra. QR-koden är rätt primär väg och ska stå först i dialogen, med den skrivna koden som andra alternativ.

### 7f. Stationsnamnet "test1" visas för personalen

Sidhuvudet visar enhetens namn med stationsnamnet under. Enhetsnamnet är rätt och ska stå störst. Stationsnamnet är driftdata — meningsfullt för administratören som har fyra stationer i listan, men brus för den som ska stämpla.

**Ändring:** visa enheten, inte stationen. Behöver stationen synas för felsökning: längst ned, i 11 px grått, tillsammans med versionsnummer.

### Behåll oförändrat

- **"På plats nu" med tomläget "Ingen är instämplad."** Rakt och ärligt. Listan är också social kontroll: ser man att en kollega saknas påminner man henne.
- **Maskerat personnummer i bekräftelsen**, under namnet. Rätt avvägning mellan att bekräfta rätt person och att inte visa mer än nödvändigt.
- **Hälsningen med förnamn.** Personligt utan att avslöja något.
- **Adminvyns tre åtgärder per station** — Profil, Rotera kod, Återkalla — med Återkalla i rött. Behåll, men lägg in förklaringstexterna för rotera och återkalla.
- **QR-kod plus kopieringsknapp** i kodmodalen, och texten om att koden bara visas en gång. Bra, och bättre än Personalkollen.

## 8. Attestvyn — avvikelser i beslutsordning

Skild från granskningsvyn i 6d: här avgörs vad som är sant, där avgörs vad som betalas.

**Syfte:** en chef går igenom föregående periods avvikelser och fattar ett beslut per post, snabbt.

**Sidhuvud:** enhet, period, och tre tal — antal avvikelser, antal attesterade, timmar som väntar på beslut. Plus periodens status och när låset stänger.

**Beslutsraden:** den avvikelse som kostar mest eller är äldst, med åtgärd inline.

**Kön, en post per avvikelse**, sorterad efter typ och sedan datum. Fem typer, var och en med sin egen fråga:

| Typ | Vad chefen ska avgöra |
|---|---|
| `sen_in` | Ska den sena tiden gälla, eller schematiden? |
| `tidig_ut` | Samma fråga, andra änden |
| `missad_rast` | Ska rast dras trots att den inte stämplats? |
| `oplanerad_tid` | Ska tid utan pass betalas, och på vilket kostnadsställe? |
| `missat_pass` | Var personen där? Frånvaro, eller glömd stämpling? |

**Varje post visar tre tal sida vid sida** — schematid, stämplad tid, differens — och tre val som radioknappar: **Schematid**, **Stämplad**, **Justerad** med tidsfält. Aldrig en fritextruta där ett val räcker.

Under valet: konsekvensen i klartext. *"Väljer du stämplad tid: +42 min, varav 0 min OB. Preliminärt +112 kr."* Det är skillnaden mellan att attestera och att gissa.

**Bulkattest** för det vanligaste fallet: alla poster inom stationens tolerans, standard sju minuter. En kryssruta överst — *"Attestera 23 poster inom tolerans"* — och ett klick. Men **aldrig bulk över en post där schematid och stämplad tid skiljer sig mer än toleransen**, och aldrig över `missat_pass`.

**Periodlåset** som avslutande handling, med förvarning: *"Låser augusti för Torslanda Amhult. Efter låsning krävs admin för att rätta."* Och efter låsning syns enheten som klar i periodlåsvyn i 6b.

**Tomläge:** *"Inga avvikelser att attestera. Perioden kan låsas."* Med låsknappen direkt — det är det tillstånd chefen vill nå.

**Ingen chef kan attestera sin egen tid.** Egna poster visas men gråmarkerade, med texten *"Attesteras av admin"*.

---

## 9. Min tid — vyn som stoppar lönefelen

Mobil. Anställd, ingen adminbehörighet. RLS tillåter läsning av egna `time_entries` redan.

**Detta är den billigaste kvalitetssäkringen i hela systemet.** Femtio personer som ser sitt eget underlag före attest hittar fler fel än någon kontroll som kan byggas in — och de har starkare motiv än någon annan.

Tre frågor, i denna ordning:

**1. Hur mycket har jag jobbat?** Ett stort tal överst: periodens timmar. Under det, OB-minuter per nivå som tre separata tal — 50 %, 70 %, 100 % — aldrig en klumpsumma. Personen ska kunna känna igen sin lördagskväll.

**2. Stämmer dagarna?** Ett kort per dag, inte en tabell. Datum och veckodag, in-tid, ut-tid, rast, arbetad tid. Kostnadsställe bara när dagen var delad, och då med båda intervallen. Dagar utan tid visas inte alls.

**3. Något är fel — vad gör jag?** En knapp per dag: **"Flagga den här dagen"**. Öppnar ett kort fält för kommentar och skapar en avvikelse hos chefen. **Den ändrar ingenting i journalen** — och det ska stå i gränssnittet, så ingen tror att felet är rättat.

**Periodens status överst, i klartext:** Öppen, Attesterad, eller Låst. Är den låst är flaggknappen borta och ersatt av: *"Perioden är låst. Prata med Elin Norrback om något är fel."* Med namn, inte "din chef".

**Tomläge:** *"Ingen registrerad tid den här perioden."*

---

## 10. Dag- och veckovyn i schemat

Ritade som körbara filer i separat leverans (`Schema - vecka och dag`). I text:

**Veckovyn:** person mot veckodag. Vänsterkolumn 176 px med namn och anställningsform. Sju dagkolumner, helgen med sänkt bakgrund. Högerkolumn 132 px: veckans timmar mot avtalstak som tal plus en delad stapel där mertidsdelen är bärnsten. Nederst en täckningsrad per dag, bemanning mot behov.

Passen i cellerna: 3 px vänsterkant i statusfärg, tid i mono, grundpassets kod under. Regelbrott får dessutom hel 1,5 px ram och orsaken i förkortad form — "Vila 7 h".

**Dagvyn:** banor per person över en tidsaxel, 04–18 eller enhetens öppettider plus två timmar. Passen som block med grundpass och kostnadsställe. Under banorna: ruttavgångar eller andra deadlines som trianglar, och en bemanningsgraf per halvtimme mot kapacitet, där överbelastning är alert-färgad med minuttalet skrivet.

**Till höger, 328 px: "Kommer och går".** Kronologisk lista över ankomster och avgångar med klockslag, namn och konsekvens där den finns — *"Butiken står ensambemannad till 13:00"*. Det är det schemat inte visar av sig självt, och det är den enda vyn som svarar på frågan en butikschef faktiskt ställer på morgonen.

**Kopplingspanelen** vid valt pass: person, tider, kostnadsställen med intervall, lönekostnad, veckans timmar mot grad, och regelstatus med paragrafhänvisning plus **två åtgärdsförslag** — aldrig bara ett nej.

---

## D. Tillstånd som gäller varje vy

Det som skiljer en design som håller från en som ser bra ut i en skärmbild.

**Laddning.** Aldrig en helskärmsspinner. Skelettrader med rätt höjd och rätt antal, så layouten inte hoppar när data kommer. Tar ett anrop över två sekunder: en rad över innehållet som säger vad som hämtas — *"Räknar OB för 50 personer…"*. Löneunderlag för nio enheter kommer att tugga, och tystnad tolkas som fel.

**Fel.** Tre nivåer, tre uttryck. Fältfel vid fältet. Vyfel som en rad överst i alert-100 med orsak och en åtgärd — aldrig "något gick fel". Systemfel som en sida med vad användaren kan göra nu och vem som är meddelad.

**Sparat.** En kort remsa i ok-100 vid det som ändrades, inte en toast i ett hörn. Toast missas av den som tittade på fältet.

**Optimistisk uppdatering** i schemat, där man lägger många pass i rad. Men **aldrig** i attest, löneunderlag eller export — där ska en handling inte se klar ut förrän den är det.

**Tomläge** enligt regel 18: föreslå nästa åtgärd. Skilj alltid "inget finns" från "inget matchar ditt filter" — den andra ska erbjuda att rensa filtret.

**Responsivitet.** Adminvyerna designas för 1280 px och ska hålla ner till 1024. Under det: sidokolumnen fälls under huvudinnehållet, tabeller får horisontell scroll med frusen första kolumn. Täckningskartan med nio rader och sju kolumner fungerar på en laptop, men **försäljningsprognosraden fälls in** först. Mobilvyerna designas för 375 px.

**Tangentbord.** Fokusordning följer läsordning. Fokusring 2 px accent med 2 px offset, aldrig webbläsarens standard. Schemagriden navigeras med piltangenter, Enter öppnar cellen, Escape stänger. Varje dragoperation har en motsvarande tangentbordsväg enligt regel 20. Genvägar: `⌘K` global sökning, `⌘Enter` spara i dialog.

**Utskrift.** Endast två vyer är gjorda för papper: inspektörsläget och lönespecifikationen. A4 stående, 12 pt brödtext, marginal 20 mm. Sidhuvudet med bolag, driftställe och period repeteras på varje sida. Radbrytning aldrig mitt i en persons dagrader. Knappar, navigation och sessionsband försvinner. Sidnummer som "3 av 7" — en inspektör ska kunna se att bunten är komplett.

**Kopieringens tonläge.** Rakt, kort, personligt där det är en människa och neutralt där det är ett system. Skriv "Elin Norrback är meddelad", inte "Notifiering skickad". Skriv "Du är instämplad", inte "Instämpling registrerad". Aldrig utropstecken, aldrig "Hoppsan", aldrig versaler för emfas. Siffror med siffror, inte ord: "3 dagar", inte "tre dagar". Och aldrig ett ord i gränssnittet som personalen inte själva använder — de säger inte "attestera avvikelse", de säger "godkänna tid", och rubriken ska följa dem även när tabellen heter något annat.

---

## E. Sex frågor som återstår

Dessa kan jag inte avgöra själv utan att gissa om er verksamhet. Ingen blockerar avsnitt 1 eller 2; de påverkar detaljer i vyer längre bak i ordningen.

**1. Semesteråret — kalenderår eller 1 april till 31 mars?** Avgör om semesterårsvyn har en rad per kalenderår eller per intjänandeår, och hur förfallovarningen räknas. Jag har ritat kalenderår som antagande. *Påverkar 2e.*

**2. Vilka frånvarotyper finns med löneart?** Jag har ritat de fem vanligaste — semester, föräldraledighet, VAB, tjänstledigt, kompledigt — plus "Annat". Behöver ni fler synliga i första nivån, eller är fler bakom "Annat" rätt? Ge gärna hela CauseCode-listan så jag kan sortera dem efter verklig frekvens. *Påverkar 2b.*

**3. Finns en kompetensmodell?** Krockdialogen i 2c säger *"synligt för 6 personer med rätt kompetens"*. Utan kompetens per person blir det "synligt för alla i enheten", vilket är sämre men fungerar. Finns det, eller ska öppna pass vara öppna för hela enheten? *Påverkar 2c och öppna pass.*

**4. Vem är enhetens chef i datamodellen?** Notiser per driftställe enligt F4 kräver en mottagare. Finns `work_sites.manager_id`, eller härleds det ur roller? Och vad händer när chefen är sjuk — går notisen vidare till någon? *Påverkar 2f och 6b.*

**5. Är `/my-shifts` en PWA?** Push-notiser till personalen kräver det, eller så blir det SMS och e-post. Det avgör om notiscentret i 2f är en panel i appen eller ett komplement till SMS — och därmed hur hårt integritetsregeln behöver bita, eftersom SMS syns på en låst skärm. *Påverkar 2f.*

**6. Sjuklön och karens — visas dagen eller inte?** Fortnox räknar karensen. Frågan är om dag 1 i en sjukperiod ska märkas i vår vy så en chef förstår varför beloppet ser ut som det gör, eller om vi ska hålla oss helt utanför. Jag lutar åt att märka den som en not utan belopp. *Påverkar 6d.*

---

## F. Leveransordning och acceptanskriterier

| # | Vy | Avsnitt | Klar när |
|---|---|---|---|
| 1 | Inspektörsläget | 1 | En inspektör kan läsa den utan förklaring, med sekunder, kolonformat, två datumfilter och ett driftställe |
| 2 | Etapp 4: sjuk idag, ansök, frånvarokö, griden, semesterår, notiser | 2a–2f | Sjukanmälan tar ett tryck; ingen notis avslöjar frånvarotyp |
| 3 | Schemavyn | 3b | **En stressad butikschef klarar en hel vecka på under fem minuter** — fem till sju åtgärder för en kopierad vecka med två undantag |
| 4 | Täckningskartan | 3 | Nio rader, avvikelse syns utan att man läser talen |
| 5 | Attestvyn | 8 | Bulkattest inom tolerans i ett klick; ingen attesterar egen tid |
| 6 | Min tid | 9 | En anställd kan flagga en dag utan att journalen ändras |
| 7 | Delad personal | 4 | Två chefers lagliga scheman kan inte tillsammans bryta 13 § ATL |
| 8 | Etapp 5 | 6a–6k | Exporten kan inte köras med fel i kön; inget belopp saknar preliminärmärkning |
| 9 | Stämpelklockan | 7 | Föreslagen åtgärd är den fyllda knappen; klockan är störst |
| 10 | Flexsaldo | 5 | Etapp 7 — designad, ej byggd |

**Tvärgående acceptanskriterier, alla vyer:**

1. Ingen information bärs av färg ensam. Testa i gråskala.
2. Alla tal tabulära och högerställda. Alla tider som `8 h 11 min`.
3. Alla sex funktionsfärgssteg klarar sin kontrastnivå mot både grund och yta.
4. Varje tomläge föreslår en åtgärd.
5. Varje felmeddelande säger vad användaren ska göra.
6. Varje belopp är märkt preliminärt.
7. Ingen vy kräver mus. Fokusring är accent, aldrig standard.
8. Kiosken har inga hårstreck och inga träffytor under 88 px i stämplingsstegen.
9. Ingen notis och ingen lista avslöjar frånvarotyp, hälsodata eller utmätning.
10. Inspektörsläget visar ett driftställe. Aldrig fler.

**Vad som inte ska göras utan att fråga först:** avvika från något beslut i avsnitt A, lägga till en färg utanför tokens i 0a, införa en modal för något som kan ske i raden, eller bygga en vy vars tomläge är ett tomt rutnät.

**Inget i detta dokument väntar på ett svar för att kunna byggas.** De sex frågorna i avsnitt E påverkar detaljer, och varje fråga anger vilket avsnitt den rör samt vilket antagande jag ritat mot. Bygg mot antagandet och rätta när svaret kommer.

Dagvyn och veckovyn finns dessutom som körbara filer med exakta mått, färger och radlayouter.

Alla fyra backendfrågor är besvarade, så inget i ovanstående vilar på ett antagande om backend.

De fyra modellfrågorna F5–F8 är avgjorda i avsnitt 0 med motivering. Skulle någon visa sig kostsam i implementation: säg det som en fråga innan ni avviker, så påverkas bara den vy frågan gäller.

Klockan i avsnitt 7 är ändringar mot befintlig kod. `/schedule-planner` och `/attestations` finns byggda men ritas om enligt 3b respektive 8 — där gäller femminuterskravet som acceptanskriterium, inte som ambition.
