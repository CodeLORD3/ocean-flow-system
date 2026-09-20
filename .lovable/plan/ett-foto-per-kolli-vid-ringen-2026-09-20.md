# Ett foto per kolli vid ringen

Antalet kolli styr hur många bilder som ska tas. Anger inköparen 4 kolli tar appen emot 4 bilder och räknar själv upp dem — inköparen behöver inte hålla räkningen i huvudet.

## Så blir flödet

1. Pris per kg och antal kolli som i dag, på samma skärm.
2. Kameran öppnas direkt och rubriken visar **Bild 1 av 4**, under den en rad med små rutor som fylls i takt med att bilderna tas.
3. Efter varje bild: liten förhandsvy, **Ta om** eller **Nästa bild** — kameran öppnas automatiskt igen för nästa kolli.
4. När sista bilden är tagen byter knappen till **Klar (4 bilder)**. Grön bekräftelse, sedan direkt tillbaka till Nytt inköp.
5. Bilder kan tas bort ett i taget innan man sparar; då räknar appen ner igen.

Om antalet kolli ändras nedåt efter att bilder tagits tas de överskjutande bilderna bort; ändras det uppåt fortsätter räkningen på nästa bild.

Köpet kan inte sparas förrän alla kolli är fotograferade — knappen visar då hur många bilder som saknas, t.ex. "2 bilder kvar". Ett kolli utan bild blir aldrig ett parti.

## I dagens lista

- Miniatyren visar första bilden med en liten markering "4 bilder".
- Tryck på miniatyren för att svepa igenom alla bilder på partiet i full skärm.
- Rättas antalet kolli i efterhand visar kortet "bilder saknas: 1" i gult tills bilderna kompletterats.

## Fortfarande ett parti

Ett vunnet bud är ett parti oavsett hur många lådor det gäller. Bilderna är dokumentation av samtliga lådor — de skapar inte fyra partier och inte fyra lagerrörelser. Nominell vikt är fortfarande vikt per kolli × antal kolli.

## Tekniskt

- Migration: lägg till `box_photo_urls text[]` på `auction_purchases` och `lots` (`box_photo_urls`). `box_photo_url` behålls som första bilden så befintliga vyer och miniatyrer fungerar oförändrat.
- `src/lib/auctionPurchases.ts`: `uploadBoxPhoto` blir `uploadBoxPhotos(files, date)` som laddar upp parallellt i `lot-documents/auktion/<datum>/`, skriver hela listan och sätter `box_photo_url` till första. `createAuctionPurchase` tar `photos: File[]` och validerar `photos.length === colli`.
- `src/pages/AuctionMobile.tsx`: steget `foto` håller `File[]`, räknare "Bild n av m", prickrad över antalet kolli, `Ta om`/`Nästa bild`/`Klar (m bilder)`, kameran (`capture="environment"`) öppnas automatiskt om `photos.length < colli`, borttagning per bild. Alla tryckytor minst 56 px och knapparna 64 px som i övriga flödet.
- Ny komponent `src/components/auction/AuctionPhotoStrip.tsx` för miniatyr med antal och helskärmssvep, byggd på `StorageImage`.
- Befintliga köp med en enda bild fortsätter fungera: listan läser `box_photo_urls` när den finns, annars `box_photo_url`.
- Verifiering på 390 px: köp med 3 kolli → räknaren går 1–3, sparandet blockeras vid 2 bilder, tre filer ligger i arkivet på partiet, ett parti och en preliminär rad i dagens lista.
