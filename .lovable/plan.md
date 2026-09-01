# Koppla FSAB:s anställda från Fortnox — stegvis

## Nuläge (kontrollerat i systemet nu)

- FSAB (`Fisk & Skaldjursspecialisten AB`) är **redan kopplat** mot Fortnox, och behörigheten omfattar lön (`salary`). Ingen ny inloggning behövs.
- DE No.1 AB är inte kopplat (påverkar inte lönekedjan för FSAB).
- Lönearter är redan mappade: 79 rader per bolag.
- Lönepolicyer finns (8 rader).
- **Det som saknas:** samtliga 26 aktiva FSAB-anställningar saknar Fortnox anställningsnummer. Det är exakt det som stoppar exporten ("Fortnox-anställningsnummer saknas").
- Ingen löneperiod är beräknad ännu.

Eftersom FSAB har alla anställda på fil i Fortnox ska numren hämtas därifrån istället för att skrivas in för hand.

## Steg 1 — Hämta anställda från Fortnox

Ny funktion som läser FSAB:s anställda från Fortnox Lön (namn, anställningsnummer, personnummer, anställningsdatum, status) och sparar dem i en egen tabell som en spegel av Fortnox-filen. Fortnox är master; vi ändrar inget hos dem.

## Steg 2 — Automatmatchning mot personalregistret

Matchning i tur och ordning:

1. Personnummer (säkraste träffen) — hashat/maskerat i gränssnittet enligt befintlig personnummerrutin.
2. Efternamn + förnamn.
3. Ingen träff → hamnar i en manuell kö.

Träffar med personnummer föreslås som bekräftade, namnträffar visas som förslag att godkänna.

## Steg 3 — Importdialog i Fortnox-inställningar

Ny flik "Anställda" bredvid Kundmatchning och Fakturajobb:

- Knapp "Hämta anställda från Fortnox".
- Lista: Fortnox-anställd | föreslagen Makrilltrade-person | matchmetod | status.
- Kryssa/justera och "Koppla valda" → skriver anställningsnummer på den aktiva anställningen.
- Rader utan träff kan kopplas manuellt via sök, eller lämnas för att först läggas upp i personalregistret.
- Räknare högst upp: "26 av 26 anställningar saknar anställningsnummer" som går mot noll.

## Steg 4 — Genomgång av kvarvarande luckor

Efter körningen visas en tydlig lista på:

- Fortnox-anställda som inte finns i Makrilltrade.
- Makrilltrade-anställningar som inte finns i Fortnox.
- Dubbletter (samma nummer på två personer blockeras).

## Steg 5 — Provkörning av lönekedjan

Med numren på plats kör vi igenom en period i granskningsvyn: Beräkna period → felkön ska vara tom → Markera granskad → hämta **PAXml 2.2** som fil först (rör inte Fortnox), kontrollera timmar/OB/dagar mot journalen, och först därefter Skicka till Fortnox.

## Teknisk detalj

- Ny edge function `fortnox-import-employees` som anropar Fortnox `/3/employees` (paginerat) med befintlig tokenhantering (`fortnox_read_tokens`, `fortnox-refresh`), samma mönster som `fortnox-import-customers`.
- Ny tabell `fortnox_employees` (legal_entity_code, employee_id/anställningsnummer, förnamn, efternamn, personnummer, anställningsdatum, inaktiv-flagga, payload jsonb, synced_at) med GRANT + RLS enligt bolagsbehörighet (`is_staff()` + `can_see_company()`), samt `fortnox_employee_map` för kopplingen mot `employments`.
- Matchning i en `SECURITY DEFINER`-funktion så personnummerjämförelsen sker i databasen utan att personnummer exponeras i klienten; uppslag via befintlig `lookup_employee_by_pnr`-logik.
- Bekräftad koppling skriver `employments.fortnox_employee_id` (och `employment_number`) på den aktiva anställningen; unikt index per bolag för att förhindra dubbletter.
- Frontend: ny flik i `src/pages/FortnoxSettings.tsx` plus `FortnoxImportEmployeesDialog.tsx` i samma stil som kundimporten; hook i `src/hooks/usePayroll.ts` eller ny `useFortnoxEmployees.ts`.
- Inga ändringar i `payroll-compute` eller `fortnox-payroll-export` behövs — de läser redan `employments.fortnox_employee_id`.

## Utanför detta uppdrag

- DE No.1 AB-anslutningen.
- Ändringar av lönearter (redan mappade).
- Skarp lönekörning/utbetalning — det görs i Fortnox Lön.
