# Importera allergener till produktregistret

Den uppladdade filen innehåller 762 rader — exakt samma artikelnummer som de 762 produkter som redan finns i systemet, varken fler eller färre. Alla produkter saknar idag allergenuppgifter (0 av 762 har något ifyllt), så detta blir en ren komplettering av befintliga produkter. Inga nya produkter skapas och inga priser, lager eller bilder ändras.

## Vad som görs

**1. Allergener fylls i på alla produkter**
Kolumnen `allergener` i filen läses in på respektive produkt:
- Fisk (447 produkter), Kräftdjur (82), Blötdjur, Mjölk, Ägg, Gluten, Selleri, Senap, Svaveldioxid och sulfit
- "Inga" (16 produkter) sparas som uttryckligen allergenfri — tom lista
- 17 rader har inget värde och lämnas tomma (visas som "saknar allergenuppgifter" i beställningsflödet, precis som idag)

**2. Nytt fält "Kan innehålla spår av"**
Filen har även en kolumn `kan_innehalla` (158 produkter, t.ex. "Blötdjur, Kräftdjur"). Det är korskontaminering, inte innehåll, och ska inte blandas med de riktiga allergenerna. Därför läggs ett separat fält till på produkten:
- Visas som egen rad i produktkortet och i produktformuläret, med samma kryssrutor som allergener
- Visas som en mildare notering (inte röd varning) i kundbeställningar
- Utlöser en informationstext — inte en blockerande allergivarning — om kunden undviker något av spåren

**3. Ingen dubblettrisk**
Matchningen sker på artikelnummer. Skulle ett artikelnummer inte hittas hoppas raden över och rapporteras, istället för att skapa en ny produkt.

## Resultat

Efter importen visar varje produkt korrekta allergener, och allergivarningarna i kundbeställningar (privatkund med allergier) börjar faktiskt fungera eftersom underlaget nu finns.

## Teknisk detalj

- Ny kolumn `products.may_contain text[]` (default `'{}'`), migration.
- Etikettsträngarna i filen mappas till de befintliga nycklarna i `src/lib/catering.ts` (`Fisk`→`fisk`, `Kräftdjur`→`skaldjur`, `Blötdjur`→`blotdjur`, `Spannmål som innehåller gluten`→`gluten`, `Ägg`→`agg`, `Mjölk`→`mjolk`, `Selleri`→`selleri`, `Senap`→`senap`, `Svaveldioxid och sulfit`→`sulfit`). "Inga" → `'{}'`, tomt → `NULL`.
- Datauppdateringen körs som en `UPDATE ... FROM (VALUES ...)` mot `sku` — inga inserts.
- `checkAllergenConflict` i `src/lib/catering.ts` utökas med spårnivå (`severity: "contains" | "trace"`), och konsumenterna (`CustomerOrderWizard`, `CustomerOrderRow`, `CateringKitchenList`, packlista-PDF) visar spår som neutral notering.
- `src/pages/Products.tsx`: kryssrutegruppen för allergener dupliceras för `may_contain`, samt visning i produktlistan/kortet.
