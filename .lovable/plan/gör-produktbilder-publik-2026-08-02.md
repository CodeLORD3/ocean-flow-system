# Gör produktbilder publik

## Mål
Bucketen `produktbilder` blir publik så att varje produktbild har en fast, förutsägbar bas-URL istället för signerade tokenlänkar.

## Publik bas-URL efter ändringen
```text
https://tzcvoqnrhjtrxlzhhdmu.supabase.co/storage/v1/object/public/produktbilder/<sku>.jpg
```

## Vad som görs
1. Sätt bucketen `produktbilder` till publik (om arbetsytans policy blockerar publika buckets rapporteras det direkt och vi behåller privat).
2. Läsåtkomst: publik läsning via bucketen; uppladdning/ändring/borttagning fortsatt endast för inloggade.
3. Bulkuppladdningen (`ProductImageBulkUpload`) slutar skapa signerade URL:er och sparar den publika URL:en i `products.image_url`.
4. Migrera befintliga produkter: `image_url` som innehåller `/object/sign/produktbilder/...?token=...` skrivs om till motsvarande `/object/public/produktbilder/...`.
5. Ingen ändring i produktlista, produktkort eller inleverans – de läser redan `image_url`.

## Notering
Bilderna blir därmed åtkomliga för alla som har länken (ingen inloggning krävs). Det avviker från det tidigare kravet "endast internt bruk" – säg till om du vill gå tillbaka till privat läge senare.
