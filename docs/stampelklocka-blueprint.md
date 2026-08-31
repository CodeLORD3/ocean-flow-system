# Blueprint: Stämpelklockan i Makrill Trade

## Syfte

Detta dokument beskriver **endast stämpelklockan/personalens tidrapportering** i Makrill Trade. Det är skrivet för att kunna skickas till en annan utvecklare eller Claude för granskning av riktning, kopplingar, säkerhet och kvarvarande arbete.

Dokumentet skiljer mellan:

- **Implementerat:** finns i kod/databas och används av ett konkret flöde.
- **Förberett:** datamodell eller komponent finns, men hela användarflödet är inte färdigkopplat.
- **Utanför stämpelklockans kärna:** närliggande äldre eller parallella personalflöden som kan påverka förståelsen.

---

## 1. Kort beskrivning i klartext

Stämpelklockan består av två delar:

1. **Fristående kiosk på `/clock`**
   - Kräver ingen vanlig ERP-inloggning.
   - En administratör skapar en klockstation och får en aktiveringskod.
   - Kioskens enhet aktiveras med koden och får en tidsbegränsad stationssession.
   - Personal identifierar sig med personnummer eller alternativt kortnummer.
   - Systemet visar bara förnamn och maskerat personnummer.
   - Personen väljer IN, UT eller RAST.
   - Stämplingen sparas som en ny post i den append-only journalen `time_entries`.
   - Om nätet saknas krypteras identifieraren lokalt och stämplingen läggs i en offlinekö.
   - När nätet kommer tillbaka skickas kön till backend.

2. **Administrations- och uppföljningsdelen i ERP**
   - `/clock-stations`: skapa, aktivera om, rotera kod, återkalla och konfigurera stationer.
   - `/time-entries`: läsa dagslistan och journalen, efterregistrera och skapa korrigeringar.
   - `/staff-rules`: hantera arbetstidsregler, OB-data, lönearter, driftställen och helgdagar.
   - `/payroll-exports`: räkna arbetstid/OB och spara ett löneunderlag samt ladda ner CSV.
   - `/clock-vs-pk`: jämföra den egna klockan med importerade Personalkollen-tider.

Den centrala principen är:

> `time_entries` är den historiska sanningen. En felaktig stämpling ändras eller raderas aldrig. En rättelse skapar en ny rad som pekar på originalet.

---

## 2. Övergripande arkitektur

```text
┌──────────────────────────────┐
│ Kiosk /clock                 │
│ Ingen ERP-session            │
│ Personnummer/kortnummer     │
└──────────────┬───────────────┘
               │ x-clock-session + JSON
               ▼
┌──────────────────────────────┐
│ Edge Functions               │
│ clock-activate               │
│ clock-punch                  │
│ clock-status                 │
└──────────────┬───────────────┘
               │ servervalidering
               ▼
┌──────────────────────────────────────────────────┐
│ Lovable Cloud-databasen                          │
│ clock_stations                                   │
│ clock_station_sessions                           │
│ employees                                        │
│ clock_pending_registrations                      │
│ time_entries  ← append-only journal              │
│ work_sites / cost centers                        │
└──────────────┬───────────────────────────────────┘
               │ AFTER INSERT-trigger
               ▼
┌──────────────────────────────┐
│ staff_shifts                 │
│ härledda pass för befintliga │
│ personalvyer                 │
└──────────────────────────────┘

ERP-admin ── RLS-skyddad läsning/skrivning ──► journal, regler, export
Personalkollen ── read-only import ─────────► pk_logged_times
Fortnox ── förberedd koppling för employee/löneunderlag
```

### Viktig gräns

Kioskklienten läser inte tabeller direkt. Den går genom `src/lib/clockApi.ts` till de dedikerade funktionerna. Administrationsvyerna är däremot inloggade ERP-vyer och läser tabeller genom den vanliga klienten, med RLS som åtkomstkontroll.

---

## 3. Användarflöde: från skapad station till registrerad tid

### 3.1 Administratören skapar stationen

I `/clock-stations`:

1. Administratören anger stationsnamn och butik/enhet.
2. `useCreateClockStation()` anropar RPC-funktionen `clock_station_create`.
3. Backend skapar en slumpmässig aktiveringskod.
4. Endast hash och de sista fyra tecknen sparas i databasen.
5. Hela koden visas i dialogen en gång och kan kopieras eller visas som QR-kod.

Källor:

- `src/pages/ClockStations.tsx`
- `src/hooks/useClock.ts`, `useCreateClockStation`
- migration `20260825154927_...sql`, `clock_station_create`

### 3.2 Kiosken aktiveras

I `/clock`:

```ts
const res = await call("clock-activate", {
  activation_code: activationCode,
});

localStorage.setItem(CLOCK_SESSION_KEY, res.session_token);
localStorage.setItem(CLOCK_STATION_KEY, JSON.stringify(res.station));
```

`clock-activate`:

1. Läser aktiveringskoden i request body.
2. Normaliserar den genom att ta bort blanksteg och göra den versal.
3. Hashar med `CLOCK:`-prefix.
4. Söker matchande aktiv station.
5. Skapar en slumpmässig sessionstoken.
6. Sparar bara hash av sessionstoken i `clock_station_sessions`.
7. Returnerar stationsinformation och relevanta aktiva driftställen.

Sessionens TTL är 12 timmar och förnyas vid varje giltigt anrop.

### 3.3 Personal identifierar sig

Kiosken accepterar:

- svenskt personnummer i 10 eller 12 siffror, eller
- `employees.alt_clock_identifier`, till exempel ett kortnummer.

Backend gör följande:

1. Normaliserar personnumret till 10 siffror.
2. Hashar det med `SE:`-prefix.
3. Söker på `employees.pnr_hash`.
4. Om ingen träff finns söker den på `alt_clock_identifier`.
5. Om träff finns returneras endast förnamn och maskerat personnummer.
6. Om ingen träff finns skapas en post i `clock_pending_registrations`.

Det fullständiga personnumret ska alltså inte lagras eller returneras av klockflödet. `pnr_masked` är den enda visningsformen.

### 3.4 Systemet föreslår nästa åtgärd

Senaste dagens stämpling används för att föreslå åtgärd:

```text
senaste = in eller rast_slut  → föreslå UT
senaste = rast_start          → föreslå RAST SLUT
ingen annan relevant status    → föreslå IN
```

Kiosken visar alltid knappar för IN, UT och RAST. På bekräftelsesteget finns också uttrycklig knapp för `Rast slutar`.

### 3.5 Driftställe och kostnadsställe

Om stationen har flera aktiva driftställen visas ett val i kiosken. Det valda driftstället skickar:

- `work_site_id`
- driftställets `posting_cost_center`
- eventuell position och noggrannhet

Vid en instämpling krävs ett driftställe om stationen har flera möjliga driftställen. Backend validerar att driftstället tillhör samma butik som stationen.

### 3.6 Geofence

När driftstället har koordinater:

1. Kiosken försöker läsa webbläsarens position.
2. Den skickar latitud, longitud och noggrannhet.
3. Backend räknar avståndet med Haversine-formeln.
4. Stämpling godkänns bara om avståndet ligger inom `geofence_radius_m`.
5. Vid fel sparas `distance_m` och `geofence_ok` när en stämpling kan registreras.
6. Om mobil stämpling är tillåten men position saknas nekas stämplingen med tydligt fel.
7. Geofence-/valideringsfel köas inte lokalt, eftersom det skulle kunna kringgå platskontrollen.

Om driftställets `allow_mobile_punch` är falskt är position inte ett krav på samma sätt; kontrollen används främst för konfigurerade platslås.

### 3.7 Stämplingen skrivs

För IN/UT kan stationens avrundningsprofil tillämpas. Rast start/slut sparas utan den här avrundningen.

Posten innehåller bland annat:

```ts
{
  employee_id,
  station_id,
  store_id,
  legal_entity_id,
  work_site_id,
  cost_center,
  punch_lat,
  punch_lng,
  punch_accuracy_m,
  distance_m,
  geofence_ok,
  offline_queued,
  synced_at,
  type,             // in | ut | rast_start | rast_slut
  occurred_at,
  registered_at,
  source: "clock",
  note
}
```

### 3.8 Bekräftelse och ”På plats nu”

Efter godkänd stämpling visas en kvittens i tre sekunder. Kiosken hämtar också regelbundet aktuell närvaro via `clock-status`.

En person räknas som aktiv om senaste relevanta status är:

- `in`
- `rast_start`
- `rast_slut`

`rast_start` visas som att personen är på rast. `ut` tar bort personen från listan.

---

## 4. Offlineflödet

Offlineflödet finns i `src/lib/clockQueue.ts` och använder IndexedDB-databasen `mt-clock`.

### 4.1 Vad som lagras lokalt

- åtgärd
- ursprunglig `occurred_at`
- driftställe
- kostnadsställe
- eventuell geolocation
- en krypterad identifierare
- en läsbar etikett, till exempel `Stämpling köad 13:12`

Själva identifieraren lagras inte i klartext. En 256-bitars AES-GCM-nyckel skapas lokalt och sparas i IndexedDB:s key store. Varje köpost får ett slumpmässigt 12-byte IV.

### 4.2 Köning

```ts
const key = await deviceKey();
const iv = crypto.getRandomValues(new Uint8Array(12));
const cipher = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv },
  key,
  new TextEncoder().encode(identifier),
);
```

Kvittensen visar endast den maskerade texten:

```text
Stämpling köad 13:12
```

### 4.3 Synkning

När browsern får tillbaka nätet:

1. `syncQueue()` hämtar poster i ordning.
2. Poster äldre än 72 timmar raderas.
3. Identifieraren dekrypteras tillfälligt i minnet.
4. Den skickas genom samma `punch()`-väg som en vanlig stämpling.
5. Vid lyckad synkning raderas könsobjektet.
6. Vid fel stoppas synkningen vid den aktuella posten så att senare poster inte går förbi den.
7. Klartextvariabeln nollställs i `finally` så långt JavaScript tillåter.

En viktig säkerhetskonsekvens är att offlinekön inte är en fribiljett för geofence. När den synkas skickas platskontexten med och backend gör sin vanliga validering.

---

## 5. Administrationsvyer

### 5.1 Stationer — `/clock-stations`

Funktioner:

- lista aktiva och återkallade stationer
- skapa station kopplad till butik
- visa aktiveringskod en gång
- generera QR-kod
- kopiera aktiveringskod
- rotera kod
- återkalla station
- redigera stationsprofil
- se senaste kontakt
- hantera väntande personalregistreringar

Behörighet: `ADMIN` i `src/lib/pageAccess.ts`.

Stationsprofilen innehåller i nuläget:

```ts
{
  rounding: {
    mode: string;
    step: number;
    direction: "nearest" | "up" | "down";
  },
  break: {
    mode: "manual" | "auto";
    auto_after_hours: number;
    auto_minutes: number;
  },
  tolerance_minutes: number,
  geofence: boolean
}
```

Det är viktigt att skilja på profilflaggan `geofence` och driftställets faktiska geofencefält. Den server-side kontrollen i `clock-punch` använder i första hand driftställets koordinater, radie och `allow_mobile_punch`.

### 5.2 Väntande registreringar

När en person inte kan identifieras skapas en väntande post. Admin kan:

- granska maskerad identifierare
- se uppgivet namn, station, butik och tid
- koppla posten till en befintlig anställd
- godkänna
- avvisa

Godkännande använder `clock_pending_approve`. Den kopplar identifieringen till personalkortet så att nästa stämpling kan hittas.

### 5.3 Rapporterad tid — `/time-entries`

Vyn innehåller:

- datumintervall
- filter på enhet/butik
- dagslista per person
- första IN, sista UT, rast och arbetad tid
- källa: klocka, manuell, rättelse eller import
- journal med alla ursprungliga och korrigerande poster
- manuell efterregistrering
- rättelse genom ersättning
- ogiltigförklaring
- anteckning/orsak
- kontrolläge för personalliggare
- utskrift/PDF i kontrolläge

Dagslistan räknas från `effectiveEntries()`, inte genom att radera gamla poster.

### 5.4 Inspektörsläge / personalliggare

Knappen `Visa för Skatteverket` skapar en post i `inspector_sessions` med:

- SHA-256-hashat sessionsvärde
- starttid
- sluttid två timmar framåt
- orsak
- eventuell återkallningstid

Kontrollvyn visar:

- datum
- person
- start
- slut
- rast
- arbetad tid
- källa
- korrigeringshistorik
- registreringstid
- anteckningar

Vyn kan skrivas ut eller sparas som PDF genom browserns utskriftsfunktion. När den stängs sätts `revoked_at`.

### 5.5 Regler & OB — `/staff-rules`

Vyn hämtar fem datakällor:

- `work_rules`
- `ob_windows`
- `payroll_holidays`
- `wage_codes`
- `work_sites`

Den visar:

- versionerade arbetstidsregler
- regelvärden och enheter
- markerade overifierade regler
- OB-fönster per veckodag/helgdag
- procentnivå, exempelvis 50/70/100
- kopplad eller saknad löneart
- driftställe, kostnadsställe, radie och mobilpolicy
- helgdagar som påverkar OB-klassning

I nuvarande UI kan regelvärden uppdateras och helgdagar läggas till. OB-fönster, lönearter och driftställen visas, men hela CRUD-redigeringen för alla deras fält är inte färdig i denna vy.

### 5.6 Löneunderlag — `/payroll-exports`

Vyn hämtar `time_entries`, aktiva `ob_windows` och `payroll_holidays` för vald period.

För varje person:

1. Effektiva IN/UT-poster sorteras.
2. Ett IN öppnar ett arbetspass.
3. Ett efterföljande UT stänger passet.
4. Tiden delas upp i 15-minutersintervall.
5. Varje intervall klassas som ordinarie, OB 50, OB 70 eller OB 100.
6. Den högsta matchande OB-procenten vinner om fönster överlappar.
7. Saknad löneart flaggar raden.
8. Om total tid överstiger 160 timmar i perioden klassas överskottet som enkel övertid enligt den nuvarande förenklade beräkningen.

Löneunderlaget sparas som:

- en rad i `payroll_exports`
- en rad per person i `payroll_export_lines`

Om en OB-period saknar löneart blir exportens status `blocked` och sparandet blockeras i UI. CSV kan laddas ner lokalt.

### 5.7 Klocka vs Personalkollen — `/clock-vs-pk`

Vyn jämför per person och dag:

- första/sista tid i Makrill Trades klocka
- arbetad tid från `time_entries`
- motsvarande tider från `pk_logged_times`
- differens i minuter

Rader med mer än fem minuters differens markeras som avvikelse. Rader som bara finns i en källa visas separat.

---

## 6. Datamodell och relationer

### 6.1 `employees`

Personalens identitet och klockidentifiering.

Viktiga fält:

- `id`
- `staff_id` → `staff.id`, valfri koppling till äldre/övergripande personalpost
- `pk_staff_id` → Personalkollen-identitet som text
- `first_name`, `last_name`
- `pnr_hash` → hashat personnummer, unikt
- `pnr_masked`
- `pnr_last4`
- `alt_clock_identifier` → alternativt kort-/klock-ID
- `is_active`

Personnummer i klartext ska inte ligga i denna modell.

### 6.2 `clock_stations`

En fysisk eller dedikerad klockenhet.

Relationer:

```text
clock_stations.store_id → stores.id
clock_stations.legal_entity_id → bolagets identifierare
clock_stations.id ← clock_station_sessions.station_id
clock_stations.id ← time_entries.station_id
```

Viktiga fält:

- aktiveringskodens hash
- kodhint
- status `active`/`revoked`
- senaste kontakt
- JSON-profil

### 6.3 `clock_station_sessions`

Server-only-tabell för sessionshashar.

- `station_id` → `clock_stations.id`
- `token_hash` är unikt
- `expires_at`
- `last_used_at`

Frontend får tokenvärdet endast vid aktivering. Databasen sparar hashvärdet.

### 6.4 `time_entries`

Den centrala append-only journalen.

```text
employees 1 ─── * time_entries
clock_stations 1 ─── * time_entries
stores 1 ─── * time_entries
work_sites 1 ─── * time_entries
 time_entries 1 ─── * time_entries.corrects_entry_id
```

Viktiga fält:

- vem: `employee_id`
- varifrån: `station_id`, `store_id`, `legal_entity_id`
- var: `work_site_id`, `cost_center`
- platsbevis: `punch_lat`, `punch_lng`, `punch_accuracy_m`, `distance_m`, `geofence_ok`
- synk: `offline_queued`, `synced_at`
- händelse: `type`
- faktisk händelsetid: `occurred_at`
- registreringstid: `registered_at`
- källa: `source`
- rättelse: `corrects_entry_id`, `correction_kind`
- audit: `created_by`, `note`

Tillåtna `type`:

```text
in | ut | rast_start | rast_slut
```

Tillåtna `source`:

```text
clock | manual | correction | import
```

### 6.5 Append-only och effektiv tid

Databasen blockerar UPDATE och DELETE på `time_entries` genom trigger. UI:t skapar i stället en ny rad:

```text
Original:  08:03 IN
Rättelse:  08:00 IN, corrects_entry_id = original.id,
           correction_kind = replace
```

Vid ogiltigförklaring skapas en ny rättelserad med `correction_kind = void`.

Effektiv mängd räknas sedan så här:

```ts
const superseded = new Set(
  entries.map((entry) => entry.corrects_entry_id).filter(Boolean),
);

return entries
  .filter((entry) => !superseded.has(entry.id))
  .filter((entry) => entry.correction_kind !== "void");
```

### 6.6 `clock_pending_registrations`

Tillfällig kö för okända eller ännu inte godkända personer.

Relationer:

```text
clock_stations 1 ─── * clock_pending_registrations
employees 1 ─── * clock_pending_registrations (valfri tills godkänd)
```

Full identifierare undviks även här. Tabellen innehåller hash/maskering, inte ett fritt personnummerfält.

### 6.7 `work_sites`

Driftställe och konteringskontext.

Viktiga fält:

- `store_id`
- `legal_entity_id`
- `kind`
- `cost_center`
- `posting_cost_center`
- `geofence_lat`, `geofence_lng`
- `geofence_radius_m`
- `allow_mobile_punch`
- `ledger_required`
- `is_active`

`clock-activate` skickar aktiva driftställen som hör till stationens butik eller bolag. `clock-punch` validerar sedan valt driftställe igen på serversidan.

### 6.8 `time_allocations`

Datamodell för att dela ett arbetspass mellan driftställen/kostnadsställen:

- person
- driftställe
- kostnadsställe
- start/slut
- kopplad start-/slutstämpling
- rättelsepekare
- korrigeringsorsak

Tabellen är skapad med RLS och relationer, men det finns inte ett komplett UI- eller klockflöde som skapar dessa intervall automatiskt i den nuvarande implementationen. Den ska därför betraktas som **förberedd**, inte som färdig funktion.

### 6.9 Regel- och löneunderlagstabeller

```text
work_rules
  versionerade generella arbetstidsregler

ob_windows
  tidsfönster och procentnivåer för OB
  wage_code_id → wage_codes.id

wage_codes
  lönearter per bolag/typ

payroll_holidays
  datum som klassas som holiday/saturday/weekday

payroll_exports
  ett sparat löneunderlag för en period

payroll_export_lines
  export_id → payroll_exports.id
  employee_id → employees.id
  work_site_id → work_sites.id (valfri)
```

### 6.10 `inspector_sessions`

Tidsbegränsad session för kontrolläge.

- `token_hash`
- `work_site_id`
- `starts_at`
- `expires_at`
- `reason`
- `created_by`
- `revoked_at`

Den används i UI:t för att öppna och stänga inspektörsvyn och journalför själva kontrollsessionen.

---

## 7. Server-side säkerhet

### 7.1 Stationssession

`requireStation()`:

```ts
const token = req.headers.get("x-clock-session") ?? "";
const hash = await sessionTokenHash(token);
const session = await db
  .from("clock_station_sessions")
  .select("id, station_id, expires_at")
  .eq("token_hash", hash)
  .maybeSingle();
```

Den kontrollerar:

- token finns
- tokenhash matchar
- sessionen inte gått ut
- stationen finns
- stationen är aktiv

Efter godkänd request förnyas sessionen och `last_seen_at` uppdateras.

### 7.2 Personnummer

```ts
export function normalizePnr(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 12) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

export const pnrHash = (pnr: string) => sha256Hex(`SE:${pnr}`);
```

Fullt personnummer ska aldrig hamna i:

- frontendrespons
- stationslista
- väntande registreringskort
- loggmeddelanden
- CSV från klockflödet

### 7.3 Rate limiting

`clock_rate_limits` begränsar uppslag till högst fem försök per minut och station. Denna tabell är endast serveråtkomlig.

### 7.4 RLS och roller

ERP-vyerna kräver adminbehörighet enligt page access:

```text
/clock-stations   ADMIN
/time-entries     ADMIN
/staff-rules      ADMIN
/payroll-exports  ADMIN
/clock-vs-pk      ADMIN
```

Databasens policies begränsar ytterligare läsning/skrivning. Exempel:

- stationsläsning: plattformsadmin, admin eller butiksåtkomst
- stationsändring: plattformsadmin/admin
- time entries-läsning: plattformsadmin/admin, butiksåtkomst eller personen själv
- manuell/correction insert: admin eller behörig butikschef inom synlig butik
- sessions- och rate-limit-tabeller: service role/serverfunktion

### 7.5 CORS

Klockfunktionerna tillåter definierade Makrill Trade-, Lovable- och localhost-origins och skickar CORS-headers även på felrespons. Klocksessionen skickas i `x-clock-session`.

---

## 8. Koppling till `staff_shifts`

Det finns en äldre/övergripande passmodell `staff_shifts`. Stämpelklockan skriver inte direkt till den från frontend.

I stället finns en databastrigger:

```text
AFTER INSERT ON time_entries
  → time_entries_sync_staff_shift()
  → staff_shifts_rebuild_from_clock_internal(employee_id, svensk dag)
```

Rebuild-algoritmen:

1. Hitta `employees.staff_id`.
2. Ta bort tidigare `staff_shifts` med `source = 'clock'` för personen och dagen.
3. Läs effektiva IN/UT-poster i svensk tid.
4. Para IN med nästa UT.
5. Skapa öppet pass om IN saknar UT.
6. Ignorera UT utan föregående IN.
7. Spara länkarna `time_entry_in_id` och `time_entry_out_id`.

Detta gör att befintliga personalvyer som läser `staff_shifts` kan fortsätta fungera, medan `time_entries` behåller källhistoriken.

Det finns också RPC-funktioner för att bygga om en person/dag eller ett helt datumintervall. De är skyddade med server-side behörighetskontroll.

### Svensk tidszon

Klockans nya passkoppling använder `Europe/Stockholm` när dagsgränsen bestäms. Detta är viktigt runt midnatt och sommar-/vintertid.

---

## 9. Koppling till schema och attest

Stämpelklockan har närliggande schema-/attestmodeller:

- `shifts` för planerade pass
- `attestations` för attestresultat och avvikelser
- `period_locks` för låsta löneperioder

Korrigeringar av `time_entries` blockeras om butikens period är låst. Attestering har också en egen låskontroll.

Status i nuvarande stämpelklockkod:

- journal, efterregistrering och correction: implementerat
- låsta perioder för correction: implementerat server-side
- attestmotorn: implementerad i edge function `attest-compute`, som matchar `time_entries` mot publicerade `shifts` per person och svenskt datum, räknar rast av `rast_start`/`rast_slut`-par och sätter `auto_approved` inom stationens `tolerance_minutes` (default 7) eller `flagged` med avvikelsetyp (`sen_in`, `tidig_ut`, `missad_rast`, `oplanerad_tid`, `missat_pass`). Korrigerade poster räknas bort via `corrects_entry_id`.
- attestbeslut: implementerat i `/attestations` (`src/pages/Attestations.tsx` + `src/hooks/useAttest.ts`) med bulkbeslut, underlagsval (schematid, stämplad tid, justerad tid), loggning av `decided_by`/`decided_at` samt låsning och loggad upplåsning av period.
- attestknapp direkt i `TimeEntriesPage`: inte implementerad — beslut fattas i attestvyn, inte i journalvyn
- automatisk jämförelse mot schemalagt pass sker i `attest-compute`, inte i `time-entries`-vyn

---

## 10. Koppling till Personalkollen

Personalkollen-importen är read-only från Makrill Trades perspektiv.

Flöde:

```text
Personalkollen API
  → personalkollen-sync
  → pk_staff / pk_logged_times / pk_work_periods / pk_workplaces
  → usePkLoggedTimes()
  → /clock-vs-pk
```

`usePkLoggedTimes()`:

1. hämtar `pk_staff` och bygger URL → `employee_id`
2. hämtar `pk_logged_times` för perioden
3. hoppar över makulerade poster
4. väljer `real_start`/`real_stop` när de finns
5. grupperar i frontend per person och svensk datumdel
6. jämför med `summarizeDays(time_entries)`

Det finns alltså en jämförelsevy, men den är inte en automatisk skrivning tillbaka till Personalkollen och inte en automatisk ersättning av `time_entries`.

---

## 11. Koppling till Fortnox

### Det som är kopplat

Personalmodellen har Fortnox-relaterade fält, bland annat `employments.fortnox_employee_id`. Löneunderlagstabellerna har `fortnox_reference`, vilket ger plats för extern referens.

`/payroll-exports` skapar ett strukturerat internt löneunderlag och CSV med:

- person
- period
- ordinarie minuter
- OB 50 minuter
- OB 70 minuter
- OB 100 minuter
- övertidsminuter
- om löneart saknas

### Det som inte är färdigkopplat

I den granskade koden finns ingen färdig edge function eller UI-knapp som skickar `payroll_exports` direkt till Fortnox löne-API. Nuvarande flöde är därför:

```text
time_entries
  → OB-/tidsberäkning
  → payroll_exports + payroll_export_lines
  → CSV-nedladdning
  → eventuell extern Fortnox-import manuellt
```

Detta ska inte beskrivas som en fullautomatisk Fortnox-lönekoppling ännu.

---

## 12. Exakta huvudfunktioner i kod

### 12.1 Kioskens API-lager

Fil: `src/lib/clockApi.ts`

```ts
activate(code)
  → POST clock-activate
  → sparar stationssession lokalt

lookup(identifier)
  → POST clock-punch { mode: "lookup" }

punch(identifier, action, occurredAt, context)
  → POST clock-punch { mode: "punch", ... }

statusOnSite()
  → POST clock-status
```

### 12.2 Kioskens beslutsträd

Fil: `src/pages/Clock.tsx`

```text
inte aktiverad?
  → visa aktiveringsfält

aktiverad?
  → visa identifieringsfält

offline vid lookup?
  → skapa offline-identitet och gå till åtgärd

online och träff?
  → visa namn, maskerat PNR och föreslagen åtgärd

online utan träff?
  → skapa pending registration

IN och flera driftställen utan valt driftställe?
  → blockera

plats-/valideringsfel?
  → visa fel, köa inte

annat nätverksfel?
  → lägg i krypterad offlinekö
```

### 12.3 Dagsberäkning

Fil: `src/lib/timeEntries.ts`

`summarizeDays()`:

- filtrerar bort superseded/void-poster
- grupperar per person och datum
- summerar IN→UT som arbete
- summerar RAST START→RAST SLUT som rast
- räknar arbetad tid som arbete minus rast
- behåller källorna för spårbarhet

### 12.4 OB-beräkning

Fil: `src/pages/PayrollExports.tsx`

`splitPremium()` går framåt i 15-minuterssteg och klassar varje intervall enligt:

```text
helgdag → payroll_holidays.treated_as
lördag/söndag/veckodag → lokal svensk veckodag
matchande OB-window → högsta pct
ingen match → ordinarie tid
```

### 12.5 Rättelsemodell

Fil: `src/pages/TimeEntriesPage.tsx`

```ts
await createEntry.mutateAsync({
  employee_id: correcting.employee_id,
  store_id: correcting.store_id,
  station_id: correcting.station_id,
  type: correcting.type,
  occurred_at: occurredAt,
  corrects_entry_id: correcting.id,
  correction_kind: "replace" | "void",
  note,
});
```

Originalet lämnas kvar. Det är den här modellen som gör journalen revisionsbar.

---

## 13. Vad som är färdigt enligt kodgenomgången

### Färdigt/implementerat

- fristående kioskroute utan ERP-login
- stationsaktivering med hashad kod
- förnybar, tidsbegränsad stationssession
- stationer kopplade till butik/enhet
- stationskod kan roteras och återkallas
- QR-kod för aktivering
- personnummer normaliseras och hash-matchas
- alternativt kort-/klock-ID
- maskerat personnummer i svar och UI
- väntande registrering för okänd personal
- godkänn/avvisa väntande registrering
- IN, UT, rast start, rast slut
- föreslagen nästa åtgärd
- append-only `time_entries`
- manuell efterregistrering
- correction/replace/void med referens
- anteckning på journalpost
- driftställe och kostnadsställe i stämpling
- server-side driftställeskontroll
- server-side geofenceberäkning
- offlinekö med AES-GCM-krypterad identifierare
- 72 timmars maxålder för offlineposter
- automatisk synkning när nätet återkommer
- ”På plats nu” för stationen
- rate limit per station
- stationsprofil för avrundning/rast/tolerans
- regler/OB/helgdagar/löneartsmodell
- periodbaserat löneunderlag
- OB 50/70/100-beräkning i 15-minutersintervall
- blockering när OB-löneart saknas
- intern payroll-export och CSV
- tidsbegränsat inspektörsläge
- utskrift/PDF via kontrolläge
- direkt triggerkoppling till härledda `staff_shifts`
- jämförelsevy mot importerade Personalkollen-tider
- RLS och page-level admin access för administrationsvyer
- periodlås som blockerar stämplingskorrigering

---

## 14. Begränsningar och punkter som bör verifieras/byggas vidare

Detta är viktigt att skicka med vid extern granskning så att ingen antar att förberedda tabeller automatiskt betyder färdig funktion.

### 14.1 Full Fortnox-löneexport saknas

Nuvarande implementation sparar internt löneunderlag och laddar ner CSV. En direkt API-export till Fortnox lönefunktion är inte färdig i den granskade koden.

### 14.2 `time_allocations` saknar komplett användarflöde

Tabellen finns med RLS och relationer, men klockan skapar inte automatiskt flera konteringsintervall under ett pågående pass. Ett separat flöde behöver definiera hur en person byter driftställe under passet och hur detta attesteras.

### 14.3 Arbetstidsregler är främst data, inte full enforcement

`work_rules` kan lagra regler som dygnsvila, veckovila eller övertidsnivåer, men den granskade `clock-punch`-funktionen blockerar inte dessa regler i realtid. Ett komplett regelverk behöver:

- specificerade rule keys
- tidszonsmedveten beräkning
- varning/blockering per regel
- undantag och dokumenterad orsak
- koppling till attest och löneexport

### 14.4 Rastprofilen är delvis konfiguration

Stationsprofilen har auto-rastfält, men den centrala `time_entries`-skrivningen skapar inte i den granskade funktionen automatiskt en `rast_start`/`rast_slut`-post efter X timmar. Automatisk rast behöver därför verifieras eller implementeras innan den marknadsförs som aktiv funktion.

### 14.5 Attestflödet i rapporterad tid är inte färdigt

`TimeEntriesPage` kan markera dagsrader, men visar att attest kommer i senare etapp. Attestationsmodellen finns i databasen och används av schemaflöden, men en komplett attestknapp från denna vy är inte klar.

### 14.6 Auto-clock-out har en separat legacy-väg

Det finns en `auto-clock-out-shifts`-funktion som stänger öppna poster i `staff_shifts` vid svensk dygnsgräns. Den är inte samma sak som att skapa en `ut`-post i den append-only `time_entries`-journalen. Detta måste beslutas tydligt:

- antingen ska klockan alltid skapa en historisk `ut`-händelse,
- eller ska legacy-passet endast vara en härledd presentation.

Annars kan journal och visat pass få olika semantik.

### 14.7 Tidszon bör standardiseras i alla UI-filter

Vissa frontendhjälpare använder `new Date().toISOString().slice(0, 10)`, vilket är UTC-baserat. Backendens passrebuild använder Europe/Stockholm. Datumfilter runt svensk midnatt bör därför testas och standardiseras så att kiosk, rapport och löneperiod alltid använder samma lokala datumlogik.

### 14.8 Inspektörstoken används främst som sessionsjournal

UI:t skapar och återkallar en hashad `inspector_sessions`-post. Ett separat externt kontrollflöde som validerar en inspektörstoken utan inloggad admin har inte identifierats i den granskade klientkoden.

### 14.9 Stationens JSON-profil och driftställets geofence överlappar

`clock_stations.profile.geofence` finns som stationsinställning. Den faktiska serverkontrollen läser däremot driftställets geofence-koordinater, radie och mobilpolicy. Dessa två nivåer bör förenas eller dokumenteras ännu tydligare för att undvika att en admin ändrar en flagga och förväntar sig annan serverlogik.

### 14.10 Rättelse och rebuild behöver acceptanstester

Följande scenarier bör testas med verkliga testposter:

- IN → UT
- IN → rast start → rast slut → UT
- två IN i rad
- UT utan IN
- öppet pass över midnatt
- replace av IN
- void av UT
- rättelse efter periodlås
- offlinepost inom 72 timmar
- offlinepost äldre än 72 timmar
- offlinepost utanför geofence
- kodrotation medan kiosk har gammal session
- återkallad station
- okänd person som senare godkänns
- svensk sommar-/vintertid

---

## 15. Förslag på acceptansdefinition

Stämpelklockan kan betraktas som produktionsklar när alla punkter nedan är verifierade:

```text
[ ] Station kan skapas, aktiveras, roteras och återkallas.
[ ] Giltig session fungerar och gammal session nekas efter rotation/återkallning.
[ ] PNR/kortidentifierare lämnar aldrig systemet i klartext utanför requestens livstid.
[ ] Okänd person hamnar i pending och kan kopplas utan dubbelregistrering.
[ ] IN/UT/rast ger korrekt kvittens och korrekt På plats nu-status.
[ ] Offlinekö krypterar, synkar, raderar lyckade poster och stoppar gamla poster.
[ ] Geofence kan inte kringgås via offlineflödet.
[ ] Append-only-regeln kan inte kringgås via vanlig klient.
[ ] Korrigering visar både original och ersättande post.
[ ] Svensk tidszon används vid dag, period och midnatt.
[ ] Härledda staff_shifts och time_entries har definierad källa/semantik.
[ ] Inspektörsläge kan öppnas, skrivas ut och återkallas.
[ ] OB räknas korrekt mot helgdagar och lönearter.
[ ] Blockerade löneunderlag kan inte exporteras som färdiga.
[ ] Fortnox-exportens omfattning är antingen implementerad eller uttryckligen CSV-only.
[ ] Personalkollen-jämförelsen visar differenser utan att skriva över klockans journal.
[ ] RLS, rollåtkomst och butik/bolagsscope testas med minst två roller.
```

---

## 16. Filkarta

### Frontend

```text
src/App.tsx
  fristående route /clock

src/pages/Clock.tsx
  kioskflöde, lookup, punch, offline, På plats nu

src/pages/ClockStations.tsx
  stationer, koder, QR, profil, pendingregistreringar

src/pages/TimeEntriesPage.tsx
  dagslista, journal, efterregistrering, rättelse, inspektörsläge

src/pages/StaffRules.tsx
  regler, OB, lönearter, driftställen, helgdagar

src/pages/PayrollExports.tsx
  tids-/OB-beräkning, sparat underlag, CSV

src/pages/ClockVsPk.tsx
  jämförelse mot Personalkollen

src/hooks/useClock.ts
  ERP-queries/mutations för stationer, journal och pending

src/lib/clockApi.ts
  enda klientvägen för kioskens serveranrop

src/lib/clockQueue.ts
  krypterad IndexedDB-offlinekö

src/lib/timeEntries.ts
  effektiv journal och dagsberäkning

src/lib/pageAccess.ts
  page-level access för adminvyer
```

### Backend

```text
supabase/functions/_shared/clock.ts
  hashning, station session, CORS, rate limit, avrundning

supabase/functions/clock-activate/index.ts
  aktivering och stationssession

supabase/functions/clock-punch/index.ts
  lookup, pending, geofence och skrivning av time_entries

supabase/functions/clock-status/index.ts
  På plats nu per station

supabase/functions/auto-clock-out-shifts/index.ts
  separat legacy-stängning av öppna staff_shifts

supabase/functions/personalkollen-sync/
  read-only Personalkollen-import
```

### Databas

```text
20260825154927_...sql
  grundmodell för stationer, sessioner, time_entries, pending och rate limit

20260831120247_...sql
  work_sites, geofencefält, time_allocations, work_rules,
  ob_windows, payroll_holidays, wage_codes

20260831120515_...sql
  payroll_exports, payroll_export_lines, inspector_sessions

20260827203130_...sql
  time_entries → staff_shifts-rebuild och trigger

20260827212928_...sql
  intern rebuild-funktion och server-side behörighetswrapper

20260827213134_...sql
  slutlig trigger som använder intern rebuild-funktion
```

---

## Slutsats

Riktningen är en servervaliderad, revisionsbar och offline-tålig stämpelklocka där `time_entries` är den historiska sanningen. Kioskflödet, stationssäkerheten, maskerad identifiering, offlinekö, geofence, journal/rättelser, inspektörsläge, OB-underlag och Personalkollen-jämförelse finns i den nuvarande implementationen.

De största punkterna att inte överskatta är den direkta Fortnox-löneexporten, automatisk regel-enforcement, komplett `time_allocations`, full attest från tidsvyn och relationen mellan nya `time_entries` och den separata legacy-funktionen för automatisk stängning av `staff_shifts`.
