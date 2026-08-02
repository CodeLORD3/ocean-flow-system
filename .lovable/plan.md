# Visa butiksbilden på Butiker- och Organisation-sidan

Bilden på Fiskskaldjur Torslanda Torg finns redan i bildgalleriet och är markerad som omslagsbild, men den visas bara på Dashboard. Butiker-sidan visar endast butikens logotyp, och Organisation-sidan visar ingen bild alls.

## Vad som byggs

**Butiker-sidan (/stores)**
- Varje butikskort får en liggande omslagsbild högst upp (16:9), hämtad från butikens galleri.
- Saknas omslagsbild används logotypen, annars en neutral platshållare.
- Befintlig logotyp-uppladdning behålls som den är.

**Organisation-sidan (/organisation)**
- Varje butik i översikten får en liten omslagsbild (thumbnail) intill namnet, från samma källa.
- Saknas bild visas en neutral platshållare så layouten inte hoppar.

Resultat: samma bild syns konsekvent på Dashboard, Butiker och Organisation, och när omslagsbilden byts i galleriet uppdateras alla tre.

## Teknisk detalj

- Ny delad hook som hämtar en omslagsbild per butik från `entity_images` (`entity_type = 'store'`, sorterat på `is_cover` sedan `sort_order`) och returnerar en uppslagstabell `store_id -> url`. Samma logik som i `OurStoresSection` men utbruten så den kan återanvändas.
- `src/pages/Stores.tsx` och `src/pages/OrganisationOverview.tsx` använder hooken; fallback-kedja: omslagsbild → `logo_url` → platshållare.
- Inga databasändringar behövs.
