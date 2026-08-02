# Lägg in butiksbild för Fiskskaldjur Torslanda Torg

Den uppladdade fotografin av butiksfasaden (skylt "Fiskskaldjur – Torslanda Torg") läggs in som butiksbild och sätts som omslagsbild.

## Vad som händer

- Bilden laddas upp till bildlagringen i backend, i mappen för butiksbilder.
- En bildpost skapas för butiken **Fiskskaldjur Torslanda Torg** med bildtext "Butiksfasad – Torslanda Torg".
- Bilden markeras som **omslagsbild**, vilket gör att den:
  - visas som hero-bild på butikskortet i "Our Stores" på dashboarden
  - visas först i butikens bildgalleri i butikens backend

Ingen ny kod behövs – funktionen för omslagsbild finns redan. Detta är enbart innehåll (en bild + en post).

## Teknisk detalj

- Fil: laddas upp till bucket `logos` under `entity-images/store/857b421c-8319-4a66-97c1-7bff980f4967/torslanda-torg.png`.
- Rad i `entity_images`: `entity_type = 'store'`, `entity_id = 857b421c-8319-4a66-97c1-7bff980f4967`, `url` = publik URL, `caption = 'Butiksfasad – Torslanda Torg'`, `sort_order = 0`, `is_cover = true`.
- Eventuell tidigare omslagsbild för samma butik nollställs först (endast en omslagsbild per objekt tillåts av unikt index).
