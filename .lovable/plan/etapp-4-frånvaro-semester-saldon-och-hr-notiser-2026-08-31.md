# Etapp 4 — frånvaro, semester, saldon och HR-notiser

## Mål
Slutföra etapp 4 ovanpå den redan skapade HR-datamodellen: personal kan ansöka om frånvaro, chef kan hantera kön och saldon, och HR-händelser kan levereras som in-app-notiser samt via e-post/SMS enligt preferenser.

## Genomförande
1. **Notifieringsfunktionen**
   - Skapa `notify` som autentiserar anrop, validerar mall/mottagare/payload och använder befintlig `hr_notify`-logik.
   - Läsa Loopia-/46elks-credentials från Vault via secrets, aldrig från klientkod.
   - Implementera kanalpreferenser, deduplicering, max ett SMS per händelse/mottagare, säkra svenska mallar och bounded retry för enbart tillfälliga leveransfel.
   - Returnera tydliga fel och spara varje kanalhändelse i `hr_notifications`.

2. **Återanvändbart frontend-lager**
   - Bygga Industry-baserade hooks för `absence_requests`, `vacation_balances`, `comp_balances`, `sick_periods`, `hr_notifications` och preferenser.
   - Lägga till en personalvy under Mina pass för frånvaroansökan, snabb sjukanmälan, egna statusar och saldo.
   - Lägga till en chefsvy med SideQueue för väntande ansökningar, saldoförhandsvisning, konfliktinformation mot publicerade pass, beslut och beslutskommentar.
   - Lägga till saldo-/sjukperiodsvy för behöriga chefer/admin med historik och manuella justeringar där backendreglerna tillåter det.
   - Koppla HR-notiser till ett återanvändbart notiscenter i toppbaren, inklusive olästa räknare, markera läst och länk till rätt vy.
   - Registrera routes och sidebarposter utan att ändra befintliga affärsflöden.

3. **Integrationer och regler**
   - Visa och länka schemakrockar till berört pass.
   - Visa sjukperiodens återinsjuknande, karensräknare och dag-15-varning utan att exponera hälsodetaljer i SMS/e-post.
   - Koppla frånvarobeslut till attestvyn och visa frånvaroreferens när en missad schemarad löses.
   - Visa semesterår, intjänade/uttagna/sparade dagar och varningar för förfall enligt befintliga databasfunktioner.

4. **Körbevis a–j**
   - Testa mobil ansökan → chefsbeslut → saldo före/efter.
   - Testa schemakrock, sjukperiodens återöppning/ny period, dag 15, attestkoppling och semesterårsskifte.
   - Skicka ett verkligt testmeddelande till Baldvin efter explicit kontroll av mottagare och verifiera `sent` i `hr_notifications`.
   - Genomföra RLS-verifiering med två autentiserade användare för anställd-/enhetsisolering.
   - Verifiera avstängd SMS-preferens, att inget SMS-försök loggas, samt att testposter och testnotiser städas/voidas.

## Tekniskt
- Endast Lovable Cloud-funktioner, befintliga tabeller/RPC:er och Industry-primitiver används.
- Ingen löneberäkning eller nya Zollikon-regler.
- Ingen personnummerdata i UI-notiser, e-post eller SMS.
- Alla edge function-svar inkluderar CORS, input valideras och alla anrop testas mot den riktiga funktionen innan etappen rapporteras som klar.
- Backendändringar begränsas till det som krävs för notifieringsfunktionen och verifierad säkerhet; inga klienthemligheter eller hårdkodade credentials.