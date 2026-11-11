# Shopify Sverige: daglig kontroll av prenumerationer och missade order

## Vad kontrollen visade (bara läsning, inget ändrat)

**a) Prenumerationer i svenska butiken** – tre stycken, alla orörda sedan 20 augusti 2026:

| Ämne | Pekar på | API-version | Skapad / ändrad |
|---|---|---|---|
| orders/create | shopify-order-webhook (rätt adress) | 2026-07 | 2026-08-20, aldrig ändrad |
| orders/paid | shopify-order-webhook (rätt adress) | 2026-07 | 2026-08-20, aldrig ändrad |
| orders/cancelled | shopify-order-webhook (rätt adress) | 2026-07 | 2026-08-20, aldrig ändrad |

Ingen prenumeration har tagits bort, lagts om eller pekat fel under uppehållen.

**b) Svenska order efter 2026-11-04 19:07 UTC** – en enda: **#2752, 2026-11-09 08:07 UTC**. Den finns i kundordrarna. Butiken har alltså redan tagit emot igen (senaste mottagning 2026-11-09 08:07, inte 11-04 som stod i frågan).

**Hela perioden sedan 1 oktober:** Shopify har 46 order, **#2707–#2752 utan ett enda hopp i numreringen**, och **alla 46 finns** i kundordrarna. Även uppehållen 15–19 okt (#2731 → #2732), 21–25 okt (#2741 → #2742) och 29 okt–2 nov (#2747 → #2748) är luckor utan order i Shopify.

## Trolig orsak

Det har helt enkelt inte kommit några svenska webborder under uppehållen. Inget tappades, inga signaturfel, inga borttagna prenumerationer. Det "gick över av sig självt" eftersom nästa kund beställde.

Bifynd (ingen ändring nu): hemligheten som `shopify_shops` pekar på för svenska nyckeln finns inte. Systemet använder i stället en sparad nyckel från september med behörigheterna läsa order och kunder. Det räcker för kontrollen nedan men bör noteras.

## Förslag: skydd så att ett verkligt avbrott aldrig går obemärkt

Eftersom tystnad är normalt ska kontrollen inte larma på tystnad, utan på det som faktiskt är fel.

1. **Ett dagligt jobb** (en gång per dygn, kl. 06:00 svensk tid) som för varje aktiv Shopify-butik (Sverige och Schweiz):
   - listar prenumerationerna och **lägger tillbaka** de av orders/create, orders/paid, orders/cancelled som saknas eller pekar fel (samma logik som befintliga "laga"-knappen),
   - hämtar butikens order från **de senaste 72 timmarna** och lägger varje order som saknas i kön, bearbetad **genom webhookens egen kodväg** – så dubblettkontrollen gäller och ingen order kan skapas två gånger.
2. **Notis till kontoret bara när något åtgärdats eller misslyckats**: "X prenumerationer lades tillbaka" / "Y missade order hämtades: #nnnn" / "Kontrollen kunde inte nå Shopify". Ingen notis när allt är i ordning. En notis per butik och dag (dedupliceras).
3. **Logg** av varje körning i befintliga integrationsloggen (kort sammanfattning, bara ordernummer, aldrig kunduppgifter eller nycklar).

Inget annat ändras: befintlig webhook, befintliga knappar, ordrar, lager och Fortnox lämnas orörda. Ingen bokföring, ingen radering.

**Test efter bygget (en gång):** kör jobbet manuellt; förväntat resultat är "3 av 3 prenumerationer finns, 0 missade order" för båda butikerna, och ingen notis skickas.

## Tekniska detaljer

- Ny edge-funktion `shopify-health` som anropas av pg_cron med en tjänstehemlighet (ingen inloggning); ingen ändring i `shopify-webhooks` eller `shopify-backfill`.
- Prenumerationer: `GET/POST webhooks.json` som i `shopify-webhooks/ensure`; samma adress och topics.
- Missade order: `orders.json?status=any&created_at_min=now-72h`, jämför `shopify_order_id` mot `customer_orders` och mot `shopify_webhook_events` (orders/create i slutstatus). Saknade köas i `shopify_webhook_events` som `koad` med samma payloadformat som backfyllnaden.
- Bearbetning: `shopify-order-webhook/reprocess` kräver i dag inloggad personal. Jag lägger till att `/reprocess` också godtar samma tjänstehemlighet som jobbet – den enda ändringen i webhook-funktionen; själva orderlogiken rörs inte.
- Schemaläggning: ett pg_cron-jobb `shopify-health-daily`, dagligen (1 gång/dygn), med managed cron-autentisering.
- Notis via befintliga `notifications` med `dedupe_key` per butik och dag; logg i `integration_log` (≤300 tecken).
- Arkitekturregeln läggs i `AGENTS.md`.
