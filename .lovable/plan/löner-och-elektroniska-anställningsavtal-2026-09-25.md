# Löner och elektroniska anställningsavtal

## Svar: hur sätter man lön idag?
Lönen sätts redan på den anställdes personalkort under **Anställning**: välj Månadslön eller Timlön, fyll i beloppet, plus OB, sysselsättningsgrad, semesterregler och skattetabell. I schemat finns även en snabbruta för lön med "gäller från"-datum så att gamla veckor behåller den tidigare lönen. Det som saknas är avtalet. Det byggs nu.

## Vad som byggs

1. **Fliken Avtal på den anställdes profil**
   - Knapp "Skapa anställningsavtal". Avtalet fylls i automatiskt från personalkortet: namn, personnummer, bolag, butik, befattning, anställningsform, startdatum, provanställning, sysselsättningsgrad, lön, OB, semester och avtalsområde.
   - Lista över personens alla avtal med status: Utkast, Skickat, Signerat av en part, Signerat, Avbrutet.

2. **Redigera innan det skickas**
   - Avtalet visas som ett dokument uppdelat i avsnitt (parter, anställning, lön, arbetstid, semester, uppsägning, övrigt).
   - Varje avsnitt kan skrivas om, tas bort eller läggas till. Man kan också återställa till mallens text.
   - Förhandsvisning av PDF:en innan den skickas.

3. **Mall enligt Handelsavtalet**
   - Jag skriver ett förslag på avtalstext som ni granskar. Mallen redigeras i ett eget avsnitt i Personalregler och gäller per bolag.
   - Fälten i texten, t.ex. lön och startdatum, fylls i från personalkortet.

4. **Skicka för underskrift med Scrive och BankID**
   - "Skicka för underskrift" låser avtalet och skickar det till Scrive. Den anställde och butikschefen för den anställdes butik får var sitt mejl och skriver under med BankID.
   - Status uppdateras automatiskt när någon skriver under. Den signerade PDF:en sparas i den anställdes dokument.
   - Ett skickat avtal kan avbrytas men aldrig ändras. En ändring blir ett nytt avtal.

5. **Behörighet**
   - Butikschef ser och skapar avtal för sin butiks personal. Bolagsadmin ser alla i bolaget. Den anställde ser bara sina egna avtal under Min profil.

## Det du behöver ordna
- Ett Scrive-konto och en API-nyckel från Scrive. Jag ber om nyckeln när bygget startar.
- Varje butikschef behöver ha e-post och personnummer på sitt personalkort för BankID.
- Granska mallens text innan första riktiga avtalet skickas. Den är ett förslag och inte juridisk rådgivning.

## Tekniska detaljer
- Nya tabeller: `employment_contract_templates` (bolag, avsnitt jsonb, version) och `employment_contracts` (employee_id, employment_id, avsnitt jsonb, status, scrive_document_id, signatärer, skickad/signerad tid, pdf-sökväg). RLS via can_see_employee / can_manage_schedule; skrivning via security definer-funktioner. Låst efter skick via trigger.
- PDF genereras i en edge function och sparas i privat bucket kopplad till `employee_documents`.
- Edge functions: `contract-send` (skapar dokument i Scrive med två BankID-signatärer), `scrive-callback` (tar emot statusändringar, hämtar signerad PDF). Hemlighet: SCRIVE_API_TOKEN.
- Personnummer läses via befintlig get_employee_pnr, aldrig till klienten.
- Chef hämtas från butikens store_manager-roll; saknas chef stoppas skicket med tydligt meddelande.
