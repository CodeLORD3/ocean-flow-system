# Inventering på telefon — guidad räkning i ett steg i taget

Ny mobilvy för inventeringen. Samma lagerlogik som idag: räkningen ändrar inga saldon, den skapar ett underlag som butikschefen godkänner, och först då bokförs justeringarna med orsak "inventering".

## Så blir upplevelsen

**Start.** En stor knapp "Starta inventering" i butikens mobilvy. Butiken hämtas från inloggad person; frågan ställs bara om personen har fler än en butik.

**Välj plats.** Ett stort kort per lagerplats (Disk, Kyl, Frys, Lager) med antal varor och, om en räkning redan börjat, "Fortsätt där du slutade — 14:32".

**Räkna.** En vara per skärm: bild, namn i stor text, enhet. Under den: minus, stort siffervärde, plus, och "Skriv siffra" som öppnar en egen stor knappsats med komma för kilo — telefonens tangentbord används aldrig. Knappar längst ner: "Spara och nästa", "Hoppa över", "Finns inte här", plus "Ångra" på senaste inmatning. Överst "Vara 12 av 48" och en framstegsrad. Förväntat saldo visas inte under räkningen (blindräkning), styrs av en inställning som är på från start. Varor med flera partier får ett kort per parti med partinummer och "Bäst före 21 sep".

**Sammanfattning.** Sökbar lista över det som räknats. Här visas avvikelserna för första gången, färgade och i klartext: "3,2 kg mindre än väntat". Tryck på en rad för att räkna om just den varan.

**Skicka in.** "Skicka in räkningen" med bekräftelse: "48 varor räknade, 5 avvikelser. Butikschefen godkänner innan lagret uppdateras." Underlaget får status "Väntar på godkännande".

**Godkännande.** Butikschefen ser underlaget i befintlig inventeringsvy (och på mobil) med avvikelserna listade. Vid godkännande bokförs en lagerrörelse per avvikande rad. Före godkännande är alla saldon orörda.

## Robusthet

- Varje inmatad rad sparas direkt lokalt i telefonen och mot databasen när nätet finns. Tappat nät eller stängd flik tappar ingen rad.
- Vid återöppning: "Fortsätt räkningen från 14:32?" med Fortsätt eller Börja om.
- Två personer kan räkna olika lagerplatser i samma butik samtidigt. Ett utkast hör till en person och en lagerplats — ingen kan öppna någon annans utkast för en annan plats.

## Hjälp i vyn

Tre introskärmar första gången (hur man räknar, hur man hoppar över, vad som händer efter inskick), alltid åtkomliga igen via "Hur gör jag?" i sidhuvudet.

## Teknisk plan

- **Databas (migration, additiv):**
  - `stock_count_sessions`: nytt `location_id`, `claimed_by` (staff) och `last_activity_at`; statuslistan utökas med `inskickad`; nytt unikt index på (store_id, count_date, location_id) för öppna pass så två platser kan räknas parallellt.
  - `stock_count_lines`: `lot_id` (parti per rad) och tar bort beroendet av en rad per produkt+plats genom utökad unik nyckel (session, produkt, plats, parti).
  - `inventory_reports`: status `vantar_godkannande` tillåts, plus `approved_by` / `approved_at` / `count_session_id`.
  - GRANT + RLS enligt befintligt mönster (`is_staff() AND can_see_store(...)`).
- **Ny kod:**
  - `src/hooks/useMobileStockCount.ts` — pass per butik+plats, radsparning med localStorage-kö och återspelning mot databasen, avvikelseberäkning mot `product_stock_locations`.
  - `src/lib/inventorySubmit.ts` — bygger `inventory_reports` + `inventory_report_lines` med status `vantar_godkannande` (inga saldon skrivs).
  - `src/lib/inventoryApprove.ts` — godkännande som anropar befintlig `setBalance` (alltså `stock_movements`, orsak `inventering`) en gång per avvikande rad och sätter underlaget till godkänt.
  - `src/pages/CountMobile.tsx` + `src/components/inventory/mobile/` (StartCard, LocationCards, CountCard, NumberPad, Stepper, SummaryList, SubmitDialog, IntroSlides) med 56/64 px tryckytor, 18/24 px text och ingen horisontell scroll vid 390 px.
  - Godkännandekort i befintlig `Inventory.tsx` / `InventoryReportsDialog.tsx` för väntande underlag.
- **Oförändrat:** `setBalance`, `stockLedger.ts`, befintlig desktopvy `StockCount.tsx` (fortsätter fungera som idag).

## Bevis som körs och redovisas

1. Skärmbilder av hela flödet i 390 px bredd, utan horisontell scroll.
2. Uppmätta höjder på alla interaktiva ytor i flödet (krav 56 px).
3. Testräkning med minst 10 varor, varav en med två partier: underlag skapas med status Väntar på godkännande, och saldofrågor mot databasen visar oförändrade saldon.
4. Godkännande som butikschef: en rörelse per avvikande rad i `stock_movements` med orsak inventering, och saldon som stämmer efteråt.
5. Stängd flik mitt i räkningen, öppnad igen — alla rader kvar.
6. Försök att öppna ett utkast för en annan lagerplats/person visar att det inte går.
