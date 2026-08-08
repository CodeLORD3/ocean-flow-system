# Gör systemet användbart i frontend

## Svar på dina frågor (verifierat nu)

**1. Publicering.** Appen är publicerad och publikt åtkomlig på `makrilltrade.com`, `www.makrilltrade.com` och `ocean-flow-system.lovable.app`. Livebundlen är `assets/index-BCZKKGDh.js`. Exakt publiceringstidpunkt och versionsnummer kan jag inte läsa ut med de verktyg jag har — det syns bara i Publish-dialogen. Frontend-ändringar går live först vid publicering, backend-ändringar (databas + edge functions) är redan live. Jag kan inte bevisa vilken kodversion som ligger live; därför ingår ett verifieringssteg nedan där jag jämför en känd, nyligen tillagd yta mot livesajten.

**2. Edge functions.** 14 finns i repot: `parse-foljesedel`, `archive-daily-reports`, `archive-daily-production-reports`, `auto-clock-out-shifts`, `auto-mature-investments`, `seed-staff-users`, `update-vilma-credentials`, `scomber-batch-allocate`, `scomber-makrilltrade-sync`, `scomber-morning-suggest`, `scomber-pos-checkout`, `scomber-price-resolve`, `scomber-set-override`, `scomber-traceability`. Deployad version och tidsstämpel per funktion exponeras inte för mig — jag kan bara deploya om och läsa loggar. Två noteringar: `post_purchase_report` är **inte** en edge function utan en databasfunktion, och den ligger redan live (verifierad i databasen). `supabase/config.toml` pekar på `scomber-b2b-order` som inte har någon mapp.

**3. Adress och inloggning.** Personalen använder egen domän: `makrilltrade.com`. Staff-tabellen har **12** rader, inte 11. 11 har konto och kan logga in. **Ewa Ahlander saknar både e-post och konto** och kan inte logga in. **Erik Franzén** har `must_change_password = true` och tvingas byta lösenord vid första inloggning.

**4. Vad personalen ser först efter publicering.** Allt frontend som byggts sedan senaste publicering, bl.a.: redigerbar inloggningssida med logga och typografi, radbrytningar i rubriker, automatisk utstämpling vid midnatt (UI-filtret), samt övriga UI-ändringar från de senaste dagarna. Vilka exakt beror på publiceringstidpunkten — bekräftas i verifieringssteget.

**5. Tre saker före släpp — planeras nedan.**

---

## Del 1: Behörighet per sida

Idag finns bara en spärr (`src/App.tsx:52`). Åtgärd:

- Ny modul `src/lib/pageAccess.ts` med en regeltabell rutt → tillåtna portaler:
  - **Butik**: översikt, chatt, checklista, kalender, ordrar, kunder, önskemål, lager (endast egen enhet), inleveranser, personal, rapporter, dagsrapport.
  - **Grossist**: inköpsrapportering, inleveranser, tillverkning, produktionsrapportering, inköpsplanering, leverantörer, prissättning, lager (alla enheter).
  - **Admin**: allt.
- `KeepAliveTabs` renderar en "Ingen behörighet"-vy istället för sidan när rutten inte är tillåten för aktuell portal, så att direktlänkar inte kringgår menyn.
- Sidebar-navigering filtreras mot samma regeltabell (en källa, ingen dubblering).
- **Priskänsliga fält döljs i butiksläge**: inköpspris/självkostnad och marginal i lagervyerna, samt hela auktionskalkylen. Butik ser kvantitet, min-nivå och sitt eget utpris.
- Lagervyerna i butiksläge låses till butikens egna lagerplatser.

## Del 2: Egna menyposter för lagerrörelser och spårbarhet

- Nya rutter `/stock-movements` och `/traceability` som renderar befintliga `StockMovementsView` och `LotTraceabilityView` som fullsidor.
- Egna menyposter under Lagerstyrning i alla tre sidebars, med tydliga namn ("Lagerrörelser", "Spårbarhet — partier").
- Flikarna inuti `/inventory` behålls så inget nuvarande arbetssätt bryts.
- Spårbarhetssidan får sökfält på partinummer och en utskriftsknapp, så den kan visas direkt vid kontroll.

## Del 3: Tomma tillstånd med åtgärd

Genomgång av alla lager- och tillverkningsvyer. Varje tomt läge får rubrik, en förklarande rad och en knapp:

| Vy | Text | Knapp |
|---|---|---|
| Lagerrörelser | Inga rörelser bokförda ännu. Rörelser skapas när en inköpsrapport bokförs. | Till inköpsrapportering |
| Spårbarhet | Inga partier ännu. Partier skapas vid bokförd inleverans. | Till inköpsrapportering |
| Lageröversikt | Inget saldo i det här lagret ännu. | Registrera inleverans |
| Tillverkningshistorik | Inga tillverkningsordrar ännu. | Skapa tillverkningsorder |
| Verkliga utfall | Inga utfall registrerade. | Registrera utbyte |
| Utbytesregister / Styckningsmodeller | Inga rader för den här artgruppen. | Lägg till rad |
| Lagerrapporter | Inga rapporter skapade. | Skapa lagerrapport |
| Dagsavstämning | Inga produkter med saldo. | Till inleveranser |
| Inköpsrapporter | Inga rapporter. | Läs in följesedel |

En gemensam `EmptyState`-komponent används överallt så utseendet blir enhetligt.

## Del 4: Kör igenom första flödet skarpt

Utförs efter del 1–3, med resultat rapporterat per steg:

1. **Deploya om** `parse-foljesedel` och de övriga edge-funktionerna, så repo och drift garanterat matchar. Städa bort den döda `scomber-b2b-order`-posten i config.
2. **Fyll artgrupperna** — 251 av 762 produkter saknar `species_group`. Fylls via importfunktionen eller en riktad uppdatering utifrån latinskt namn, och resultatet räknas av.
3. **Bokför en inköpsrapport skarpt** — en av de 55 obokförda rapporterna bokförs via `post_purchase_report`. Kontroll: `posted_at` satt, partier skapade med IL-nummer, `inleverans`-rörelser, `lot_id`/`movement_id` ifyllda på raderna.
4. **Kör en tillverkningsorder på torsk** — kontroll att grad ≥ 3 ger hel filé, att FIFO-uttaget tar rätt parti, att `tillverkning_ut`/`tillverkning_in` bokförs och att `lot_transformations` får en rad.
5. **Verifiera priser** — att detaljpriser uppstår ur NRV-modellen och att referenspriset räknas på det nya inköpet.
6. **Städa restposterna** från det avbrutna bokföringsförsöket (två nollpartier med kvarhängande snittkostnad).
7. **Publicera** och bekräfta mot livesajten att de nya menyposterna och behörighetsspärrarna är ute.

## Utanför denna plan (behöver ditt beslut senare)
- Konto och e-post för **Ewa Ahlander** så hon kan logga in.
- Om butik ska se sitt eget utpris men aldrig inköpspris även i rapportarkivet.

## Tekniska detaljer
- Regeltabellen blir en ren datastruktur (rutt → portaler) som både `KeepAliveTabs` och de tre sidebar-komponenterna läser, så behörighet och meny aldrig kan glida ifrån varandra.
- Fältdöljningen sker i presentationslagret via portalkontexten (`useSite`), inte i hooks eller databaslager — inga ändringar i rörelselogg, triggrar eller prislogik.
- Inga nya tabeller. Punkt 4 skriver data via befintliga RPC:er och rörelseloggen, aldrig direkt mot saldon.
