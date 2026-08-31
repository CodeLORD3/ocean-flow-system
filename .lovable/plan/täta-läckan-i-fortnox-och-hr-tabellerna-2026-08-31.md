# Täta läckan i Fortnox- och HR-tabellerna

Publiceringen är igång, men säkerhetsskanningen hittade en allvarlig brist: **Fortnox-data kan läsas av vilken inloggad användare som helst**, oavsett bolag. Det gäller kunduppgifter, fakturajobb, kopplingsinformation och API-loggar för alla bolag samtidigt. En investerarinloggning eller en butiksanställd på ett bolag kan i teorin läsa ett annat bolags kunddata.

Två mindre varningar hänger ihop med samma mönster: global HR-konfiguration (skifttyper, frånvarotyper, frånvaropolicyer, frånvarodagar, bemanningsbehov) saknar kontroll av att användaren faktiskt är personal.

## Vad som ska göras

1. **Fortnox-tabellerna låses till personal och rätt bolag.** Läsning kräver att användaren är personal och har behörighet till det bolag posten tillhör — samma regel som redan gäller övriga bolagsövergripande tabeller.
2. **HR-konfigurationen låses till personal.** Frånvarotyper, frånvaropolicyer, skifttyper, frånvarodagar och bemanningsbehov blir läsbara enbart för personal, inte för investerarkonton.
3. **Frånvarodagar begränsas ytterligare** till egen personal respektive chef med behörighet till medarbetaren, inte alla inloggade.
4. **Bolagsmappningen verifieras** så att en inloggad användare helt utan bolagsbehörighet inte kan läsa juridiska enheter.
5. **Kontroll efteråt**: säkerhetsskanning körs igen, och jag verifierar att Fortnox-flödena (fakturautkast, kundimport, inboxinläsning) och personalmodulen fortfarande fungerar — edge-funktioner påverkas inte eftersom de kör med förhöjd behörighet.

## Teknisk detalj

- Migrering som ersätter `USING (true)` i policyerna `fortnox_api_log_read`, `fortnox_connections_read`, `fortnox_customers_read`, `fortnox_customer_map_rw`, `fortnox_article_map_read`, `fortnox_invoice_jobs_read` med `is_staff() AND can_see_company(<legal_entity>)`.
- Motsvarande skärpning av `shift_types read`, `absence_policies_read`, `absence_types_read`, `absence_days_select`, `staffing_needs read` till `is_staff()`, och `absence_days` till `can_see_employee(employee_id)`.
- Verifiering att `can_see_company()` returnerar false för användare utan scope, samt att `SECURITY DEFINER`-funktioner inte är körbara för `anon` (separat linter-varning).
- Ingen ändring av frontendkod krävs; endast databasens behörighetsregler.

## Utanför detta uppdrag

Etapp 4-ändringarna som just publicerades (frånvaroansökan, semesterårsvy, schemabadges, chefens frånvarokö) rörs inte. De är typkontrollerade men inte genomklickade som inloggad användare — säg till om du vill att jag verifierar dem också.
