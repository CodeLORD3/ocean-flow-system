# Portalvalet fastnar — diagnos och härdning

## Vad kontrollen visar

- Behörigheten är intakt: ditt konto har fyra portalrader (`admin`, `wholesale`, `production`, `shop`) i behörighetstabellen. Det är alltså **inte** raderade rättigheter den här gången.
- Authloggen kl 20:26 (exakt när du skrev) visar `400 Invalid Refresh Token: Refresh Token Not Found` från previewfönstret. Sessionen kunde inte förnyas.
- Portalvalet hämtar din profil via `staff_access`. När anropet svarar med fel (t.ex. utgången/ogiltig token) görs tre försök och sedan sätts profilen tyst till `null` — resultatet blir skärmen "Kunde inte hämta din behörighet" eller en snurra, utan att någon förklaring eller felkod visas.
- Slutsatsen "trasig refresh-token orsakar just den här tomma vyn" är rimlig men **inte bevisad** — vi ser inte vilket fel selecten gav, eftersom felet aldrig loggas eller visas. Därför är första steget att göra felet synligt.

## Åtgärder

1. **Gör felet synligt (första steget).** Spara undan felet från profilhämtningen (kod + meddelande) och visa det i klartext på "Kunde inte hämta"-skärmen, samt logga det i konsolen. Nästa gång detta händer ser vi direkt om det är 401 (session), 403 (RLS) eller nätverk.
2. **Behandla ogiltig session som utloggning, inte som fel.** Om profilhämtningen misslyckas på grund av ogiltig/utgången session: kontrollera sessionen mot servern, och är den död → rensa den och skicka till inloggningen med meddelandet "Din session gick ut, logga in igen" istället för att stå kvar på en vy utan portaler.
3. **Skilj "laddar" från "misslyckades".** Låt även auth-händelser (inklusive misslyckad tokenförnyelse och utloggning) släppa laddningsläget, så vyn aldrig kan stå kvar i evig snurra.
4. **Manuell räddningsknapp.** På felskärmen: behåll "Försök igen", och lägg till "Logga in igen" som rensar den lokala sessionen helt (inkl. portalvalet) och går till inloggningen — så du alltid kommer vidare utan att rensa webbläsardata själv.

## Tekniskt

- `src/contexts/StaffAuthContext.tsx`: spara `lastError` i contexten från `loadStaff`, sätt `loading=false` även i `onAuthStateChange`, och exponera en `hardSignOut` som rensar session + `sessionStorage`-portalvalet.
- `src/pages/PortalChooser.tsx`: visa `lastError` i felrutan, lägg till "Logga in igen"-knappen och navigering till `/` när sessionen är verifierat död.
- Ingen ändring i databas, RLS, vyer, funktioner eller edge functions — behörighetsdatan är redan korrekt.
