# GFA-följesedeln fastnade som dubblett

## Vad som hänt

Följesedeln GFA_Följesedel_2026-09-17.pdf lästes in korrekt från mejlslingan (mejlet ligger som behandlat, filen är tolkad och kopplad till rätt leverantör). Men den fick status "dubblett" och attestkorgen visar bara dokument med status "utkast". Därför syns den i mejlslingan men inte bland dokument som väntar på attest.

Orsaken: dubblettspärren jämför leverantör + dokumenttyp + dokumentnummer. För GFA blir det utlästa dokumentnumret samma korta siffra ("10") på varje följesedel, så nya GFA-följesedlar matchar en gammal, redan attesterad följesedel från 2026-08-05 och stoppas. Samma sak har hänt tidigare dagar: 2026-09-02, 2026-09-03, 2026-09-08, 2026-09-16 och 2026-09-17 ligger alla som dubbletter trots att de är olika leveranser.

## Åtgärder

1. Skärp dubblettspärren så att den kräver riktigt lika dokument: samma leverantör, samma dokumenttyp OCH samma dokumentdatum. Ett dokumentnummer som bara är en kort siffra utan datum får inte längre ensamt utlösa dubblettstopp. Samma regel i både mejlslingan och Fortnox-inläsningen.
2. Filhashkollen behålls oförändrad — exakt samma fil ska fortsätta stoppas.
3. I fliken "Dubbletter och fel" läggs en knapp till: "Är ingen dubblett — skicka till attest". Den visar vilket dokument systemet trodde var samma, och flyttar dokumentet tillbaka till attestkorgen. Handlingen loggas i historiken.
4. Rätta de befintliga felaktigt stoppade GFA-följesedlarna (2026-09-02, 09-03, 09-08, 09-16, 09-17) så att de hamnar i attestkorgen igen, med dokumentdatum som dokumentnummer. Inget bokförs automatiskt — personal attesterar som vanligt.
5. Kontroll efteråt: attestkorgen ska visa de återställda följesedlarna, och en ny inläsning av exakt samma fil ska fortfarande stoppas som dubblett.

## Tekniska detaljer

- `supabase/functions/mail-intake/index.ts` och `supabase/functions/fortnox-inbox-intake/index.ts`: dubblettmatchningen villkoras på `supplier_id` + `doc_type` + `document_date` (och `document_number` när det finns och är datumlikt). `maybeSingle()` byts mot `limit(1)` för att undvika fel när flera gamla rader delar nummer.
- `MailIntakePanel.tsx` + `useSupplierDocuments.ts`: mutation som sätter `status='utkast'`, `duplicate_of=null`, `document_number = document_date` och skriver rad i `activity_logs` via befintliga fält (`action_type`, `performed_by`, `details`).
- Datarättning som engångsuppdatering av de fem raderna i `supplier_documents`.
