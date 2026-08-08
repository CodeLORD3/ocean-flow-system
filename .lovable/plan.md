# Verifiering av omläggningen, sedan etapp 4

## Del 1 — Verifieringen, med talen

Alla siffror nedan är hämtade nu, från databasen och testsviten.

**1. Aktiva lagerplatser**

| | Före | Efter |
|---|---|---|
| Lagerplatser totalt | 91 | 91 |
| Aktiva | 91 | 36 |
| Inaktiverade | 0 | 55 |

De 36 aktiva: 9 inköpslager, 1 grossistlager (Grossist Flytande), 9 tillverkningslager, 9 leveranslager, 8 butikslager (Försäljningslager).

**2. Summa kilo**

| Före | Efter |
|---|---|
| 399,000 kg | 399,000 kg |

Efter-talet är läst på tre oberoende håll och alla tre ger samma tal: saldotabellen 399,000, hela rörelseloggen summerad 399,000, och saldon på aktiva platser 399,000. På inaktiverade platser ligger 0,000 kg.

**3. Summa lagervärde**

| Före | Efter |
|---|---|
| 32 034,00 kr | 32 034,00 kr |

**4. Avstämning rörelselogg mot saldotabell**

Summan av `stock_movements` per produkt och plats jämförd med `product_stock_locations`, full join i båda riktningarna:

- Avvikande rader: **0**
- Saldorader: 14
- Aggregat från rörelseloggen: 14
- Totalt antal rörelser i loggen: 20

**5. Saldospärrarna**

Båda triggrarna finns och är aktiverade (`tgenabled = O`): `guard_stock_balance_writes_trg` på `product_stock_locations` och `guard_product_stock_total_trg` på `products`. Även flödesspärrarna är aktiva: `trg_enforce_transfer_flow` och `trg_enforce_movement_preconditions`.

Att de *ger utslag* kan inte visas härifrån: läsrollen jag frågar med får inte köra UPDATE alls, så ett avvisat försök blir "permission denied" i stället för spärrens eget felmeddelande. Det körs skarpt som första punkt i del 2 nedan, med rörelseloggen avstängd, så att spärrens egen text syns.

**6. Guard-testets undantagslista**

`LEGACY_DIRECT_WRITERS` i `src/test/stockLedgerGuard.test.ts` är fortfarande **tom** — inga undantag har lagts till under omläggningen.

**7. Tester**

61 tester i 5 filer, **61 passerar, 0 faller**.

**8. Konstanter och kvarvarande uppslag mot inaktiverade platser** — här finns tre verkliga hål

`locations.ts` innehåller nu bara en hårdkodad plats, `GROSSIST_FLYTANDE_ID`, och den pekar på en aktiv plats. Allt annat slås upp på nivå. Men tre ställen slår fortfarande upp platser **på namn**, och namnen de letar efter tillhör inaktiverade platser:

| Fil | Söker | Läge |
|---|---|---|
| `src/pages/Receiving.tsx` | namn `Raw-%` | inaktiverade — butiksinleverans skulle träffa fel eller inget |
| `src/lib/orderStatusSync.ts` | namn `Pre-%` | inaktiverade |
| `src/pages/Inventory.tsx` | namn `Transportlager` / `Grossist Flytande` | Transportlager inaktiverat |

Dessutom: en inaktiverad plats har fortfarande en rad i saldotabellen, med 0,000 kg. Den städas bort.

**9. Nollpartierna med lot_number 2 och 3**

De finns kvar och blev inte flyttade — de låg på Grossist Flytande, som är kvar som grossistlagret. Båda har status `terminerad` och 0,000 kg. Kvarhängande kostnad finns fortfarande: Kolja `avg_cost` 78,00 och Långa `avg_cost` 60,00, båda med `stock_value` 0,00. Två sådana nollrader totalt. De påverkar inte kilo eller värde, men ett snittpris på en tom plats kan smitta nästa inleverans, så de nollställs i del 2.

**10. post_purchase_report mot inköpslagret**

Funktionen är oförändrad i databasen; det som ändrats är vilket `p_location_id` frontend skickar in. Den vägen har aldrig körts skarpt. Den testas skarpt i del 2 innan gränssnittet byggs.

## Del 2 — Åtgärder innan etapp 4

1. Skarpt bevis för spärrarna: försök skriva ett saldo direkt och visa spärrens egna felmeddelande, samt försök bokföra en rörelse mot en inaktiverad plats och visa att den avvisas.
2. Nollställ `avg_cost` och `unit_cost` på de två nollraderna via rörelseloggen, inte med en direktskrivning.
3. Ta bort den tomma saldoraden på den inaktiverade platsen.
4. Peka om de tre namnuppslagen: `Receiving.tsx` och `orderStatusSync.ts` går över till nivåuppslag (butikslager respektive leveranslager), `Inventory.tsx` slutar särbehandla platser på namn.
5. **Spärr så felet inte kan uppstå igen.** Två delar, båda i samma ändring som punkt 4:
   - Namnuppslag mot lagerplats görs bara via en ny funktion i `locations.ts`. Den kastar fel om namnet är tvetydigt (som idag) **och** om den enda träffen är en inaktiverad plats. Ingen väg returnerar längre `null` eller en inaktiv plats tyst. Uppslag på id går fortsatt genom `assertActiveLocation`.
   - Nytt test `src/test/locationLookupGuard.test.ts`, i samma anda som `stockLedgerGuard`: det söker igenom `src/` efter uppslag mot `storage_locations` som filtrerar på `name` (`.eq("name"`, `.ilike("name"`, `.in("name"`, `.like`, `.or` med `name.`) och faller om något ligger utanför `locations.ts`. Nivåuppslag (`location_type`) och `GROSSIST_FLYTANDE_ID` undantas. Undantagslistan startar tom och får bara krympa.
6. Skarp test av hela kedjan: bokför en följesedel → partier landar i inköpslagret → ankomstregistrering flyttar till grossistlagret → avvikelse blir svinn hos avsändaren. Efteråt kontrolleras att kilo och värde stämmer och att avstämningen fortfarande ger 0 avvikande rader.

Skälet till punkt 5: det här är andra gången ett namnuppslag orsakat ett tyst fel — först `maybeSingle` mot "Grossist Flytande" när sex platser hade samma namn, nu tre filer som letade efter inaktiverade platser genom hela omläggningen. Ett test stänger mönstret i stället för att nästa förekomst hittas av misstag.


## Del 3 — Etapp 4: gränssnittet

**Nivåväljare på lagersidan.** Fem flikar i flödesordning: Inköpslager, Grossistlager, Tillverkningslager, Leveranslager, Butik. Varje flik visar vad nivån betyder ("i vår ägo, ännu inte hos oss", "fysiskt hos oss" och så vidare), saldo i kilo och värde, och kan fällas ut per underlager. Butiksanvändare ser bara sin egen butiks nivåer; grossist och admin ser alla.

**Guidat överföringsflöde.** Ett steg i taget, med systemet som spärr:

```text
Välj underlag  ->  Välj rader och kvantitet  ->  Skriv ut plocklista
     ->  Registrera plockat (avvikelse kräver orsak)
     ->  Godkänn utleverans (varan går "under transport")
     ->  Mottagaren registrerar mottaget och godkänner
     ->  Saldon bokförs. Differens blir svinn hos avsändaren.
```

Otillåtna riktningar visas inte som val. Saknas underlag går knappen inte att trycka, med en text som säger vad som saknas.

**Sida för överföringar.** Lista med status, ordernummer, från/till med nivå, underlag och vem som gjort vad. Knappar för plocklista och följesedel som PDF. Mottagningsvyn ligger på samma sida för den som är mottagare.

**Larm för oregistrerad plocklista.** Överföringar där plocklistan skrevs ut för mer än fyra timmar sedan utan att plockningen registrerats visas högst upp i rött, med en räknare i sidomenyn.

**Svinn.** Formulär med obligatorisk orsak och kommentar, kopplat till lagerplats och parti.

**Tomma vyer förklarar sig.** Varje nivå utan saldo säger varför den är tom och vad som fyller den.

## Tekniska noteringar

- Nya sidor: `src/pages/StockTransfers.tsx` (lista, mottagning, larm) och `src/pages/WasteReports.tsx`, plus `src/components/stock/TransferWizard.tsx` och `LevelSelector.tsx`.
- Hooks mot befintliga libbar: `src/hooks/useTransferOrders.ts` använder `src/lib/transferOrders.ts`, `src/lib/waste.ts`, `src/lib/transferPdf.ts` — ingen ny skrivväg till saldon.
- Rutter och behörighet läggs i `src/lib/pageAccess.ts` med samma mönster som `/stock-movements`.
- Inga nya databasändringar behövs för etapp 4 utöver städningen i del 2.
- Spärren i del 2 punkt 5 är ren frontend: en funktion i `src/lib/locations.ts` plus `src/test/locationLookupGuard.test.ts`.
