# Del 1: Avatarstapel per butiksrad på Live personal

En kompakt stapel med de personer som är instämplade just nu, först i varje butiksrad på `/live-staff`, i samma visuella språk som "Arbetar nu"-kortet på Översikt (rund profilbild eller initialer, namn vid hover, färg efter status).

## Beteende

- Visar personer med status **Arbetar nu** (grön), **Rast** (gul) och **Avvikelse** (röd) — planerade/ej påbörjade och avslutade pass räknas inte in i stapeln.
- Max 4 avatarer, därefter en `+N`-bricka. Hover på `+N` listar resten med namn och status.
- Hover/fokus på en avatar visar namn, status och instämplingstid.
- Klick på en avatar (eller `+N`) öppnar butiksdetaljvyn för raden — samma vy som klick på butiksnamnet redan ger.
- Tom butik: en diskret grå platshållare "Ingen instämplad", inget mockinnehåll.
- Historiska datum: stapeln visar dagens faktiska pass som "avslutade" räknas bort, så för bakåtdatum visas platshållaren — status "nu" gäller bara idag.

## Data och realtid

Ingen ny datakälla. Samma aggregat som butiksdetaljvyn redan använder: `useLiveStaffDay` bygger `staffRows` per butik ur `staff_shifts` + `staff_planned_shifts`, med status från `src/lib/liveStaff.ts`. Profilbilder tas från personallistan (`profile_image_url`), initialer som fallback. Realtidsuppdateringen sker redan via den befintliga `live-staff-realtime`-kanalen — stapeln följer med utan omladdning.

## Filer

- Ny `src/components/livestaff/OnDutyAvatars.tsx` — stapeln, återanvänder statusfärgerna i `StatusChip`.
- `src/pages/LiveStaff.tsx` — renderar stapeln i butiksradens vänsterkolumn, ovanför/vid öppettidsraden, med `onSelect` kopplad till befintlig `setSelected`.

Inget annat ändras.

# Del 2: Förstudie personalkostnad och bemanningseffektivitet (bygger inget)

## (a) Lön/kostnad per anställd

Finns inte. `staff` har: `id, first_name, last_name, age, phone, email, workplace, profile_image_url, store_id, created_at, user_id, must_change_password, legal_entity_id`. Ingen timlön, inget avtal, ingen anställningsform, inget lönepåslag. `staff_shifts` har bara tider (`clocked_in_at`, `clocked_out_at`), inga kostnadsfält, och `staff_planned_shifts` är tom (0 rader).

Minimalt förslag när det ska byggas:
- `staff.hourly_rate numeric` (SEK/timme, nullable — inget defaultbelopp, ingen mockdata) plus `staff.rate_valid_from date` om historik behövs.
- Ett systemvärde för sociala avgifter/påslag i `system_settings` (t.ex. `payroll_overhead_pct`) i stället för hårdkodad procent.
- Personal utan satt timlön exkluderas ur kostnads-KPI:er och flaggas som "Timlön saknas" — aldrig en gissad siffra.
- Vill man senare ha avtal per period krävs en egen tabell `staff_pay_rates` (personal, timlön, gäller från/till); fältet på `staff` räcker för nuläget.

## (b) Omsättning per butik och tidsperiod

Tre olika källor finns, med olika upplösning:

1. `daily_reports` — per butik och datum: `gross_sales`, `net_sales`, `receipt_count`, `largest_sale`. Dagsupplösning, manuellt inmatad. 5 rader idag. Bäst för dag/vecka/månad-jämförelser, men inte "live per timme".
2. `pos_transactions` — per transaktion: `occurred_at`, `store_id`, `total_ore`, `status`, `payment_method`, `reversed_transaction_id`. Detta är den enda källan som kan ge omsättning per timme/live. 2 rader idag (kassan är i praktiken inte i drift ännu).
3. `customer_orders` — per order: `store_id`, `wanted_date`, `estimated_total`, `total_incl_vat`, `status`. Beställd försäljning, inte kassaomsättning; kan användas som komplement men ska inte blandas in i samma summa.

`shop_reports` (0 rader) innehåller bara lager, ingen omsättning.

Slutsats: dagsnivå går att aggregera direkt ur `daily_reports` redan idag; timupplöst live kräver att kassan (`pos_transactions`) faktiskt används. Vi bör därför bygga KPI-lagret med en tydlig källhierarki (POS när det finns data för perioden, annars dagsrapport) och visa vilken källa siffran kommer ur.

## (c) Föreslaget KPI-lager

Modulärt och separerat från vyerna, så Live personal kan byggas ut utan omskrivning:

```text
src/lib/staffKpi.ts        rena funktioner, inga anrop:
                           laborMinutes(shifts) -> minuter
                           laborCost(minutes, rate, overheadPct) -> SEK
                           costRatio(cost, revenue) -> %
                           efficiency(revenue, minutes) -> SEK/arbetad timme

src/hooks/useRevenue.ts    omsättning per butik/period med källhierarki
                           (pos_transactions -> daily_reports) + källmarkering

src/hooks/useStaffKpi.ts   kombinerar useLiveStaffDay + useRevenue + timlöner
                           och returnerar per butik: workedMinutes, laborCost,
                           costPct, revenuePerLaborHour, missingRateCount
```

Live personal konsumerar bara `useStaffKpi` — befintliga `useLiveStaffDay` och `liveStaff.ts` lämnas orörda, så tidslinjen och avvikelselogiken påverkas inte. Samma hook kan sedan återanvändas på Översikt och i veckorapporter.

Del 2 implementeras inte nu — jag väntar på ditt godkännande av fält och källhierarki.
