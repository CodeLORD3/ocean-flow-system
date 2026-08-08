# Fix: instämpling fungerar inte när en gammal stämpling ligger öppen

## Vad som faktiskt hände

Tim har en stämpling som aldrig stängdes: instämplad **6 augusti 09:36** på **Fiskskaldjur Amhult**, `clocked_out_at` är fortfarande tom. Totalt ligger **3 sådana gamla öppna stämplingar** i databasen.

Instämplingen gör en dubbelstämplingskontroll som letar efter *vilken som helst* öppen stämpling — utan datumgräns. Hittar den en, avbryter den tyst och returnerar den gamla stämplingens id som om allt gick bra. Gränssnittet läser däremot bara **dagens** stämplingar, så Tims gamla rad från 6 augusti syns inte. Resultat: knappen ger ingen effekt, ingen felruta, och kortet står kvar på "Ingen instämplad". Samma sak händer i alla butiksportaler och på personalens profilsida, eftersom de använder samma logik.

Nattjobbet som ska stämpla ut alla vid dygnsskiftet är schemalagt och aktivt, men de tre gamla raderna finns kvar — de skapades innan jobbet började köra och städas inte av det, eftersom jobbet bara stänger dagen som just passerade.

## Vad som ska göras

1. **Instämpling får aldrig misslyckas tyst.**
   - Dubbelstämplingskontrollen begränsas till dagens stämplingar, precis som resten av gränssnittet läser.
   - Ligger en stämpling öppen från en tidigare dag stängs den automatiskt vid instämpling (satt till slutet av den dagen), och en ny stämpling skapas för idag i den butik man står i.
   - Är man redan instämplad idag i **en annan butik** flyttas stämplingen dit man stämplar in: den gamla stängs och en ny öppnas — med en tydlig bekräftelse i rutan innan, så det inte sker av misstag.
   - Är man redan instämplad idag i **samma butik** visas ett informationsmeddelande i stället för tystnad.

2. **Städa de tre gamla raderna** så att ingen sitter fast: stäng dem vid slutet av respektive arbetsdag.

3. **Nattjobbet görs självläkande** — det stänger alla öppna stämplingar som startade före dagens datum, inte bara igår, så en missad natt inte låser någon.

4. **Kontroll att det fungerar i alla butiksportaler**: instämpling och utstämpling provkörs mot Eriksberg och ytterligare en butik, och det verifieras att personen dyker upp under "Arbetar nu" i rätt butik och inte i de andra.

## Tekniskt

- `src/hooks/useStaffShifts.ts`: `useClockIn` får datumgräns i dedupe-frågan, stänger gamla öppna pass, hanterar butiksbyte och returnerar ett resultat som säger vad som hände (`created` / `moved` / `already`) så gränssnittet kan visa rätt meddelande.
- `src/components/staff/OnDutyStaff.tsx` och `src/pages/StaffProfile.tsx`: visar meddelande utifrån resultatet, samt bekräftelsetext när stämplingen flyttas från en annan butik.
- Databasuppdatering: stäng de 3 kvarliggande öppna stämplingarna.
- `supabase/functions/auto-clock-out-shifts/index.ts`: stäng allt som startat före dagens datum.
