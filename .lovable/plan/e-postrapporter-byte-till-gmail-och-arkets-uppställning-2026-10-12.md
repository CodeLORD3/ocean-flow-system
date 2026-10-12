# E-postrapporter: byte till Gmail och arkets uppställning

## 1. Läget i dag (kontrollerat)

**Byggt**
- Inställningstabell `report_email_settings`: på/av (AV), mottagare baldvin@ och caisa@fiskskaldjur.se, avsändare. Endast admin läser och ändrar.
- Loggtabell `report_email_runs`: typ, datum, status, butiker, saknade, sparad HTML, felsteg/fel, start/klar. Unikt index stoppar dubbla lyckade utskick.
- Funktion `report-email` med lägena cron, förhandsvisning, testmejl och kör igen (de tre sista endast admin). Den räknar dagsrapport, veckosammanfattning, avvikelser, datakvalitet och AI-analys. Blocken finns i `blocks.ts`.
- Schemalagt jobb `report-email-hourly` varje hel timme. Funktionen avgör själv svensk tid och veckodag.
- Adminsidan **E-postrapporter** (`/report-emails`): logg, förhandsvisning, testmejl, inställningar och på/av.

**Status:** schemat är AV, loggen har 0 körningar och 0 skickade mejl. Inget mejl har gått iväg.

## 2. Byte till Gmail

**Det här gör du (en gång)**
1. Öppna länken nedan, välj Google och logga in som **caisacarning@gmail.com**. Godkänn att Lovable får skicka e-post från kontot. Behörigheten heter "Skicka e-post för din räkning".
   https://lovable.dev/connectors/google_mail/connect?workspace=oh1w8LKtr9rZ6DGqzTyk
2. Säg till i chatten när det är klart. Då kopplar jag kontot till projektet.

**Det här gör jag**
- Tar bort Resend helt ur funktionen. Mejlet skickas i stället via Gmail-kopplingen som HTML-mejl (svenska tecken kodas rätt i ämnesraden).
- Avsändaren blir alltid caisacarning@gmail.com, eftersom Gmail bara kan skicka från det inloggade kontot. Fältet "Avsändare" på adminsidan blir ett visningsnamn ("Makrill Trade").
- Saknas kopplingen loggas körningen som "ej skickad – e-post ej konfigurerad" med HTML sparad, precis som i dag.
- Gmail-meddelandets id sparas i loggen i stället för Resends id.
- Dubblettskyddet behålls (unikt index plus kontroll före utskick).
- Mottagare oförändrade.
- Gmail har en gräns på cirka 500 mejl per dygn för vanliga konton. Det räcker gott för två mejl per dag.

## 3. Arkets uppställning (Göteborg / Grossisten / Stockholm)

Blocken är redan byggda och provkörda mot vecka 41: mån–sön, en rad per dag, KORTKÖP-rad, totalrad och sammanställning under. Kvar att göra är den slutliga förhandsvisningen i appen och dina beslut nedan.

**Datakällor som används**
- **Butikernas försäljning och kortköp:** dagsrapporternas netto och antal kvitton.
- **Inköp Göteborg:** Fortnox-verifikationer i FSAB, konto 4010 + 4011 (debet minus kredit), per bokföringsdag.
- **Grossistens fakturering:** FSAB:s kundfakturor i Fortnox till Componia AG (Schweiz) och DE No.1 AB (Stockholm), intäktskonton 30xx utan öresavrundning. Fakturanumret kopplas till butiksbeställningen och läggs på beställningens leveransdag. Facit stämmer exakt: 118 175,27 och 113 815,63.
- **Inköp Stockholm:** grossistens faktura till DE No.1 AB.
- **Webb (hämtdag):** webbshopens beställningar (Shopify) per hämtdag i Stockholmsbutikerna, utan avbrutna, exklusive 6 % moms. Facit stämmer exakt.
- **Faktura Stockholm:** kundfakturor i DE No.1 i Fortnox. Det fanns inga vecka 41, så kolumnen visar 0.

**Källor som saknas**
- **Grossistens varukostnad:** ingen verklig kostnad finns i systemet. I dag räknas den som fakturerat × 78 % (marginalmål 22 %), med en not i mejlet. Arket räknar fakturerat ÷ 1,282, vilket ger exakt facit. **Beslut behövs:** behålla 78 % eller byta till ÷ 1,282?
- **Lager (ingående/utgående):** inget lagervärde finns. Visas som "–" och lagerförändringen räknas som 0, med not "källa saknas".

**Kända skillnader mot facit (rapporteras, tvingas inte fram)**
- Göteborgs inköp är bara delvis bokfört i Fortnox, och fredagen saknas helt. Mejlet märks som preliminärt.
- Ålstens söndag på 2 263,68 kr finns i dagsrapporterna men inte i arket.
- Componias faktura 841 på 39 696,15 kr saknar kopplad beställning och visas som en not, inte medräknad.
- Marstrand visas som en tom kolumn. **Beslut behövs:** dölja butiker utan rapporter under veckan?

## Tekniska detaljer
- Länka google_mail-kopplingen till projektet. Funktionen anropar `POST /gmail/v1/users/me/messages/send` via kopplingens gateway med `LOVABLE_API_KEY` och kopplingens nyckel. Meddelandet byggs som RFC 2822 med `Content-Type: text/html; charset=UTF-8`, ämne och visningsnamn kodas enligt RFC 2047 och allt base64url-kodas.
- Felsteg loggas separat ("utskick" med Gmails status och svar).
- Funktionen driftsätts om. Inga ändringar i tabellerna behövs; kolumnen `resend_message_id` återanvänds för Gmail-id.
