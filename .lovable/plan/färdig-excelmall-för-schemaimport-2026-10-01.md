# Färdig Excelmall för schemaimport

Caisa ska få en ifylld exempelfil som går att importera direkt i schemavyn.

## Vad filen innehåller
- Ett blad per butik ("Fiskskaldjur Eriksberg", "Ålstens Fisk" osv.).
- På varje blad står alla som har jobbat i butiken de senaste 30 dagarna. Underlaget är stämplingar, Personalkollen-tider och planerade pass.
- En exempelrad per person för nästa vecka (måndag 5 okt). Raden har datum, starttid 09:00, sluttid 17:00, 30 min rast, anställningsnummer, fullständigt namn och butikens fullständiga namn. Raderna är märkta "EXEMPEL – ändra eller ta bort".
- Ett blad "Instruktion" på svenska som förklarar kolumnerna. Där står att anställningsnummer är viktigast och att lediga dagar ska lämnas bort.
- Ett blad "Personal" med namn, anställningsnummer och butik. Det används som uppslag.
- Personer utan anställningsnummer markeras gult så att Caisa ser vilka som kan behöva kopplas för hand.

## Undantag
- Testpersoner tas inte med.
- Personnummer tas inte med.
- Ingen data i systemet ändras.

## Leverans
- Filen heter `schemamall-2026-10.xlsx` och läggs bland Filer för nedladdning.
- Innan den lämnas ut kontrolleras att kolumnerna stämmer med importens mall.

## Tekniskt
- Läsfrågor: aktiva anställda med time_entries, pk_logged_times eller staff_planned_shifts/shifts sedan 2026-09-01, plus anställning och butik. Personer med is_test exkluderas.
- Filen byggs med openpyxl i Arial med kolumnerna: datum, starttid, sluttid, rast_min, anstallningsnummer, personnummer (tom), namn, enhet, skifttyp, notering.
