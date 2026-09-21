# Platser, gångvägar och faktisk arbetsväg

Nästa lager ovanpå det som redan fungerar. Genomför, Hur gör vi?, kontrollpunkter, tidtagning, pauser, bilder, kommentarer och resursregistret rörs inte. Inget hårdkodas till Zollikon — allt hänger på butik och butikens egen ritning.

## 1. Områden kan kopplas ihop

Ny koppling mellan två områden på butikskartan med gångtid och avstånd. Redigeras visuellt i kartans Redigera-läge: tryck på ett område, tryck på ett annat, ange sekunder och meter. Kopplingen gäller båda riktningarna och kan stängas av utan att tas bort. Ingen automatisk navigation byggs — systemet ska bara förstå ungefär hur långt det är mellan delarna av butiken.

Om avstånd saknas mellan två områden används kartans egen skala (mittpunkt till mittpunkt) som uppskattning, tydligt märkt "uppskattat".

## 2. Resursens normala plats och återlämning

Platsen ligger kvar på ett enda ställe i registret. Varje plats får en markering för "normal plats enligt 5S" och en valfri anteckning som "På städvagnen" för saker som hör till en annan sak. Återanvändbara saker visas i vägens sista steg som "Lämna tillbaka". Förbrukningsmaterial visas aldrig där.

## 3. Planering visar arbetsvägen

Planering byggs om till en visuell arbetsväg som räknas fram automatiskt ur: uppgiftens område, kraven på uppgiften, butikens valda saker, sakernas platser, områdenas kopplingar och vad som ska tillbaka.

```text
① STÄDSTATION   Hämta: Städvagn, Mopp, Golvmedel    ca 1 min
      ↓
② LAGER         Hämta: Varningsskylt                ca 30 sek
      ↓
③ KORRIDOR      Utför: Städa golvet                 ca 10 min
      ↓
④ STÄDSTATION   Lämna tillbaka: Städvagn, Mopp      ca 1 min
KLAR
```

Under vägen visas summeringen: arbete, förflyttning, förberedelse, kontroll, återställning och beräknad totaltid. Standardtidens fem delar och uppföljningen finns kvar men flyttas ned, under vägen och kartan.

Varje stopp har alltid ett tydligt syfte i vanliga ord: **Hämta**, **Utför**, **Kontrollera** eller **Lämna tillbaka**. Saker som står på samma ställe blir ett enda stopp, och en sak som hör till en annan sak ("Mopp — på städvagnen") hämtas tillsammans med den, aldrig som eget stopp. Återanvändbara saker grupperas på samma sätt vid återlämning; förbrukningsmaterial ger aldrig ett återlämningsstopp.

Systemet försöker inte räkna fram matematiskt kortaste väg — det ger ett rimligt första förslag utifrån startområde, hämtställen, arbetsområdet, områdenas kopplingar och gångtid.

## 3b. Beräknad väg och vår standardväg

Systemet föreslår, människan bestämmer. Under Planering/Inställningar väljer en ansvarig:

```text
VÄG I BUTIKEN
○ Beräkna automatiskt
● Använd vår standardväg
```

Väljs standardvägen kan stoppen flyttas med drag-and-drop och sparas som butikens standardväg för uppgiften — per uppgiftsstandard/variant och butik. Butikskartan ändras inte.

Finns en standardväg visas den diskret mot systemets förslag, som beslutsunderlag:

```text
STANDARDVÄG                 ca 72 m · 3 min 10 sek
Systemets beräknade förslag  ca 61 m · 2 min 45 sek   [ VISA ALTERNATIV ]
```

Ingen text påstår att systemets väg är bättre — det finns praktiska skäl systemet inte känner till.

Flyttas en sak inom samma område (ST-01 → ST-04) fortsätter standardvägen gälla och bara den exakta platsen uppdateras. Flyttas saken till ett annat område visas en varning till ansvarig: "Moppen har flyttats från Städstation till Lager" med knappen **Granska vägen**. Standardvägen ändras aldrig automatiskt.

För personalen syns inget av detta — de ser bara stoppen, vad som ska hämtas, vad som ska göras och totaltiden, med **Visa på kartan**.

## 4. Arbetsvägen på butikskartan

Knappen **Visa hela vägen på kartan** öppnar butikens befintliga karta med stoppen numrerade 1, 2, 3, 4 och en linje mellan dem i ordning. Samma karta, samma områden — bara vägen ovanpå. Ingen GPS-navigation.

## 5. "Var finns det?" i Genomför

Genomför förblir lika kort. Knappen **Var finns det?** öppnar en kompakt lista: sakens namn, område och exakt plats, med **Visa** per rad och **Visa allt på kartan** längst ned. Saknar butiken en vald sak står det tydligt att den behöver väljas.

## 6. Förberedd för att hitta slöseri

Varje gång vägen räknas fram sparas den som en ögonblicksbild: stoppen i ordning, totalt antal meter och beräknad gångtid. Då kan en framtida 5S-ändring jämföras mot dagens standard (−42 meter, −1 min 35 sek per genomförande). Ingen automatisk analys byggs nu, bara datan.

## Teknisk sammanfattning

- Migration: `map_zone_connections` (id, store_id, floor_plan_id, from_zone_id, to_zone_id, walk_seconds, distance_meters, active, created_at/updated_at, unikt par) med GRANT + RLS enligt befintligt mönster (butikens personal läser, admin/butikschef skriver). `resource_locations` får `is_normal_location boolean default true` och `attached_to_resource_id` (t.ex. mopp på städvagnen). Ny `task_route_snapshots` (checklist_item_id, template_item_id, store_id, stops jsonb, total_meters, walk_seconds, created_at) för jämförelse över tid.
- `src/lib/taskRoute.ts`: `buildRoute(area, needs, connections, zones, pxPerMeter)` → stopp med typ (hämta/utför/tillbaka), saker per stopp, meter och sekunder per etapp; fallback till centroid-avstånd via `mapGeometry`/`mapScale` när koppling saknas. Ren funktion med enhetstester (ordning, inga dubbletter, förbrukning utan återlämning, saknad koppling).
- `src/hooks/useZoneConnections.ts` (läsa/spara/inaktivera), `src/hooks/useTaskRoute.ts` (bygger vägen och sparar ögonblicksbild när den ändras).
- Nya komponenter: `src/components/tasks/TaskRoute.tsx` (visuella stopp + summering), `src/components/tasks/NeedsSheet.tsx` ("Var finns det?"), `src/components/storemap/RouteOverlay.tsx`.
- `FloorPlanCanvas.tsx` får valfri `route?: { zoneId, index }[]` som ritar numrerade brickor och linje mellan zonernas centroider; inget annat beteende ändras.
- `StoreMap.tsx` får kopplingsläge i Redigera (välj två zoner → dialog för sekunder/meter) och kan visa en väg via URL-parameter från uppgiften.
- `TaskPlanningPanel.tsx` byter ut nuvarande "Vägen i butiken"-lista mot `TaskRoute`; `TaskPerformPanel.tsx` får enbart knappen som öppnar `NeedsSheet`.
- Verifiering: typecheck, tester för vägberäkningen, samt inloggad genomgång i telefonbredd (390 px) av Genomför → Var finns det? → Planering → Visa hela vägen på kartan.
