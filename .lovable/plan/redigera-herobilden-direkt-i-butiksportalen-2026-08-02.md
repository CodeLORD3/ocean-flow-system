# Redigera herobilden direkt i butiksportalen

Herobilden för aktiv butik visas redan högst upp på alla sidor i butiksportalen (t.ex. Torslanda Torg). Nu ska den kunna bytas och redigeras direkt i vyn, utan att gå till galleriet.

## Vad som byggs

I herobilden (uppe på varje sida i butiksportalen) läggs en diskret kontrollyta som syns vid hovring/tap:

- **Byt bild** – filväljare som laddar upp en ny bild för butiken och sätter den direkt som omslag.
- **Välj bland befintliga** – liten popover med butikens redan uppladdade bilder; klick sätter vald bild som omslag.
- **Bildtext** – redigerbar text som sparas på bilden och visas över heron.
- **Ta bort** – tar bort nuvarande omslagsbild (nästa bild i galleriet tar över, annars platshållare).

Behörighet: kontrollerna visas endast för personal med butiks-/adminbehörighet till den aktiva butiken; övriga ser bara bilden.

Efter byte uppdateras bilden direkt både i heron och på butikskorten (Dashboard, Butiker, Organisation), eftersom samma omslagsbild används överallt.

## Teknisk plan

- `src/components/StoreHero.tsx`: använd `useEntityImages("store", activeStoreId)` istället för enbart cover-mappen, lägg till overlay med knappar och popover.
- Återanvänd befintliga mutationer i `src/hooks/useEntityImages.ts`: `useUploadEntityImage`, `useSetCoverImage`, `useUpdateEntityImage`, delete-mutationen. Vid uppladdning: sätt cover på den nya bilden i samma flöde.
- Invalidera både `["entity-images", "store", id]` och `["store-cover-images"]` så hero och butikskort uppdateras samtidigt.
- Ingen databas- eller schemaändring behövs; bilder lagras som idag i bucket `logos` under `entity-images/store/<id>/`.
