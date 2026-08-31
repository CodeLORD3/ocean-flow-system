# Väderkolumn i sälj-/orderrapporterna

Lägg till en kolumn "Väder" direkt bredvid försäljningssiffran per dag och butik i rapporterna (dag-för-dag-tabellen under vecko- och månadsrapport), samt i PDF/Excel-exporten.

## Vad som byggs

1. **Butiksposition (geokodning en gång per butik)**
   - Nya kolumner på butiksregistret: `latitude`, `longitude`, `weather_timezone`, `geocoded_at`.
   - Backend-funktion slår upp orten via `geocoding-api.open-meteo.com/v1/search?name={stad}` (butikerna har städerna Göteborg, Stockholm, Marstrand, Zürich, Morges) och sparar lat/long + tidszon (`Europe/Stockholm` för SE, `Europe/Zurich` för CH).
   - Saknad/felaktig träff kan rättas manuellt genom att sätta lat/long på butiken.

2. **Väderhämtning med cache**
   - Ny tabell `store_weather_daily` (butik, datum, min/max-temp, nedbörd, max vind, weathercode, text, källa `archive`/`forecast`, hämtad-tid) med RLS + GRANTs så personal kan läsa.
   - Backend-funktion `store-weather` hämtar saknade dagar per butik och datumintervall:
     - datum i förfluten tid → `archive-api.open-meteo.com/v1/archive`
     - dagens datum och framåt → `api.open-meteo.com/v1/forecast`
     - fält: `temperature_2m_max, temperature_2m_min, precipitation_sum, windspeed_10m_max, weathercode`
   - Historiska dagar cachas permanent; prognosdagar uppdateras om de är äldre än ett par timmar (arkivdata skriver över prognosen när dagen passerat).

3. **Tolkning av WMO-kod till svensk text**
   - 0 → Klart, 1–3 → Halvklart/Molnigt, 45/48 → Dimma, 51–67 → Regn, 71–77 → Snö, 80–82 → Regnskurar, 95–99 → Åska, övrigt → Okänt.
   - `windspeed_10m_max > 30 km/h` visas som "Blåsigt" oavsett kod.
   - Visning: `"Klart, 24°C"`, `"Blåsigt, 14°C"` (max-temp avrundad till heltal). Saknas data visas "—".

4. **UI och export**
   - `StoreWeekDays` (dag-för-dag under vecko- och månadsrapport) får kolumnen **Väder** direkt efter nettoomsättningen.
   - PDF- och Excel-exportens dagtabell får samma kolumn.
   - Väderdata hämtas per butik + datumintervall och blockerar inte rapportens rendering (visas när den kommit).

5. **Licens/kommersiellt bruk**
   - Open-Meteos gratisnivå gäller endast icke-kommersiellt bruk. Funktionen byggs så att en betald API-nyckel kan användas: om hemligheten `OPEN_METEO_API_KEY` finns anropas `customer-`-endpointerna med `apikey`, annars gratisnivån. Nyckeln läggs in när abonnemanget (Professional för historik) är på plats.

## Teknisk sammanfattning

- Migration: kolumner på `stores`, ny tabell `store_weather_daily` (unikt index på butik+datum), GRANTs och RLS-policy för inloggad personal.
- Edge function `store-weather`: input `{ store_id, start_date, end_date }`, geokodar butiken vid behov, hämtar saknade dagar från arkiv/prognos, upsertar cachen och returnerar raderna.
- Ny hook `useStoreWeather(storeId, from, to)` (React Query) + hjälpfil för WMO-tolkning och etikettformatering.
- Ändrade filer: `src/components/reports/StoreWeekDays.tsx`, `src/lib/weeklyReportExport.ts` (DAY_HEAD + rader), `src/lib/weeklyReportDays.ts` (typ utökas med väderfält).
