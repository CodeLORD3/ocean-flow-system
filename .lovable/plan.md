# Varför 5 (egentligen 8) webbordrar misslyckades

## Vad jag ser i systemet

- Schweiz-butiken (`iqnb3f-ga.myshopify.com`) har **18 händelser med status `skapad`** (lyckade) och **8 händelser som hänger kvar i status `bearbetar`**, alla utan felmeddelande.
- Funktionsloggen för order-webhooken visar upprepade krascher:
  `ReferenceError: shopifyOrderId is not defined` i `processEvent` (rad 725 i den **driftsatta** versionen).
- Koden i projektet är korrekt — variabeln deklareras innan den används. Den driftsatta versionen av funktionen är alltså en äldre build som har buggen kvar.

Följden: när en händelse kraschar med ReferenceError hinner den aldrig köra `fail()`-hjälparen, så raden fastnar på `bearbetar` med tomt fel istället för att markeras som misslyckad eller läggas i kö för nytt försök. Det är precis mönstret vi ser: 8 rader låsta i `bearbetar`, inget felmeddelande.

Det handlar alltså inte om Shopify-token, HMAC eller valuta — anslutningen fungerar. Det är en gammal driftsatt funktionsversion plus rader som saknar automatisk återställning.

## Åtgärd

1. **Driftsätt order-webhooken igen** så att den aktuella (rättade) koden körs.
2. **Släpp låsta rader**: nollställ de 8 händelserna från `bearbetar` tillbaka till `osorterad` så att de kan bearbetas om, och kör dem igen via befintlig replay-väg.
3. **Verifiera**: bekräfta i loggen att ReferenceError är borta och att alla 8 rader landar som `skapad` eller `duplikat` (dubbletter mot de 18 redan skapade ordrarna är förväntat och ofarligt).
4. **Robusthet (litet tillägg)**: lägg en tidsgräns så att en händelse som stått i `bearbetar` längre än några minuter automatiskt återgår till kön istället för att fastna för alltid, plus att oväntade fel alltid skrivs till `error`-kolumnen.

## Tekniskt

- Redeploy: `shopify-order-webhook` (ingen kodändring krävs för själva ReferenceError-felet).
- SQL: `update shopify_webhook_events set status='osorterad', error=null where shop_domain='iqnb3f-ga.myshopify.com' and status='bearbetar'`.
- I `processEvent`: wrappa hela kroppen så att catch-grenen alltid skriver `status='fel'` + felmeddelande, och behandla `bearbetar` med gammal `last_attempt_at` som återförsöksbar.
