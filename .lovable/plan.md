# Automatisk hämtning av Fortnox-post

## Steg du gör själv (först)
Öppna sidan Fortnox i Makrilltrade, hitta raden **Fisk & Skaldjursspecialisten AB (fsab-se)** och klicka **Koppla om**. Logga in i Fortnox som administratör och godkänn behörigheterna, inklusive **Digital inkorg**. Utan den godkända behörigheten kan inkorgsfilerna (PDF-fakturor med artikelrader) inte hämtas.

## Vad jag bygger

1. **Schemalagd hämtning varje timme**
   Ett schemalagt jobb kör `fortnox-inbox-intake` för fsab-se en gång i timmen (minut 20), med 7 dagars bakåtblick och en säker batchstorlek. Cirka 24 körningar per dygn, max ca 1 timmes fördröjning på inkommande post. En timme valt eftersom leverantörsfakturor inte behöver realtid – tätare körningar håller databasen vaken i onödan och ökar Cloud-kostnaden.

2. **CPU-säker batchning**
   Tidigare körningar avbröts av CPU-budget. Funktionen får en tidsbudget: när den närmar sig gränsen avslutar den snyggt, sparar var den kom och rapporterar "delvis klar", så nästa körning fortsätter där den slutade istället för att misslyckas.

3. **Synlighet i gränssnittet**
   På Fortnox-sidan visas senaste körning: tidpunkt, antal hämtade/sparade dokument och eventuellt fel. Om anslutningen saknar inkorgsbehörighet visas en tydlig varning med knappen "Koppla om".

4. **Ingen dubblettinläsning**
   Dokument matchas på Fortnox fil-id, så samma faktura läses aldrig in två gånger även om jobbet kör om samma period.

## Tekniska detaljer
- `cron.schedule('fortnox-inbox-hourly', '20 * * * *', ...)` med `net.http_post` mot `fortnox-inbox-intake`, body `{"entity":"fsab-se","days":7,"limit":25}`.
- Körningar loggas i `mail_intake_runs` (folder `fortnox:fsab-se`) — används som datakälla för statusvisningen.
- Tidsbudget i `supabase/functions/fortnox-inbox-intake/index.ts` (deadline-check i huvudloopen) plus `partial: true` i svaret.
- Behörighetsfel från Fortnox (saknad `inbox`-scope) mappas till ett tydligt statusfält på `fortnox_connections` istället för generiskt 400-fel.
