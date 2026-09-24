# Dagens avslut: bort från admins sidor, kvar per butik

## Vad som ändras
- **Butik:** raden "Kvar i dag" visas som i dag, men bara för den butik man är inloggad i.
- **Grossist:** raden visas bara för grossistens egen enhet (Grossist Göteborg), inte för alla butiker.
- **Admin:** raden syns inte längre högst upp på varje sida. I stället ligger en kompakt ruta "Dagens avslut" på startsidan (Översikt) med en rad per butik och grossist: namn, "2 av 4 klara" och de punkter som saknas som klickbara knappar. Butiker som är klara visas med grön bock.
- En liten siffra i sidomenyn vid Översikt visar hur många butiker som har något kvar, så admin ser läget utan att bli störd.

## Tekniskt
- `useDagsavslut`: filtrera på portal: shop → aktiv butik, production → grossistens butik(er), wholesale → alla.
- `AppLayout`: rendera `DayCloseBanner` endast när site är shop eller production.
- Ny komponent `DayCloseOverview` på startsidan för admin, återanvänder samma data och navigering med tillbaka-väg.
