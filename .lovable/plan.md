# E-postrapporter via Loopia SMTP (caisa@fiskskaldjur.se)

## Mål
Dags- och veckorapporterna skickas från caisa@fiskskaldjur.se via Loopias utgående post. Ingen Gmail, Outlook eller Resend. Mottagarna är oförändrade (baldvin@fiskskaldjur.se, caisa@fiskskaldjur.se). Schemat förblir AV tills du slår på det.

## Inställningar
- Server: `mailcluster.loopia.se`, port 465, SSL/TLS direkt från start (inte 587/25).
- Användarnamn: `caisa@fiskskaldjur.se`.
- Server, port och användare sparas i rapportinställningarna och visas på adminsidan E-postrapporter (går att ändra där).
- Lösenordet sparas bara som hemligheten `LOOPIA_SMTP_PASSWORD`. Det visas aldrig i appen, i loggar eller i chatten.

## Så lägger du in lösenordet säkert
1. När planen är godkänd och koden klar öppnar jag en säker inmatningsruta i chatten för `LOOPIA_SMTP_PASSWORD`.
2. Klistra in Caisas lösenord för e-postkontot hos Loopia (samma som i Loopia Webmail/e-postprogrammet) och tryck Spara.
3. Värdet sparas krypterat direkt i Cloud › Secrets och passerar aldrig genom chatten eller mig.
4. Byter Caisa lösenord hos Loopia senare: be om att uppdatera `LOOPIA_SMTP_PASSWORD`, så öppnas samma ruta igen.
Tips: har Loopia-kontot tvåstegsverifiering, använd ett separat applösenord om Loopia erbjuder det.

## Beteende
- Saknas hemligheten eller användare/server: körningen loggas `ej_skickad` med "ej skickad – e-post ej konfigurerad", och HTML sparas i körningsloggen som i dag.
- Inloggningsfel (fel lösenord): status `fel`, med tydligt meddelande "Loopia nekade inloggningen (535) – kontrollera LOOPIA_SMTP_PASSWORD". HTML sparas.
- Anslutningsfel/tidsgräns: status `fel`, med "Kunde inte ansluta till mailcluster.loopia.se:465 – <orsak>". HTML sparas.
- Mottagare avvisade: status `fel`, med vilken adress och serverns svar.
- Dubblettskyddet (bara en lyckad körning per rapport) är oförändrat; ett misslyckat utskick kan skickas om.
- Testutskick från adminsidan går samma väg, med "TEST –" i ämnesraden.

## Testning
- Utan lösenord: provkörning ska ge `ej_skickad`, HTML sparad, inget skickat.
- Efter att du lagt in lösenordet: ett testmejl bara till caisa@fiskskaldjur.se, och resultatet visas i körningsloggen. Inget skickas till Baldvin förrän du säger till.
- Schemat slås inte på av mig.

## Tekniska detaljer
- Gmail-gatewayanropet i `supabase/functions/report-email/index.ts` ersätts med en liten egen SMTP-klient i samma funktionsmapp (`smtp.ts`). Den använder `Deno.connectTls` mot port 465 och kör stegen EHLO → AUTH LOGIN → MAIL FROM → RCPT TO → DATA → QUIT. Varje svar läses och svarskoder utanför 2xx/3xx kastas som fel med kod och servertext; lösenordet tas bort ur alla felmeddelanden. Tidsgräns 20 s per steg.
- MIME som i dag: UTF-8, ämne och visningsnamn RFC 2047-kodade, HTML-delen base64, plus `Date`- och `Message-ID`-rubriker (`@fiskskaldjur.se`).
- `report_email_settings` får kolumnerna `smtp_host` (standard mailcluster.loopia.se), `smtp_port` (465) och `smtp_user` (caisa@fiskskaldjur.se). Avsändaren `sender` sätts lika med `smtp_user`, eftersom Loopia kräver att From matchar inloggningen.
- Adminsidan `ReportEmails.tsx` visar och sparar de tre fälten och tar bort texten om Gmail-kopplingen.
- `GOOGLE_MAIL_API_KEY` och Gmail-koden tas bort ur funktionen. Inget annat ändras: siffror, block, cron-jobb och dubblettskydd.
