# Leverans: kör systemet skarpt på makrilltrade.com

## Rättelse mottagen

Artgrupperna fylls inte. Din siffra stämmer: 762 produkter, 511 med `species_group`, 251 tomma — de saknar art och ska vara tomma. Punkt 2 i Del 4 är struken. I stället verifieras: 511 med värde, och antal aktiva i Färsk Fisk/Skaldjur utan värde ska vara 0. Just nu är den siffran **1**, inte 0 — den enda produkten redovisas och rättas manuellt, inget härlett.

Publicering sker före det skarpa flödet.

## Del A — cut_splits: 47 arter kan inte styckas

Bara 5 artgrupper har uppdelning (laxfisk, plattfisk, rundfisk, sej, torsk) mot 52 i `species_cut_models`. Alla rader läggs med `is_estimate = true` (kolumnen finns inte idag och läggs till). Enligt ditt val gäller dina tal överallt — även torsk och sej skrivs om.

**Ny standard för loin_four** (rygg 55, stjärtbit 20, slag 15, kontrarygg 10):
torsk, sej (omskrivna), samt bleka, havskatt, kapkummel, kolfisk, kolja, kummel, långa, lubb.

**single — hel filé 100 %** (24 arter):
abborre, beryx, bläckfisk, dorade, fjärsing, gädda, havsabborre, knot, kungsfisk, lake, madai, makrill, mullus, papegojfisk, red-snapper, sardin, sik, sill, silversida, skipjack, stenbit, stillahavskungsfisk, taggmakrill, vitling.

**flatfish — plattfiskmallen** (filé utan skinn 100, kotlett 100), 9 arter:
bergtunga, blåkveite, hälleflundra, piggvar, rödspätta, rödtunga, sillflundra, sjötunga, slätvar.

**salmon_side — laxfiskmallen** (sida med skinn 100, portion 85, avskär 15), 4 arter:
havsöring, lax, regnbåge, röding.

**loin_whole — hel loin 100 %**, 4 arter: blåfenad-tonfisk, seriola, svärdfisk, tonfisk.

**tail_only — stjärtfilé 100 %**: marulk.

Efter skrivning redovisas antal arter per mall och en kontroll att varje art i `species_cut_models` har minst en rad.

## Del B — Referenspriser för alla arter

`detail_prices` har 5 rader, alla torsk. Panelen "Referenspriser" på Prissättning byggs ut så att den listar **en rad per artgrupp och detaljform per prislista** för samtliga arter med styckningsmodell, inte bara de som redan har pris:

- `reference_cost_per_kg` förifylls från artens rullande snitt av de tre senaste inköpen.
- Saknade värden visas som tomma fält att fylla i, med tydlig markering av vad som är ifyllt och vad som saknas.
- Sortering efter hur ofta arten köps (flest inköp först), så det mest använda ligger överst.
- Ifyllda rader sparas till `detail_prices` per prislista.

## Del C — Ewa Ahlander får konto

Hon finns som personal (Butiksansvarig) med butiksbehörighet till Amhult men utan e-post och inloggning. Konto skapas med **ewaahlander@gmail.com**, portal Butik, behörighet Amhult, tillfälligt lösenord som måste bytas vid första inloggningen.

## Del D — Publicera och deploya (före flödet)

1. Publicera appen så ändringarna går live på makrilltrade.com. Tid och resultat redovisas.
2. Deploya om samtliga edge functions så drift matchar repo.
3. Ta bort den döda posten `[functions.scomber-b2b-order]` ur config.toml — funktionen finns inte i repot.

## Del E — Verifiera på livesajten

makrilltrade.com öppnas och följande bekräftas med skärmbild:

- menyposten Lagerrörelser
- menyposten Spårbarhet
- att butiksportalen inte når Inköpsrapportering, Auktionskalkyl eller inköpspriser
- att tomma vyer visar text och knapp i stället för tom yta

## Del F — Kör hela flödet skarpt

Kandidatrapport: inköpsrapport från **2026-07-28**, 16 rader, 532 kg, alla rader har produkt, pris, partinummer och fångstområde, varav en torskrad.

1. Bokför rapporten (0 av 55 är bokförda idag).
2. Kontrollera att partier skapades med IL-nummer och `supplier_lot_id`.
3. Kontrollera att inleveransrörelser bokfördes och att `avg_cost` blev skilt från noll.
4. Kör en tillverkningsorder på torsken.
5. Kontrollera att `tillverkning_ut` och `tillverkning_in` bokfördes och att `lot_transformations` fick en rad.
6. Kontrollera att NRV-modellen räknade fram pris per detalj.

Varje steg redovisas med siffror.

## Del G — Vad som syns efteråt

Efter flödet gås var och en igenom på livesajten och bekräftas med data, inte tom yta: Lagerrörelser (raderna från bokföringen), Spårbarhet (partiet med fångstuppgifter och rörelsehistorik), Lager (saldo med snittkostpris och lagervärde), Filé/Tillverkning (ordern med utbyte, kostnad och pris per detalj).

## Del H — Instruktion till dig

Svaret avslutas med en numrerad startlista med exakta sidnamn och knappnamn, skriven för någon som aldrig sett systemet.

## Tekniskt

- Migration: `cut_splits` får `is_estimate boolean not null default false`; rader för 47 artgrupper skrivs, torsk och sej uppdateras till 55/20/15/10.
- Dataverifiering: den enda aktiva Färsk Fisk/Skaldjur-produkten utan `species_group` identifieras och rättas manuellt.
- `src/components/pricing/ReferencePricesPanel.tsx`: rader byggs från alla arter i `species_cut_models` × mallens detaljformer, sorterade på inköpsfrekvens från `useReferencePricing`, med tomma fält som ifyllbara.
- `supabase/functions/seed-staff-users/index.ts`: Ewa läggs till (shop, Amhult) och funktionen körs.
- `supabase/config.toml`: posten `[functions.scomber-b2b-order]` tas bort.
- Livekontroll sker mot makrilltrade.com efter publicering; bokföring via `post_purchase_report` och tillverkningsflödet körs i gränssnittet så det som verifieras är samma väg du själv går.
