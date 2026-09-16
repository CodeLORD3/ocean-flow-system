# Butikskarta — integrerad i befintligt ERP

## Vad analysen visade (steg 0)

Redan byggt och som ska återanvändas oförändrat:

| Koncept | Finns som | Slutsats |
| --- | --- | --- |
| Butiker | `stores` (id, namn, stad, bolag, region, lagerplats) | Kartan pekar på befintligt `store_id` |
| Personer | `staff` (profilbild, butik, roll) + `employees` | Ingen ny personmodell |
| Inloggning/roller | `StaffAuthContext`, `user_roles`, `user_scopes`, `has_role`, `is_platform_admin`, `can_see_store` | Återanvänds i RLS |
| Sidbehörighet | `src/lib/pageAccess.ts` (ROUTE_ACCESS) | Ny rutt läggs in där |
| Checklistor | `checklist_templates`, `checklist_template_items`, `checklist_days`, `checklist_items` + `useChecklist.ts` (bl.a. `useToggleChecklistItem`) | Samma poster, samma hookar |
| Bilder | `entity_images` (+ `entity_image_comments`), bucket `logos`, komprimering i `imageCompress` | Återanvänds med nya entitetstyper |
| Avvikelser | `deviations` (source/source_id, ansvarig, åtgärd, stängning) | Anmärkning/avvikelse på kartan |
| Egenkontroll | `control_points` (har redan textfältet `zone`) + `control_records` | Temperaturpunkter kopplas till kartobjekt |
| Notiser | `notifications` + `useNotifications` | Mentions/anmärkningar |
| Logg | `activity_logs` | Aktivitetsflödet |
| Design | shadcn-komponenter i `src/components/ui`, Lucide-ikoner, Verktygstema v1 | Inget nytt designsystem |

## Nya tabeller (bara det som saknas)

Alla additiva, med `store_id`/`floor_plan_id`-nycklar mot befintliga rader, RLS enligt `can_see_store`/`has_role` och `created_at`/`updated_at` som i övriga systemet.

- `floor_plans` — `store_id` → `stores`, namn, våning, bakgrundsbild (URL i `logos`-bucketen), opacity/skala/position, rutnät, `status` (utkast/publicerad), `published_at`.
- `floor_plan_versions` — sparad layout-snapshot (JSON) per publicering. Påverkar aldrig historiska uppgifter.
- `map_geometry` — väggar, dörrar, öppningar som enkla linjer/segment per plan.
- `map_zones` — `floor_plan_id`, `store_id`, namn (Beredning, Fiskdisk, Kassa, Kylrum, Lager, WC, Personal, Entré), polygon, färg.
- `map_object_types` — bibliotek: nyckel, namn, kategori, Lucide-ikon eller top-down-SVG, standardstorlek, föreslagna rutiner.
- `map_objects` — instanser: `object_type_id`, `zone_id`, `floor_plan_id`, `store_id`, namn (Kyl 01 …), x/y, bredd/höjd, rotation, `control_point_id` (valfri koppling till egenkontroll). Identiteten följer objektet även när det flyttas.

## Utökning av befintliga tabeller (inga namnbyten, ingen borttagning)

- `checklist_template_items` + `checklist_items`: nya nullable `zone_id` och `map_object_id`. Uppgiften är samma rad som på checklistsidan — kartan är bara ett annat sätt att bocka av den.
- `entity_images`: ny nullable `image_kind` (standard / progress / completion / issue / general). Kartans bilder sparas som `entity_type = 'map_zone' | 'map_object'` i samma tabell och bucket.
- `deviations`: `source = 'map_zone' | 'map_object'` med `source_id` — ingen ny avvikelsemodell.
- `control_points`: ny nullable `map_object_id` så temperaturpunkter visas på rätt plats.

## Frontend

Ny rutt `/store-map` (Butikskarta) i `ROUTE_ACCESS` och i butiks-/grossist-/adminsidomenyn, renderad i befintlig `AppLayout` med samma flikar, drawers, badges och toaster.

Nya komponenter (endast kartspecifika):
`FloorPlanCanvas`, `MapZoneShape`, `MapObjectShape`, `StatusRing`, `MapLayerSelector`, `MapModeSwitch`, `ZoneDrawer`, `ObjectDrawer`, `ObjectLibrary`, `MapEditor`, `MapComposer` (kommentar/anmärkning/avvikelse i ett fält).

Återanvänds: `Sheet`, `Dialog`, `Tabs`, `Badge`, `Avatar`, `Tooltip`, bilduppladdaren, `EmptyState`, avatarhelpers (`useStaffAvatars`).

Kartlägen: Live, Uppgifter, Städning, Placering, Utrustning — samma karta, olika datalager. Status (grön/gul/röd/blå/lila/grå) beräknas ur uppgifter och avvikelser, aldrig ur ett eget statusfält.

Realtid: samma mönster som övriga systemet — React Query-invalidering plus Supabase-kanal på `checklist_items`, så avbockning från mobil syns direkt på kartan och tvärtom.

Behörighet: personal ser och utför, butiksansvarig hanterar, admin får redigeringsläge, förhandsvisning och publicering. Spärren ligger i RLS, inte bara i knappar.

## Etapper

1. Migration: nya tabeller, tillägg på befintliga, RLS, index.
2. Karta i läsläge för pilotbutiken med zoner, objekt och statuslager.
3. Zone- och objektdrawer med uppgifter, aktivitet, bilder, standardbild.
4. Composer: kommentar, anmärkning, avvikelse — kopplade till inloggat konto.
5. Redigeringsläge: bakgrundsritning, väggar, zoner, objektbibliotek, drag/resize/rotera/duplicera, snap, ångra.
6. Förhandsvisa som personal + publicera med versionshistorik.
7. Pilotdata från den bifogade ritningen kopplad till befintlig butik (inga dubbletter av butik eller personer).
8. Integrationstesterna 1–8 i din lista körs mot riktig data.

## Pilotbutiken

Den bifogade planritningen (Grundrissplan Laden EG 1:100) laddas upp som bakgrund och kopplas till en befintlig butik i registret. Säg vilken butik det gäller — annars föreslår jag Fisk & Skaldjur Zollikon, eftersom ritningen är på tyska.
