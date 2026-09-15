# Schema: vecka och dag enligt ritningen

Målet är att Schema-fliken ska se ut och arbeta som den uppladdade ritningen "Två vyer, en sanning": veckovyn svarar på om bemanningen räcker och om avtalet hålls, dagvyn svarar på vem som kommer, vem som går och när vi står tomma. Allt bygger på befintliga pass, stämplingar, frånvaro och löneuppgifter — ingen ny beräkningslogik för lön.

## Så ser sidan ut efter ändringen

**Toppen (samma för båda vyerna)**
- Rubrik "Schema" med underrad: vecka, datumintervall, antal enheter och bolag.
- Växlaren Vecka / Dag direkt intill rubriken, i mörkblått för valt läge.
- Till höger tre siffror i rad — schemalagda timmar, lönekostnad, kräver åtgärd (rött tal) — och knappen "Publicera vecka NN".
- En smal grå rad under: driftställen med grå monokoder (B03, GRO …) och en förklaringsrad med prickar för Publicerat, Utkast, Regelbrott och streckad ruta för Öppet pass.

**Veckovyn**
- Personkolumn till vänster (namn + anställning), sju dagkolumner, helgen tonad, dagens kolumn markerad.
- Passen som vita block med tunn ram och 3 px färgad vänsterkant; tid i monospace, driftställe under. Regelbrott får hel röd ram.
- Höger kolumn "Mot avtal" visar 40,0 / 40 och markerar mertid.
- Sista raden "Täckning mot behov" per dag, t.ex. 4/4 och "1 saknas" i rött.
- Klick på ett pass öppnar en panel till höger: valt pass, enheter och avtal (delat pass med tider per enhet), konsekvens i kronor och veckotimmar, samt regler — dygnsvila och veckovila med förslag på åtgärd.

**Dagvyn**
- Timaxel 04–18, en rad per person med initialer, passblock på axeln, rast och enhetsbyte i blocket.
- Nederst "Bemanning mot behov per timme" med markerad lucka, t.ex. 11–12 · 1 saknas.
- Panel till höger "Kommer och går": kronologisk lista med tid, namn, kommer/går/byter till, och konsekvenstext under.

## Färg och form
Färg används bara för status. Enheter får grå monokoder. Prick plus ord i stället för färgad text. Siffror i monospace med tabellsiffror. Ljus bakgrund, vita kort, tunna linjer — samma ljusa personaldesign som redan finns.
