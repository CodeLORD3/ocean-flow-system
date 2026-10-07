# Laga tre saker i partiflödet

## 1. Omvandlingen i en enda transaktion
- Ny databasfunktion `perform_lot_transformation(...)` (security definer, kontrollerar inloggning och lagerbehörighet för platsens butik på servern).
- I en transaktion: kontrollerar saldot på partiet och platsen, skriver `tillverkning_ut` (och ev. `svinn`), skapar det nya partiet med samma ärvda härkomstfält och samma partinummer (`<källparti>-01-OMV`) som i dag, skriver `tillverkning_in`, `lot_transformations` och `stock_transformations`. Fel någonstans gör att inget sparas.
- Utbytet i procent räknas på samma sätt och returneras tillsammans med nya partiets id.
- `performTransformation` i `src/lib/stockTransform.ts` anropar funktionen i stället för de separata skrivningarna. Samma in- och utdata, så partisidan och övriga anropare fungerar som förut. Flerutfallsvarianten (`performTransformationBatch`) ändras inte.

## 2. Fel vid etikettutskrift efter omvandling
- På partisidan: misslyckas utskriften visas ett tydligt fel med knappen Försök igen (som skriver ut igen) i stället för att tyst hoppa över. Omvandlingen är redan sparad och påverkas inte.

## 3. Hjälptext i kameran
- `BarcodeScanner` får en valfri hjälptext. `LotScanButton` skickar "Rikta kameran mot QR-koden på lådan". Övriga skannrar behåller EAN-13-texten.

## Bevis
- Läsfråga på senaste raden i `lot_transformations`: nya partiet följs bakåt till leverantör och inleverans.
- Inga testpartier i riktiga lager, inget bokförs, inget raderas. Funktionen testas en gång med ett anrop som avvisas (för stor mängd) för att visa att inget sparas.
