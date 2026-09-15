# Personal & Schema: ny design och nytt arbetsflöde

Målet är att personalmodulen ska se ut och kännas som referensbilderna: ljus bakgrund, vita kort med mjuka hörn och lätt skugga, pastellfärgade ikonrundlar, luftig rubriktypografi och tydliga gröna/röda statusmärken. Dagens sida är byggd i det mörka, täta "industri"-språket med kondenserad text och tabellinjer — därför känns den gammal och svårjobbad. Det är hela anledningen: två olika designspråk, inte trasig funktion.

Ingen ändring i lön, tidberäkning, behörigheter eller databas. Bara utseende, struktur och navigering.

## Vad som ändras i upplevelsen

1. **Startsida istället för länksamling.** `/personal` blir en riktig startvy: fem nyckeltalskort (försäljning, personalkostnad, personalkostnad %, arbetade timmar, försäljning per arbetad timme) med jämförelse mot historik, och därunder "Dagens pass" grupperat per bolag och butik med personbild, tid, status (Instämplad) och arbetad tid.
2. **Färre flikar.** Dagens 16 poster grupperas till fem: Start, Schema, Tider, Analys, Personal. Allt som finns idag nås fortfarande — det ligger som undermeny inne i respektive flik istället för i en lång rad.
3. **Schema** får Personalkollens veckolayout: sammanfattningsrader (schemalagt, personalkostnad, prognos) per bolag och butik som kan fällas ihop, dagkolumner med markerad idag-kolumn och röd söndag, och passblock med färgpunkt per grundpass.
4. **Tider** blir avstämningsvy: månadskalender till vänster med avvikelsemarkeringar, dagslista till höger med Schema (klockslag/timmar), Arbetad tid (klockslag/timmar) och Frånvaro, samt knappar för att lägga till arbetstid eller frånvaro.
5. **Analys** får kort + kombinerat diagram (staplar för personalkostnad, linje för resultat) med jämförelseläge historik/prognos/ingen.
6. **Personal** blir en lista grupperad per butik och roll med anställningsnummer, namn, personnummer och statusmärken, plus filter för aktiv/framtida anställning och sortering.

Allt görs responsivt: korten staplas, veckorutnätet skrollar horisontellt inuti sin egen ram och kalender/dagslista blir staplade på telefon.
