# Nimpos — driftsättning butik för butik (Etapp 5)

Skarp driftsättning sker en butik i taget. Nästa butik startar först när
föregående butik klarat hela checklistan två dagar i rad.

## Ordning

1. Ålsten (alsten) — DE No 1 AB
2. Kungsholmen (kungsholmen) — DE No 1 AB
3. Torslanda Torg (torslanda-torg) — Fisk & Skaldjursspecialisten No 1 AB
4. Torslanda Amhult (amhult) — FSAB
5. Särö (saro) — FSAB

## Före start (per butik)

- `nimpos_store_map` har rätt `store_code` → butik, `active = true`.
- Butiken har lagerplats **Försäljningslager** med sublager per kategori.
- Artikelregistret i kassan använder våra SKU:er (reserv: streckkod).
- Prislista för butikens bolag är markerad **Gäller i kassan** och pushkön är tom
  (Kassa live → Priser → Pushkö = 0 väntande, 0 misslyckade).
- Secrets satta: `NIMPOS_WEBHOOK_SECRET` (mottagning), `NIMPOS_API_KEY` +
  `NIMPOS_PUSH_URL` (prispush), läs-API-nyckel för nattavstämning.

## Testplan (körs i testläge, `test: true` i payloaden)

Kör kontraktets fem testkvitton mot butiken:

| # | Fall | Godkänt när |
|---|------|-------------|
| 1 | Kortköp | kvitto i registret, `stock_movements` mot FEFO-parti, saldo minskat |
| 2 | Kontantköp | betalningsfördelning kontant, momsrader stämmer |
| 3 | Blandbetalning | summa betalningar = kvittototal |
| 4 | Viktvara, tre decimaler | kvantitet oavrundad, enhet = produktens enhet |
| 5 | Retur (`reverses_external_id`) | motrörelse in på samma parti som drogs |

Plus:

- Omsändning av samma `X-Nimpos-Event-Id` → svar `duplicate: true`, inga dubbla rörelser.
- Statusuppslag (GET med signatur) per `external_id` svarar `booked`.
- Okänd `store_code` → `parked unmapped_store`, aldrig 5xx.
- Tidsstämpel äldre än 300 s → 400 `stale_timestamp`.
- Testkvitton syns märkta **Test** i kvittolistan och rör inte skarpt lager.

## Skarp start (dag 1)

1. Slå av testläge i kassan.
2. Följ Kassa live under första öppettimmen: kvitton ska tickas in i realtid.
3. Kontrollera Systemstatus → Kassa: ingen tystnad > 60 min, 0 avvisade anrop.
4. Vid dagens slut: jämför Dagsrapportens förifyllda försäljning mot kassans
   egen dagrapport — differens ska vara 0 kr.
5. Morgonen efter: nattavstämningen (03:15) ska visa 0 saknade `external_id`.

## Avbrytskriterier

Pausa butiken och felsök innan nästa butik om något av detta inträffar:

- Avvikelse mellan kassans dagrapport och `pos_transactions` > 0 kr.
- Fler än 2 % omatchade rader.
- Enhetsavvikelser på viktvaror.
- Tystnad i kassan under öppettid utan känd orsak.
