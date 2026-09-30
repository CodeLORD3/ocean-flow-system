# Veckorapporter – läget och det som återstår

Datamodellen, regionmappningen och regelmotorn från den tidigare planen är redan byggda och körs i dag. Planen nedan beskriver dem i klartext och tar bara upp det som behöver rättas.

## Det som redan finns

- **Butiksfält:** varje butik har en region och en "veckans sista öppetdag" (i dag söndag för alla).
- **Veckorapport per butik och ISO-vecka:** 59 rader från vecka 32 (3 aug) till vecka 40. 57 är låsta, 2 pågår (innevarande vecka). 26 är markerade som korrigerade efter omfördelningen av Personalkollen-timmar. Inga avvikelser efter låsning.
- **Region och Sverige totalt:** räknas fram vid läsning, med status Klar/Preliminär, saknade butiker och skillnad mot förra veckan.
- **Regelmotor:** varje sparad dagsrapport räknar om butikens vecka. Veckan låses när dagen är butikens sista öppetdag eller senare. En låst vecka skrivs aldrig om; ändras en gammal dagsrapport markeras "avviker efter låsning" med skillnaden. Dessutom låses kvarvarande veckor måndag kl. 12 (Stockholm) som reserv.
- **"Stängd denna vecka"** per butik finns och räknas som klar.

## Regionmappning i dag

| Butik | Region |
|---|---|
| Torslanda Torg, Amhult, Eriksberg, Särö Centrum, Marstrand | Göteborg |
| **Grossist Göteborg** | **Göteborg** (avviker från den tidigare planen) |
| Kungsholmen, Ålstens Fisk | Stockholm |
| Zollikon, Morges Market | Schweiz |
| Administration DE No.1, Testbutik Inventering | ingen (ingår inte) |

Sverige totalt = Göteborg + Stockholm.

## Ändringar att godkänna

1. **Ta bort Grossist Göteborg ur regionen**, så som den tidigare planen sa, så att grossistens siffror inte räknas in i Göteborg och Sverige totalt. Veckorna räknas om; redan låsta veckor får en avvikelsemarkering i stället för att skrivas om.
2. **Sista öppetdag:** ligger kvar som söndag för alla butiker tills du säger något annat.
3. **Regeln "sparad dagsrapport = attesterad"** gäller som den redan fungerar. Ingen ny knapp eller status.

Inget nytt läggs till i vyn i det här steget.

## Tekniska detaljer

- Uppdatera data: `stores.region = null` för Grossist Göteborg (dataändring, ingen ändring av tabellstrukturen).
- Kör `recompute_weekly_store_report` för grossistens veckor. Vyn `weekly_region_reports` räknas om av sig själv vid läsning.
- Tabellstrukturen, triggern på `daily_reports` och schemat för måndagslåsningen lämnas orörda.
