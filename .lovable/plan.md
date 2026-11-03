# Inköpsmailkorgen hämtar inte ny post av sig själv

## Vad jag hittade
- Mailkorgen läses bara när någon trycker på hämta-knappen. Det finns inget schema som hämtar ny post automatiskt.
- Mellan 23 oktober och idag (3 november, 09:15) gjordes ingen hämtning alls. Därför kom inga nya följesedlar in under den tiden.
- När det hämtades idag fungerade det: "LEV 3 NOVEMBER" och "Följesedel 2026-11-03" lästes in och tolkades.
- Varje hämtning tar bara de 2 senaste olästa mejlen. Om fler mejl kommer in mellan två hämtningar blir de äldre liggande.
- Två tidigare körningar avbröts för att de tog för mycket datorkraft (23 okt och 26 sep). Det fanns inget som provade igen.
- Det ligger 354 olästa mejl i inkorgen. De flesta saknar bilaga och lämnas medvetet orörda, så att en människa ser dem.

## Ändringar
1. Lägg till automatisk hämtning var 10:e minut, 05:00–20:00 svensk tid, med samma funktion och samma inställningar som knappen.
2. Spärra så att två hämtningar aldrig körs samtidigt. Mejl som redan är inlästa hoppas över som idag, så inget blir dubbelt.
3. Låt varje körning fortsätta med nästa olästa mejl med bilaga tills det tar slut eller tiden är ute. Det som blir kvar tas i nästa körning, och ingenting hoppas över.
4. Om en körning avbryts tas samma mejl igen i nästa körning.
5. Visa på mailkorgssidan när senaste hämtning gjordes och om den misslyckades.

## Det här ändras inte
Inget bokförs, inga mejl raderas och tolkningen av följesedlar är densamma. Lagret ändras inte förrän en människa godkänner.

## Teknisk sammanfattning
- Schemaläggning anropar `mail-intake` på samma sätt som knappen.
- Lås med lease i `mail_intake_runs`.
- Hämtningen går från äldsta till nyaste bland mejl med bilaga, med tidsbudget och kontrollpunkt efter varje mejl.
- Test: lås, ordning och att en avbruten körning tas om.
