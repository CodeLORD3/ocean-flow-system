## Teknisk genomgång

**Inställningar (nytt).** Fyra procentsatser läses via ett nytt hook `useMarginSettings`:
`vat_pct` (6), `gross_margin_pct` (35), `other_cost_pct` (standard sätts till 0 tills värde finns) och `profit_target_pct` (gemensam nivå). Globala standardvärden lagras i `system_settings`; per-ställe-override stageas som en additiv kolumnuppsättning på butikstabellen (`margin_overrides` jsonb) i en migrationsfil under draftens `migrations/`-mapp. Överskrivningarna finns först när draften accepteras — tills dess används de globala satserna, och koden skrivs så att saknad kolumn inte kraschar.

**`src/hooks/useWeekdayStaffNeed.ts`.** `computeNeedForDay` byter budgetkälla: i stället för `averageRevenue × limitPct/100` beräknas

```text
net    = revenue / (1 + vat/100)
gross  = net * grossMargin/100
budget = gross - net * (otherCost + profitTarget)/100
```

Är `budget <= 0` returneras `hours: 0` med källa `"utan utrymme"` (ny variant i `StaffNeedSource`) i stället för null, så planeraren kan visa att kalkylen inte lämnar plats för personal. Historikklämman ±25 % och omräkningen till personer via snittpass behålls oförändrade. Signaturen tar ett `margins`-objekt i stället för `limitPct`.

**`src/pages/SchedulePlanner.tsx`.** Skickar `margins` till hooken. Behovsradens tooltip byggs om till hela kedjan i kronor: försäljning → netto → bruttovinst → avdrag → lönebudget, plus antal underlagsdagar och använd timkostnad. Raden "Snittförsäljning" behålls, och 20 %-taket kvarstår enbart som varningsgräns på personalkostnadsraden.

**Verifiering.** Typecheck, ett enhetstest på `computeNeedForDay` med talen 42 000 / 6 % / 35 % så kedjan är räknebar, och en inloggad genomgång av `/schedule-planner` för Amhult och Eriksberg med skärmbild av behovsraden.
