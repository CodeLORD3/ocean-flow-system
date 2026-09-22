## Teknisk del

- Utöka `dagsavslut_status(_store_id, _day)` med `grossistorder_klar` och `inkop_klar`.
  - Grossist: `store_replenishment_orders` med `sent_at is not null` för nästa leveransdag, eller en kvittering.
  - Inköp: dagens inköpsrader hanterade, eller en kvittering.
- Ny tabell `dagsavslut_kvitteringar` (butik, dag, vad, vem, när, notis) med RLS och grants för "inget att beställa"/"inget att köpa in". Additiv och tillämpas när utkastet accepteras — den finns alltså inte i utkastets förhandsvisning förrän du accepterar.
- `src/lib/dagsavslut.ts`: `dagsavslutText` byggs om till `dagsavslutPoster()` som returnerar `{ nyckel, etikett, klar, sida }`, så banner, notis och utstämplingsruta använder samma källa. Gamla textfunktionen behålls som omslag.
- Ny `src/components/DayCloseBanner.tsx` + hook `useDagsavslut(storeIds)`; monteras i `AppLayout` intill `TaskAlertBanner`, döljs i räkningens helskärmsflöde. Butiksvy = aktiv butik, grossist/kontor = alla aktiva butiker (ej Administration/Testbutik).
- Invalidering av statusen när dagsrapport sparas, räkning godkänns, beställning skickas eller kvittering görs.
- Utstämplingen i `src/pages/StaffProfile.tsx`, `src/components/staff/OnDutyStaff.tsx` och `src/pages/Clock.tsx` visar en kvarstående ruta med de fyra punkterna i stället för en flyktig toast; kvittot i Clock får längre visningstid.
- `inventering_paminnelse()` utökas med de två nya punkterna; schemat `dagsavslut-paminnelse-daglig` går från en gång 16:00 UTC till tre tider (08:00, 12:00, 16:00 UTC) med samma dubblettskydd per butik, dag och portal.
- Ditt öppna pass i Amhult från i dag ligger kvar — säg till om du vill att jag stämplar ut det på rätt tid.
