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
| Merchant code | `MCNGCU6L` — **den kod nyckeln och försäljningen ligger på** (Componia AG, CH) |
| Merchant code | `MKC571XH` — svarar men har noll transaktioner, ligger inaktiv i registret |
| Secrets | `SUMUP_API_KEY` (skarp), `SUMUP_API_KEY_SANDBOX` (sandbox) |
| Scopes | `transactions.history`, `transactions.read`, `receipts.read` |
| Butik | `zollikon` → bolag `fsab-ch`, valuta CHF |

Merchant-koder ligger i tabellen `sumup_merchants` (kod → butik → bolag, valuta,
testläge, aktiv), aldrig i kod. Flera koder stöds: dyker MCNGCU6L upp som en
egen profil med försäljning läggs den till som ytterligare rad, ingen kodändring.

`SUMUP_API_KEY` verifierad mot `GET /v0.1/me`: den tillhör merchant **MCNGCU6L**,
Componia AG, CH — inte MKC571XH. Därför flyttades pollningen till MCNGCU6L.
`SUMUP_API_KEY_SANDBOX` svarar **401** och måste bytas innan sandbox-tester körs;
verifieringen ovan gjordes därför mot skarp läsning (läsning bokför inget).

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

**Vad de riktiga svaren visade (kört mot MCNGCU6L, se 4.1):** kassan skickar
**alltid `quantity: 1`** för viktvaror och lägger **vikten som prefix i namnet**,
medan `price`/`total_with_vat` är radens **totalbelopp** — inte kilopris.

**Tolkningsordning (implementerad i `_shared/sumup.ts`, `interpretLine`):**

| Steg | Villkor | Källa som sparas |
| --- | --- | --- |
| 1 | namnet börjar med vikt (`0.724 kg Lachs filet`, även `150 g`, komma-decimal) | `namn_vikt` — vikten ur namnet, kilopris = radtotal / vikt, namnet rensas |
| 2 | `quantity` bär decimaler (1.24) | `rapporterad` |
| 3 | kg-vara, heltalskvantitet, radtotal och kilopris finns | `harledd_pris` |
| 4 | inget av ovan räcker | `okand` — raden flaggas, inget gissas |

Steg 1 är den väg Zollikon faktiskt använder; steg 2–4 ligger kvar som skydd om
kassan konfigureras om. Källan sparas per rad i
`pos_transaction_items.quantity_source` och den råa kvantiteten i
`external_quantity`, så varje inventeringsavvikelse går att förklara i efterhand.

Viktprefixet rensas innan namnmatchningen — annars hade varje vägning blivit ett
nytt artikelnamn i mappningen.

### 4.1 Resultat från skarp läsning (2026-08-16, merchant MCNGCU6L)

Kg-artikel, transaktion `TAAA2UVXQGS` (195,10 CHF), rad ur `products[]`:

```json
{"name": "0.724 kg Lachs filet", "price": 55.75, "price_with_vat": 57.2,
 "quantity": 1, "vat_amount": 1.45, "total_price": 55.75,
 "total_with_vat": 57.2, "vat_rate": 0.026}
```

Tolkas som 0,724 kg "Lachs filet", radtotal 5720 rappen, kilopris 79,01 CHF/kg,
källa `namn_vikt`. Samma transaktion innehåller `"1.60 kg Seezunge (ganz)"`
(126,40 CHF) — också `quantity: 1`.

Styckvara, transaktion `TAAA2UV2PLN`:

```json
{"name": " Sourgood Brot", "price": 11.69, "price_with_vat": 11.99,
 "quantity": 2, "total_price": 23.39, "total_with_vat": 24.0, "vat_rate": 0.026}
```

Tolkas som 2 st, radtotal 2400 rappen, källa `rapporterad`.

Kvitto, `GET /v1.1/receipts/{id}?mid=MCNGCU6L` → `transaction_data.receipt_no`
= `S20260009988`, `card_reader.code` = `201100164125`. Kvittots `products[]`
skickar beloppen som **strängar** (`"11.69"`), history/transactions som tal —
båda hanteras.

| Fall | Bevis | `quantity` | Vald källa |
| --- | --- | --- | --- |
| kg (0,724 kg) | `TAAA2UVXQGS` | 1 + vikt i namnet | `namn_vikt` |
| kg (1,60 kg) | `TAAA2UVXQGS` | 1 + vikt i namnet | `namn_vikt` |
| styck 2 st | `TAAA2UV2PLN` | 2 | `rapporterad` |
| retur | **ej observerad** — 200 transaktioner i fönstret är alla `PAYMENT` (180 lyckade, 20 misslyckade), noll `REFUND` | — | — |

**Öppet:** returen måste göras i kassan (eller hittas i äldre historik) innan
etapp 2 låser motrörelsen. Koden hanterar redan negativa belopp, men det är
otestat mot verkligt svar. Misslyckade betalningar (`FAILED`) ska aldrig ge
lagerrörelse — de finns i historiken och filtreras bort.

## 5. Kö och idempotens

Skarpt bevis 2026-08-16: 126 kvitton hämtade och köade i första körningen,
därefter ny körning på samma fönster → 89 hämtade, **0 nya, 89 dubbletter**.
Kortdata saknas i lagrad payload (skrubbat), valutan är CHF, kvittonummer finns.
19 artikelnamn hamnade i granskningsvyn utan produkt — Zollikons tyska namn
behöver kopplas en gång.

Pagineringen i history returnerar `links[].href` som **enbart frågesträng**
(utan sökväg); klienten sätter tillbaka sökvägen innan nästa sida hämtas.

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
- **Etapp 5**: skarpa nycklar och verifiering mot en hel handelsdag.

## 10. Etapp 3, CHF-priser och katalogutbyte (klar)

`price_lists.currency` (standard SEK) sätts automatiskt till CHF för Zollikon.
Momsen sätts per rad ur `vat_rates` för bolaget: Componia AG har 2,6 % som
standardsats (livsmedel), 8,1 % för "Emballage & Förbrukning" och 8,1 % för
"Servering på plats". Uppslaget sker i `src/lib/vatRates.ts` (kategorimatchning
före bolagets standardsats `*`).

Katalogen hanteras i fliken **Priser → Katalog Zollikon**:

1. **Exportera CSV** i SumUps importformat (`Item name, Description, Category,
   Variant name, SKU, Price, Currency, Tax rate (%), On/Off, Track inventory`),
   byggd från den CHF-prislista som är markerad "gäller i kassan".
2. **Stäm av kassans export** — SumUps egen katalogexport (CSV eller XLSX) läses
   in och jämförs på artikelnamn: stämmer, prisavvikelse, saknas i kassan eller
   saknas i Makrilltrade. Prisjämförelsen tolererar 0,01.
3. Varje avstämning sparas i `sumup_catalog_audits` (antal rader, träffar,
   prisavvikelser, saknade i vardera riktning samt de 500 första avvikelserna).

Inget katalog-API finns hos SumUp i dag — CSV-vägen är därför sanningen.
Kontrollera developer.sumup.com/changelog innan detta byts mot ett API.

## 11. Etapp 4, nattlig avstämning (klar)

`sumup-reconcile` körs 03:30 Zürich-tid, hämtar föregående dags historik, fyller
i kvittonummer och skriver `sumup_reconciliations` (antal och belopp i CHF på
båda sidor plus differens). Kassapanelen och Systemstatus visar de senaste
dagarna med larm när differensen inte är noll. CHF blandas aldrig med SEK: i
Kassa live räknas totalerna per valuta.

## 9. Beroende utanför koden

Zollikons försäljningslager fylls via veckoleveransens överföringsorder från
Göteborg (förtullning i Basel). Inleveransen måste bokföras i Zollikon innan
veckans försäljning börjar, annars går kvittona mot undersaldo när etapp 2 är
igång.
