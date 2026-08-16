# SumUp ↔ Makrilltrade (Zollikon)

Status: **etapp 1 byggd** (hämtning, kö, namnmappning, larm, viktvaruprotokoll).
Inga lagerrörelser skapas ännu — det är etapp 2.

Gäller endast Fiskskaldjur Zollikon (bolag `fsab-ch`, i registret **Componia AG**), valuta CHF.

## 1. Grundskillnad mot Nimpos

SumUp **pushar inte** kvitton från POS-appen. Webhooks finns bara för checkouts
som skapats via API. Kassaförsäljning hämtas därför genom pollning av
Transactions API — "live" betyder inom en minut, inte i samma sekund.

```text
schemaläggare ──▶ sumup-poll (edge)
                    │ 1. GET /v2.1/merchants/{mid}/transactions/history?changes_since=
                    │ 2. GET /v2.1/merchants/{mid}/transactions?id=      (products[], vat_rates[])
                    │ 3. GET /v1.1/receipts/{id}?mid=                    (receipt_no, card_reader.code)
                    ▼
             sumup_events (rå kö, unik på merchant_code + transaction_id)
                    │  etapp 2
                    ▼
     pos_transactions + pos_transaction_items + stock_movements (FEFO)
```

Kvittonummer (`receipt_no`) och terminal (`card_reader.code`) hämtas **alltid**
från receipts-endpointen, aldrig gissat ur history.

## 2. Nycklar och merchant

| Post | Värde |
| --- | --- |
| Merchant code | `MKC571XH` (skarp) |
| Secrets | `SUMUP_API_KEY` (skarp), `SUMUP_API_KEY_SANDBOX` (sandbox) |
| Scopes | `transactions.history`, `transactions.read`, `receipts.read` |
| Butik | `zollikon` → bolag `fsab-ch`, valuta CHF |

Merchant-koder ligger i tabellen `sumup_merchants` (kod → butik → bolag, valuta,
testläge, aktiv), aldrig i kod. Flera koder stöds: dyker MCNGCU6L upp som en
egen profil med försäljning läggs den till som ytterligare rad, ingen kodändring.

Nyckeln som delats i chatt ska roteras i SumUp-dashboarden. Nycklar går aldrig
via chatt eller kod.

## 3. Belopp, valuta och kortdata

- SumUp skickar decimaltal i huvudenhet (`10.10`). Vi lagrar minsta enhet
  (rappen) — `majorToMinor()`.
- `pos_transactions.currency` sattes till `SEK` för befintlig data och `CHF` för
  SumUp, så CHF och SEK aldrig summeras ihop.
- Transaktion i annan valuta än butikens parkeras med `status = fel` och larm.
- `last_4_digits`, `masked_pan` och liknande skrubbas ur payloaden vid
  mottagning (`scrubCard()`), de lagras aldrig.

## 4. Viktvarutestet — körs först, låser tolkningen

`products[].quantity` är heltal enligt SumUps API-spec, men fisk säljs per kilo
med tre decimaler. Innan bearbetningen låses ska tre råa svar hämtas i sandbox.

**Så hämtas råa svaren** (kräver inloggad personal, ingen nyckel i klienten):

```bash
POST /functions/v1/sumup-poll
{ "action": "probe", "merchant_code": "MKC571XH", "transaction_id": "<id>" }
```

Svaret innehåller hela transaktionen, kvittot och, per rad, både tolkningen som
styckvara och som kg-vara — så det syns direkt vilken väg som är sann.

**Testfall att köra och klistra in i avsnitt 4.1 nedan:**

1. kg-artikel såld på **1,24 kg**
2. styckvara såld i **2 st**
3. **retur** av kg-artikeln

**Tolkningsordning (implementerad i `_shared/sumup.ts`, `interpretLine`):**

| Fall | Villkor | Källa som sparas |
| --- | --- | --- |
| 1 | `quantity` bär decimaler (1.24) | `rapporterad` |
| 2 | kg-vara med heltalskvantitet, radtotal och kilopris finns | `harledd_pris` (radtotal / kilopris) |
| 3 | varken kvantitet eller pris räcker | `okand` — raden flaggas, inget gissas |

Källan sparas per rad i `pos_transaction_items.quantity_source`, och den råa
kvantiteten i `external_quantity`, så varje inventeringsavvikelse går att
förklara i efterhand. Returens JSON avgör om returrader bär `products[]`
(partivis motrörelse i etapp 2) eller bara belopp (beloppsjustering med flagga).

### 4.1 Resultat från sandbox

| Fall | Datum | `quantity` i svaret | `price` | `total_with_vat` | Vald källa |
| --- | --- | --- | --- | --- | --- |
| kg 1,24 | _ej kört_ | | | | |
| styck 2 | _ej kört_ | | | | |
| retur | _ej kört_ | | | | |

Klistra in de tre råa JSON-svaren här när de körts. Först då sätts standardvägen
i koden; till dess stödjer koden alla tre och flaggar det som är osäkert.

## 5. Kö och idempotens

`sumup_events`: unik på (`merchant_code`, `external_id`), status
`koad` / `bearbetad` / `duplikat` / `fel`, plus försök, felmeddelande och
`test_mode`. Ompollning av samma transaktion räknas som duplikat och skapar
aldrig en andra rad. `changes_since` sätts till senaste lyckade körning minus
5 minuter (överlapp mot klockglapp).

## 6. Produktnamnsmappning

`products[]` saknar SKU och EAN, så matchningen sker på namn:

1. bekräftad mappning i `sumup_product_map`
2. exakt namnträff i produktregistret (sparas då automatiskt som mappning)
3. annars räknas namnet upp som omatchat och hamnar i granskningsvyn med förslag

Regel: artiklar skapas alltid i Makrilltrade först, och SumUp-artikelns namn
sätts identiskt med Makrilltrades kundvänliga namn — det är matchnyckeln.

## 7. Larm (etapp 1)

Körningarna loggas i `sumup_poll_runs` (starttid, utfall, antal hämtade, köade,
duplikat, HTTP-status, felkod). Två larm visas direkt i kassapanelen och på
Systemstatus:

- **pollningen misslyckad tre gånger i rad** per merchant (`fail_streak >= 3`),
  med senaste felkod (401 nyckel, 429 rate limit, 5xx uppström).
- **tyst kassa över 60 minuter under öppettid** — öppettiderna läses per butik
  ur `store_opening_hours`, larmet är tyst utanför öppettid.

## 8. Kvar till senare etapper

- **Etapp 2**: bearbetning till lagerrörelser (FEFO ur Zollikons
  försäljningslager, försäljning blockeras aldrig av saldo), transaktionsregister,
  returer som motrörelse, live i Översikt.
- **Etapp 3**: CH-prislista i CHF (2,6 % livsmedel, 8,1 % övrigt),
  katalogexport i SumUps CSV-format samt uppladdning och avstämning av SumUps
  katalogexport. Inget katalog-API finns i dag — kontrollera
  developer.sumup.com/changelog vid bygget.
- **Etapp 4**: nattlig avstämning av föregående dag och fullt Systemstatus-kort.
- **Etapp 5**: skarpa nycklar och verifiering mot en hel handelsdag.

## 9. Beroende utanför koden

Zollikons försäljningslager fylls via veckoleveransens överföringsorder från
Göteborg (förtullning i Basel). Inleveransen måste bokföras i Zollikon innan
veckans försäljning börjar, annars går kvittona mot undersaldo när etapp 2 är
igång.
