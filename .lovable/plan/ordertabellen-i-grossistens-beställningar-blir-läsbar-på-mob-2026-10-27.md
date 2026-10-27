## Ordertabellen i grossistens beställningar blir läsbar på mobil

**Problem (från bilden):** På mobil trycks kolumnerna Enhet, Beställt och Lager ihop så att rubriker och siffror står en bokstav per rad ("k / g", "3 / 8", "Finns i Ålsten" lodrätt). Produktnamnet tar nästan hela bredden.

**Ändring (bara utseende, endast smala skärmar; dator oförändrad):**
- Rubrikerna Enhet, Beställt och Lager bryts aldrig mitt i ordet; förkortas på mobil till "Enh", "Best.", "Lager".
- Siffror och enhet i dessa kolumner håller ihop på en rad (t.ex. "38", "kg").
- Produktnamnet får krympa och radbrytas i stället för att trycka ihop kolumnerna.
- "Finns i Ålsten …" visas under produktnamnet på mobil (radbrytande text), inte i den smala Lager-kolumnen.
- Ingen sidledsskroll införs. Inga data, statusar eller lager ändras.

### Tekniskt
- `src/pages/WholesaleOrders.tsx`, orderradstabellen (~rad 1580–1760): `whitespace-nowrap` på Enhet/Beställt/Lager-celler och rubriker, `w-px` för att låta dem ta minsta naturliga bredd, produktcellen `break-words`.
- "Finns i"-raden: `hidden sm:block` i lagercellen + kopia med `sm:hidden` under produktnamnet.
- Kontrollera i Playwright med 390 px bredd att inga bokstäver staplas och att sidan inte skrollar i sidled.
